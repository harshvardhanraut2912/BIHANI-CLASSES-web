// 📂 SAVE THIS FILE AT: app/api/admin/courses/route.js
//
// Courses are rows in sidebar_main_sections with is_course = true. This
// route now only manages the course row itself (create/edit/delete a
// course's own fields + notes). Its subsections/chapters/products are
// managed through /api/admin/subsections, /api/admin/chapters and
// /api/admin/products, scoped to this course's id -- see the "Course
// detail" screen in the admin UI, which nests all of that inline.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const getAdminClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function GET(request) {
    try {
        const supabase = getAdminClient();
        const { searchParams } = new URL(request.url);
        const courseId = searchParams.get('id');

        if (courseId) {
            // Full drill-down for one course: its subsections, each
            // subsection's chapters, and each chapter's products -- all in
            // one round trip so the course detail screen renders instantly.
            const { data: course, error: courseErr } = await supabase
                .from('sidebar_main_sections')
                .select('*')
                .eq('id', courseId)
                .eq('is_course', true)
                .single();
            if (courseErr) throw courseErr;

            const { data: subsections, error: subErr } = await supabase
                .from('sidebar_subsections')
                .select('*')
                .eq('main_section_id', courseId)
                .order('display_order', { ascending: true });
            if (subErr) throw subErr;

            const subIds = (subsections || []).map(s => s.id);
            let chapters = [];
            if (subIds.length > 0) {
                const { data, error } = await supabase
                    .from('sidebar_chapters')
                    .select('*')
                    .in('subsection_id', subIds)
                    .order('display_order', { ascending: true });
                if (error) throw error;
                chapters = data || [];
            }

            const chapterIds = chapters.map(c => c.id);
            let products = [];
            if (chapterIds.length > 0) {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, title, product_type, is_paid, price, chapter_id, thumbnail_url, badge_label')
                    .in('chapter_id', chapterIds)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                products = data || [];
            }

            const chaptersBySub = {};
            chapters.forEach(ch => {
                if (!chaptersBySub[ch.subsection_id]) chaptersBySub[ch.subsection_id] = [];
                chaptersBySub[ch.subsection_id].push({
                    ...ch,
                    products: products.filter(p => p.chapter_id === ch.id),
                });
            });

            const nestedSubsections = (subsections || []).map(sub => ({
                ...sub,
                chapters: chaptersBySub[sub.id] || [],
            }));

            return NextResponse.json({ ...course, subsections: nestedSubsections });
        }

        // List view: just the course rows, lightweight.
        const { data, error } = await supabase
            .from('sidebar_main_sections')
            .select('*')
            .eq('is_course', true)
            .order('display_order', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error("Admin Courses GET Error:", err);
        return NextResponse.json({ error: 'Failed to read courses' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const supabase = getAdminClient();

        if (!body.name || !String(body.name).trim()) {
            return NextResponse.json({ error: 'Course title is required.' }, { status: 400 });
        }

        const derivedCourseId = body.id || `COURSE_${Date.now()}`;

        const { data: existingSections, error: orderErr } = await supabase
            .from('sidebar_main_sections')
            .select('display_order')
            .order('display_order', { ascending: false })
            .limit(1);
        if (orderErr) throw orderErr;
        const nextDisplayOrder = existingSections?.[0]?.display_order ? existingSections[0].display_order + 1 : 1;

        const coursePayload = {
            id: derivedCourseId,
            name: body.name,
            slug: body.slug ? String(body.slug).trim() : null,
            is_course: true,
            is_paid: !!body.is_paid,
            price: body.is_paid ? Number(body.price) : 0,
            thumbnail_url: body.thumbnail_url || null,
            details_html_path: body.details_html_path || null,
            badge_label: body.badge_label || 'Course',
            display_order: nextDisplayOrder,
            icon_url: body.icon_url || '',
            notes: body.notes || null,
            segment_id: body.segment_id || null,
        };

        const { data: courseRow, error: courseErr } = await supabase
            .from('sidebar_main_sections')
            .insert([coursePayload])
            .select();
        if (courseErr) throw courseErr;

        return NextResponse.json(courseRow[0], { status: 201 });
    } catch (err) {
        console.error("Admin Courses POST Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const supabase = getAdminClient();

        if (!body.id) {
            return NextResponse.json({ error: 'Missing course id.' }, { status: 400 });
        }

        // Notes gets its own lightweight path: when only `notes` is present
        // (plus id), update just that column so the Notes editor's save
        // button never has to resend/revalidate the entire course form.
        const isNotesOnly = Object.keys(body).filter(k => k !== 'id').every(k => k === 'notes');

        const updatePayload = isNotesOnly
            ? { notes: body.notes || null }
            : {
                name: body.name,
                slug: body.slug ? String(body.slug).trim() : null,
                is_paid: !!body.is_paid,
                price: body.is_paid ? Number(body.price) : 0,
                thumbnail_url: body.thumbnail_url || null,
                details_html_path: body.details_html_path || null,
                badge_label: body.badge_label || 'Course',
                icon_url: body.icon_url || '',
                notes: body.notes ?? undefined,
                segment_id: body.segment_id ?? null,
            };

        // Strip undefined keys so a full-form save without notes touched
        // doesn't null out an existing notes value.
        Object.keys(updatePayload).forEach(k => updatePayload[k] === undefined && delete updatePayload[k]);

        const { data: courseRow, error: courseErr } = await supabase
            .from('sidebar_main_sections')
            .update(updatePayload)
            .eq('id', body.id)
            .select();
        if (courseErr) throw courseErr;

        return NextResponse.json(courseRow[0]);
    } catch (err) {
        console.error("Admin Courses PUT Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { id } = await request.json();
        if (!id) return NextResponse.json({ error: 'Missing course id.' }, { status: 400 });
        const supabase = getAdminClient();

        const { data: subs, error: subErr } = await supabase
            .from('sidebar_subsections')
            .select('id')
            .eq('main_section_id', id)
            .limit(1);
        if (subErr) throw subErr;
        if (subs && subs.length > 0) {
            return NextResponse.json({ error: 'Delete this course\'s subsections first.' }, { status: 400 });
        }

        const { error } = await supabase.from('sidebar_main_sections').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Admin Courses DELETE Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}