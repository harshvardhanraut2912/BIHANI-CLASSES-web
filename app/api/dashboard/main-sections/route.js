// app/api/dashboard/main-sections/route.js
//
// Server-side, enrollment-checked replacement for a direct client query
// against sidebar_main_sections. Same rule as dashboard.html's
// buildDynamicSidebarAccordions:
//   - is_course main sections are PRIVATE -- only returned if this student
//     has a matching row in user_enrollments.course_id
//   - non-course sections (Study, Tools, etc.) are always returned
//
// This runs with the service role key, so the filtering happens here, in
// server code the student can't see or modify -- not in the browser. A
// student calling this endpoint directly still only gets back what they're
// enrolled in; there's no client-side list to tamper with.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getVerifiedUser } from '@/lib/studentAuth';

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

export async function GET(request) {
    try {
        // Was: supabaseAdmin.auth.getUser(sessionToken) here directly — a
        // network round-trip to Supabase on every call. See studentAuth.js
        // for why that was causing 403s under normal dashboard load.
        const user = await getVerifiedUser(request);
        if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

        const [{ data: mains, error: mainsErr }, { data: courseEnrollments, error: enrollErr }] = await Promise.all([
            supabaseAdmin
                .from('sidebar_main_sections')
                .select('id, name, icon_url, display_order, is_course, is_paid, price, thumbnail_url, badge_label, notes')
                .order('display_order', { ascending: true }),
            supabaseAdmin
                .from('user_enrollments')
                .select('course_id')
                .eq('student_id', user.email)
                .not('course_id', 'is', null),
        ]);

        if (mainsErr) throw mainsErr;
        if (enrollErr) throw enrollErr;

        const enrolledCourseIds = new Set((courseEnrollments || []).map((r) => r.course_id));

        const visible = (mains || []).filter((section) => !section.is_course || enrolledCourseIds.has(section.id));

        return NextResponse.json({ sections: visible });
    } catch (err) {
        console.error('main-sections error:', err);
        return NextResponse.json({ error: 'Failed to load sections' }, { status: 500 });
    }
}