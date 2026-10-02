// SAVE THIS FILE AT: lib/studentAuth.js  (REPLACE your existing file with this)
//
// Identifies the logged-in student from the `cet_session_token` cookie
// (set by public/auth.js on sign-in).
//
// PREVIOUSLY this called supabaseAdmin.auth.getUser(sessionToken) — a live
// network round-trip to Supabase's /auth/v1/user endpoint — on EVERY API
// call, which was tripping Supabase GoTrue's rate limiting under bursty
// dashboard load traffic (the "node | 403" storm).
//
// FIRST FIX ATTEMPT used jose's jwtVerify() with a raw shared-secret
// (SUPABASE_JWT_SECRET, HS256). This FAILED for this project with:
//   "Key for the ES256 algorithm must be one of type KeyObject, CryptoKey,
//    or JSON Web Key. Received an instance of Uint8Array"
// This project's tokens are signed with ES256 (Supabase's newer asymmetric
// JWT Signing Keys system), not the old single shared HS256 secret. A raw
// Uint8Array key only works for HS256, hence the error on every call.
//
// CORRECT FIX: verify against Supabase's public JWKS endpoint using
// jose's createRemoteJWKSet(). This works for both ES256 and HS256/RS256
// automatically (jose picks the right key based on the token's `kid`
// header), requires no manually-copied secret at all, and jose caches
// the JWKS response internally so this still avoids a network call on
// every single request (only refetches the JWKS when a `kid` it hasn't
// seen shows up, e.g. after key rotation).

import { createClient } from '@supabase/supabase-js';
import { jwtVerify, createRemoteJWKSet } from 'jose';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Supabase's JWKS endpoint — public keys used to verify tokens it issues.
// No secret needed here; this is safe to hardcode/derive from the public
// project URL.
const JWKS_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Verifies a Supabase access token locally against Supabase's JWKS
 * (no per-request network call to /auth/v1/user) and returns
 * { id, email } for the user it belongs to, or null if the token is
 * missing, expired, or has an invalid signature.
 */
// ROOT CAUSE (confirmed): logs proved tokens had ~3600s of real validity
// left, yet jwtVerify() still threw JWTExpired -- while a Date.now() call
// a few ms later (in the catch block) read the CORRECT time. jose's own
// claims check reads Date.now() *internally*, and it does so AFTER an
// internal `await` (the JWKS lookup). If that internal clock read lands
// in a bad window (consistent with a Vercel Fluid Compute container-
// resume clock artifact), jose has no way to know -- it trusts its own
// Date.now(). A synchronous retry right after can still land in the same
// bad window, because it goes through the same internal await-then-read
// pattern again.
//
// FIX: capture the clock ourselves, synchronously, BEFORE calling
// jwtVerify at all (no await has happened yet, so this read can't be
// affected by whatever happens during jose's internal JWKS await). Pass
// it in as `currentDate` so jose checks `exp` against OUR timestamp
// instead of calling Date.now() itself. This removes the internal clock
// read as a point of failure entirely, rather than just retrying around
// it. clockTolerance stays tight ('30 sec', normal clock-drift
// allowance) since this doesn't depend on a wide tolerance to mask
// anything.
async function verifyOnce(sessionToken, currentDate) {
    const { payload } = await jwtVerify(sessionToken, jwks, {
        clockTolerance: '30 sec',
        currentDate,
    });
    if (!payload.sub) return null;
    return { id: payload.sub, email: payload.email || null };
}

async function verifyLocally(sessionToken) {
    const capturedAt = new Date(); // read BEFORE any await -- see note above
    try {
        return await verifyOnce(sessionToken, capturedAt);
    } catch (err) {
        if (err.name === 'JWTExpired') {
            // Belt-and-suspenders: retry with a freshly captured clock
            // reading in case the token was genuinely borderline.
            try {
                return await verifyOnce(sessionToken, new Date());
            } catch (retryErr) {
                console.error(
                    '[studentAuth] jwtVerify failed after retry:', retryErr.name, retryErr.message,
                    '| capturedAtEpoch:', Math.floor(capturedAt.getTime() / 1000),
                    '| serverNowEpoch:', Math.floor(Date.now() / 1000),
                    '| serverNowISO:', new Date().toISOString()
                );
                return null;
            }
        }
        console.error(
            '[studentAuth] jwtVerify failed:', err.name, err.message,
            '| capturedAtEpoch:', Math.floor(capturedAt.getTime() / 1000),
            '| serverNowEpoch:', Math.floor(Date.now() / 1000),
            '| serverNowISO:', new Date().toISOString()
        );
        return null;
    }
}

/**
 * Resolves the `cet_session_token` cookie on `request` (a NextRequest) to
 * { id, email }, or null if there's no valid session. This is the shared
 * entry point every route should use instead of rolling its own
 * supabaseAdmin.auth.getUser(sessionToken) call.
 */
export async function getVerifiedUser(request) {
    const sessionToken = request.cookies.get('cet_session_token')?.value;
    if (!sessionToken) return null;

    return verifyLocally(sessionToken);
}

/**
 * Returns the logged-in student's email, or null if there's no valid
 * session. `request` is the NextRequest passed into a route handler.
 */
export async function getStudentEmail(request) {
    const user = await getVerifiedUser(request);
    return user?.email || null;
}

/**
 * Returns { email, name, phone } for the logged-in student, or null.
 * `name`/`phone` come from the `profiles` table (full_name, mobile_number)
 * and fall back to '' when not set -- Razorpay's checkout fills in
 * whatever prefill fields are left empty.
 */
export async function getStudentProfile(request) {
    const user = await getVerifiedUser(request);
    if (!user) return null;

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('full_name, mobile_number')
        .eq('id', user.id)
        .maybeSingle();

    return {
        email: user.email,
        name: profile?.full_name || '',
        phone: profile?.mobile_number || '',
    };
}

export { supabaseAdmin };
