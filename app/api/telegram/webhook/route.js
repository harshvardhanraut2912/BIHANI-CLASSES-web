// SAVE THIS FILE AT: app/api/telegram/webhook/route.js
//
// This is the URL you register with Telegram as your bot's webhook, e.g.:
//   https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://your-domain.com/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
// (run that once, in a browser or curl -- not from this app)
//
// Conversation handled here, entirely from the admin group chat:
//   admin:  coupon code=200
//   bot:    Enter the admin password to generate a ₹200 coupon:
//   admin:  <ADMIN_PASSWORD_KEY>
//   bot:    ✅ Coupon generated: HUCN200
//           Valid for 24 hours only (expires ...). Single use.
//
// State between those two admin messages is kept in
// telegram_pending_coupon_requests (see supabase/telegram_pending_table.sql)
// since this route is stateless/serverless -- it can't hold anything in
// memory between two separate incoming webhook calls.
//
// Only messages from TELEGRAM_ADMIN_CHAT_ID are ever acted on -- anyone else
// messaging the bot is silently ignored, so this can't be used to generate
// coupons even if someone finds the bot and messages it directly.

import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { generateCouponCode, couponExpiryFromNow } from '@/lib/coupons';
import { sendTelegramMessage, copyCodeButton } from '@/lib/telegram';

const PENDING_TTL_MS = 3 * 60 * 1000; // password must be sent within 3 minutes

const getClient = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { cookies: { getAll() { return []; }, setAll() {} } }
);

async function generateAndSaveCoupon(supabase, amount, createdBy) {
    const expiresAt = couponExpiryFromNow();
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCouponCode(amount);
        const { error } = await supabase.from('coupons').insert({
            code: candidate,
            discount_amount: amount,
            created_by: createdBy || 'telegram-admin',
            expires_at: expiresAt.toISOString(),
        });
        if (!error) return { code: candidate, expiresAt };
        if (error.code !== '23505') throw error; // only retry on unique_violation
    }
    throw new Error('Could not generate a unique coupon code after 5 attempts.');
}

export async function POST(request) {
    // Telegram needs a fast 200 regardless of what happened inside --
    // it'll retry/disable the webhook if it sees repeated non-200s.
    try {
        // Optional but recommended: verify the secret token Telegram sends
        // when you register the webhook with `secret_token`, so random
        // requests to this URL can't pretend to be Telegram.
        const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        if (expectedSecret) {
            const gotSecret = request.headers.get('x-telegram-bot-api-secret-token');
            if (gotSecret !== expectedSecret) {
                return NextResponse.json({ ok: true }); // silently drop
            }
        }

        const update = await request.json();
        const message = update?.message;
        const text = message?.text?.trim();
        const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
        const fromUser = message?.from?.username || message?.from?.first_name || 'unknown';

        if (!chatId || !text) {
            return NextResponse.json({ ok: true });
        }

        // Only the configured admin chat can drive this conversation.
        const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
        if (!adminChatId || chatId !== String(adminChatId)) {
            return NextResponse.json({ ok: true });
        }

        const supabase = getClient();

        // ---- 1. Is there a pending "waiting for password" request? ----
        const { data: pending } = await supabase
            .from('telegram_pending_coupon_requests')
            .select('discount_amount, requested_at')
            .eq('chat_id', chatId)
            .maybeSingle();

        if (pending) {
            const isExpired = Date.now() - new Date(pending.requested_at).getTime() > PENDING_TTL_MS;

            // Always clear the pending row once we act on it -- one attempt,
            // then the admin has to restart with "coupon code=<amount>" again.
            await supabase.from('telegram_pending_coupon_requests').delete().eq('chat_id', chatId);

            if (isExpired) {
                await sendTelegramMessage(chatId, '⌛ That request timed out. Send "coupon code=<amount>" again to restart.');
                return NextResponse.json({ ok: true });
            }

            const expectedPassword = process.env.ADMIN_PASSWORD_KEY;
            if (!expectedPassword) {
                await sendTelegramMessage(chatId, '⚠️ Server misconfigured: ADMIN_PASSWORD_KEY is not set.');
                return NextResponse.json({ ok: true });
            }

            if (text !== expectedPassword) {
                await sendTelegramMessage(chatId, '❌ Incorrect password. Send "coupon code=<amount>" to try again.');
                return NextResponse.json({ ok: true });
            }

            try {
                const { code, expiresAt } = await generateAndSaveCoupon(supabase, pending.discount_amount, fromUser);
                await sendTelegramMessage(
                    chatId,
                    `✅ Coupon generated: ${code}\n` +
                    `💰 Discount: ₹${pending.discount_amount}\n` +
                    `⏳ Valid for 24 hours only — expires ${new Date(expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
                    `🔒 Single use — discarded the moment it's redeemed.`,
                    { replyMarkup: copyCodeButton(code) }
                );
            } catch (err) {
                console.error('coupon generation via telegram failed:', err);
                await sendTelegramMessage(chatId, '⚠️ Could not generate a coupon code, please try again.');
            }
            return NextResponse.json({ ok: true });
        }

        // ---- 2. Is this a new "coupon code=<amount>" request? ----
        const match = text.match(/coupon\s*(?:code)?\s*=\s*(\d+(?:\.\d+)?)/i);
        if (match) {
            const amount = Number(match[1]);
            if (!amount || amount <= 0) {
                await sendTelegramMessage(chatId, '⚠️ Discount amount must be a positive number.');
                return NextResponse.json({ ok: true });
            }

            await supabase.from('telegram_pending_coupon_requests').upsert({
                chat_id: chatId,
                discount_amount: amount,
                requested_by: fromUser,
                requested_at: new Date().toISOString(),
            });

            await sendTelegramMessage(chatId, `🔑 Enter the admin password to generate a ₹${amount} coupon (expires in 3 minutes):`);
            return NextResponse.json({ ok: true });
        }

        // Anything else from the admin chat -- ignored, no reply, so the
        // bot doesn't spam the group on unrelated chatter.
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error('telegram webhook error:', err);
        return NextResponse.json({ ok: true }); // still 200 -- never let Telegram retry-storm this
    }
}