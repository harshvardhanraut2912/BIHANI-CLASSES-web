// SAVE TO: app/api/exam/asset/route.js  (new file)
//
// Serves question/solution images for the completed-attempt Review &
// Solutions pages, without ever letting the browser see that the images
// live on GitHub. Mirrors the security pattern of /api/images (the
// live-exam image proxy) but reads from GitHub raw URLs instead of
// Supabase Storage, since GitHub raw has no bandwidth billing concern
// the way Supabase Storage egress does.
//
// Client sends: POST { token, q_id, type: 'question' | 'solution' }
// Server verifies: valid session cookie -> owns this token -> attempt is
// 'completed'. Only then does it fetch the real GitHub URL and stream
// the bytes back under a generic Content-Type, with no-store caching so
// nothing sits in disk cache under a GitHub-revealing name.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/examAuth';

// SECURITY FIX: this route reads a per-user session cookie and must
// NEVER be cached or reused across requests/users at the edge or in
// Next.js's Data Cache -- without this, Vercel/Next.js can serve one
// student's response (or coalesce request context) to a different
// student. See: https://vercel.com/docs/functions/configuring-functions/caching
export const dynamic = 'force-dynamic';


const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function unauthorized(msg = 'Unauthorized') {
  return new NextResponse(msg, { status: 401 });
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);
    const { token, q_id, type } = payload || {};

    if (!token || !q_id || (type !== 'question' && type !== 'solution')) {
      return unauthorized('Unauthorized');
    }

    // 1. Must be a logged-in student. getAuthenticatedUser() wraps
    //    supabaseAdmin.auth.getUser() with a hard timeout, so a slow/hung
    //    Supabase Auth response fails fast instead of hanging.
    const { user, errorResponseInit } = await getAuthenticatedUser(request, supabaseAdmin);
    if (!user) return new NextResponse(errorResponseInit.body?.error || 'Unauthorized', { status: errorResponseInit.status });

    // 2. The token must belong to THIS student, and the attempt must be
    //    completed — same gate as /api/exam/review. This blocks anyone
    //    from replaying a captured token/q_id pair from a different
    //    account or against an in-progress attempt.
    const { data: sessionData, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('test_id, status')
      .eq('token', token)
      .eq('student_id', user.email)
      .single();

    if (sessionErr || !sessionData || sessionData.status !== 'completed') {
      return unauthorized('Unauthorized');
    }

    const testId = sessionData.test_id;

    // 3. Resolve the real image URL server-side — this value never
    //    reaches the browser in any form. GitHub raw is preferred (no
    //    Storage egress cost); Supabase Storage is a fallback for any
    //    question/solution that hasn't been pushed to GitHub yet — still
    //    proxied through this same route, so the origin stays hidden
    //    either way.
    let githubUrl = null;
    let fallbackUrl = null;

    if (type === 'question') {
      const { data: qRow } = await supabaseAdmin
        .from('exam_question_data')
        .select('questions_manifest')
        .eq('mock_test_name', testId)
        .single();

      const manifest = qRow
        ? (typeof qRow.questions_manifest === 'string' ? JSON.parse(qRow.questions_manifest) : qRow.questions_manifest)
        : [];
      const entry = manifest.find(q => q.q_id === q_id);
      githubUrl = entry?.github_que_raw_url || null;
      fallbackUrl = entry?.question_img_url || null;
    } else {
      const { data: kRow } = await supabaseAdmin
        .from('exam_answer_keys')
        .select('answer_key_manifest')
        .eq('mock_test_name', testId)
        .single();

      const manifest = kRow
        ? (typeof kRow.answer_key_manifest === 'string' ? JSON.parse(kRow.answer_key_manifest) : kRow.answer_key_manifest)
        : [];
      const entry = manifest.find(k => k.q_id === q_id);
      githubUrl = entry?.github_sol_raw_url || null;
      fallbackUrl = entry?.solution_img_url || null;
    }

    if (!githubUrl && !fallbackUrl) {
      return new NextResponse('Asset not found.', { status: 404 });
    }

    // 4. Fetch server-side and stream bytes back — the browser only ever
    //    sees "POST /api/exam/asset -> image bytes", never which of the
    //    two sources actually served it.
    let imgResponse = null;
    if (githubUrl) {
      try { imgResponse = await fetch(githubUrl); } catch (e) { imgResponse = null; }
    }
    if (!imgResponse || !imgResponse.ok) {
      if (fallbackUrl) {
        try { imgResponse = await fetch(fallbackUrl); } catch (e) { imgResponse = null; }
      }
    }

    if (!imgResponse || !imgResponse.ok) {
      return new NextResponse('Asset not found.', { status: 404 });
    }

    const imageBuffer = await imgResponse.arrayBuffer();

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        // Deliberately NOT cached to disk under a predictable name/URL —
        // every load re-authenticates and re-fetches.
        'Cache-Control': 'private, no-store',
      },
    });

  } catch (err) {
    console.error("Asset Proxy Exception:", err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}