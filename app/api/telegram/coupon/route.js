// SAVE THIS FILE AT: app/api/telegram/coupon/route.js
//
// Called by your Telegram bot -- NOT by the browser -- when an admin types
// something like "coupon code=200" in the admin group and then supplies the
// admin password when the bot asks for it. Your bot's own code should:
//   1. Parse the discount amount out of the admin's message.
//   2. Prompt the admin for the password (in the same chat).
//   3. POST here with { discount_amount, admin_password, created_by }.
//   4. Send whatever `code` / `expires_at` this route returns back into the
//      same Telegram chat, plus the "valid for 24 hours" notice.
//
// This route does not know anything about Telegram -- it's a plain JSON API.
// Wire your bot's HTTP call to whatever URL this deploys at, e.g.
//   https://your-domain.com/api/telegram/coupon

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { generateCouponCode, couponExpiryFromNow } from '@/lib/coupons';

const getClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

export async function POST(request) {
    try {
        const body = await request.json();
        const { discount_amount, admin_password, created_by } = body || {};

        // 1. Password gate -- this is the ONLY thing standing between anyone
        // who finds this URL and free coupon generation, so it's checked first
        // and matched against the server-only env var, never something that
        // could leak to a client bundle.
        const expectedPassword = process.env.ADMIN_PASSWORD_KEY;
        if (!expectedPassword) {
            return NextResponse.json(
                { error: 'Server misconfigured: ADMIN_PASSWORD_KEY is not set.' },
                { status: 500 }
            );
        }
        if (!admin_password || admin_password !== expectedPassword) {
            return NextResponse.json({ error: 'Incorrect admin password.' }, { status: 401 });
        }

        // 2. Validate the discount amount.
        const amount = Number(discount_amount);
        if (!amount || amount <= 0 || !Number.isFinite(amount)) {
            return NextResponse.json({ error: 'discount_amount must be a positive number.' }, { status: 400 });
        }

        const supabase = getClient();
        const expiresAt = couponExpiryFromNow();

        // 3. Generate a code and retry on the rare unique-constraint collision
        // (4 random letters -> ~458k combinations per amount, collisions are
        // rare but not impossible, especially for common round amounts).
        let code = null;
        let insertError = null;
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = generateCouponCode(amount);
            const { error } = await supabase.from('coupons').insert({
                code: candidate,
                discount_amount: amount,
                created_by: created_by || 'telegram-admin',
                expires_at: expiresAt.toISOString(),
            });
            if (!error) {
                code = candidate;
                insertError = null;
                break;
            }
            // 23505 = unique_violation in Postgres -- only case worth retrying.
            if (error.code !== '23505') {
                insertError = error;
                break;
            }
            insertError = error;
        }

        if (!code) {
            console.error('coupon generation failed:', insertError);
            return NextResponse.json({ error: 'Could not generate a unique coupon code, try again.' }, { status: 500 });
        }

        return NextResponse.json({
            code,
            discount_amount: amount,
            expires_at: expiresAt.toISOString(),
            notice: `Valid for 24 hours only (expires ${expiresAt.toISOString()}). Single use -- discarded immediately after first redemption.`,
        });
    } catch (err) {
        console.error('telegram coupon route error:', err);
        return NextResponse.json({ error: 'Failed to generate coupon.' }, { status: 500 });
    }
}