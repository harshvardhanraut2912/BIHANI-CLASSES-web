// app/api/admin/reports/regenerate/route.js
//
// Handles exactly two actions from the admin Reports page:
//   - "void":   mark a test_q_num as a bonus/voided slot (question_voids).
//               Awards the mark to every student for that question.
//               UNCHANGED — this was already correct: mock_test_name is
//               keyed on products.id, matching exactly what
//               review.html/solutions.html/leaderboard query.
//   - "delete": permanently remove a reported question from the master
//               pool (question_bundles_v2). No image files to delete
//               anymore — v2 questions are pure HTML, nothing in Storage.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Looks up the reported question in exam_answer_keys_v2 (not
// exam_question_data_v2) because chapter_id — needed to find the right
// question_bundles_v2 row — only lives on the answer manifest, not the
// question manifest.
async function resolveQuestionLocation(testId, testQNum) {
  const { data: productRow } = await supabaseAdmin
    .from("products")
    .select("linked_exam_v2_id")
    .eq("id", testId)
    .maybeSingle();

  const v2RowId = productRow?.linked_exam_v2_id || testId;

  const { data: keyRow, error: keyErr } = await supabaseAdmin
    .from("exam_answer_keys_v2")
    .select("id, answer_manifest")
    .eq("id", v2RowId)
    .single();
  if (keyErr || !keyRow) throw new Error(`No exam_answer_keys_v2 row for test_id "${testId}"`);

  const answerManifest =
    typeof keyRow.answer_manifest === "string" ? JSON.parse(keyRow.answer_manifest) : keyRow.answer_manifest;

  const entry = answerManifest.find((q) => q.q_num === testQNum);
  if (!entry) throw new Error(`No manifest entry for test_q_num ${testQNum}`);
  if (!entry.chapter_id || !entry.ques_type) {
    throw new Error(`Question ${entry.q_id} is missing chapter_id/ques_type — cannot locate its source bundle.`);
  }

  const { data: bundleRow, error: bErr } = await supabaseAdmin
    .from("question_bundles_v2")
    .select("id, questions")
    .eq("chapter_id", entry.chapter_id)
    .eq("question_type", entry.ques_type)
    .maybeSingle();
  if (bErr) throw new Error(`Failed to load question_bundles_v2: ${bErr.message}`);
  if (!bundleRow) return null;

  const list = Array.isArray(bundleRow.questions) ? bundleRow.questions : [];
  const found = list.find((q) => q.q_id === entry.q_id);
  if (!found) return null;

  return { bundleRowId: bundleRow.id, chapterId: entry.chapter_id, question: found, allQuestions: list };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, test_id, test_q_num } = body;

    if (!action || !test_id || !test_q_num) {
      return NextResponse.json({ error: "Missing action, test_id, or test_q_num." }, { status: 400 });
    }

    // ============================================================
    // VOID — mark this slot as a bonus/void question (unchanged)
    // ============================================================
    if (action === "void") {
      const { reason } = body;
      const { error } = await supabaseAdmin
        .from("question_voids")
        .upsert([{ mock_test_name: test_id, test_q_num, reason: reason || null }], { onConflict: "mock_test_name,test_q_num" });
      if (error) throw new Error(`Failed to void question: ${error.message}`);
      return NextResponse.json({ success: true });
    }

    // ============================================================
    // DELETE — purge the question from question_bundles_v2
    // ============================================================
    if (action === "delete") {
      const located = await resolveQuestionLocation(test_id, test_q_num);
      if (!located) {
        return NextResponse.json({ error: "Could not locate this question in question_bundles_v2." }, { status: 404 });
      }

      const { bundleRowId, chapterId, question, allQuestions } = located;

      const nextQuestions = allQuestions.filter((q) => q.q_id !== question.q_id);
      const { error: delErr } = await supabaseAdmin
        .from("question_bundles_v2")
        .update({ questions: nextQuestions })
        .eq("id", bundleRowId);
      if (delErr) throw new Error(`Failed to update question_bundles_v2 row ${bundleRowId}: ${delErr.message}`);

      return NextResponse.json({
        success: true,
        q_id: question.q_id,
        chapterId,
        storage_files_removed: 0, // no images in v2 — nothing in Storage to clean up
      });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (error) {
    console.error("Regenerate route failure:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}