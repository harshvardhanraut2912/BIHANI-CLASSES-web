// app/api/dashboard/chapter-products/route.js
//
// LEVEL 3 of the progressive dashboard loader: given a subsection's chapter
// ids, returns the products for ALL of them in a single `.in()` query and
// groups them by chapter_id server-side. This replaces the old
// /api/dashboard/tree behaviour of firing one products query per chapter
// (which is what made the whole tree endpoint slow -- N+1 queries before
// anything could render). Fetched in the background right after LEVEL 2
// (subsection-content) resolves a chapters list, so by the time the
// student taps a chapter the products are usually already cached.

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
        const chapterIdsParam = searchParams.get('chapterIds');
        if (!mainSectionId || !chapterIdsParam) {
            return NextResponse.json({ error: 'Missing mainSectionId/chapterIds' }, { status: 400 });
        }
        const chapterIds = chapterIdsParam.split(',').map((s) => s.trim()).filter(Boolean);
        if (chapterIds.length === 0) return NextResponse.json({ productsByChapter: {} });

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

        const { data: products, error: prodErr } = await supabaseAdmin
            .from('products')
            .select(PRODUCT_SELECT)
            .in('chapter_id', chapterIds)
            .order('created_at', { ascending: true });
        if (prodErr) throw prodErr;

        const gated = mainSection.is_course ? (products || []) : (products || []).filter((p) => enrolledProductIds.has(p.id));

        const productsByChapter = {};
        chapterIds.forEach((id) => { productsByChapter[id] = []; });
        gated.forEach((p) => {
            if (!productsByChapter[p.chapter_id]) productsByChapter[p.chapter_id] = [];
            productsByChapter[p.chapter_id].push(p);
        });

        return NextResponse.json({ productsByChapter });
    } catch (err) {
        console.error('dashboard chapter-products error:', err);
        return NextResponse.json({ error: 'Failed to load chapter products' }, { status: 500 });
    }
}