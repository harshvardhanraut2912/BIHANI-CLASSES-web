// app/api/admin/exam-questions/route.js  (new file)
//
// Serves question content to the Create Exam screens WITHOUT ever sending a
// whole chapter (let alone the whole database) to the browser:
//
//   action "page"   -> one slice of a chapter's questions (manual selection,
//                      "Load more"): { total, questions[offset..offset+limit] }
//   action "random" -> for each requested chapter, N randomly picked questions
//                      (automatic selection and "Regenerate"). `exclude` lets a
//                      regenerate avoid repeating the current questions.
//   action "replace"-> ONE new random question for a single chapter (the per-question
//                      regenerate button). `exclude` = every q_id already in that
//                      chapter's list, so the new one is never a duplicate.
//
// The chapter's bundle is read here on the server (service role); only the
// requested slice / random pick goes back in the response. Random picks are done
// INSIDE the database by the get_random_questions() SQL function
// (see sql/get_random_questions.sql); if it is not installed the route falls back
// to the old (slow) server-side picking. /api/admin/* is
// already behind the admin session gate in proxy.js.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { denyIfSubjectBlocked } from "@/lib/subjectAccess";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const norm = (s) => String(s || "").trim().toLowerCase();

/* ---------- chapter name -> chapter_id (metadata only, cached) ---------- */
const idCache = new Map(); // exam -> { at, map }
async function chapterIdFor(exam, subject, chapter, given) {
  if (given) return String(given);
  let entry = idCache.get(exam);
  if (!entry || Date.now() - entry.at > 5 * 60 * 1000) {
    const { data, error } = await supabaseAdmin
      .from("syllabus_chapters_v2")
      .select("id, subject, chapter_name")
      .eq("exam", exam);
    if (error) throw error;
    const map = new Map();
    (data || []).forEach((r) => map.set(`${norm(r.subject)}|${norm(r.chapter_name)}`, String(r.id)));
    entry = { at: Date.now(), map };
    idCache.set(exam, entry);
  }
  return entry.map.get(`${norm(subject)}|${norm(chapter)}`) || null;
}

/* ---------- one chapter's questions (short in-memory cache) ---------- */
const qCache = new Map(); // chapter_id -> { at, list }
async function loadChapter(chapterId) {
  const hit = qCache.get(chapterId);
  if (hit && Date.now() - hit.at < 60 * 1000) return hit.list;

  const { data, error } = await supabaseAdmin
    .from("question_bundles_v2")
    .select("question_type, questions")
    .eq("chapter_id", chapterId)
    .order("question_type", { ascending: true });
  if (error) throw error;

  const list = [];
  (data || []).forEach((row) => {
    (Array.isArray(row.questions) ? row.questions : []).forEach((q) => {
      list.push({ ...q, question_type: row.question_type, chapter_id: chapterId });
    });
  });

  qCache.set(chapterId, { at: Date.now(), list });
  if (qCache.size > 30) qCache.delete(qCache.keys().next().value);
  return list;
}

/* ---------- random pick ---------- */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(list, count, excludeIds) {
  const ex = new Set(excludeIds || []);
  const fresh = shuffle(list.filter((q) => !ex.has(q.q_id)));
  if (fresh.length >= count) return fresh.slice(0, count);
  // not enough unseen questions: use all of them and top up from the rest
  const rest = shuffle(list.filter((q) => ex.has(q.q_id)));
  return fresh.concat(rest).slice(0, count);
}

/* ---------- fast path: let the database pick (get_random_questions RPC) ----------
   Returns Map(key -> { total, questions }) or null when the SQL function has not
   been created yet (then the old server-side picking below is used instead). */
async function randomViaDb(dbItems) {
  const { data, error } = await supabaseAdmin.rpc("get_random_questions", { p_items: dbItems });
  if (error) {
    const missing = error.code === "PGRST202" || error.code === "42883" || /get_random_questions/i.test(error.message || "");
    if (missing) {
      console.warn("get_random_questions RPC not found - using the slow fallback.");
      return null;
    }
    throw error;
  }
  return new Map((Array.isArray(data) ? data : []).map((r) => [r.key, r]));
}

const clampInt = (v, min, max, dflt) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt;
};

