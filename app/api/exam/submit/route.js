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

export async function POST(request) {
    try {
        // getAuthenticatedUser() reads the cookie and wraps
        // supabaseAdmin.auth.getUser() with a hard timeout — a slow/hung
        // Supabase Auth response now fails cleanly (504) instead of
        // leaving a final exam submit hanging indefinitely.
        const { user, errorResponseInit } = await getAuthenticatedUser(request, supabaseAdmin);
        if (!user) {
            return NextResponse.json(errorResponseInit.body, { status: errorResponseInit.status });
        }

        const { token, raw_response_matrix } = await request.json();

        // 1. Verify the token is valid, belongs to the user, and is STILL in progress
        const { data: sessionData, error: sessionErr } = await supabaseAdmin
            .from('attempt_sessions')
            .select('test_id, status')
            .eq('token', token)
            .eq('student_id', user.email)
            .single();

        // Accept submit from 'in_progress' OR 'paused' -- pagehide can flip
        // a live attempt to 'paused' on a plain tab switch, and submit is
        // the one action that must never be blocked by that false signal.
        // Only a token that's missing, belongs to someone else, or has
        // already been completed is rejected.
        if (sessionErr || !sessionData || sessionData.status === 'completed') {
            return NextResponse.json({ error: 'Invalid, expired, or already submitted exam token.' }, { status: 403 });
        }

        // 2. Insert the final results securely using the Admin Key (bypassing any client-side RLS tricks)
        const { error: insertErr } = await supabaseAdmin.from('exam_results').insert({
            test_id: sessionData.test_id,
            student_id: user.email,
            raw_response_matrix: raw_response_matrix
        });

        if (insertErr) throw insertErr;

        // 3. LOCK THE EXAM: Update the session token status to 'completed' so it can NEVER be submitted again
        await supabaseAdmin.from('attempt_sessions').update({ status: 'completed' }).eq('token', token);

        // 4. Scheduled exams whose result hasn't been declared yet don't get
        //    sent to the review page — student just gets a "saved" ack and
        //    goes back to the dashboard; results unlock later via the
        //    dedicated "Check Result" gate once result_declared_at passes.
        const { data: productRow } = await supabaseAdmin
            .from('products')
            .select('is_scheduled, result_declared_at')
            .eq('id', sessionData.test_id)
            .maybeSingle();

        const resultPending = productRow?.is_scheduled &&
            (!productRow.result_declared_at || new Date() < new Date(productRow.result_declared_at));

        if (resultPending) {
            return NextResponse.json({ status: 'saved', message: 'Your attempt was saved successfully.' });
        }

        // 5. Return the secure URL for the review page
       return NextResponse.json({ url: `/review.html?token=${token}` });
       
    } catch (err) {
        console.error("Submission Proxy Exception:", err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}