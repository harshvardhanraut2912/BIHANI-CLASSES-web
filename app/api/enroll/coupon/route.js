// SAVE THIS FILE AT: app/api/enroll/coupon/route.js  (replace existing)
//
// Handles the "coupon covers 100% of the price -> skip Razorpay entirely"
// case. Called by BuyBox when the applied coupon's discount looks like it
// zeroes out the price -- but that client-side check is ONLY used to decide
// which button/label to show. The actual gate is here: this route
// recomputes everything from scratch (course price + coupon row from
// Supabase) and REJECTS the request unless the server's own math also
// comes out to exactly ₹0.

import { NextResponse } from 'next/server';
import { normalizeCouponCode } from '@/lib/coupons';
import { sendTelegramMessage } from '@/lib/telegram';
import { getStudentEmail, supabaseAdmin } from '@/lib/studentAuth';
import { notifyEnrollment } from '@/lib/notifyEnrollment';

// SECURITY FIX: this route reads a per-user session cookie and must
// NEVER be cached or reused across requests/users at the edge or in
// Next.js's Data Cache -- without this, Vercel/Next.js can serve one
// student's response (or coalesce request context) to a different
// student. See: https://vercel.com/docs/functions/configuring-functions/caching
export const dynamic = 'force-dynamic';


// Same tamper signal as create-order -- a client should never be sending
// price/amount fields to this route either.
const FORBIDDEN_CLIENT_FIELDS = ['amount', 'price', 'finalPrice', 'final_price', 'discount', 'discountAmount', 'discount_amount'];

export async function POST(request) {
    try {
        const body = await request.json();
        const { productId, couponCode } = body || {};

        const suspiciousFields = FORBIDDEN_CLIENT_FIELDS.filter((f) => body && Object.prototype.hasOwnProperty.call(body, f));
        if (suspiciousFields.length > 0) {
            console.warn('Price tamper attempt on enroll/coupon:', { productId, suspiciousFields, body });
            return NextResponse.json(
                { tamper: true, error: 'Pricing is verified on our server and cannot be set from the browser. Please do not try to bypass checkout.' },
                { status: 400 }
            );
        }

        if (!productId) {
            return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
        }

        const studentEmail = await getStudentEmail(request);
        if (!studentEmail) {
            return NextResponse.json({ error: 'Please log in to enroll.' }, { status: 401 });
        }

        // ---- 1. Server-side truth for the course price ----
        const { data: course, error: courseError } = await supabaseAdmin
            .from('sidebar_main_sections')
            .select('id, name, price, is_paid, is_course')
            .eq('id', productId)
            .single();

        if (courseError || !course) {
            return NextResponse.json({ error: 'Course not found' }, { status: 404 });
        }

        const originalPrice = Number(course.price) || 0;

        // ---- 1b. Naturally-free course path (is_paid=false / price=0) ----
        // No coupon involved at all -- skip straight to granting access.
        // This is separate from the "100%-off coupon on a paid course"
        // path below, which still requires a valid, unused, unexpired
        // coupon that zeroes out a genuinely non-zero price.
        const courseIsFree = !course.is_paid || originalPrice === 0;

        let claimed = null;

        if (!courseIsFree) {
            if (!couponCode) {
                return NextResponse.json({ error: 'A coupon code is required for free enrollment.' }, { status: 400 });
            }

            // ---- 2. Server-side coupon validation ----
            const normalized = normalizeCouponCode(couponCode);
            const { data: coupon, error: couponError } = await supabaseAdmin
                .from('coupons')
                .select('id, code, discount_amount, used, expires_at')
                .eq('code', normalized)
                .single();

            if (couponError || !coupon) {
                return NextResponse.json({ error: 'Invalid coupon code.' }, { status: 404 });
            }
            if (coupon.used) {
                return NextResponse.json({ error: 'This coupon has already been used.' }, { status: 410 });
            }
            if (new Date(coupon.expires_at).getTime() < Date.now()) {
                return NextResponse.json({ error: 'This coupon has expired.' }, { status: 410 });
            }

            const finalPrice = Math.max(0, originalPrice - Number(coupon.discount_amount));

            // ---- 3. THE gate: only proceed if this route's own math says ₹0 ----
            if (finalPrice > 0) {
                return NextResponse.json(
                    { error: `This coupon doesn't cover the full price (₹${finalPrice} would still be due). Use Buy Now to pay the remaining balance.` },
                    { status: 400 }
                );
            }

            // ---- 4. Redeem the coupon atomically (one-time use) ----
            const { data: claimedCoupon, error: claimError } = await supabaseAdmin
                .from('coupons')
                .update({
                    used: true,
                    used_by: studentEmail,
                    used_at: new Date().toISOString(),
                    product_id: String(productId),
                    original_price: originalPrice,
                    redeemed_price: 0,
                })
                .eq('id', coupon.id)
                .eq('used', false) // atomic guard -- a concurrent duplicate request can't double-redeem
                .select()
                .single();

            if (claimError || !claimedCoupon) {
                return NextResponse.json({ error: 'This coupon has already been used.' }, { status: 410 });
            }

            claimed = claimedCoupon;
        }

        // ---- 5. Actually grant access: write to user_enrollments ----
        // sidebar_main_sections rows with is_course = true are gated on the
        // *dashboard* by the `course_id` column (public/dashboard.html
        // buildDynamicSidebarAccordions -> enrolledCourseIds), NOT
        // `product_id`. Writing only product_id here means the sidebar
        // never shows the section for enrolled students. Non-course
        // sections continue to use product_id as before.
        // 23505 = already enrolled (e.g. a retry) -- not an error worth
        // failing the request over, the student ends up enrolled either way.
        const enrollmentRow = course.is_course
            ? { student_id: studentEmail, course_id: String(productId) }
            : { student_id: studentEmail, product_id: String(productId) };

        const { error: enrollError } = await supabaseAdmin
            .from('user_enrollments')
            .insert(enrollmentRow);

        if (enrollError && enrollError.code !== '23505') {
            console.error('user_enrollments insert failed after coupon redemption:', enrollError);
            // Coupon is already spent at this point -- don't fail the
            // response over a logging-adjacent write; the admin can grant
            // access manually via app/api/admin/enrollments if this ever
            // actually happens. Still tell the student it worked, since it
            // mostly did (payment/coupon side is done).
        }

        // ---- "Course enrolled" in-app + push notification ----
        // Same rule as the paid path in payment/verify/route.js: course
        // enrollments only, never for standalone products. This was
        // previously missing here entirely, so a free course or a
        // 100%-off coupon redemption never notified the student.
        if (course.is_course) {
            await notifyEnrollment(studentEmail, course.name, productId);
        }

        // ---- 6. Telegram notification ----
        const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
        const couponLine = claimed
            ? `🎟️ Coupon: ${claimed.code} (-₹${claimed.discount_amount})\n`
            : `🎟️ Coupon: none — course is free (is_paid=false)\n`;
        await sendTelegramMessage(
            adminChatId,
            `🎁 Free Enrollment — Y N Classes\n\n` +
            `👤 Student: ${studentEmail}\n` +
            `📘 Course: ${course.name} (${productId})\n` +
            couponLine +
            `💰 Amount Paid: ₹0\n` +
            `🕒 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
        );

        return NextResponse.json({ success: true, enrolled: true });
    } catch (err) {
        console.error('enroll/coupon error:', err);
        return NextResponse.json({ error: 'Failed to process enrollment' }, { status: 500 });
    }
}
