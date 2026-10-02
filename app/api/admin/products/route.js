// 📂 SAVE THIS FILE AT: app/api/admin/products/route.js
//
// Products now attach ONLY via chapter_id -- subsection_id and
// course_subsection_id are no longer written for new/edited rows (they
// stay in the schema for old data but this route ignores them). Every
// product is created from inside a specific chapter's screen in the admin
// UI, so chapter_id always arrives in the request body already, never
// picked from a dropdown here.

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
        const chapterId = searchParams.get('chapter_id');

        let query = supabase.from('products').select('*').order('created_at', { ascending: false });
        if (chapterId) query = query.eq('chapter_id', chapterId);

        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json(data);
    } catch (err) {
        return NextResponse.json({ error: 'Failed to read data' }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const body = await request.json();
        const supabase = getAdminClient();
        const derivedId = body.id || `PROD_${Date.now()}`;

        if (!body.chapter_id) {
            return NextResponse.json({ error: 'Missing chapter_id -- products must be created from inside a chapter.' }, { status: 400 });
        }

        const insertPayload = {
            id: derivedId,
            chapter_id: body.chapter_id,
            segment_id: body.segment_id || null,
            title: body.title,
            instructor: body.instructor,
            thumbnail_url: body.thumbnail_url || null,
            badge_label: body.is_paid ? 'PAID' : 'FREE',
            validity_text: 'Valid Till: Lifetime',
            progress_percent: 0,
            is_paid: body.is_paid,
            price: body.is_paid ? Number(body.price) : 0,
            duration_mins: body.product_type === 'exam' ? Number(body.duration_mins) : 0,
            image_extension: body.extension,
            image_base_url: null,
            linked_exam_v2_id: body.product_type === 'exam' ? (body.linked_exam_v2_id || null) : null,
            sections: JSON.parse(body.sections || '[]'),
            product_type: body.product_type,
            document_path: body.product_type === 'exam' ? '' : body.document_path,
            allow_download: body.allow_download,
            is_scheduled: body.product_type === 'exam' ? !!body.is_scheduled : false,
            scheduled_start_at: (body.product_type === 'exam' && body.is_scheduled) ? (body.scheduled_start_at || null) : null,
            scheduled_end_at: (body.product_type === 'exam' && body.is_scheduled) ? (body.scheduled_end_at || null) : null,
            result_declared_at: (body.product_type === 'exam' && body.is_scheduled) ? (body.result_declared_at || null) : null,
        };

        if (body.product_type === 'exam' && !insertPayload.linked_exam_v2_id) {
            return NextResponse.json({ error: 'Please choose which exam question set this test uses.' }, { status: 400 });
        }

        if (body.product_type === 'exam' && body.is_scheduled && (!insertPayload.scheduled_start_at || !insertPayload.scheduled_end_at)) {
            return NextResponse.json({ error: 'Scheduled exams need both a start and an end date/time.' }, { status: 400 });
        }

        const { data, error } = await supabase.from('products').insert([insertPayload]).select();
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

        const updatePayload = {
            chapter_id: body.chapter_id,
            segment_id: body.segment_id || null,
            title: body.title,
            instructor: body.instructor,
            thumbnail_url: body.thumbnail_url,
            badge_label: body.is_paid ? 'PAID' : 'FREE',
            is_paid: body.is_paid,
            price: body.is_paid ? Number(body.price) : 0,
            duration_mins: body.product_type === 'exam' ? Number(body.duration_mins) : 0,
            image_extension: body.extension,
            image_base_url: null,
            linked_exam_v2_id: body.product_type === 'exam' ? (body.linked_exam_v2_id || null) : null,
            sections: JSON.parse(body.sections || '[]'),
            product_type: body.product_type,
            document_path: body.product_type === 'exam' ? '' : body.document_path,
            allow_download: body.allow_download,
            is_scheduled: body.product_type === 'exam' ? !!body.is_scheduled : false,
            scheduled_start_at: (body.product_type === 'exam' && body.is_scheduled) ? (body.scheduled_start_at || null) : null,
            scheduled_end_at: (body.product_type === 'exam' && body.is_scheduled) ? (body.scheduled_end_at || null) : null,
            result_declared_at: (body.product_type === 'exam' && body.is_scheduled) ? (body.result_declared_at || null) : null,
        };

        if (body.product_type === 'exam' && !updatePayload.linked_exam_v2_id) {
            return NextResponse.json({ error: 'Please choose which exam question set this test uses.' }, { status: 400 });
        }

        if (body.product_type === 'exam' && body.is_scheduled && (!updatePayload.scheduled_start_at || !updatePayload.scheduled_end_at)) {
            return NextResponse.json({ error: 'Scheduled exams need both a start and an end date/time.' }, { status: 400 });
        }

        const { data, error } = await supabase.from('products').update(updatePayload).eq('id', body.id).select();
        if (error) throw error;
        return NextResponse.json(data[0]);
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(request) {
    try {
        const { id } = await request.json();
        if (!id) return NextResponse.json({ error: 'Missing product id.' }, { status: 400 });
        const supabase = getAdminClient();
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}