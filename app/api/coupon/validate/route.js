// SAVE THIS FILE AT: app/api/coupon/validate/route.js
//
// Called when the student clicks "Apply" in CouponBox. Deliberately
// READ-ONLY -- it checks the code but does NOT mark it used. That way a
// student can preview the discount without burning a one-time code just by
// clicking Apply. The code only actually gets consumed in
// app/api/payment/create-order/route.js, at the point of real purchase.
//
// This is still fully server-side truth: the discount_amount returned here
// is exactly what create-order will apply later -- the client never
// invents or edits this number.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { normalizeCouponCode } from '@/lib/coupons';

const getClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function POST(request) {
    try {
        const { code } = await request.json();
        const normalized = normalizeCouponCode(code);

        if (!normalized) {
            return NextResponse.json({ valid: false, error: 'Enter a coupon code.' }, { status: 400 });
        }

        const supabase = getClient();
        const { data: coupon, error } = await supabase
            .from('coupons')
            .select('code, discount_amount, used, expires_at')
            .eq('code', normalized)
            .single();

        if (error || !coupon) {
            return NextResponse.json({ valid: false, error: 'Invalid coupon code.' }, { status: 404 });
        }

        if (coupon.used) {
            return NextResponse.json({ valid: false, error: 'This coupon has already been used.' }, { status: 410 });
        }

        if (new Date(coupon.expires_at).getTime() < Date.now()) {
            return NextResponse.json({ valid: false, error: 'This coupon has expired.' }, { status: 410 });
        }

        return NextResponse.json({
            valid: true,
            code: coupon.code,
            discount_amount: Number(coupon.discount_amount),
        });
    } catch (err) {
        console.error('coupon validate route error:', err);
        return NextResponse.json({ valid: false, error: 'Could not validate coupon right now.' }, { status: 500 });
    }
}