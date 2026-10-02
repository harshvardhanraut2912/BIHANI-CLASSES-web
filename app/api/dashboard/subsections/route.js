// app/api/dashboard/subsections/route.js
//
// LEVEL 1 of the progressive dashboard loader: returns ONLY the subsection
// list for a main section -- no chapters, no products. This is the endpoint
// hit for every course the student can see (including ones they haven't
// opened yet), because it's cheap: one query, no per-chapter/per-product
// fan-out. Deep content (chapters/products) is loaded separately and only
// for whichever course is currently open -- see subsection-content and
// chapter-products routes.
//
// Same enrollment gate as the old /api/dashboard/tree route: a course
// section the student isn't enrolled in returns 403 with no data at all.

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

        const { searchParams } = new URL(request.url);
        const mainSectionId = searchParams.get('mainSectionId');
        if (!mainSectionId) return NextResponse.json({ error: 'Missing mainSectionId' }, { status: 400 });

        const { data: mainSection, error: mainErr } = await supabaseAdmin
            .from('sidebar_main_sections')
            .select('id, is_course')
            .eq('id', mainSectionId)
            .maybeSingle();
        if (mainErr) throw mainErr;
        if (!mainSection) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

        if (mainSection.is_course) {
            const { count, error: enrollErr } = await supabaseAdmin
                .from('user_enrollments')
                .select('course_id', { count: 'exact', head: true })
                .eq('student_id', user.email)
                .eq('course_id', mainSection.id);
            if (enrollErr) throw enrollErr;
            if (!count) return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
        }

        const { data: subsections, error: subsErr } = await supabaseAdmin
            .from('sidebar_subsections')
            .select('id, main_section_id, name, display_order, icon_url')
            .eq('main_section_id', mainSectionId)
            .order('display_order', { ascending: true });
        if (subsErr) throw subsErr;

        return NextResponse.json({ subsections: subsections || [] });
    } catch (err) {
        console.error('dashboard subsections error:', err);
        return NextResponse.json({ error: 'Failed to load subsections' }, { status: 500 });
    }
}