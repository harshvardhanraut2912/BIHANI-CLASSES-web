// app/api/admin/exam-papers/route.js  (new file)
//
// Saved exams (the same two tables the old assembler wrote to):
//   exam_question_data_v2  -> questions_manifest
//   exam_answer_keys_v2    -> answer_manifest
//
//   GET                 -> the exam list. METADATA ONLY (name, exam, created, question count);
//                          the question manifests are never downloaded for the list.
//   GET ?id=<slug>      -> ONE exam for the preview (its answer_manifest + chapter names).
//   POST                -> save a new exam from the picked questions.
//   PATCH               -> save regenerated/replaced questions of an existing exam
//                          (only the replaced questions travel; slots, numbering and
//                          everything else in both manifests stay exactly as they were).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminTokenDetailed, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { buildManifests, slugify, slotPayloads, missingField } from "./build";
import { denyIfSubjectBlocked } from "@/lib/subjectAccess";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const check = await verifyAdminTokenDetailed(token, secret);
  return !!check.valid;
}

const forbidden = () => NextResponse.json({ error: "Forbidden: Admin authentication required." }, { status: 403 });
const asArray = (v) => (Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v || "[]") : []);

/* ------------------------------------------------------------------ list */
async function listExams() {
  const { data, error } = await supabaseAdmin.rpc("get_exam_papers_list");
  if (!error) return Array.isArray(data) ? data : [];

  const missing = error.code === "PGRST202" || error.code === "42883" || /get_exam_papers_list/i.test(error.message || "");
  if (!missing) throw error;

  // Slow fallback (SQL function not installed yet): reads the manifests just to count them.
  console.warn("get_exam_papers_list RPC not found - using the slow fallback.");
  const { data: rows, error: e2 } = await supabaseAdmin
    .from("exam_question_data_v2")
    .select("id, mock_test_name, mock_slug, exam, created_at, questions_manifest")
    .order("created_at", { ascending: false });
  if (e2) throw e2;
  return (rows || []).map((r) => ({
    id: r.id,
    mock_test_name: r.mock_test_name,
    mock_slug: r.mock_slug,
    exam: r.exam,
    created_at: r.created_at,
    question_count: Array.isArray(r.questions_manifest) ? r.questions_manifest.length : 0,
  }));
}

/* --------------------------------------------------------------- preview */
async function loadExam(id) {
  const { data: row, error } = await supabaseAdmin
    .from("exam_answer_keys_v2")
    .select("id, exam, mock_test_name, answer_manifest")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const questions = asArray(row.answer_manifest);
  const ids = [...new Set(questions.map((q) => q.chapter_id).filter(Boolean))];
  const chapters = {};
  if (ids.length) {
    const { data: chRows, error: chErr } = await supabaseAdmin
      .from("syllabus_chapters_v2")
      .select("id, subject, chapter_name")
      .in("id", ids);
    if (chErr) throw chErr;
    (chRows || []).forEach((c) => { chapters[String(c.id)] = { name: c.chapter_name, subject: c.subject }; });
  }
  return { id: row.id, exam: row.exam, name: row.mock_test_name, questions, chapters };
}

export async function GET(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ exams: await listExams() });

    const exam = await loadExam(id);
    if (!exam) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json(exam);
  } catch (err) {
    console.error("exam-papers GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load exams." }, { status: 500 });
  }
}

