// 📂 SAVE THIS FILE AT: app/api/deploy-test-v2/route.js
// (replaces the old /api/deploy-test route entirely — no GitHub involved)
//
// Takes the manifest built by addexamimages' page.js and inserts:
//   - exam_question_data_v2: one row per question — question_html + options ONLY
//   - exam_answer_keys_v2:   one row per question — answer_key + solution_html ONLY
// Both rows share the same id (`${mockSlug}_q${test_q_num}`), globally unique
// per question, with exam_answer_keys_v2.id as an FK back to
// exam_question_data_v2.id.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminTokenDetailed, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 🔒 SECURITY: writes directly to exam_question_data_v2 / exam_answer_keys_v2
// via the service-role key. proxy.js's middleware gate is the primary
// defense (it now runs on this path), this check is defense-in-depth in
// case the middleware matcher is ever edited again without noticing.
async function requireAdmin(request) {
  const adminToken = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const check = await verifyAdminTokenDetailed(adminToken, secret);
  return !!check.valid;
}

export async function POST(request) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: "Forbidden: Admin authentication required." }, { status: 403 });
    }

    const { exam, mockName, mockSlug, manifest } = await request.json();

    if (!mockSlug || !Array.isArray(manifest) || manifest.length === 0) {
      return NextResponse.json({ success: false, error: "mockSlug and a non-empty manifest are required." }, { status: 400 });
    }

    // solution_html is deliberately absent from the client-supplied manifest —
    // it was stripped at the pool-fetch stage (fixing a statement_timeout on
    // the assembler page) and is never trusted from the client anyway. Look
    // it up here from question_bundles_v2, batched by each distinct
    // (chapter_id, question_type) pair actually present in this manifest.
    const bundleKeys = new Set(manifest.map((it) => `${it.chapter_id}::${it.question_type}`));
    const solutionLookup = {}; // q_id -> solution_html

    for (const key of bundleKeys) {
      const [chapterId, questionType] = key.split("::");
      if (!chapterId || !questionType) continue;

      const { data: bundleRow, error: bundleFetchError } = await supabaseAdmin
        .from("question_bundles_v2")
        .select("questions")
        .eq("chapter_id", chapterId)
        .eq("question_type", questionType)
        .maybeSingle();

      if (bundleFetchError) throw bundleFetchError;

      (bundleRow?.questions || []).forEach((q) => {
        solutionLookup[q.q_id] = q.solution_html || null;
      });
    }

    const questionManifest = [];
    const answerManifest = [];

    for (const item of manifest) {
      if (!item.question_html || !item.options || !item.answer_key) {
        return NextResponse.json(
          { success: false, error: `Question ${item.test_q_num} is missing question_html, options, or answer_key.` },
          { status: 400 }
        );
      }

      const baseQuestionPayload = {
        q_id: item.q_id,
        q_num: item.test_q_num,
        test_q_num: item.test_q_num,
        sub_id: item.sub_id,
        q_section: item.q_section ?? item.subject ?? null,
        options: item.options,
        section: item.section ?? null,
        ques_type: item.ques_type ?? item.question_type ?? null,
        source_id: item.source_id ?? null,
        exam_history: item.exam_history ?? [],
        question_html: item.question_html,
      };

      questionManifest.push(baseQuestionPayload);

      answerManifest.push({
        ...baseQuestionPayload,
        chapter_id: item.chapter_id || null,
        answer_key: item.answer_key,
        solution_html: solutionLookup[item.q_id] ?? null,
      });
    }

    const rowId = `${mockSlug}`;

    const { error: questionInsertError } = await supabaseAdmin
      .from("exam_question_data_v2")
      .upsert(
        {
          id: rowId,
          exam: exam || "MHT-CET",
          mock_test_name: mockName,
          mock_slug: mockSlug,
          questions_manifest: questionManifest,
        },
        { onConflict: "id" }
      );

    if (questionInsertError) throw questionInsertError;

    const { error: answerInsertError } = await supabaseAdmin
      .from("exam_answer_keys_v2")
      .upsert(
        {
          id: rowId,
          exam: exam || "MHT-CET",
          mock_test_name: mockName,
          mock_slug: mockSlug,
          answer_manifest: answerManifest,
        },
        { onConflict: "id" }
      );

    if (answerInsertError) {
      await supabaseAdmin
        .from("exam_question_data_v2")
        .delete()
        .eq("id", rowId);
      throw answerInsertError;
    }

    return NextResponse.json({
      success: true,
      count: questionManifest.length,
      mockSlug,
    });
  } catch (err) {
    console.error("deploy-test-v2 route error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}