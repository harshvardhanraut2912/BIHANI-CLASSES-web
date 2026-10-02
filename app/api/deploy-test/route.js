import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminTokenDetailed, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

// FORCE INITIALIZATION WITH THE ADMIN SERVICE KEY FOR RLS BYPASS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ CRITICAL: Server-side environment tokens are missing!");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
const REPO_OWNER = "harshvardhanraut2912";
const REPO_NAME = "mht-cet-images";
const BRANCH = "main";

// 🔒 SECURITY: This route writes exam content via the service-role key and
// pushes to the private GitHub repo via GITHUB_TOKEN — it must never be
// reachable without a valid admin session. proxy.js's middleware gate is
// the primary defense (it now runs on this path), but this check is kept
// here too as defense-in-depth in case the middleware matcher is ever
// edited again without someone noticing this route depends on it.
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

    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: "Configuration Exception: GITHUB_TOKEN environment variable is unassigned on server." }, { status: 500 });
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Configuration Exception: SUPABASE_SERVICE_ROLE_KEY environment variable is unassigned on server." }, { status: 500 });
    }

    const body = await request.json();
    const { exam, mockName, folderName, manifest } = body;

    if (!folderName || !manifest || !Array.isArray(manifest)) {
      return NextResponse.json({ error: "Invalid Payload: Missing core layout matrix structural configurations." }, { status: 400 });
    }

    const headers = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "NextJS-MockTest-CompilerEngine",
    };

    // ========================================================
    // STEP 1: FETCH BASE REPO REFERENCE HEAD SHAs
    // ========================================================
    const refRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/ref/heads/${BRANCH}`, { headers });
    if (!refRes.ok) throw new Error(`GitHub Ref Error: Failed to poll reference tree heads. Status: ${refRes.status}`);
    const refData = await refRes.json();
    const lastCommitSha = refData.object.sha;

    const commitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits/${lastCommitSha}`, { headers });
    if (!commitRes.ok) throw new Error("GitHub Commit Error: Failed to poll base tree location references.");
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // ========================================================
    // STEP 2: PARSE IMAGE BUFFERS TO GITHUB ENCODED BLOBS
    // ========================================================
    const treeEntries = [];

    const blobPromises = manifest.map(async (item) => {
      // A. Process Question Component
      let qSha = null;
      if (item.question_img_url) {
        const qImgRes = await fetch(item.question_img_url);
        if (qImgRes.ok) {
          const buffer = await qImgRes.arrayBuffer();
          const base64Content = Buffer.from(buffer).toString("base64");

          const blobRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
            method: "POST",
            headers,
            body: JSON.stringify({ content: base64Content, encoding: "base64" }),
          });
          if (blobRes.ok) {
            const blobData = await blobRes.json();
            qSha = blobData.sha;
          }
        }
      }

      // B. Process Solution Component
      let sSha = null;
      if (item.solution_img_url) {
        const sImgRes = await fetch(item.solution_img_url);
        if (sImgRes.ok) {
          const buffer = await sImgRes.arrayBuffer();
          const base64Content = Buffer.from(buffer).toString("base64");

          const blobRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/blobs`, {
            method: "POST",
            headers,
            body: JSON.stringify({ content: base64Content, encoding: "base64" }),
          });
          if (blobRes.ok) {
            const blobData = await blobRes.json();
            sSha = blobData.sha;
          }
        }
      }

      if (qSha) {
        treeEntries.push({
          path: `tests/${folderName}/${item.test_q_git_name}`,
          mode: "100644",
          type: "blob",
          sha: qSha,
        });
      }

      if (sSha) {
        treeEntries.push({
          path: `solutions/${folderName}/${item.solution_git_name}`,
          mode: "100644",
          type: "blob",
          sha: sSha,
        });
      }
    });

    await Promise.all(blobPromises);

    if (treeEntries.length === 0) {
      throw new Error("Blob Generation Empty: Failed to resolve binary image strings from any Supabase links.");
    }

    // ========================================================
    // STEP 3: SUBMIT NEW GRAPHICAL FILE SCHEMATICS TREE
    // ========================================================
    const treeRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees`, {
      method: "POST",
      headers,
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
    });
    if (!treeRes.ok) throw new Error("GitHub Tree Error: Failed to compile remote directory objects.");
    const newTreeData = await treeRes.json();
    const newTreeSha = newTreeData.sha;

    // ========================================================
    // STEP 4: WRITE TRANSACTION COMMIT
    // ========================================================
    const newCommitRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/commits`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: `🤖 System Auto-Build: Compiled deployment for ${folderName}`,
        tree: newTreeSha,
        parents: [lastCommitSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error("GitHub Commit Error: Failed to stage change trees.");
    const newCommitData = await newCommitRes.json();
    const newCommitSha = newCommitData.sha;

    // ========================================================
    // STEP 5: ATOMIC SHIFT BRANCH REFERENCE HEAD POINTER
    // ========================================================
    const patchRefRes = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ sha: newCommitSha, force: false }),
    });
    if (!patchRefRes.ok) throw new Error("GitHub Deployment Error: Failed to redirect branch reference pointers.");

    // ========================================================
    // 🔥 STEP 6: SPLIT INTO TWO TABLE SHAPES + UPSERT (Guaranteed Execution)
    // ========================================================
    // exam_question_data: student-facing side — NO answer_key, NO solution fields.
    const questionsManifest = manifest.map((item) => ({
      q_id: item.q_id,
      sub_id: item.sub_id,
      test_q_num: item.test_q_num,
      test_q_git_name: item.test_q_git_name,
      question_img_url: item.question_img_url,
      github_que_raw_url: item.github_que_raw_url,
    }));

    // exam_answer_keys: answers + solutions, kept in a separate table entirely.
    const answerKeyManifest = manifest.map((item) => ({
      q_id: item.q_id,
      sub_id: item.sub_id,
      test_q_num: item.test_q_num,
      answer_key: item.answer_key,
      solution_git_name: item.solution_git_name,
      solution_img_url: item.solution_img_url,
      github_sol_raw_url: item.github_sol_raw_url,
    }));

    // mock_test_name is the join key between the two tables — same string, both rows.
    // Upsert (not insert) so re-pushing an existing mock test updates its row instead
    // of creating a duplicate. Requires a UNIQUE constraint on mock_test_name in both
    // tables for onConflict to work.
    const { error: qDbError } = await supabaseAdmin
      .from("exam_question_data")
      .upsert(
        [{
          exam: exam,
          mock_test_name: mockName,
          github_folder_name: folderName,
          questions_manifest: questionsManifest,
        }],
        { onConflict: "mock_test_name" }
      );

    if (qDbError) {
      throw new Error(`Supabase Question Ledger Exception (RLS/DB Error): ${qDbError.message}`);
    }

    const { error: aDbError } = await supabaseAdmin
      .from("exam_answer_keys")
      .upsert(
        [{
          mock_test_name: mockName,
          answer_key_manifest: answerKeyManifest,
        }],
        { onConflict: "mock_test_name" }
      );

    if (aDbError) {
      throw new Error(`Supabase Answer Key Ledger Exception (RLS/DB Error): ${aDbError.message}`);
    }

    return NextResponse.json({ success: true, files_pushed: treeEntries.length });

  } catch (error) {
    console.error("Pipeline Failure:", error);
    return NextResponse.json({ error: error.message || "Pipeline execution aborted." }, { status: 500 });
  }
}