/* ---------------------------------------------------------------- create */
export async function POST(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();

    const { name, exam, groups } = await request.json();
    // Per-admin subject switches: an exam can only contain subjects this admin may use.
    const blockedPost = await denyIfSubjectBlocked(request, Array.isArray(groups) ? groups.map((g) => g?.subject) : []);
    if (blockedPost) return blockedPost;

    const mockName = String(name || "").trim();
    const slug = slugify(mockName);
    if (!mockName || !slug) return NextResponse.json({ error: "Enter a valid exam name." }, { status: 400 });
    if (!Array.isArray(groups) || !groups.length) return NextResponse.json({ error: "No questions were sent." }, { status: 400 });

    const { questionManifest, answerManifest } = buildManifests(groups);
    if (!questionManifest.length) return NextResponse.json({ error: "No questions were sent." }, { status: 400 });

    // never overwrite an existing exam from the create screen
    const { data: taken, error: takenErr } = await supabaseAdmin.from("exam_question_data_v2").select("id").eq("id", slug).maybeSingle();
    if (takenErr) throw takenErr;
    if (taken) {
      return NextResponse.json({ error: `An exam named "${mockName}" already exists. Go back and use a different name.` }, { status: 409 });
    }

    const examType = String(exam || "MHT-CET");
    const { error: qErr } = await supabaseAdmin
      .from("exam_question_data_v2")
      .insert({ id: slug, exam: examType, mock_test_name: mockName, mock_slug: slug, questions_manifest: questionManifest });
    if (qErr) throw qErr;

    const { error: aErr } = await supabaseAdmin
      .from("exam_answer_keys_v2")
      .insert({ id: slug, exam: examType, mock_test_name: mockName, mock_slug: slug, answer_manifest: answerManifest });
    if (aErr) {
      await supabaseAdmin.from("exam_question_data_v2").delete().eq("id", slug);
      throw aErr;
    }

    return NextResponse.json({ success: true, id: slug, count: questionManifest.length });
  } catch (err) {
    console.error("exam-papers POST error:", err);
    return NextResponse.json({ error: err.message || "Failed to save the exam." }, { status: err.status || 500 });
  }
}

/* --------------------------------------------------------------- replace */
export async function PATCH(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();

    const { id, replacements } = await request.json();
    if (!id || !Array.isArray(replacements) || !replacements.length) {
      return NextResponse.json({ error: "id and replacements are required." }, { status: 400 });
    }

    const [{ data: qRow, error: qErr }, { data: aRow, error: aErr }] = await Promise.all([
      supabaseAdmin.from("exam_question_data_v2").select("questions_manifest").eq("id", id).maybeSingle(),
      supabaseAdmin.from("exam_answer_keys_v2").select("answer_manifest").eq("id", id).maybeSingle(),
    ]);
    if (qErr) throw qErr;
    if (aErr) throw aErr;
    if (!qRow || !aRow) return NextResponse.json({ error: "Exam not found." }, { status: 404 });

    const oldQuestions = asArray(qRow.questions_manifest);
    const oldAnswers = asArray(aRow.answer_manifest);
    const questions = oldQuestions.slice();
    const answers = oldAnswers.slice();

    // Per-admin subject switches: only questions of subjects this admin may use can be replaced.
    const slotSubjects = replacements.map((r) => answers.find((q) => q.q_id === r?.old_q_id)?.q_section).filter(Boolean);
    const blockedPatch = await denyIfSubjectBlocked(request, slotSubjects);
    if (blockedPatch) return blockedPatch;

    const taken = new Set(answers.map((q) => q.q_id));
    for (const r of replacements) {
      const oldId = r?.old_q_id;
      const item = r?.question;
      const idx = answers.findIndex((q) => q.q_id === oldId);
      if (idx === -1) return NextResponse.json({ error: `Question ${oldId} is not in this exam any more. Reload and try again.` }, { status: 409 });
      const bad = missingField(item);
      if (bad) return NextResponse.json({ error: `Replacement for ${oldId} is missing ${bad}.` }, { status: 400 });
      if (item.q_id !== oldId && taken.has(item.q_id)) {
        return NextResponse.json({ error: `Question ${item.q_id} is already in this exam.` }, { status: 409 });
      }
      taken.delete(oldId);
      taken.add(item.q_id);

      // the slot (number, section) stays; everything about the question itself is swapped
      const slot = { test_q_num: answers[idx].test_q_num, sub_id: answers[idx].sub_id, q_section: answers[idx].q_section };
      const { question, answer } = slotPayloads(item, slot);
      const qi = questions.findIndex((q) => q.q_id === oldId);
      if (qi !== -1) questions[qi] = question;
      answers[idx] = answer;
    }

    const { error: u1 } = await supabaseAdmin.from("exam_question_data_v2").update({ questions_manifest: questions }).eq("id", id);
    if (u1) throw u1;
    const { error: u2 } = await supabaseAdmin.from("exam_answer_keys_v2").update({ answer_manifest: answers }).eq("id", id);
    if (u2) {
      await supabaseAdmin.from("exam_question_data_v2").update({ questions_manifest: oldQuestions }).eq("id", id); // undo
      throw u2;
    }

    return NextResponse.json({ success: true, replaced: replacements.length });
  } catch (err) {
    console.error("exam-papers PATCH error:", err);
    return NextResponse.json({ error: err.message || "Failed to save changes." }, { status: err.status || 500 });
  }
}
