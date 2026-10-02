// 📂 SAVE THIS FILE AT: app/api/admin/subject-bundle/route.js
//
// On-demand companion to /api/admin/exam-summary. Called only when the user
// expands a subject row (or hits "Preview all") on the chapters screen —
// fetches that subject's full question_bundles_v2 content (minus
// solution_html, same as the old exam-pool route) via get_subject_bundle().
// Scoping to one subject instead of the whole exam keeps each call small,
// so this stays fast even though it does the same per-question unpacking
// the old get_exam_pool() did for everything at once.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const exam = searchParams.get("exam");
    const subject = searchParams.get("subject");

    if (!exam || !subject) {
      return NextResponse.json(
        { error: "exam and subject query params are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("get_subject_bundle", {
      p_exam: exam,
      p_subject: subject,
    });

    if (error) throw error;

    // data is already the bundles array for this subject, straight from the
    // SQL function (each item: chapter_id, chapter, subject, question_type,
    // questions[] with solution_html stripped).
    return NextResponse.json({ bundles: data || [] });
  } catch (err) {
    console.error("subject-bundle route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}