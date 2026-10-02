// 📂 SAVE THIS FILE AT: app/api/admin/upload/route.js (or wherever your push/upload route currently lives)
// (replaces your existing push route at the same path)
//
// WHAT CHANGED:
//   - The question-image upload, solution-image upload, and existing-bundle fetch are
//     independent of each other (none needs another's result), so they now run
//     concurrently via Promise.all instead of one after another. You wait for the
//     slowest of the three instead of the sum of all three.
// WHAT DID NOT CHANGE:
//   - Every error check, the public URL generation, the dedup/sort/upsert logic, the
//     cleanup step, and the response shape are all identical to your original file.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { 
      exam, 
      subject, 
      chapter, 
      questionType, 
      questionNumber, 
      rawQuestion, 
      rawSolution, 
      answerKey, 
      index,
      qBase64,
      sBase64
    } = await request.json();

    const rootDir = process.cwd();
    const publicTempDir = path.join(rootDir, "public", "temp");

    let qBuffer = null;
    let sBuffer = null;

    if (qBase64) {
      qBuffer = Buffer.from(qBase64.split(",")[1], "base64");
      if (sBase64) {
        sBuffer = Buffer.from(sBase64.split(",")[1], "base64");
      }
    } else {
      const localQPath = path.join(publicTempDir, `preview_q_${index}.png`);
      const localSPath = path.join(publicTempDir, `preview_s_${index}.png`);

      if (!fs.existsSync(localQPath)) {
        return NextResponse.json({ success: false, error: "Rendered question asset missing in local cache." }, { status: 400 });
      }

      qBuffer = fs.readFileSync(localQPath);
      if (fs.existsSync(localSPath)) {
        sBuffer = fs.readFileSync(localSPath);
      }
    }

    const uniqueStringToken = Math.random().toString(36).substring(2, 7);
    const currentTimestamp = Date.now();
    const qRandomIdStr = `${currentTimestamp}_idx_${index}_${uniqueStringToken}`;
    const qFileName = `q_${qRandomIdStr}.webp`;
    const sFileName = `s_${currentTimestamp}_idx_${index}.webp`;

    const qStoragePath = `${exam}/${subject}/${chapter}/${questionType}/${qFileName}`;
    const sStoragePath = `${exam}/${subject}/${chapter}/${questionType}/${sFileName}`;

    // 🟢 CHANGED: these three calls are independent of each other -- none needs another's
    // result -- so they now run concurrently with Promise.all instead of one after another.
    // You wait for the slowest of the three instead of the sum of all three. Same error
    // checks, same public URL generation, same everything else below -- just reordered.
    const uploadQPromise = supabaseAdmin.storage
      .from("question-images")
      .upload(qStoragePath, qBuffer, { contentType: "image/webp", upsert: true });

    const uploadSPromise = sBuffer
      ? supabaseAdmin.storage
          .from("question-images")
          .upload(sStoragePath, sBuffer, { contentType: "image/webp", upsert: true })
      : Promise.resolve({ error: null });

    const fetchBundlePromise = supabaseAdmin
      .from("question_bundles")
      .select("questions")
      .eq("exam", exam)
      .eq("subject", subject)
      .eq("chapter", chapter)
      .eq("question_type", questionType)
      .maybeSingle();

    const [qUploadResult, sUploadResult, fetchBundleResult] = await Promise.all([
      uploadQPromise,
      uploadSPromise,
      fetchBundlePromise,
    ]);

    const { error: qError } = qUploadResult;
    if (qError) throw new Error(`Question storage crash: ${qError.message}`);

    let publicSolUrl = "";
    if (sBuffer) {
      const { error: sError } = sUploadResult;
      if (sError) throw new Error(`Solution storage crash: ${sError.message}`);
      publicSolUrl = supabaseAdmin.storage.from("question-images").getPublicUrl(sStoragePath).data.publicUrl;
    }

    const publicQuestUrl = supabaseAdmin.storage.from("question-images").getPublicUrl(qStoragePath).data.publicUrl;

    const reconstructedFullRawLatex = `${rawQuestion}\n\\textbf{Ans.} ${answerKey.toLowerCase()}\n\\textbf{Sol.:} ${rawSolution}`.trim();

    const { data: existingBundle, error: fetchError } = fetchBundleResult;
    if (fetchError) throw fetchError;

    let currentQuestionsArray = [];
    if (existingBundle && existingBundle.questions) {
      currentQuestionsArray = Array.isArray(existingBundle.questions) ? existingBundle.questions : [];
    }

    const targetSequentialNumber = currentQuestionsArray.length + 1;

    const newQuestionObject = {
      q_num: targetSequentialNumber,
      q_id: qRandomIdStr,
      q_type: questionType,
      q_data: reconstructedFullRawLatex,
      answer_key: answerKey.toLowerCase(),
      question_img_url: publicQuestUrl,
      solution_img_url: publicSolUrl || ""
    };

    currentQuestionsArray = currentQuestionsArray.filter(q => {
      if (!q.q_data || typeof q.q_data !== "string") return true;
      
      const existingMatch = q.q_data.match(/(?:\\noindent\s*)?(?:\\textbf\{\s*(\d+)\.\s*\}|\$(\d+)\$\.\s*|\\item\[\s*(\d+)\.\s*\]|(\d+)\.\s*)/);
      const existingNumStr = existingMatch ? existingMatch.slice(1).find(g => g !== undefined) : null;
      return existingNumStr !== questionNumber;
    });

    currentQuestionsArray.push(newQuestionObject);

    currentQuestionsArray.sort((x, y) => {
      const stringX = typeof x.q_data === "string" ? x.q_data : "";
      const stringY = typeof y.q_data === "string" ? y.q_data : "";

      const matchX = stringX.match(/(?:\\noindent\s*)?(?:\\textbf\{\s*(\d+)\.\s*\}|\$(\d+)\$\.\s*|\\item\[\s*(\d+)\.\s*\]|(\d+)\.\s*)/);
      const numX = matchX ? parseFloat(matchX.slice(1).find(g => g !== undefined)) : 0;
      
      const matchY = stringY.match(/(?:\\noindent\s*)?(?:\\textbf\{\s*(\d+)\.\s*\}|\$(\d+)\$\.\s*|\\item\[\s*(\d+)\.\s*\]|(\d+)\.\s*)/);
      const numY = matchY ? parseFloat(matchY.slice(1).find(g => g !== undefined)) : 0;
      
      return numX - numY;
    });

    const { error: upsertError } = await supabaseAdmin
      .from("question_bundles")
      .upsert(
        {
          exam,
          subject,
          chapter,
          question_type: questionType,
          questions: currentQuestionsArray,
          updated_at: new Date().toISOString()
        },
        { onConflict: "exam,subject,chapter,question_type" }
      );

    if (upsertError) throw upsertError;

    if (!qBase64) {
      const localQPath = path.join(publicTempDir, `preview_q_${index}.png`);
      const localSPath = path.join(publicTempDir, `preview_s_${index}.png`);
      try { fs.unlinkSync(localQPath); } catch (e) {}
      try { fs.unlinkSync(localSPath); } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      assignedIndex: currentQuestionsArray.length
    });

  } catch (err) {
    console.error("Grouped Bundle Upload Core Failure:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}