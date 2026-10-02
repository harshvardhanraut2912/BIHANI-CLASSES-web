// 📂 SAVE THIS FILE AT: app/api/admin/target-segments/route.js
//
// Read-only list of target_segments (e.g. "11th", "12th") for admin dropdowns
// -- used by the Courses form so a course can optionally also be listed
// inside a specific segment's row on /cources, alongside its products.

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
            .from('target_segments')
            .select('*')
            .order('display_order', { ascending: true });
        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}