// SAVE TO: app/api/admin/reports/regenerate/route.js
//
// Handles three actions dispatched from the admin Reports page:
//   - "preview": given a reported test_q_num, resolve which chapter it
//                belongs to and return candidate replacement questions.
//   - "replace": push the chosen replacement's image to GitHub at the
//                SAME path/filename the old question used, then update
//                exam_question_data + exam_answer_keys for that one slot.
//   - "delete":  remove a question permanently from question_bundles
//                (the master pool) so it's never drawn into a future test.
//   - "void":    mark a test_q_num as a bonus/voided slot (question_voids).
//
// NOTE: exam_question_data.questions_manifest no longer carries `chapter`
// (deploy-test strips it), so "preview" resolves chapter by scanning
// question_bundles for the subject derived from sub_id.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_OWNER = "harshvardhanraut2912";
const REPO_NAME = "mht-cet-images";
const BRANCH = "main";

const SUB_ID_TO_SUBJECT = {
  phy_sec: "Physics",
  chem_sec: "Chemistry",
  math_sec: "Mathematics",
  bio_sec: "Biology",
};

async function getManifests(testId) {
  const [{ data: qRow, error: qErr }, { data: aRow, error: aErr }] = await Promise.all([
    supabaseAdmin
      .from("exam_question_data")
      .select("id, github_folder_name, questions_manifest")
      .eq("mock_test_name", testId)
      .single(),
    supabaseAdmin
      .from("exam_answer_keys")
      .select("id, answer_key_manifest")
      .eq("mock_test_name", testId)
      .single(),
  ]);
  if (qErr || !qRow) throw new Error(`No exam_question_data row for test_id "${testId}"`);
  if (aErr || !aRow) throw new Error(`No exam_answer_keys row for test_id "${testId}"`);

  const questionsManifest =
    typeof qRow.questions_manifest === "string" ? JSON.parse(qRow.questions_manifest) : qRow.questions_manifest;
  const answerKeyManifest =
    typeof aRow.answer_key_manifest === "string" ? JSON.parse(aRow.answer_key_manifest) : aRow.answer_key_manifest;

  return { qRow, aRow, questionsManifest, answerKeyManifest };
}

async function findChapterAndBundleRow(subject, qId) {
  const { data: bundles, error } = await supabaseAdmin
    .from("question_bundles")
    .select("id, chapter, question_type, questions")
    .eq("subject", subject);
  if (error) throw new Error(`Failed to load question_bundles for ${subject}: ${error.message}`);

  for (const row of bundles || []) {
    const list = Array.isArray(row.questions) ? row.questions : [];
    if (list.some((q) => q.q_id === qId)) {
      return { chapter: row.chapter, bundleRow: row, allSubjectBundles: bundles };
    }
  }
  return { chapter: null, bundleRow: null, allSubjectBundles: bundles };
}

