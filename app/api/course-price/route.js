import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// SECURITY FIX: this route reads a per-user session cookie and must
// NEVER be cached or reused across requests/users at the edge or in
// Next.js's Data Cache -- without this, Vercel/Next.js can serve one
// student's response (or coalesce request context) to a different
// student. See: https://vercel.com/docs/functions/configuring-functions/caching
export const dynamic = 'force-dynamic';


// Public, read-only endpoint. Returns ONLY the fields BuyBox needs to render
// a price -- never the full row -- so we don't leak details_html / internal
// columns to the client. Each course page.js passes its own product id in.

const getClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing course id' }, { status: 400 });
    }

    try {
        const supabase = getClient();
        const { data, error } = await supabase
            .from('sidebar_main_sections')
            .select('id, name, price, is_paid, slug')
            .eq('id', id)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Course not found' }, { status: 404 });
        }

        return NextResponse.json({
            id: data.id,
            title: data.name,
            price: data.is_paid ? Number(data.price) : 0,
            is_paid: data.is_paid,
            slug: data.slug
        });
    } catch (err) {
        console.error('course-price route error:', err);
        return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 });
    }
}