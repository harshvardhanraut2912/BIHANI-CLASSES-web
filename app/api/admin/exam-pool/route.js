// 📂 SAVE THIS FILE AT: app/api/admin/exam-pool/route.js
//
// Fetches syllabus_chapters_v2 + question_bundles_v2 server-side using the
// service-role key (bypasses the anon role's statement_timeout entirely), and
// strips solution_html from every question before responding — the assembler
// only needs question_html/options/answer_key to build previews and let you
// select questions. solution_html is the single largest field per question
// (it carries the most embedded MathML) and is completely unused until
// deploy time, so dropping it here cuts the payload substantially.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminFromRequest } from "@/lib/devAuth";
import { getDeniedSubjects, canonicalSubject } from "@/lib/subjectAccess";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const exam = searchParams.get("exam") || "MHT-CET";

    // Calls a Postgres function with its own function-level statement_timeout
    // override (see get_exam_pool.sql) — this survives Supabase's connection
    // pooler, unlike `alter role ... set statement_timeout`, which doesn't.
    // solution_html is stripped INSIDE Postgres before the result ever comes
    // back, so the heavy field never round-trips at all.
    const { data, error } = await supabaseAdmin.rpc("get_exam_pool", { p_exam: exam });
    if (error) throw error;

    // Drop subjects this admin is switched OFF for (Settings -> Developers).
    const admin = await getAdminFromRequest(request);
    const denied = admin ? await getDeniedSubjects(admin.email) : [];
    const isDenied = (subject) => denied.includes(canonicalSubject(subject));
    const blockedChapterIds = new Set((data?.chapters || []).filter((c) => isDenied(c.subject)).map((c) => String(c.id)));

    const chapters = (data?.chapters || []).filter((c) => !isDenied(c.subject)).map((c) => ({
      id: c.id,
      exam: c.exam,
      std: c.standard,
      subject: c.subject,
      chapter_name: c.chapter_name,
      default_weight: c.default_weight,
    }));

    const bundles = (data?.bundles || []).filter(
      (b) => !(b?.subject && isDenied(b.subject)) && !blockedChapterIds.has(String(b?.chapter_id))
    );
    return NextResponse.json({ chapters, bundles });
  } catch (err) {
    console.error("exam-pool route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}