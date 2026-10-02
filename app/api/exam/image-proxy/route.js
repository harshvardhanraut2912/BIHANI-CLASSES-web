// app/api/exam/image-proxy/route.js
//
// question_html/options can contain <img> tags (LaTeX-rendered diagrams)
// pointing at Supabase Storage. Even though question-chunk's JSON is
// encrypted, an <img src="https://xxxx.supabase.co/..."> still makes the
// browser fetch that URL directly — visible via "open image in new tab",
// drag-and-drop, or the Network tab. This route fetches the bytes
// server-side and streams them back under a generic path, so the client
// converts them to a blob: URL instead.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

// Only ever proxy requests for our own Supabase Storage host — never an
// arbitrary attacker-supplied URL (basic SSRF guard).
const ALLOWED_HOST = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;

export async function POST(request) {
  try {
    const { token, src } = await request.json();
    if (!token || !src) {
      return new NextResponse('Missing parameters.', { status: 400 });
    }

    let parsed;
    try {
      parsed = new URL(src);
    } catch {
      return new NextResponse('Invalid URL.', { status: 400 });
    }
    if (parsed.host !== ALLOWED_HOST) {
      return new NextResponse('Blocked.', { status: 403 });
    }

    // Session just needs to exist and belong to an active or completed
    // attempt — same asset-access gate used elsewhere.
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('status')
      .eq('token', token)
      .single();

    if (sessionErr || !session || (session.status !== 'in_progress' && session.status !== 'completed')) {
      return new NextResponse('Unauthorized.', { status: 401 });
    }

    const imgResponse = await fetch(parsed.toString());
    if (!imgResponse.ok) {
      return new NextResponse('Not found.', { status: 404 });
    }

    const buffer = await imgResponse.arrayBuffer();
    const contentType = imgResponse.headers.get('content-type') || 'image/png';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('Image Proxy Exception:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}