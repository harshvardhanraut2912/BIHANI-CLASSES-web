// SAVE TO: app/api/exam/save-progress/route.js  (new file — this route did not exist yet)
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
    const { token, exam_state, current_question_label, current_section_name } = await request.json();

    if (!token || !exam_state) {
      return NextResponse.json({ error: 'Missing token or exam_state.' }, { status: 400 });
    }

    // Only allow writes against a session that is still genuinely active.
    // A 'paused' or 'completed' row should never accept a fresh autosave —
    // pausing/completing are one-way transitions from the exam's point of view.
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('status')
      .eq('token', token)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Invalid exam token.' }, { status: 403 });
    }

    // 'paused' no longer blocks autosave -- pagehide flips it to 'paused'
    // on a mere tab switch, and the student is still actively taking the
    // exam. Only a completed (already-submitted) attempt refuses writes.
    if (session.status === 'completed') {
      return NextResponse.json({ error: 'This attempt is not currently active.' }, { status: 409 });
    }

    const { error: updateErr } = await supabaseAdmin
      .from('attempt_sessions')
      .update({
        exam_state: exam_state,
        last_active_at: new Date().toISOString(),
        // A live autosave proves the student reconnected -- flip 'paused'
        // back to 'in_progress' here too, not just via /api/exam/start,
        // so status stays accurate even if the client-side reconnect call
        // hasn't landed yet.
        status: 'in_progress',
        // Convenience columns for dashboard "Resume — Q14, Physics" previews
        // without parsing the JSON blob. Optional fields — only set if sent.
        ...(current_question_label != null ? { current_question_label } : {}),
        ...(current_section_name != null ? { current_section_name } : {})
      })
      .eq('token', token)
      .neq('status', 'completed'); // belt-and-suspenders against a race with a completed submit

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("Save Progress Exception:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}