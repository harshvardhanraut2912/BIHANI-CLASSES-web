// SAVE THIS FILE AT: app/api/payment/create-order/route.js  (replace existing)
//
// Only change from your version: added `key_id` to the JSON response
// (see the return block at the bottom) so the app always uses the exact
// key that created this specific order, instead of relying on a
// separately hardcoded value on the app side that can drift out of sync.
//
// Two things this route guarantees:
//   1. PRICE IS NEVER TRUSTED FROM THE CLIENT. The only inputs used to
//      compute the final amount are: the course's price row from Supabase,
//      and (optionally) a coupon row from Supabase.
//   2. If the request body contains any field that looks like an attempt to
//      pass a price/amount/discount directly, the request is rejected with
//      `tamper: true` and a message the frontend shows as a red popup.
//
// Coupon redemption (marking a code "used") happens in /api/payment/verify,
// NOT here -- this route just prices a checkout attempt and can be hit
// repeatedly (reloads, abandoned carts) without a real payment happening.

import { NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { normalizeCouponCode } from '@/lib/coupons';
import { getStudentProfile, supabaseAdmin } from '@/lib/studentAuth';

// ---- Test-mode support for the mobile app ----
// Your website always checks out with your LIVE Razorpay keys. The app,
// while it's still being tested, needs to hit Razorpay in TEST mode
// instead — but test-mode orders can only be opened by a test-mode
// checkout key, so we can't just swap the key here for everyone.
// Instead: only requests carrying the exact APP_TEST_MODE_SECRET header
// (known only to you / the app build) get routed to the test key pair.
// Every normal website checkout is completely unaffected.
function getRazorpayCredentials(request) {
    const testHeader = request.headers.get('x-app-test-mode');
    const testSecretConfigured = process.env.APP_TEST_MODE_SECRET;
    const isTestRequest = !!testHeader && !!testSecretConfigured && testHeader === testSecretConfigured;

    if (isTestRequest) {
        return {
            key_id: process.env.RAZORPAY_TEST_KEY_ID,
            key_secret: process.env.RAZORPAY_TEST_KEY_SECRET,
            isTest: true,
        };
    }
    return {
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
        isTest: false,
    };
}

const FORBIDDEN_CLIENT_FIELDS = ['amount', 'price', 'finalPrice', 'final_price', 'discount', 'discountAmount', 'discount_amount'];

export async function POST(request) {
    try {
        const body = await request.json();
        const { productId, couponCode } = body || {};

        const suspiciousFields = FORBIDDEN_CLIENT_FIELDS.filter((f) => body && Object.prototype.hasOwnProperty.call(body, f));
        if (suspiciousFields.length > 0) {
            console.warn('Price tamper attempt on create-order:', { productId, suspiciousFields, body });
            return NextResponse.json(
                { tamper: true, error: 'Pricing is verified on our server and cannot be set from the browser. Please do not try to bypass checkout — the exact listed price will always apply.' },
                { status: 400 }
            );
        }

        if (!productId) {
            return NextResponse.json({ error: 'Missing productId' }, { status: 400 });
        }

        const studentProfile = await getStudentProfile(request);
        if (!studentProfile) {
            return NextResponse.json({ error: 'Please log in to purchase this course.' }, { status: 401 });
        }
        const { email: studentEmail, name: studentName, phone: studentPhone } = studentProfile;

        // ---- 1. Server-side truth for the course price ----
        const { data: course, error: courseError } = await supabaseAdmin
            .from('sidebar_main_sections')
            .select('id, name, price, is_paid')
            .eq('id', productId)
            .single();

        if (courseError || !course) {
            return NextResponse.json({ error: 'Course not found' }, { status: 404 });
        }
        if (!course.is_paid || !course.price) {
            return NextResponse.json({ error: 'This course does not require payment' }, { status: 400 });
        }

        const originalPrice = Number(course.price);
        let finalPrice = originalPrice;
        let coupon = null;

        // ---- 2. Server-side coupon validation (read-only check here) ----
        // Redemption is deferred to /api/payment/verify so a stub/failed
        // order never burns the student's coupon.
        if (couponCode) {
            const normalized = normalizeCouponCode(couponCode);

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

            coupon = couponRow;
            finalPrice = Math.max(0, originalPrice - Number(coupon.discount_amount));
        }

        const finalAmountPaise = Math.round(finalPrice * 100);

        // ---- 3. Razorpay order creation ----
        // Coupon redemption + Telegram purchase notification + the actual
        // user_enrollments write all happen in /api/payment/verify, once
        // BuyBox's Razorpay success handler confirms the payment there.
        // This route only ever opens an order -- it never grants access.
        const { key_id, key_secret, isTest } = getRazorpayCredentials(request);
        // TEMP DEBUG — check your website's server logs (terminal / Vercel
        // function logs) after tapping Buy Now on the app.
        console.log('[create-order] x-app-test-mode header:', request.headers.get('x-app-test-mode'));
        console.log('[create-order] APP_TEST_MODE_SECRET set:', !!process.env.APP_TEST_MODE_SECRET, '| isTest:', isTest, '| using key_id:', key_id);
        if (!key_id || !key_secret) {
            return NextResponse.json(
                {
                    error: isTest
                        ? 'App test mode is on but RAZORPAY_TEST_KEY_ID / RAZORPAY_TEST_KEY_SECRET are not set in .env.local.'
                        : 'Razorpay is not configured yet. Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to .env.local.',
                },
                { status: 501 }
            );
        }
        const razorpay = new Razorpay({ key_id, key_secret });

        // Receipt id must be <= 40 chars per Razorpay's API.
        const receipt = `rcpt_${productId}_${Date.now()}`.slice(0, 40);

        const order = await razorpay.orders.create({
            amount: finalAmountPaise,
            currency: 'INR',
            receipt,
            notes: { productId: String(productId), couponCode: coupon?.code || '' },
        });

        return NextResponse.json({
            ...order,
            // Prefill data for Razorpay checkout — never trust these back on verify
            prefill: {
                name: studentName,
                email: studentEmail,
                contact: studentPhone,
            },
            // Pass course name to BuyBox so it can set description
            courseName: course.name,
            studentId: studentEmail,
            // Diagnostic: which key pair the server actually used for this
            // order. The app checks this against what it expected and
            // warns loudly on mismatch instead of opening a checkout sheet
            // that's guaranteed to fail.
            isTestMode: isTest,
            // The actual key_id used to create this order. The app opens
            // Razorpay checkout with THIS value (falling back to its own
            // local constant only if this is ever missing) — guarantees
            // checkout always matches the order's key pair, test or live.
            key_id: key_id,
        });
    } catch (err) {
        console.error('create-order error:', err);
        return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
    }
}
