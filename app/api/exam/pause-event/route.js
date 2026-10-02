// SAVE TO: app/api/exam/pause-event/route.js  (new file)
//
// Fire-and-forget endpoint the exam engine calls whenever the student's
// attempt is disrupted in a "legit" way: tab hidden/minimized, internet
// dropped, or the tab/page actually closing. Trusts the token the same
// way save-progress does (this route is only ever called by a client
// that already has a live secureToken for an in-progress attempt).
//
// The actual increment + debounce logic lives in the DB function
// increment_pause_count() (see sql/2026-09-20_pause_count.sql) so it's
// atomic and safe against two events firing milliseconds apart for the
// same real disruption (e.g. closing a tab fires visibilitychange(hidden)
// immediately followed by pagehide).
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'Missing token.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc('increment_pause_count', {
      p_token: token,
    });

    if (error) {
      console.error('increment_pause_count RPC failed:', error.message);
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Pause Event Exception:', err);
    // Never let a pause-tracking hiccup surface to the student — this is
    // best-effort telemetry, not exam-critical.
    return NextResponse.json({ ok: true });
  }
}
