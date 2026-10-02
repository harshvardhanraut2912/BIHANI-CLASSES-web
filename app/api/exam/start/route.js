// SAVE TO: app/api/exam/start/route.js  (replace the existing file)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// SECURITY FIX: this route reads a per-user session cookie and must
// NEVER be cached or reused across requests/users at the edge or in
// Next.js's Data Cache -- without this, Vercel/Next.js can serve one
// student's response (or coalesce request context) to a different
// student. See: https://vercel.com/docs/functions/configuring-functions/caching
export const dynamic = 'force-dynamic';


// Initialize the Admin Client using the secret Service Role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// supabaseAdmin.auth.getUser() is a real network round-trip to Supabase's
// Auth server (GoTrue), not a local JWT check — and it has no built-in
// timeout. Any latency there previously stalled this whole function
// (and, compounded by the app's own 5-attempt retry loop, could hang
// for a very long time) with the client never getting a clean error to
// react to. This wraps any awaited promise with a hard deadline so a
// slow auth check fails fast with a real error instead of hanging until
// the platform's own function timeout eventually kills it.
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function POST(request) {
    try {
        // 1. Extract and verify the student's session token securely
        const sessionToken = request.cookies.get('cet_session_token')?.value;
        if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        let user;
        try {
            const { data, error: authErr } = await withTimeout(
                supabaseAdmin.auth.getUser(sessionToken),
                8000,
                'auth.getUser'
            );
            if (authErr || !data?.user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });
            user = data.user;
        } catch (timeoutErr) {
            console.error('Exam Start: auth check timed out:', timeoutErr.message);
            return NextResponse.json({ error: 'Authentication check timed out. Please try again.' }, { status: 504 });
        }

        const { test_id } = await request.json();
        if (!test_id) return NextResponse.json({ error: 'Missing test_id' }, { status: 400 });

        // 2. Scheduled-exam gate. Everything here is derived from the
        //    product's own timestamps, never a separately-stored status
        //    flag, so it can't drift out of sync with reality.
        const { data: productRow, error: productErr } = await supabaseAdmin
            .from('products')
            .select('is_scheduled, scheduled_start_at, scheduled_end_at, result_declared_at')
            .eq('id', test_id)
            .maybeSingle();
        if (productErr) throw productErr;

        if (productRow?.is_scheduled) {
            const now = new Date();
            const startAt = productRow.scheduled_start_at ? new Date(productRow.scheduled_start_at) : null;
            const endAt = productRow.scheduled_end_at ? new Date(productRow.scheduled_end_at) : null;
            const resultAt = productRow.result_declared_at ? new Date(productRow.result_declared_at) : null;
            const resultDeclared = resultAt && now >= resultAt;

            if (!resultDeclared) {
                // Still inside the original scheduled cycle — window + one-attempt rules apply.
                if (startAt && now < startAt) {
                    return NextResponse.json({ error: 'This exam is not open yet. Please check back at the scheduled time.' }, { status: 403 });
                }
                if (endAt && now > endAt) {
                    return NextResponse.json({ error: 'The scheduled window for this exam has closed. Results will be declared soon.' }, { status: 403 });
                }

                const { data: priorResult, error: priorErr } = await supabaseAdmin
                    .from('exam_results')
                    .select('id')
                    .eq('test_id', test_id)
                    .eq('student_id', user.email)
                    .limit(1)
                    .maybeSingle();
                if (priorErr) throw priorErr;

                if (priorResult) {
                    return NextResponse.json({ error: 'You have already attempted this scheduled exam. Results will be declared soon.' }, { status: 403 });
                }
            }
            // resultDeclared === true -> falls through and behaves exactly like a normal,
            // unlimited-attempt exam from here on (matches the "reopens for everyone" spec).
        }

        // 3. FIX: Look for an existing resumable attempt before creating a new one.
        //    A student who already has an in_progress or paused row for this exact
        //    test should be sent back into that same row/token, not a fresh one —
        //    otherwise every "Start"/"Resume" click silently forks a new attempt
        //    and the old one's saved progress becomes permanently orphaned.
        const { data: existingSession, error: existingErr } = await supabaseAdmin
            .from('attempt_sessions')
            .select('token, status')
            .eq('test_id', test_id)
            .eq('student_id', user.email)
            .in('status', ['in_progress', 'paused'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingErr) throw existingErr;

        if (existingSession) {
            // Resuming: if it was paused, flip it back to in_progress so
            // save-progress/submit will accept writes against it again.
            if (existingSession.status === 'paused') {
                const { error: resumeErr } = await supabaseAdmin
                    .from('attempt_sessions')
                    .update({ status: 'in_progress' })
                    .eq('token', existingSession.token);
                if (resumeErr) throw resumeErr;
            }

            return NextResponse.json({ url: `/exam.html?token=${existingSession.token}` });
        }

        // 4. No resumable attempt found — generate a fresh 32-char token.
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        const secureToken = "req_" + Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

        // 5. Register the token in the database locked to this specific student.
        //    If a concurrent request for this exact same test+student won the
        //    race and inserted its own row first, the unique partial index
        //    (attempt_sessions_one_active_per_student_test — see the
        //    accompanying migration) rejects this insert with Postgres error
        //    23505 instead of silently allowing two active sessions to exist
        //    at once. That's not a real failure from the student's point of
        //    view — it just means the OTHER concurrent request already
        //    created a usable session — so fetch and hand back that
        //    session's token instead of surfacing an error.
        const { error: dbErr } = await supabaseAdmin.from('attempt_sessions').insert({
            test_id: test_id,
            student_id: user.email,
            token: secureToken,
            status: 'in_progress'
        });

        if (dbErr) {
            if (dbErr.code === '23505') {
                const { data: winningSession, error: refetchErr } = await supabaseAdmin
                    .from('attempt_sessions')
                    .select('token')
                    .eq('test_id', test_id)
                    .eq('student_id', user.email)
                    .in('status', ['in_progress', 'paused'])
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (refetchErr || !winningSession) throw (refetchErr || dbErr);
                return NextResponse.json({ url: `/exam.html?token=${winningSession.token}` });
            }
            throw dbErr;
        }

        // 6. Return the secure URL.
        return NextResponse.json({ url: `/exam.html?token=${secureToken}` });
    } catch (err) {
        console.error("Exam Start Exception:", err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}