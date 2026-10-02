// app/api/dashboard/subsection-content/route.js
//
// LEVEL 2 of the progressive dashboard loader: returns the content for ONE
// subsection -- either its chapter list (if it has chapters) or, for
// legacy 2-level subsections with no chapters, the leaf products directly.
// It deliberately does NOT fetch per-chapter products; that's LEVEL 3
// (chapter-products route), fetched separately after chapters are shown so
// the chapter grid can render the instant this responds.
//
// Same enrollment gate as /api/dashboard/tree: a course section the
// student isn't enrolled in is rejected outright; non-course sections gate
// products individually by user_enrollments.product_id, same as before.

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

const PRODUCT_SELECT = '*, product_type_info(*)';

export async function GET(request) {
    try {
        // Was: supabaseAdmin.auth.getUser(sessionToken) here directly — a
        // network round-trip to Supabase on every call. See studentAuth.js
        // for why that was causing 403s under normal dashboard load.
        const user = await getVerifiedUser(request);
        if (!user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const mainSectionId = searchParams.get('mainSectionId');
        const subsectionId = searchParams.get('subsectionId');
        if (!mainSectionId || !subsectionId) {
            return NextResponse.json({ error: 'Missing mainSectionId/subsectionId' }, { status: 400 });
        }

        const { data: mainSection, error: mainErr } = await supabaseAdmin
            .from('sidebar_main_sections')
            .select('id, is_course')
            .eq('id', mainSectionId)
            .maybeSingle();
        if (mainErr) throw mainErr;
        if (!mainSection) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

        let enrolledProductIds = new Set();
        if (mainSection.is_course) {
            const { count, error: enrollErr } = await supabaseAdmin
                .from('user_enrollments')
                .select('course_id', { count: 'exact', head: true })
                .eq('student_id', user.email)
                .eq('course_id', mainSection.id);
            if (enrollErr) throw enrollErr;
            if (!count) return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
        } else {
            const { data: enrollments, error: enrollErr } = await supabaseAdmin
                .from('user_enrollments')
                .select('product_id')
                .eq('student_id', user.email);
            if (enrollErr) throw enrollErr;
            enrolledProductIds = new Set((enrollments || []).filter((r) => r.product_id != null).map((r) => r.product_id));
        }
        const gateProducts = (rows) => (mainSection.is_course ? rows : rows.filter((p) => enrolledProductIds.has(p.id)));

        const { data: chapters, error: chapErr } = await supabaseAdmin
            .from('sidebar_chapters')
            .select('id, subsection_id, name, display_order, icon_url')
            .eq('subsection_id', subsectionId)
            .order('display_order', { ascending: true });
        if (chapErr) throw chapErr;

        if (chapters && chapters.length > 0) {
            return NextResponse.json({ mode: 'chapters', chapters });
        }

        const { data: products, error: prodErr } = await supabaseAdmin
            .from('products')
            .select(PRODUCT_SELECT)
            .or(`course_subsection_id.eq.${subsectionId},subsection_id.eq.${subsectionId}`)
            .order('created_at', { ascending: true });
        if (prodErr) throw prodErr;

        return NextResponse.json({ mode: 'products', products: gateProducts(products || []) });
    } catch (err) {
        console.error('dashboard subsection-content error:', err);
        return NextResponse.json({ error: 'Failed to load subsection content' }, { status: 500 });
    }
}