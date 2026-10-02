// 📂 SAVE THIS FILE AT: app/api/admin/subsections/route.js
//
// CRUD for sidebar_subsections. GET supports two scopes:
//   ?parent_id=X          -> subsections under one specific main section
//                             (used inside a Course/Section detail screen)
//   ?scope=standalone      -> ALL subsections whose parent is a NON-course
//                             section -- this is what the standalone
//                             "Subsections" admin tab shows. Subsections
//                             belonging to a course are deliberately
//                             excluded here so they never show up twice.

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
        const parentId = searchParams.get('parent_id');
        const scope = searchParams.get('scope');

        if (parentId) {
            const { data, error } = await supabase
                .from('sidebar_subsections')
                .select('*')
                .eq('main_section_id', parentId)
                .order('display_order', { ascending: true });
            if (error) throw error;
            return NextResponse.json(data);
        }

        if (scope === 'standalone') {
            const { data: nonCourseSections, error: secErr } = await supabase
                .from('sidebar_main_sections')
                .select('id')
                .eq('is_course', false);
            if (secErr) throw secErr;
            const ids = (nonCourseSections || []).map(s => s.id);
            if (ids.length === 0) return NextResponse.json([]);

            const { data, error } = await supabase
                .from('sidebar_subsections')
                .select('*, sidebar_main_sections(name)')
                .in('main_section_id', ids)
                .order('display_order', { ascending: true });
            if (error) throw error;
            return NextResponse.json(data);
        }

        const { data, error } = await supabase
            .from('sidebar_subsections')
            .select('*')
            .order('display_order', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        console.error("Admin Subsections GET Error:", err);
        return NextResponse.json({ error: 'Failed to fetch subsections' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const supabase = getAdminClient();

        if (!body.main_section_id) return NextResponse.json({ error: 'Missing parent section id.' }, { status: 400 });
        if (!body.name || !String(body.name).trim()) return NextResponse.json({ error: 'Subsection name is required.' }, { status: 400 });

        const { data: existing, error: orderErr } = await supabase
            .from('sidebar_subsections')
            .select('display_order')
            .eq('main_section_id', body.main_section_id)
            .order('display_order', { ascending: false })
            .limit(1);
        if (orderErr) throw orderErr;
        const nextDisplayOrder = existing?.[0]?.display_order ? existing[0].display_order + 1 : 1;

        const payload = {
            id: body.id || `SUB_${Date.now()}`,
            main_section_id: body.main_section_id,
            name: body.name,
            display_order: Number(body.display_order) || nextDisplayOrder,
            icon_url: body.icon_url || null,
        };

        const { data, error } = await supabase.from('sidebar_subsections').insert([payload]).select();
        if (error) throw error;
        return NextResponse.json(data[0], { status: 201 });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const body = await request.json();
        const supabase = getAdminClient();
        if (!body.id) return NextResponse.json({ error: 'Missing subsection id.' }, { status: 400 });

        const payload = {
            name: body.name,
            display_order: Number(body.display_order) || 1,
            icon_url: body.icon_url || null,
        };

        const { data, error } = await supabase
            .from('sidebar_subsections')
            .update(payload)
            .eq('id', body.id)
            .select();
        if (error) throw error;
        return NextResponse.json(data[0]);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { id } = await request.json();
        if (!id) return NextResponse.json({ error: 'Missing subsection id.' }, { status: 400 });
        const supabase = getAdminClient();

        const { data: chapters, error: chapErr } = await supabase
            .from('sidebar_chapters')
            .select('id')
            .eq('subsection_id', id)
            .limit(1);
        if (chapErr) throw chapErr;
        if (chapters && chapters.length > 0) {
            return NextResponse.json({ error: 'Delete this subsection\'s chapters first.' }, { status: 400 });
        }

        const { error } = await supabase.from('sidebar_subsections').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
