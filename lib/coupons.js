// SAVE THIS FILE AT: lib/coupons.js
//
// Small shared helpers for coupon codes. Kept separate from the routes that
// use them so both app/api/telegram/coupon/route.js (generates) and
// app/api/payment/create-order/route.js (redeems) stay in sync on format.

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const COUPON_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24 hours, per spec

/**
 * Builds a code like "HUCN200" -- 4 random capital letters + the discount
 * amount (whole rupees, no decimals) appended as-is. This means the amount
 * is baked into the code itself: "TXKW150" is only ever valid for exactly
 * that -- a student typing "TXKW400" is a different string entirely and
 * will simply not be found in the table.
 */
export function generateCouponCode(discountAmount) {
    let letters = '';
    for (let i = 0; i < 4; i++) {
        letters += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }
    const amountPart = String(Math.round(Number(discountAmount)));
    return `${letters}${amountPart}`;
}

export function couponExpiryFromNow() {
    return new Date(Date.now() + COUPON_VALIDITY_MS);
}

/**
 * Normalizes user/bot input the same way everywhere: trim + uppercase.
 * Matching against the DB is a plain exact-string `.eq('code', ...)` after
 * this normalization -- no fuzzy matching, no partial matching.
 */
export function normalizeCouponCode(raw) {
    return String(raw || '').trim().toUpperCase();
}