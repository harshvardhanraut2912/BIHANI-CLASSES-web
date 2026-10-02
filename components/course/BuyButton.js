'use client';

// SAVE THIS FILE AT: components/course/BuyBox.js  (replace existing)
//
// Changes from original:
//   1. Imports PaymentSuccessOverlay.
//   2. After /api/payment/verify succeeds, instead of immediately calling
//      celebrateAndRedirect(), we store the receipt data in state and show
//      the overlay.  The overlay's "Go to Dashboard" button then triggers
//      the redirect.

import { useEffect, useState } from 'react';
import CouponBox from './CouponBox';
import PaymentSuccessOverlay from '@/components/payment/ReceiptOverlay';
import BlockingOverlay from '@/components/common/BlockingOverlay';
import { supabase } from '@/lib/supabase';

const RAZORPAY_KEY_ID = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';

export default function BuyBox({ productId, originalPrice, validityText = 'Lifetime Validity' }) {
    const [course, setCourse] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [coupon, setCoupon] = useState(null); // { code, discount_amount } | null
    const [paying, setPaying] = useState(false);
    const [alertMsg, setAlertMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isEnrolled, setIsEnrolled] = useState(false);
    const [enrollCheckDone, setEnrollCheckDone] = useState(false);

    // ── NEW: receipt data shown in the overlay after payment ──
    const [receiptData, setReceiptData] = useState(null); // null = overlay hidden

    // ── NEW: "payment gateway is active" screen-blocker overlay ──
    // Shown as soon as the Razorpay checkout window is opened, hidden only
    // once the payment succeeds (verify resolves) or fails/is dismissed.
    const [gatewayActive, setGatewayActive] = useState(false);

    // ── NEW: bottom-of-screen green toast for the FREE-enroll path only.
    // Fires the instant "Enroll for Free" is clicked (not after the API
    // call resolves), and auto-hides itself after ~4.5s as a fallback in
    // case the redirect is ever delayed.
    const [showFreeToast, setShowFreeToast] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function fetchPrice() {
            try {
                const res = await fetch(`/api/course-price?id=${encodeURIComponent(productId)}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to load price');
                if (!cancelled) setCourse(data);
            } catch (err) {
                if (!cancelled) setError(err.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        if (productId) fetchPrice();
        return () => { cancelled = true; };
    }, [productId]);

    useEffect(() => {
        let cancelled = false;
        async function checkEnrollment() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const email = session.user.email.toLowerCase();
                const uuid = session.user.id;
                const studentFilter = `student_id.ilike.${email},student_id.eq.${uuid}`;

                const [courseRes, productRes] = await Promise.all([
                    supabase
                        .from('user_enrollments')
                        .select('id')
                        .or(studentFilter)
                        .eq('course_id', productId)
                        .limit(1)
                        .maybeSingle(),
                    supabase
                        .from('user_enrollments')
                        .select('id')
                        .or(studentFilter)
                        .eq('product_id', productId)
                        .limit(1)
                        .maybeSingle(),
                ]);

                if (!cancelled && (courseRes.data || productRes.data)) {
                    setIsEnrolled(true);
                }
            } catch (err) {
                // Fail silently
            } finally {
                if (!cancelled) setEnrollCheckDone(true);
            }
        }
        if (productId) checkEnrollment();
        else setEnrollCheckDone(true);
        return () => { cancelled = true; };
    }, [productId]);

    function loadRazorpayScript() {
        return new Promise((resolve) => {
            if (window.Razorpay) return resolve(true);
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    }

    // Called by the overlay's "Go to Dashboard" button (and also on auto-timer).
    function redirectToDashboard() {
        window.location.href = `/dashboard/${course.id}`;
    }

    // Show overlay — stays until user clicks a button (no auto-redirect)
    function showOverlayAndScheduleRedirect(receipt) {
        setReceiptData(receipt);
    }


    // Shared "enrollment confirmed" step ────────────────────────────────────
    // Used by BOTH the free path (handleEnroll) and the paid path (Razorpay
    // handler, after /api/payment/verify succeeds). Fires the green "you're
    // being redirected" toast and redirects immediately — no waiting.
    // Auto-hides after 4.5s as a fallback in case the redirect is ever
    // delayed (normally the toast just disappears on navigation).
    function celebrateAndRedirect() {
        setAlertMsg('');
        setSuccessMsg("🎉 You're enrolled! Redirecting to your dashboard...");
        setShowFreeToast(true);
        setTimeout(() => setShowFreeToast(false), 4500);
        window.location.href = `/dashboard/${course.id}`;
    }

    async function handleEnroll() {
        if (!course) return;
        setAlertMsg('');
        setPaying(true);
        try {
            const res = await fetch('/api/enroll/coupon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: course.id, couponCode: coupon?.code || null })
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) {
                    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                    return;
                }
                setAlertMsg(data.error || 'Could not enroll right now.');
                if (!data.tamper) setCoupon(null);
                return;
            }
            celebrateAndRedirect();
        } catch (err) {
            setAlertMsg('Could not enroll right now. Please try again.');
        } finally {
            setPaying(false);
        }
    }

    async function handleBuyNow() {
        if (!course) return;
        setAlertMsg('');

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        // Free course
        if (!course.is_paid || course.price === 0) {
            return handleEnroll();
        }

        // Coupon covers full price
        if (coupon) {
            const clientDiscountedPrice = Math.max(0, course.price - Number(coupon.discount_amount));
            if (clientDiscountedPrice === 0) {
                return handleEnroll();
            }
        }

        if (!RAZORPAY_KEY_ID) {
            alert('Payments are not live yet on this course. (RAZORPAY_KEY_ID not set)');
            return;
        }

        // ── Screen-blocker fires instantly the moment we know this is the
        // paid/Razorpay path — before order creation, before the checkout
        // script even loads. Stays up through the whole Razorpay session
        // (success, failure, or the student closing the checkout window)
        // and, on success, through the enrollment write itself. It only
        // comes down once we know the final outcome.
        setGatewayActive(true);

        setPaying(true);
        try {
            const loaded = await loadRazorpayScript();
            if (!loaded) throw new Error('Could not load Razorpay checkout.');

            const orderRes = await fetch('/api/payment/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: course.id, couponCode: coupon?.code || null })
            });
            const order = await orderRes.json();

            if (!orderRes.ok) {
                if (orderRes.status === 401) {
                    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
                    return;
                }
                if (order.tamper) {
                    setAlertMsg(order.error);
                } else if (order.error) {
                    setAlertMsg(order.error);
                    setCoupon(null);
                }
                throw new Error(order.error || 'Could not create order');
            }

            const options = {
                key: RAZORPAY_KEY_ID,
                amount: order.amount,
                currency: order.currency || 'INR',
                name: 'Y N Classes',
                description: order.courseName || course.title,
                order_id: order.id,
                image: 'https://www.ynclasses.in/images/other_images/ynclasses-logo.png',
                prefill: {
                    name:    order.prefill?.name    || '',
                    email:   order.prefill?.email   || '',
                    contact: order.prefill?.contact || '',
                },
                theme: { color: '#3399cc' },
                modal: {
                    confirm_close:  true,
                    backdropclose:  false,
                    // Checkout window closed by the student without paying —
                    // release the screen-blocker.
                    ondismiss: function () {
                        setGatewayActive(false);
                    },
                },
                timeout: 300,
                notes: {
                    student_internal_id: order.studentId || '',
                    productId: course.id,
                },
                handler: async function (response) {
                    try {
                        const verifyRes = await fetch('/api/payment/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                productId: course.id,
                                couponCode: coupon?.code || null,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                            })
                        });
                        const verifyData = await verifyRes.json();
                        if (!verifyRes.ok) {
                            setAlertMsg(verifyData.error || 'Payment could not be verified.');
                            return;
                        }
                        // ── Enrollment confirmed — drop the blocker, fire the
                        // same green "redirecting" toast the free path uses,
                        // and redirect straight to the course dashboard.
                        setGatewayActive(false);
                        celebrateAndRedirect();
                    } catch (err) {
                        setAlertMsg('Payment succeeded but could not be confirmed. Please contact support with your payment ID.');
                        setGatewayActive(false);
                    }
                },
            };

            const rzp = new window.Razorpay(options);

            // Payment explicitly failed inside the checkout (card declined,
            // etc.) — release the screen-blocker so the student can retry.
            rzp.on('payment.failed', function (response) {
                setGatewayActive(false);
                setAlertMsg(response?.error?.description || 'Payment failed. Please try again.');
            });

            rzp.open();
        } catch (err) {
            // Order creation (or script load) itself failed before Razorpay
            // ever opened — release the blocker so the student isn't stuck.
            setGatewayActive(false);
            if (!alertMsg) alert(err.message);
        } finally {
            setPaying(false);
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    if (loading || !enrollCheckDone) {
        return (
            <div className="bb-card bb-skeleton">
                <div className="bb-skel-line" style={{ width: '60%' }} />
                <div className="bb-skel-line" style={{ width: '40%' }} />
                <div className="bb-skel-btn" />
                <style jsx>{`
                    .bb-skeleton { padding: 20px; }
                    .bb-skel-line { height: 22px; background: #e8f1fb; border-radius: 6px; margin-bottom: 10px; }
                    .bb-skel-btn { height: 46px; background: #e8f1fb; border-radius: 10px; margin-top: 14px; }
                `}</style>
            </div>
        );
    }

    if (error || !course) {
        return <div className="bb-card bb-error">Could not load pricing right now.</div>;
    }

    if (isEnrolled) {
        return (
            <div className="bb-card">
                <div className="bb-enrolled-badge">✓ You're enrolled</div>
                <div className="bb-validity">{validityText}</div>
                <button className="bb-buy-btn bb-go-study-btn" onClick={() => { window.location.href = `/dashboard/${course.id}`; }}>
                    Go Study
                </button>
                <div className="bb-trust-row">
                    <span>🔒 Secure Checkout</span>
                    <span>↩ 7-Day Refund Policy</span>
                </div>
                <style jsx>{`
                    .bb-card {
                        background: var(--card-bg, #fff);
                        border: 1px solid var(--card-border, #cbdce8);
                        border-radius: var(--radius-lg, 16px);
                        padding: 22px;
                        box-shadow: var(--shadow-premium, 0 20px 40px -5px rgba(11,79,138,0.15));
                    }
                    .bb-enrolled-badge {
                        display: inline-block;
                        background: #e8f8f0;
                        color: #0f5132;
                        border: 1px solid var(--success, #10b981);
                        font-size: 13px;
                        font-weight: 700;
                        padding: 6px 12px;
                        border-radius: 20px;
                    }
                    .bb-validity { margin-top: 10px; font-size: 13px; color: var(--text-muted, #5c6b7a); }
                    .bb-buy-btn {
                        width: 100%;
                        margin-top: 18px;
                        padding: 14px;
                        border: none;
                        border-radius: 12px;
                        color: #fff;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: transform 0.15s ease, opacity 0.15s ease;
                    }
                    .bb-buy-btn:hover { transform: translateY(-2px); }
                    .bb-go-study-btn {
                        background: linear-gradient(135deg, #10b981, #059669);
                    }
                    .bb-trust-row {
                        display: flex;
                        justify-content: space-between;
                        margin-top: 14px;
                        font-size: 12px;
                        color: var(--text-muted, #5c6b7a);
                    }
                `}</style>
            </div>
        );
    }

    const discountedPrice = coupon
        ? Math.max(0, course.price - Number(coupon.discount_amount))
        : course.price;

    const hasStrikeFromOriginal = originalPrice && originalPrice > course.price;
    const strikeBase = coupon ? course.price : originalPrice;
    const showStrike = coupon ? true : hasStrikeFromOriginal;
    const discountPercent = (showStrike && strikeBase)
        ? Math.round(((strikeBase - discountedPrice) / strikeBase) * 100)
        : null;

    return (
        <>
            {/* ── Payment success overlay ── */}
            {receiptData && (
                <PaymentSuccessOverlay
                    receipt={receiptData}
                    onClose={redirectToDashboard}
                />
            )}

            {/* ── Payment gateway active screen-blocker ── */}
            {gatewayActive && !receiptData && (
                <BlockingOverlay
                    useLottie
                    message="Payment is being processed, please wait…"
                    subMessage="Please don't refresh or close this page."
                />
            )}

            {/* ── Free-enroll toast — bottom of screen, green, instant on click ── */}
            {showFreeToast && (
                <div className="bb-free-toast" role="status">
                    <span className="bb-free-toast-icon">✓</span>
                    <span>You're being redirected to the course, please wait…</span>
                    <style jsx>{`
                        .bb-free-toast {
                            position: fixed;
                            left: 50%;
                            bottom: 28px;
                            transform: translateX(-50%);
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            background: #10b981;
                            color: #fff;
                            font-size: 14px;
                            font-weight: 600;
                            padding: 14px 20px;
                            border-radius: 12px;
                            box-shadow: 0 12px 28px -6px rgba(16, 185, 129, 0.5);
                            z-index: 9999;
                            animation: bb-toast-in 0.2s ease-out;
                        }
                        .bb-free-toast-icon {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            width: 20px;
                            height: 20px;
                            border-radius: 50%;
                            background: rgba(255, 255, 255, 0.25);
                            flex-shrink: 0;
                            font-size: 13px;
                        }
                        @keyframes bb-toast-in {
                            from { opacity: 0; transform: translateX(-50%) translateY(10px); }
                            to { opacity: 1; transform: translateX(-50%) translateY(0); }
                        }
                    `}</style>
                </div>
            )}

            <div className="bb-card">
                {successMsg && (
                    <div className="bb-success" role="status">
                        <span className="bb-success-icon">✓</span>
                        <span>{successMsg}</span>
                    </div>
                )}
                {alertMsg && (
                    <div className="bb-alert" role="alert">
                        <span className="bb-alert-icon">⚠</span>
                        <span>{alertMsg}</span>
                        <button type="button" className="bb-alert-close" onClick={() => setAlertMsg('')} aria-label="Dismiss">×</button>
                    </div>
                )}

                <div className="bb-price-row">
                    {course.is_paid ? (
                        <>
                            <span className="bb-price">₹{discountedPrice.toLocaleString('en-IN')}</span>
                            {showStrike && (
                                <>
                                    <span className="bb-original">₹{strikeBase.toLocaleString('en-IN')}</span>
                                    {discountPercent !== null && <span className="bb-discount-pill">{discountPercent}% OFF</span>}
                                </>
                            )}
                        </>
                    ) : (
                        <span className="bb-price bb-free">FREE</span>
                    )}
                </div>
                {coupon && (
                    <div className="bb-coupon-note">Coupon <strong>{coupon.code}</strong> applied: -₹{Number(coupon.discount_amount).toLocaleString('en-IN')}</div>
                )}
                <div className="bb-validity">{validityText}</div>

                {course.is_paid && <CouponBox onApply={setCoupon} />}

                <button className="bb-buy-btn" onClick={handleBuyNow} disabled={paying || !!successMsg}>
                    {successMsg ? 'Enrolled ✓' : paying ? 'Processing…' : (!course.is_paid || discountedPrice === 0) ? 'Enroll for Free' : 'Buy Now'}
                </button>

                <div className="bb-trust-row">
                    <span>🔒 Secure Checkout</span>
                    <span>↩ 7-Day Refund Policy</span>
                </div>

                <style jsx>{`
                    .bb-card {
                        background: var(--card-bg, #fff);
                        border: 1px solid var(--card-border, #cbdce8);
                        border-radius: var(--radius-lg, 16px);
                        padding: 22px;
                        box-shadow: var(--shadow-premium, 0 20px 40px -5px rgba(11,79,138,0.15));
                    }
                    .bb-success {
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        background: #e8f8f0;
                        border: 1px solid var(--success, #10b981);
                        color: #0f5132;
                        font-size: 13px;
                        font-weight: 600;
                        padding: 10px 12px;
                        border-radius: 10px;
                        margin-bottom: 14px;
                    }
                    .bb-success-icon { flex-shrink: 0; }
                    .bb-alert {
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        background: #fdecea;
                        border: 1px solid var(--danger, #ef4444);
                        color: #b42318;
                        font-size: 13px;
                        font-weight: 600;
                        padding: 10px 12px;
                        border-radius: 10px;
                        margin-bottom: 14px;
                    }
                    .bb-alert-icon { flex-shrink: 0; }
                    .bb-alert-close {
                        margin-left: auto;
                        background: none;
                        border: none;
                        color: #b42318;
                        font-size: 16px;
                        font-weight: 700;
                        line-height: 1;
                        cursor: pointer;
                        padding: 0 2px;
                    }
                    .bb-price-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
                    .bb-price { font-size: 30px; font-weight: 800; color: var(--text-main, #0f1f2e); font-family: 'Manrope', sans-serif; }
                    .bb-price.bb-free { color: var(--success, #10b981); }
                    .bb-original { font-size: 16px; color: var(--text-muted, #5c6b7a); text-decoration: line-through; }
                    .bb-discount-pill {
                        background: var(--brand-orange, #f2871a);
                        color: #fff;
                        font-size: 12px;
                        font-weight: 700;
                        padding: 3px 8px;
                        border-radius: 6px;
                    }
                    .bb-coupon-note { margin-top: 4px; font-size: 13px; color: var(--success, #10b981); font-weight: 600; }
                    .bb-validity { margin-top: 4px; font-size: 13px; color: var(--text-muted, #5c6b7a); }
                    .bb-buy-btn {
                        width: 100%;
                        margin-top: 18px;
                        padding: 14px;
                        border: none;
                        border-radius: 12px;
                        background: linear-gradient(135deg, var(--primary-blue, #0b4f8a), var(--accent-blue, #1d7fd6));
                        color: #fff;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: transform 0.15s ease, opacity 0.15s ease;
                    }
                    .bb-buy-btn:hover { transform: translateY(-2px); }
                    .bb-buy-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
                    .bb-trust-row {
                        display: flex;
                        justify-content: space-between;
                        margin-top: 14px;
                        font-size: 12px;
                        color: var(--text-muted, #5c6b7a);
                    }
                    .bb-error { color: var(--danger, #ef4444); text-align: center; padding: 30px; }
                `}</style>
            </div>
        </>
    );
}
