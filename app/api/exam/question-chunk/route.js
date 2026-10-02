// app/api/exam/question-chunk/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

function deriveSessionKey(token) {
  return crypto
    .createHash('sha256')
    .update(`${process.env.ADMIN_SESSION_SECRET}:${token}`)
    .digest();
}

// AES-256-GCM. Web Crypto's subtle.decrypt() expects ciphertext+tag
// concatenated, which is exactly what Node's cipher.getAuthTag()
// appended to the ciphertext gives us — no re-splitting needed.
function encryptChunk(key, plaintextObj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    data: Buffer.concat([encrypted, authTag]).toString('base64'),
  };
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => null);
    const { token, q_id } = payload || {};
    if (!token || !q_id) {
      return NextResponse.json({ error: 'Missing parameters.' }, { status: 400 });
    }

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('test_id, status')
      .eq('token', token)
      .single();

    // 'paused' is a presence/dashboard label now, not an access gate --
    // a tab-switch (pagehide) flips it to 'paused' even though the
    // student is still mid-exam, so it must not block question loads.
    // Only a missing/invalid token or a genuinely finished attempt is
    // denied here.
    if (sessionErr || !session || session.status === 'completed') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const testId = session.test_id;
    let v2RowId = testId;
    const { data: productRow } = await supabaseAdmin
      .from('products')
      .select('linked_exam_v2_id')
      .eq('id', testId)
      .maybeSingle();
    if (productRow?.linked_exam_v2_id) {
      v2RowId = productRow.linked_exam_v2_id;
    }

    const { data: qRow, error: qErr } = await supabaseAdmin
      .from('exam_question_data_v2')
      .select('questions_manifest')
      .eq('id', v2RowId)
      .single();

    if (qErr || !qRow) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const manifest = Array.isArray(qRow.questions_manifest)
      ? qRow.questions_manifest
      : JSON.parse(qRow.questions_manifest || '[]');

    const entry = manifest.find((q) => q.q_id === q_id);
    if (!entry) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 });
    }

    const key = deriveSessionKey(token);
    const chunk = encryptChunk(key, {
      question_html: entry.question_html,
      options: entry.options,
    });

    return NextResponse.json(chunk, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    console.error('Question Chunk Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}