async function pushSingleImageCommit({ folderName, testQGitName, solutionGitName, questionImgUrl, solutionImgUrl }) {
  if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN environment variable is unassigned on server.");

  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "NextJS-MockTest-CompilerEngine",
  };

  const refRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${BRANCH}`, { headers });
  if (!refRes.ok) throw new Error(`GitHub Ref Error: ${refRes.status}`);
  const refData = await refRes.json();
  const lastCommitSha = refData.object.sha;

  const commitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${lastCommitSha}`, { headers });
  if (!commitRes.ok) throw new Error("GitHub Commit Error: failed to resolve base tree.");
  const commitData = await commitRes.json();
  const baseTreeSha = commitData.tree.sha;

  const treeEntries = [];

  const qImgRes = await fetch(questionImgUrl);
  if (!qImgRes.ok) throw new Error("Could not fetch replacement question image from Supabase storage.");
  const qBuffer = await qImgRes.arrayBuffer();
  const qBlobRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: Buffer.from(qBuffer).toString("base64"), encoding: "base64" }),
  });
  if (!qBlobRes.ok) throw new Error("Failed to create GitHub blob for question image.");
  const qBlob = await qBlobRes.json();
  treeEntries.push({ path: `tests/${folderName}/${testQGitName}`, mode: "100644", type: "blob", sha: qBlob.sha });

  if (solutionImgUrl && solutionGitName) {
    const sImgRes = await fetch(solutionImgUrl);
    if (sImgRes.ok) {
      const sBuffer = await sImgRes.arrayBuffer();
      const sBlobRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ content: Buffer.from(sBuffer).toString("base64"), encoding: "base64" }),
      });
      if (sBlobRes.ok) {
        const sBlob = await sBlobRes.json();
        treeEntries.push({ path: `solutions/${folderName}/${solutionGitName}`, mode: "100644", type: "blob", sha: sBlob.sha });
      }
    }
  }

  const treeRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!treeRes.ok) throw new Error("GitHub Tree Error: failed to build replacement tree.");
  const newTree = await treeRes.json();

  const newCommitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: `🤖 Question regenerate: ${folderName}/${testQGitName}`,
      tree: newTree.sha,
      parents: [lastCommitSha],
    }),
  });
  if (!newCommitRes.ok) throw new Error("GitHub Commit Error: failed to commit replacement tree.");
  const newCommit = await newCommitRes.json();

  const patchRefRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  if (!patchRefRes.ok) throw new Error("GitHub Deployment Error: failed to move branch pointer.");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, test_id, test_q_num } = body;

    if (!action || !test_id || !test_q_num) {
      return NextResponse.json({ error: "Missing action, test_id, or test_q_num." }, { status: 400 });
    }

    // ============================================================
    // PREVIEW — resolve chapter + candidate replacements
    // ============================================================
    if (action === "preview") {
      const { questionsManifest } = await getManifests(test_id);
      const entry = questionsManifest.find((q) => q.test_q_num === test_q_num);
      if (!entry) return NextResponse.json({ error: `No manifest entry for test_q_num ${test_q_num}` }, { status: 404 });

      const subject = SUB_ID_TO_SUBJECT[entry.sub_id];
      if (!subject) return NextResponse.json({ error: `Unknown sub_id "${entry.sub_id}"` }, { status: 400 });

      const { chapter, allSubjectBundles } = await findChapterAndBundleRow(subject, entry.q_id);
      if (!chapter) {
        return NextResponse.json({ error: "Could not locate this question's chapter in question_bundles." }, { status: 404 });
      }

      const usedIds = new Set(questionsManifest.map((q) => q.q_id));
      const candidates = [];
      (allSubjectBundles || [])
        .filter((row) => row.chapter === chapter)
        .forEach((row) => {
          (row.questions || []).forEach((q) => {
            if (!usedIds.has(q.q_id)) {
              candidates.push({
                q_id: q.q_id,
                question_img_url: q.question_img_url,
                solution_img_url: q.solution_img_url || null,
                answer_key: q.answer_key,
                question_type: row.question_type,
              });
            }
          });
        });

      return NextResponse.json({
        success: true,
        current: { q_id: entry.q_id, sub_id: entry.sub_id, subject, chapter, test_q_git_name: entry.test_q_git_name },
        candidates,
      });
    }

    // ============================================================
    // REPLACE — push new image at same path, patch both manifests
    // ============================================================
    if (action === "replace") {
      const { new_q_id } = body;
      if (!new_q_id) return NextResponse.json({ error: "Missing new_q_id." }, { status: 400 });

      const { qRow, aRow, questionsManifest, answerKeyManifest } = await getManifests(test_id);
      const qIndex = questionsManifest.findIndex((q) => q.test_q_num === test_q_num);
      const aIndex = answerKeyManifest.findIndex((q) => q.test_q_num === test_q_num);
      if (qIndex === -1 || aIndex === -1) {
        return NextResponse.json({ error: `test_q_num ${test_q_num} not found in one of the manifests.` }, { status: 404 });
      }

      const oldQEntry = questionsManifest[qIndex];
      const oldAEntry = answerKeyManifest[aIndex];
      const subject = SUB_ID_TO_SUBJECT[oldQEntry.sub_id];

      const { chapter } = await findChapterAndBundleRow(subject, oldQEntry.q_id);
      const { data: bundleRows } = await supabaseAdmin
        .from("question_bundles")
        .select("questions")
        .eq("subject", subject)
        .eq("chapter", chapter);

      let replacement = null;
      for (const row of bundleRows || []) {
        const found = (row.questions || []).find((q) => q.q_id === new_q_id);
        if (found) {
          replacement = found;
          break;
        }
      }
      if (!replacement) return NextResponse.json({ error: "Replacement question not found in pool." }, { status: 404 });

      // Same filenames as before — this is what makes it an in-place overwrite.
      await pushSingleImageCommit({
        folderName: qRow.github_folder_name,
        testQGitName: oldQEntry.test_q_git_name,
        solutionGitName: oldAEntry.solution_git_name,
        questionImgUrl: replacement.question_img_url,
        solutionImgUrl: replacement.solution_img_url,
      });

      questionsManifest[qIndex] = {
        ...oldQEntry,
        q_id: replacement.q_id,
        question_img_url: replacement.question_img_url,
        // github_que_raw_url / test_q_git_name stay identical — same path.
      };
      answerKeyManifest[aIndex] = {
        ...oldAEntry,
        q_id: replacement.q_id,
        answer_key: replacement.answer_key,
        solution_img_url: replacement.solution_img_url,
        // solution_git_name / github_sol_raw_url stay identical — same path.
      };

      const { error: qUpdateErr } = await supabaseAdmin
        .from("exam_question_data")
        .update({ questions_manifest: questionsManifest })
        .eq("id", qRow.id);
      if (qUpdateErr) throw new Error(`Failed to update exam_question_data: ${qUpdateErr.message}`);

      const { error: aUpdateErr } = await supabaseAdmin
        .from("exam_answer_keys")
        .update({ answer_key_manifest: answerKeyManifest })
        .eq("id", aRow.id);
      if (aUpdateErr) throw new Error(`Failed to update exam_answer_keys: ${aUpdateErr.message}`);

      return NextResponse.json({ success: true, new_q_id: replacement.q_id });
    }

    // ============================================================
    // DELETE — purge a question from the master pool (question_bundles)
    // ============================================================
    if (action === "delete") {
      const { q_id, subject, chapter } = body;
      if (!q_id || !subject || !chapter) {
        return NextResponse.json({ error: "Missing q_id, subject, or chapter." }, { status: 400 });
      }

      const { data: rows, error } = await supabaseAdmin
        .from("question_bundles")
        .select("id, questions")
        .eq("subject", subject)
        .eq("chapter", chapter);
      if (error) throw new Error(`Failed to load question_bundles: ${error.message}`);

      let updated = false;
      for (const row of rows || []) {
        const list = Array.isArray(row.questions) ? row.questions : [];
        if (list.some((q) => q.q_id === q_id)) {
          const nextQuestions = list.filter((q) => q.q_id !== q_id);
          const { error: delErr } = await supabaseAdmin
            .from("question_bundles")
            .update({ questions: nextQuestions })
            .eq("id", row.id);
          if (delErr) throw new Error(`Failed to update question_bundles row ${row.id}: ${delErr.message}`);
          updated = true;
          break;
        }
      }

      if (!updated) return NextResponse.json({ error: "Question not found in question_bundles." }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    // ============================================================
    // VOID — mark this slot as a bonus/void question
    // ============================================================
    if (action === "void") {
      const { reason } = body;
      const { error } = await supabaseAdmin
        .from("question_voids")
        .upsert([{ mock_test_name: test_id, test_q_num, reason: reason || null }], { onConflict: "mock_test_name,test_q_num" });
      if (error) throw new Error(`Failed to void question: ${error.message}`);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (error) {
    console.error("Regenerate route failure:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}