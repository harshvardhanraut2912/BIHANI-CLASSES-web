// app/api/admin/search-question/route.js
//
// Finds/deletes a single question by q_id. Never touches the full
// question_bundles_v2 table — the chapter_id prefix in every q_id
// (e.g. "QcEWzF_1_05ac" -> chapter_id "QcEWzF") narrows the query to
// just that chapter's rows (usually 1-2 bundles: one per question_type),
// the same "scope by chapter, not by whole database" approach
// exam-summary/subject-bundle already use.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function deriveChapterId(qId) {
  // Chapter id is everything before the first underscore.
  return qId.split("_")[0];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const qId = (searchParams.get("q_id") || "").trim();

    if (!qId) {
      return NextResponse.json({ error: "q_id query param is required." }, { status: 400 });
    }

    const chapterId = deriveChapterId(qId);

    const { data: bundleRows, error } = await supabaseAdmin
      .from("question_bundles_v2")
      .select("id, chapter_id, question_type, questions")
      .eq("chapter_id", chapterId);

    if (error) throw error;

    if (!bundleRows || bundleRows.length === 0) {
      return NextResponse.json({ found: false, error: `No bundles found for chapter_id "${chapterId}".` }, { status: 404 });
    }

    for (const row of bundleRows) {
      const list = Array.isArray(row.questions) ? row.questions : [];
      const match = list.find((q) => q.q_id === qId);
      if (match) {
        return NextResponse.json({
          found: true,
          question: match,
          bundle_id: row.id,
          chapter_id: row.chapter_id,
          question_type: row.question_type,
        });
      }
    }

    return NextResponse.json({ found: false, error: `Question "${qId}" not found in chapter "${chapterId}".` }, { status: 404 });
  } catch (err) {
    console.error("search-question GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { bundle_id, q_id } = await request.json();
    if (!bundle_id || !q_id) {
      return NextResponse.json({ error: "bundle_id and q_id are required." }, { status: 400 });
    }

    const { data: bundleRow, error: fetchErr } = await supabaseAdmin
      .from("question_bundles_v2")
      .select("id, questions")
      .eq("id", bundle_id)
      .single();

    if (fetchErr || !bundleRow) {
      return NextResponse.json({ error: "Bundle not found." }, { status: 404 });
    }

    const list = Array.isArray(bundleRow.questions) ? bundleRow.questions : [];
    const existed = list.some((q) => q.q_id === q_id);
    const nextQuestions = list.filter((q) => q.q_id !== q_id);

    if (!existed) {
      return NextResponse.json({ error: "Question not found in this bundle (already deleted?)." }, { status: 404 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from("question_bundles_v2")
      .update({ questions: nextQuestions })
      .eq("id", bundle_id);

    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, remaining_in_bundle: nextQuestions.length });
  } catch (err) {
    console.error("search-question DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}