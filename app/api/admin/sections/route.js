// 📂 SAVE THIS FILE AT: app/api/admin/sections/route.js
//
// CRUD for sidebar_main_sections rows where is_course = false — the plain
// sidebar sections like "Study Material" / "Tools" (as opposed to Courses,
// which live in /api/admin/courses and are is_course = true rows of the
// SAME table). Kept as a separate endpoint so the admin UI's "Sections"
// tab and "Courses" tab never accidentally cross-list each other's rows.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const getAdminClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function GET() {
    try {
        const supabase = getAdminClient();
        const { data, error } = await supabase
            .from('sidebar_main_sections')
            .select('*')
            .eq('is_course', false)
            .order('display_order', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const supabase = getAdminClient();

        if (!body.name || !String(body.name).trim()) {
            return NextResponse.json({ error: 'Section name is required.' }, { status: 400 });
        }

        const { data: existing, error: orderErr } = await supabase
            .from('sidebar_main_sections')
            .select('display_order')
            .order('display_order', { ascending: false })
            .limit(1);
        if (orderErr) throw orderErr;
        const nextDisplayOrder = existing?.[0]?.display_order ? existing[0].display_order + 1 : 1;

        const payload = {
            id: body.id || `SEC_${Date.now()}`,
            name: body.name,
            icon_url: body.icon_url || '',
            display_order: Number(body.display_order) || nextDisplayOrder,
            is_course: false,
            is_paid: false,
            price: 0,
            thumbnail_url: null,
            badge_label: null,
            notes: body.notes || null,
            slug: body.slug ? String(body.slug).trim() : null,
        };

        const { data, error } = await supabase.from('sidebar_main_sections').insert([payload]).select();
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
        if (!body.id) return NextResponse.json({ error: 'Missing section id.' }, { status: 400 });

        const payload = {
            name: body.name,
            icon_url: body.icon_url || '',
            display_order: Number(body.display_order) || 1,
            notes: body.notes || null,
            slug: body.slug ? String(body.slug).trim() : null,
        };

        const { data, error } = await supabase
            .from('sidebar_main_sections')
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
        if (!id) return NextResponse.json({ error: 'Missing section id.' }, { status: 400 });
        const supabase = getAdminClient();

        // Guard rail: refuse to delete a section that still has subsections
        // under it -- forces the admin to clear the tree top-down instead of
        // silently orphaning subsections/chapters/products.
        const { data: subs, error: subErr } = await supabase
            .from('sidebar_subsections')
            .select('id')
            .eq('main_section_id', id)
            .limit(1);
        if (subErr) throw subErr;
        if (subs && subs.length > 0) {
            return NextResponse.json({ error: 'Delete this section\'s subsections first.' }, { status: 400 });
        }

        const { error } = await supabase.from('sidebar_main_sections').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
