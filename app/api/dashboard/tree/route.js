// app/api/dashboard/tree/route.js
//
// Server-side, enrollment-checked replacement for fetchCourseTree's old
// direct-from-browser Supabase queries. Enforces the exact same access
// rules dashboard.html used, but where a student can't bypass them by
// calling Supabase directly with the anon key:
//
//   - If the requested main section is a course (is_course = true), the
//     student MUST have a user_enrollments row with course_id = this
//     section's id, or the whole request is rejected with 403 -- no data
//     of any kind for that course is returned.
//   - For non-course sections, each individual product is still gated:
//     it's only included if the student has a user_enrollments row with
//     product_id = that product's id (legacy per-product purchases, same
//     as the old enrolledProductIds.includes(product.id) filter).
//
// Runs on the service role key so RLS bypass is intentional -- the access
// control lives entirely in this route's own code, server-side, not in the
// browser and not dependent on RLS policies being configured correctly.

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
        if (!mainSectionId) return NextResponse.json({ error: 'Missing mainSectionId' }, { status: 400 });

        const { data: mainSection, error: mainErr } = await supabaseAdmin
            .from('sidebar_main_sections')
            .select('id, is_course')
            .eq('id', mainSectionId)
            .maybeSingle();
        if (mainErr) throw mainErr;
        if (!mainSection) return NextResponse.json({ error: 'Section not found' }, { status: 404 });

        // Fetch this student's enrollments once, used for both the course-level
        // gate below and the per-product gate on legacy non-course sections.
        const { data: enrollments, error: enrollErr } = await supabaseAdmin
            .from('user_enrollments')
            .select('product_id, course_id')
            .eq('student_id', user.email);
        if (enrollErr) throw enrollErr;

        const enrolledCourseIds = new Set((enrollments || []).filter((r) => r.course_id != null).map((r) => r.course_id));
        const enrolledProductIds = new Set((enrollments || []).filter((r) => r.product_id != null).map((r) => r.product_id));

        if (mainSection.is_course && !enrolledCourseIds.has(mainSection.id)) {
            // Not enrolled in this course -- reject outright, no tree data at all.
            return NextResponse.json({ error: 'Not enrolled in this course' }, { status: 403 });
        }

        const { data: subsections, error: subsErr } = await supabaseAdmin
            .from('sidebar_subsections')
            .select('id, main_section_id, name, display_order, icon_url')
            .eq('main_section_id', mainSectionId)
            .order('display_order', { ascending: true });
        if (subsErr) throw subsErr;

        const contentEntries = await Promise.all(
            (subsections || []).map(async (sub) => {
                const { data: chapters, error: chapErr } = await supabaseAdmin
                    .from('sidebar_chapters')
                    .select('id, subsection_id, name, display_order, icon_url')
                    .eq('subsection_id', sub.id)
                    .order('display_order', { ascending: true });
                if (chapErr) throw chapErr;

                const gateProducts = (rows) =>
                    mainSection.is_course
                        ? rows // course access already verified above -- all products visible
                        : rows.filter((p) => enrolledProductIds.has(p.id)); // legacy per-product purchase gate

                if (!chapters || chapters.length === 0) {
                    const { data: products, error: prodErr } = await supabaseAdmin
                        .from('products')
                        .select(PRODUCT_SELECT)
                        .or(`course_subsection_id.eq.${sub.id},subsection_id.eq.${sub.id}`)
                        .order('created_at', { ascending: true });
                    if (prodErr) throw prodErr;
                    return [sub.id, { mode: 'products', products: gateProducts(products || []) }];
                }

                const productLists = await Promise.all(
                    chapters.map(async (chapter) => {
                        const { data: products, error: prodErr } = await supabaseAdmin
                            .from('products')
                            .select(PRODUCT_SELECT)
                            .eq('chapter_id', chapter.id)
                            .order('created_at', { ascending: true });
                        if (prodErr) throw prodErr;
                        return gateProducts(products || []);
                    })
                );
                const productsByChapter = {};
                chapters.forEach((chapter, i) => { productsByChapter[chapter.id] = productLists[i]; });
                return [sub.id, { mode: 'chapters', chapters, productsByChapter }];
            })
        );

        return NextResponse.json({
            subsections: subsections || [],
            contentBySubsection: Object.fromEntries(contentEntries),
        });
    } catch (err) {
        console.error('dashboard tree error:', err);
        return NextResponse.json({ error: 'Failed to load course tree' }, { status: 500 });
    }
}