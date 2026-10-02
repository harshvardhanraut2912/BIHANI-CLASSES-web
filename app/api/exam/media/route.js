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

export async function POST(request) {
  try {
    // 🔒 TRANSIT SECURITY UPGRADE: Extract parameters from secure POST body payload instead of GET query string
    const payload = await request.json();
    const { token, path } = payload;

    if (!token || !path) {
      return new NextResponse('Missing parameters in secure packet transit.', { status: 400 });
    }

    // 1. Verify token session actively
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('test_id, status')
      .eq('token', token)
      .single();

    // 💥 FIX: Allow the review page to fetch images after the exam is 'completed'
    if (sessionErr || !session || (session.status !== 'in_progress' && session.status !== 'completed')) {
      return new NextResponse('Unauthorized secure image request token state.', { status: 401 });
    }
    
    // 2. Fetch test configuration parameters
    const { data: config, error: configErr } = await supabaseAdmin
      .from('exam_configurations')
      .select('image_base_url')
      .eq('id', session.test_id)
      .single();

    if (configErr || !config) {
      return new NextResponse('Configuration matrix setup mismatch.', { status: 404 });
    }

    // 3. Assemble target path
    const finalGitHubUrl = `${config.image_base_url}${path}`;

    // 4. Fetch binary asset streams
    const imgResponse = await fetch(finalGitHubUrl);
    if (!imgResponse.ok) {
      return new NextResponse('Target resource metadata mismatch on remote server.', { status: 404 });
    }

    const imageBuffer = await imgResponse.arrayBuffer();
    
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });

  } catch (err) {
    console.error("Secure Asset Handshake Exception:", err);
    return new NextResponse('Internal Server Fault Error', { status: 500 });
  }
}