// 📂 SAVE THIS FILE AT: app/api/admin/exam-summary/route.js
//
// Fast, count-only companion to /api/admin/exam-pool. Powers the initial
// chapters screen — calls get_exam_chapters_summary(), which only reads
// jsonb_array_length() per bundle (array-header read, no per-question
// unpacking), instead of jsonb_agg'ing every question's HTML like
// get_exam_pool() does. This is what makes the chapters screen load
// instantly instead of taking ~a minute.
//
// Full question content for a given subject is fetched separately, on
// demand, by /api/admin/subject-bundle when the user expands that subject.

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

    if (!exam) {
      return NextResponse.json({ error: "exam query param is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("get_exam_chapters_summary", {
      p_exam: exam,
    });

    if (error) throw error;

    // data is already the chapters array (with question_count per chapter)
    // straight from the SQL function — no further shaping needed here.
    return NextResponse.json({ chapters: data || [] });
  } catch (err) {
    console.error("exam-summary route error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}