export async function POST(request) {
  try {
    const body = await request.json();
    const exam = String(body.exam || "").trim();
    if (!exam) return NextResponse.json({ error: "exam is required." }, { status: 400 });

    // Per-admin subject switches (Settings -> Developers): refuse blocked subjects.
    const blocked = await denyIfSubjectBlocked(request, [body.subject, ...(Array.isArray(body.items) ? body.items.map((it) => it?.subject) : [])]);
    if (blocked) return blocked;

    /* ----- one page of a chapter (manual selection) ----- */
    if (body.action === "page") {
      const id = await chapterIdFor(exam, body.subject, body.chapter, body.chapter_id);
      if (!id) return NextResponse.json({ error: "Chapter not found in the syllabus." }, { status: 404 });

      const list = await loadChapter(id);
      const offset = clampInt(body.offset, 0, 1_000_000, 0);
      const limit = clampInt(body.limit, 1, 100, 30);
      const questions = list.slice(offset, offset + limit).map((q) => ({ ...q, subject: body.subject, chapter: body.chapter }));
      return NextResponse.json({ total: list.length, questions });
    }

    /* ----- random picks for several chapters (automatic / regenerate) ----- */
    if (body.action === "random") {
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 80);
      if (!items.length) return NextResponse.json({ error: "items are required." }, { status: 400 });

      // FAST PATH: resolve chapter ids (cached, usually already sent by the client),
      // then ONE database call picks the random questions for all chapters.
      const resolved = await Promise.all(
        items.map(async (it) => {
          try { return { it, id: await chapterIdFor(exam, it.subject, it.chapter, it.chapter_id) }; }
          catch (e) { return { it, id: null, err: e.message }; }
        })
      );
      const ok = resolved.filter((r) => r.id);
      const picked = ok.length
        ? await randomViaDb(ok.map((r) => ({ key: r.it.key, chapter_id: r.id, count: clampInt(r.it.count, 0, 300, 0), exclude: Array.isArray(r.it.exclude) ? r.it.exclude : [] })))
        : new Map();
      if (picked) {
        const results = resolved.map((r) => {
          if (!r.id) return { key: r.it.key, error: r.err || "Chapter not found in the syllabus." };
          const hit = picked.get(r.it.key);
          if (!hit) return { key: r.it.key, error: "Chapter not found in the syllabus." };
          return { key: r.it.key, total: hit.total, questions: (hit.questions || []).map((q) => ({ ...q, subject: r.it.subject, chapter: r.it.chapter })) };
        });
        return NextResponse.json({ results });
      }

      // SLOW FALLBACK (SQL function not installed): load whole chapters on the server.
      const results = [];
      for (let i = 0; i < items.length; i += 8) {
        const chunk = items.slice(i, i + 8);
        const part = await Promise.all(
          chunk.map(async (it) => {
            try {
              const id = await chapterIdFor(exam, it.subject, it.chapter, it.chapter_id);
              if (!id) return { key: it.key, error: "Chapter not found in the syllabus." };
              const list = await loadChapter(id);
              const count = clampInt(it.count, 0, 300, 0);
              const questions = pickRandom(list, count, it.exclude).map((q) => ({ ...q, subject: it.subject, chapter: it.chapter }));
              return { key: it.key, total: list.length, questions };
            } catch (e) {
              return { key: it.key, error: e.message || "Failed to load questions." };
            }
          })
        );
        results.push(...part);
      }
      return NextResponse.json({ results });
    }

    /* ----- one replacement question (per-question regenerate) ----- */
    if (body.action === "replace") {
      const id = await chapterIdFor(exam, body.subject, body.chapter, body.chapter_id);
      if (!id) return NextResponse.json({ error: "Chapter not found in the syllabus." }, { status: 404 });

      const excludeIds = (Array.isArray(body.exclude) ? body.exclude : []).slice(0, 2000);
      const ex = new Set(excludeIds);

      // FAST PATH: the database returns just one question that is not in `exclude`.
      const one = await randomViaDb([{ key: "one", chapter_id: id, count: 1, exclude: excludeIds }]);
      if (one) {
        const q = one.get("one")?.questions?.[0];
        if (!q || ex.has(q.q_id)) {
          return NextResponse.json({ error: "No other questions are left in this chapter." }, { status: 409 });
        }
        return NextResponse.json({ question: { ...q, subject: body.subject, chapter: body.chapter } });
      }

      // SLOW FALLBACK
      const list = await loadChapter(id);
      const fresh = list.filter((q) => !ex.has(q.q_id));
      if (!fresh.length) {
        return NextResponse.json({ error: "No other questions are left in this chapter." }, { status: 409 });
      }
      const q = fresh[Math.floor(Math.random() * fresh.length)];
      return NextResponse.json({ question: { ...q, subject: body.subject, chapter: body.chapter } });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    console.error("exam-questions route error:", err);
    return NextResponse.json({ error: err.message || "Failed to load questions." }, { status: 500 });
  }
}
