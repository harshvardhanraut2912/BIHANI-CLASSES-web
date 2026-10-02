import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client using the secret Service Role key — bypasses RLS on
// purpose, since an admin acting on behalf of another student should
// not be constrained by that student's own row-level policies.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
    try {
        // 1. Verify the caller has a valid session at all
        const sessionToken = request.cookies.get('cet_session_token')?.value;
        if (!sessionToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(sessionToken);
        if (authErr || !user) return NextResponse.json({ error: 'Invalid Session' }, { status: 401 });

        // 2. Verify the caller is actually an admin.
        //    ⚠️ ADJUST THIS to match however your existing /api/admin/users
        //    route already checks admin access (e.g. a different column
        //    name, a separate `admins` table, or a Supabase custom claim).
        //    This block assumes a `role` column on `profiles`.
        const { data: callerProfile, error: profileErr } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileErr || !callerProfile || callerProfile.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 3. Validate the payload
        const { studentEmail, productId } = await request.json();
        if (!studentEmail || !productId) {
            return NextResponse.json({ error: 'studentEmail and productId are required' }, { status: 400 });
        }

        // 4. Insert the enrollment. If the student is already enrolled,
        //    the unique constraint on (student_id, product_id) will fire
        //    error code 23505 — treat that as a friendly conflict, not a
        //    crash, mirroring the same tolerance shop.html already has.
        const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('user_enrollments')
            .insert({ student_id: studentEmail, product_id: productId })
            .select()
            .single();

        if (insertErr) {
            if (insertErr.code === '23505') {
                return NextResponse.json(
                    { error: 'Student is already enrolled in this product.' },
                    { status: 409 }
                );
            }
            throw insertErr;
        }

        return NextResponse.json({ enrollment: inserted });

    } catch (err) {
        console.error("Admin Enrollment Exception:", err);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}