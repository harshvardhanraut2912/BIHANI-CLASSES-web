// 📂 SAVE THIS FILE AT: app/api/admin/product-types/route.js
//
// CRUD for product_type_info -- the lookup table the dashboard joins
// against (product_type_info(*)) to decide what a product card's button
// does (handling_strategy: REDIRECT / INLINE_SWAP / etc.) and what it
// says (button_label). The Products form's "Type" dropdown reads from
// this table so it's impossible to create a product whose type has no
// matching row (which silently shows "Pending Update" on the dashboard).

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
        const { data, error } = await supabase.from('product_type_info').select('*').order('id', { ascending: true });
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
        if (!body.id || !String(body.id).trim()) {
            return NextResponse.json({ error: 'Type key (id) is required, e.g. "exam" or "document".' }, { status: 400 });
        }

        const payload = {
            id: String(body.id).trim(),
            handling_strategy: body.handling_strategy || 'REDIRECT',
            button_label: body.button_label || 'Open',
        };

        const { data, error } = await supabase.from('product_type_info').insert([payload]).select();
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
        if (!body.id) return NextResponse.json({ error: 'Missing type id.' }, { status: 400 });

        const payload = {
            handling_strategy: body.handling_strategy || 'REDIRECT',
            button_label: body.button_label || 'Open',
        };

        const { data, error } = await supabase.from('product_type_info').update(payload).eq('id', body.id).select();
        if (error) throw error;
        return NextResponse.json(data[0]);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { id } = await request.json();
        if (!id) return NextResponse.json({ error: 'Missing type id.' }, { status: 400 });
        const supabase = getAdminClient();
        const { error } = await supabase.from('product_type_info').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
