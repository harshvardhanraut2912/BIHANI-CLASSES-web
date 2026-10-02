import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Reads course details HTML directly from sidebar_main_sections.details_html
// (a text column in Supabase) and serves it as HTML into the sandbox iframe.
// No GitHub needed -- admin pastes the HTML into the Supabase row directly.

const getClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('id');

    if (!courseId) {
        return NextResponse.json({ error: 'Missing course id' }, { status: 400 });
    }

    try {
        const supabase = getClient();
        const { data, error } = await supabase
            .from('sidebar_main_sections')
            .select('details_html, name')
            .eq('id', courseId)
            .single();

        if (error || !data) {
            return NextResponse.json({ error: 'Course not found' }, { status: 404 });
        }

        if (!data.details_html) {
            // Graceful fallback -- render a minimal placeholder so the sandbox
            // shows something readable instead of a blank/error page.
            const fallback = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#475569;}</style>
</head><body><p>Course details page coming soon.</p></body></html>`;
            return new NextResponse(fallback, {
                status: 200,
                headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
            });
        }

        return new NextResponse(data.details_html, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
        });
    } catch (err) {
        console.error('Course Details Route Error:', err);
        return NextResponse.json({ error: 'Failed to load course details' }, { status: 500 });
    }
}