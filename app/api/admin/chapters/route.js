// 📂 SAVE THIS FILE AT: app/api/admin/chapters/route.js
//
// CRUD for sidebar_chapters. Every subsection (course or standalone) needs
// at least one chapter before products can be added under it, since
// products now attach via chapter_id only (see /api/admin/products).

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
        const subsectionId = searchParams.get('subsection_id');

        let query = supabase.from('sidebar_chapters').select('*').order('display_order', { ascending: true });
        if (subsectionId) query = query.eq('subsection_id', subsectionId);

        const { data, error } = await query;
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

        if (!body.subsection_id) return NextResponse.json({ error: 'Missing parent subsection id.' }, { status: 400 });
        if (!body.name || !String(body.name).trim()) return NextResponse.json({ error: 'Chapter name is required.' }, { status: 400 });

        const { data: existing, error: orderErr } = await supabase
            .from('sidebar_chapters')
            .select('display_order')
            .eq('subsection_id', body.subsection_id)
            .order('display_order', { ascending: false })
            .limit(1);
        if (orderErr) throw orderErr;
        const nextDisplayOrder = existing?.[0]?.display_order ? existing[0].display_order + 1 : 1;

        const payload = {
            id: body.id || `CHAP_${Date.now()}`,
            subsection_id: body.subsection_id,
            name: body.name,
            display_order: Number(body.display_order) || nextDisplayOrder,
            icon_url: body.icon_url || null,
        };

        const { data, error } = await supabase.from('sidebar_chapters').insert([payload]).select();
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
        if (!body.id) return NextResponse.json({ error: 'Missing chapter id.' }, { status: 400 });

        const payload = {
            name: body.name,
            display_order: Number(body.display_order) || 1,
            icon_url: body.icon_url || null,
        };

        const { data, error } = await supabase
            .from('sidebar_chapters')
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
        if (!id) return NextResponse.json({ error: 'Missing chapter id.' }, { status: 400 });
        const supabase = getAdminClient();

        const { data: products, error: prodErr } = await supabase
            .from('products')
            .select('id')
            .eq('chapter_id', id)
            .limit(1);
        if (prodErr) throw prodErr;
        if (products && products.length > 0) {
            return NextResponse.json({ error: 'Delete this chapter\'s products first.' }, { status: 400 });
        }

        const { error } = await supabase.from('sidebar_chapters').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
