// SAVE THIS FILE AT: app/api/payment/verify/route.js  (replace existing)
//
// Changes from original:
//   - Email / Resend feature completely removed.
//   - Response now returns full payment details so the client can show
//     the PaymentSuccessOverlay and generate the receipt PDF in-browser.

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStudentEmail, supabaseAdmin } from '@/lib/studentAuth';
import { sendTelegramMessage } from '@/lib/telegram';
import { notifyEnrollment } from '@/lib/notifyEnrollment';

// Same test-mode gate as create-order/route.js — only requests carrying
// the correct x-app-test-mode header get verified against the TEST
// secret. Everyone else (the real website) verifies against the LIVE
// secret, unchanged.
function getVerifySecret(request) {
    const testHeader = request.headers.get('x-app-test-mode');
    const testSecretConfigured = process.env.APP_TEST_MODE_SECRET;
    const isTestRequest = !!testHeader && !!testSecretConfigured && testHeader === testSecretConfigured;
    return isTestRequest ? process.env.RAZORPAY_TEST_KEY_SECRET : process.env.RAZORPAY_KEY_SECRET;
}

function verifyRazorpaySignature(orderId, paymentId, signature, secret) {
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature || ''));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
    try {
        const body = await request.json();
        const {
            productId,
            couponCode,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = body || {};

        if (!productId) {
            return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
        }

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return NextResponse.json({ error: 'Missing payment confirmation details.' }, { status: 400 });
        }
        if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, getVerifySecret(request))) {
            console.warn('Razorpay signature mismatch:', { productId, razorpay_order_id, razorpay_payment_id });
            return NextResponse.json({ error: 'Payment verification failed.' }, { status: 401 });
        }

        const studentEmail = await getStudentEmail(request);
        if (!studentEmail) {
            return NextResponse.json({ error: 'Please log in to complete this purchase.' }, { status: 401 });
        }

        const testHeader = request.headers.get('x-app-test-mode');
        const isTestPayment = !!testHeader && testHeader === process.env.APP_TEST_MODE_SECRET;

        const { data: course, error: courseError } = await supabaseAdmin
            .from('sidebar_main_sections')
            .select('id, name, price, is_paid, is_course')
            .eq('id', productId)
            .single();

        if (courseError || !course) {
            return NextResponse.json({ error: 'Course not found' }, { status: 404 });
        }

        const originalPrice = Number(course.price);
        let finalPrice = originalPrice;
        let redeemedCoupon = null;

        // ---- Real, one-time coupon redemption ----
        if (couponCode) {
            const normalized = String(couponCode).trim().toUpperCase();

            const { data: couponRow, error: couponError } = await supabaseAdmin
                .from('coupons')
                .select('id, code, discount_amount, used, expires_at')
                .eq('code', normalized)
                .single();

            if (couponError || !couponRow) {
                return NextResponse.json({ error: 'Invalid coupon code.' }, { status: 404 });
            }
            if (couponRow.used) {
                return NextResponse.json({ error: 'This coupon has already been used.' }, { status: 410 });
            }
            if (new Date(couponRow.expires_at).getTime() < Date.now()) {
                return NextResponse.json({ error: 'This coupon has expired.' }, { status: 410 });
            }

            finalPrice = Math.max(0, originalPrice - Number(couponRow.discount_amount));

            const { data: claimed, error: claimError } = await supabaseAdmin
                .from('coupons')
                .update({
                    used: true,
                    used_by: studentEmail,
                    used_at: new Date().toISOString(),
                    product_id: String(productId),
                    original_price: originalPrice,
                    redeemed_price: finalPrice,
                })
                .eq('id', couponRow.id)
                .eq('used', false)
                .select()
                .single();

            if (claimError || !claimed) {
                return NextResponse.json({ error: 'This coupon has already been used.' }, { status: 410 });
            }

            redeemedCoupon = claimed;
        }

        // ---- Grant access ----
        const enrollmentRow = course.is_course
            ? { student_id: studentEmail, course_id: String(productId) }
            : { student_id: studentEmail, product_id: String(productId) };

        const { error: enrollError } = await supabaseAdmin
            .from('user_enrollments')
            .insert(enrollmentRow);

        if (enrollError && enrollError.code !== '23505') {
            console.error('user_enrollments insert failed after payment:', enrollError);
        }

        // ---- "Course enrolled" in-app + push notification ----
        // Best-effort, never blocks the purchase response — fires even on a
        // duplicate-enrollment (23505) since access was already granted.
        // Course only, per product spec — a standalone product purchase
        // (course.is_course === false) must NOT trigger this.
        if (course.is_course) {
            await notifyEnrollment(studentEmail, course.name, productId);
        }

        // ---- Telegram purchase notification ----
        // Skipped for app test-mode payments so real sales alerts aren't
        // mixed with test-key checkouts.
        if (!isTestPayment) {
            const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
            const couponLine = redeemedCoupon
                ? `🎟️ Coupon: ${redeemedCoupon.code} (-₹${redeemedCoupon.discount_amount})\n`
                : '';
            await sendTelegramMessage(
                adminChatId,
                `💸 New Purchase — Y N Classes\n\n` +
                `👤 Student: ${studentEmail}\n` +
                `📘 Course: ${course.name} (${productId})\n` +
                couponLine +
                `💰 Amount Paid: ₹${finalPrice}\n` +
                `🕒 Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
            );
        }

        // ---- Return full payment details for client-side overlay + receipt ----
        const purchaseTimeIST = new Date().toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            dateStyle: 'medium',
            timeStyle: 'short',
        });

        // ---- Log to transaction_history (full audit trail) ----
        // Best-effort — a logging failure should never block the student's
        // access, which has already been granted above.
        try {
            const sessionToken = request.cookies.get('cet_session_token')?.value;
            let studentId = null;
            if (sessionToken) {
                const { data: { user } } = await supabaseAdmin.auth.getUser(sessionToken);
                studentId = user?.id || null;
            }

            await supabaseAdmin.from('transaction_history').insert({
                razorpay_payment_id: razorpay_payment_id,
                razorpay_order_id:   razorpay_order_id,
                razorpay_signature:  razorpay_signature,
                student_id:          studentId,
                student_email:       studentEmail,
                course_id:           String(productId),
                course_name:         course.name,
                is_course:           !!course.is_course,
                original_price:      originalPrice,
                discount_amount:     redeemedCoupon ? Number(redeemedCoupon.discount_amount) : 0,
                final_price:         finalPrice,
                currency:            'INR',
                coupon_code:         redeemedCoupon?.code || null,
                payment_status:      isTestPayment ? 'test_captured' : 'captured',
                purchase_time_ist:   purchaseTimeIST,
                ip_address:          request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null,
                user_agent:          request.headers.get('user-agent') || null,
                razorpay_raw:        { razorpay_order_id, razorpay_payment_id, razorpay_signature },
                request_body_raw:    body,
            });
        } catch (logErr) {
            console.error('transaction_history insert failed (non-fatal):', logErr);
        }

        return NextResponse.json({
            success: true,
            // Core fields
            finalPrice,
            // Receipt data — everything the PaymentSuccessOverlay needs
            receipt: {
                paymentId: razorpay_payment_id,
                orderId: razorpay_order_id,
                studentEmail,
                courseName: course.name,
                productId: String(productId),
                amount: finalPrice,
                originalPrice,
                couponCode: redeemedCoupon?.code || null,
                discountAmount: redeemedCoupon ? Number(redeemedCoupon.discount_amount) : 0,
                purchaseTimeIST,
                currency: 'INR',
            },
        });
    } catch (err) {
        console.error('payment verify error:', err);
        return NextResponse.json({ error: 'Failed to verify payment' }, { status: 500 });
    }
}
