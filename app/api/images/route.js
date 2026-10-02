// app/api/images/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==========================================
// GET — unchanged. Only ever use this for public,
// non-sensitive assets (thumbnails, icons, logos).
// NEVER route question/solution images through GET —
// it has no token check on purpose, since it's meant
// for things anyone is already allowed to see.
// ==========================================
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let rawPath = searchParams.get('path');
  if (!rawPath) return NextResponse.json({ error: 'Asset reference path parameter missing.' }, { status: 400 });
  return processAndStreamGithubAsset(rawPath);
}

// ==========================================
// POST — now the secure, per-question gate.
// Client sends { token, q_id } (preferred) or
// { token, sub_id, test_q_num } as a fallback for
// legacy manifest rows that never got a q_id.
// No raw path is ever accepted from the client anymore.
// ==========================================
export async function POST(request) {
  try {
    const body = await request.json();
    const { token, q_id, sub_id, test_q_num } = body;

    if (!token || (!q_id && !(sub_id && test_q_num))) {
      return NextResponse.json({ error: 'Missing security parameters.' }, { status: 400 });
    }

    // 1. Verify the token belongs to a real, currently-relevant attempt.
    //    'completed' is allowed too, so review.html can reuse this same
    //    route later to re-display question images after submission.
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('test_id, status, exam_state')
      .eq('token', token)
      .single();

    if (sessionErr || !session || (session.status !== 'in_progress' && session.status !== 'completed')) {
      return NextResponse.json({ error: 'Unauthorized or expired exam token.' }, { status: 401 });
    }

    // 2. Pull this test's question manifest and structure in parallel.
    const [{ data: questionData, error: qdErr }, { data: productRow, error: prodErr }] = await Promise.all([
      supabaseAdmin
        .from('exam_question_data')
        .select('github_folder_name, questions_manifest')
        .eq('mock_test_name', session.test_id)
        .single(),
      supabaseAdmin
        .from('products')
        .select('sections')
        .eq('id', session.test_id)
        .single()
    ]);

    if (qdErr || !questionData) {
      return NextResponse.json({ error: 'Test content not found.' }, { status: 404 });
    }

    // 3. Find the requested question inside this test's manifest.
    //    Match by q_id first; fall back to sub_id + test_q_num for
    //    manifest entries that were saved without a q_id.
    const manifest = questionData.questions_manifest || [];
    const entry = q_id
      ? manifest.find(q => q.q_id === q_id)
      : manifest.find(q => q.sub_id === sub_id && q.test_q_num === test_q_num);

    if (!entry || !entry.test_q_git_name) {
      return NextResponse.json({ error: 'Question not found in test manifest.' }, { status: 404 });
    }

    // 4. Enforce the paper lock server-side — only while the exam is
    //    still in_progress. Once completed, any question can be viewed
    //    (needed for review). If exam_state hasn't been saved yet
    //    (very first load), default to paper 1 being the active phase.
    if (session.status === 'in_progress' && productRow?.sections) {
      const section = productRow.sections.find(s => s.id === entry.sub_id);
      const activePaperId = session.exam_state?.currentActivePaperId ?? 1;

      if (section && parseInt(section.paperAllocation) !== parseInt(activePaperId)) {
        return NextResponse.json({ error: 'This question belongs to a locked paper.' }, { status: 403 });
      }
    }

    // 5. Build the real path from stored data — never guessed/prefixed.
    const finalPath = `tests/${questionData.github_folder_name}/${entry.test_q_git_name}`;

    return processAndStreamGithubAsset(finalPath);

  } catch (err) {
    console.error("Secure Image API Exception:", err);
    return NextResponse.json({ error: 'Invalid payload execution constraint.' }, { status: 400 });
  }
}

async function processAndStreamGithubAsset(rawPath) {
  if (!process.env.GITHUB_TOKEN) {
    console.error("❌ DEBUG: GITHUB_TOKEN is missing from .env.local!");
    return NextResponse.json({ error: 'Server authentication unconfigured.' }, { status: 500 });
  }

  try {
    const githubOwner = "harshvardhanraut2912";
    const githubRepo = "mht-cet-images";

    // Decode space variables (%20 -> " ")
    let cleanPath = decodeURIComponent(rawPath).replace(/^\//, '');

    const githubApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${cleanPath}`;

    let githubResponse = await fetch(githubApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.raw'
      }
    });

    if (!githubResponse.ok) {
      console.error(`❌ GITHUB REJECTED IT! Status Code: ${githubResponse.status} for path: ${cleanPath}`);
      return NextResponse.json({ error: 'Target media asset not found.' }, { status: 404 });
    }

    const fileBlob = await githubResponse.blob();
    let contentType = 'image/png';
    if (cleanPath.endsWith('.jpg') || cleanPath.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (cleanPath.endsWith('.svg')) contentType = 'image/svg+xml';
    else if (cleanPath.endsWith('.ico')) contentType = 'image/x-icon';
    else if (cleanPath.endsWith('.webp')) contentType = 'image/webp';

    return new NextResponse(fileBlob, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=0, must-revalidate' // question images: don't let browsers/CDNs cache across students
      }
    });

  } catch (err) {
    console.error("Secure Image API Exception:", err);
    return NextResponse.json({ error: 'Internal streaming execution fault.' }, { status: 500 });
  }
}