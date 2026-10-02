// app/api/exam/report-error/route.js
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
        const body = await request.json();
        const { token, questionLabel, sectionName, q_id, description } = body;

        if (!token || !q_id) {
            return NextResponse.json({ error: 'Missing security parameters' }, { status: 400 });
        }

        const { data: sessionData, error: sessionErr } = await supabaseAdmin
            .from('attempt_sessions')
            .select('student_id, test_id')
            .eq('token', token)
            .single();

        if (sessionErr || !sessionData) {
            return NextResponse.json({ error: 'Unauthorized token session' }, { status: 401 });
        }

        const studentId = sessionData.student_id;
        const testId = sessionData.test_id; // == products.id

        // No image resolution needed anymore — the admin Reports page now
        // re-fetches the live question_html/options from
        // exam_question_data_v2 at display time (via q_id + test_id),
        // instead of storing a resolved image URL here.
        const insertPayload = {
            student_id: String(studentId),
            test_id: String(testId),
            q_id: String(q_id),
            question_number: parseInt(questionLabel, 10) || 0,
            section_name: String(sectionName || ''),
            description: description || "No description provided",
            status: "Pending Review"
        };

        const { error: insertErr } = await supabaseAdmin.from('error_reports').insert(insertPayload);

        if (insertErr) {
            console.error("Supabase rejected the error report row:", insertErr.message);
            throw new Error(`Database insertion failed: ${insertErr.message}`);
        }

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("Secure Report Error Exception:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}