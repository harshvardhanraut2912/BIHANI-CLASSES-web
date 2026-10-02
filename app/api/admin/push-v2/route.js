// 📂 SAVE THIS FILE AT: app/api/admin/push-v2/route.js
//
// Takes a BATCH of parsed question objects from the CMS v2 page (or a single
// one, for back-compat), extracts any inline data:image/...;base64,... blobs
// out of each question_html/solution_html/options, uploads each as a real
// file to Storage under question-images-v2/{chapterId}/, swaps the base64
// string for the resulting public URL, then appends the whole cleaned batch
// into question_bundles_v2.questions in ONE fetch + ONE upsert — instead of
// one round-trip per question. New questions are always appended after
// whatever's already in the bundle, never interleaved or reordered.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Dedicated bucket for the v2 CMS, separate from the old "question-images"
// bucket used by the original (LaTeX/Playwright) pipeline.
const BUCKET = "question-images-v2";

// Creates the bucket on first use if it doesn't exist yet. Cheap to call
// repeatedly (getBucket is a single lightweight lookup), so we just check at
// the top of every request instead of relying on a one-time migration step.
let bucketReady = false;
async function ensureBucketExists() {
  if (bucketReady) return;
  const { data: existing, error: getError } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (existing) {
    bucketReady = true;
    return;
  }
  // getBucket errors on "not found" as well as real failures — only treat a
  // missing-bucket error as expected, surface anything else.
  const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
  });
  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Failed to create bucket "${BUCKET}": ${createError.message}`);
  }
  bucketReady = true;
}

const BASE64_IMG_RE = /data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)/g;

// Finds every inline base64 image in `text`, uploads each to Storage under
// question-images/{chapterId}/{randomId}.{ext}, and returns the text with
// each data-URI replaced by the resulting public Storage URL, plus a list of
// the filenames uploaded (for cleanup bookkeeping / debugging if needed).
async function extractAndUploadImages(text, chapterId) {
  if (!text) return { cleanedText: text, uploadedFiles: [] };

  const matches = [...text.matchAll(BASE64_IMG_RE)];
  if (matches.length === 0) return { cleanedText: text, uploadedFiles: [] };

  let cleanedText = text;
  const uploadedFiles = [];

  for (const match of matches) {
    const [fullMatch, mimeType, base64Data] = match;
    const ext = mimeType === "jpeg" ? "jpg" : mimeType;
    const randomId = crypto.randomBytes(3).toString("hex"); // 6 hex chars, e.g. "a1b2c3"
    const fileName = `${randomId}.${ext}`;
    const storagePath = `${chapterId}/${fileName}`;

    const buffer = Buffer.from(base64Data, "base64");

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: `image/${mimeType}`, upsert: true });

    if (uploadError) {
      throw new Error(`Image upload failed (${fileName}): ${uploadError.message}`);
    }

    const publicUrl = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(storagePath).data.publicUrl;

    // Replace only this exact occurrence, not all occurrences of an identical
    // string elsewhere in the text (unlikely for base64 blobs, but safe either way
    // since split/join on the exact matched substring only touches real hits).
    cleanedText = cleanedText.replace(fullMatch, publicUrl);
    uploadedFiles.push(fileName);
  }

  return { cleanedText, uploadedFiles };
}

// Processes one question object end-to-end: uploads any explicit (already
// converted client-side) images at their exact predicted paths, then extracts
// + uploads any remaining inline base64 images from the question/solution/
// option text. Returns the cleaned question fields, but NOT q_id/q_num — those
// depend on this question's position in the batch + existing bundle length,
// assigned by the caller after every question in the batch has been processed.
async function processQuestion(question, explicitUploads, chapterId) {
  if (Array.isArray(explicitUploads)) {
    await Promise.all(
      explicitUploads
        .filter((u) => u.storagePath && u.base64Data)
        .map(async (upload) => {
          const buffer = Buffer.from(upload.base64Data, "base64");
          const { error } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(upload.storagePath, buffer, { contentType: "image/png", upsert: true });
          if (error) throw new Error(`Explicit upload failed (${upload.storagePath}): ${error.message}`);
        })
    );
  }

  const [questionResult, solutionResult, optA, optB, optC, optD] = await Promise.all([
    extractAndUploadImages(question.question_html, chapterId),
    extractAndUploadImages(question.solution_html || "", chapterId),
    extractAndUploadImages(question.options?.A || "", chapterId),
    extractAndUploadImages(question.options?.B || "", chapterId),
    extractAndUploadImages(question.options?.C || "", chapterId),
    extractAndUploadImages(question.options?.D || "", chapterId),
  ]);

  return {
    source_id: question.sourceId ?? null,
    question_html: questionResult.cleanedText,
    options: { A: optA.cleanedText, B: optB.cleanedText, C: optC.cleanedText, D: optD.cleanedText },
    answer_key: (question.answer_key || "a").toLowerCase(),
    solution_html: solutionResult.cleanedText,
    section: question.section || "",
    ques_type: question.quesType || "",
    exam_history: question.examHistory || [],
  };
}

export async function POST(request) {
  try {
    await ensureBucketExists();

    const body = await request.json();
    const { chapterId, exam, subject, chapter, questionType } = body;

    if (!chapterId) {
      return NextResponse.json({ success: false, error: "chapterId is required." }, { status: 400 });
    }

    // Accept either the new batch shape (questions: [{ question, explicitUploads }])
    // or the original single-question shape, so nothing calling the old API
    // shape breaks.
    let batch;
    if (Array.isArray(body.questions)) {
      batch = body.questions;
    } else if (body.question) {
      batch = [{ question: body.question, explicitUploads: body.explicitUploads }];
    } else {
      batch = [];
    }

    if (batch.length === 0) {
      return NextResponse.json({ success: false, error: "No questions in payload." }, { status: 400 });
    }
    for (const { question } of batch) {
      if (!question || !question.question_html || !question.options || !question.answer_key) {
        return NextResponse.json({ success: false, error: "Incomplete question payload." }, { status: 400 });
      }
    }

    // 1. Process every question in the batch concurrently — each one's image
    // uploads are independent of the others, so no reason to serialize this part.
    const processed = await Promise.all(
      batch.map(({ question, explicitUploads }) => processQuestion(question, explicitUploads, chapterId))
    );

    // 2. Fetch the existing bundle row ONCE for the whole batch.
    const { data: existingBundle, error: fetchError } = await supabaseAdmin
      .from("question_bundles_v2")
      .select("questions")
      .eq("chapter_id", chapterId)
      .eq("question_type", questionType)
      .maybeSingle();

    if (fetchError) throw fetchError;

    let currentQuestions = [];
    if (existingBundle?.questions && Array.isArray(existingBundle.questions)) {
      currentQuestions = existingBundle.questions;
    }

    // 3. Assign q_num/q_id in order and append after whatever's already there —
    // new questions always land after existing ones, never interleaved.
    const qIds = [];
    for (const fields of processed) {
      const qNum = currentQuestions.length + 1;
      const qId = `${chapterId}_${qNum}_${crypto.randomBytes(2).toString("hex")}`;
      currentQuestions.push({ q_id: qId, q_num: qNum, ...fields });
      qIds.push(qId);
    }

    // 4. ONE upsert for the entire batch, instead of one per question.
    const { error: upsertError } = await supabaseAdmin
      .from("question_bundles_v2")
      .upsert(
        {
          chapter_id: chapterId,
          exam: exam || "MHT-CET",
          subject,
          chapter,
          question_type: questionType,
          questions: currentQuestions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "chapter_id,question_type" }
      );

    if (upsertError) throw upsertError;

    return NextResponse.json({
      success: true,
      totalCount: currentQuestions.length,
      qIds,
      qId: qIds[qIds.length - 1], // back-compat for old single-question callers
    });
  } catch (err) {
    console.error("push-v2 route error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}