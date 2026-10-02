// SAVE THIS FILE AT: lib/telegram.js
//
// Same fire-and-forget sendMessage pattern already used in
// app/api/contact/route.js's notifyTelegram(), pulled out here so both that
// route and app/api/telegram/webhook/route.js share one implementation.

// `replyMarkup` (optional) lets a caller attach Telegram inline buttons,
// e.g. a one-tap "copy code" button using Bot API's `copy_text` button
// type -- see sendTelegramMessage(chatId, text, { copyText: code }) usage
// in the webhook route.
export async function sendTelegramMessage(chatId, text, { replyMarkup } = {}) {
    try {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken || !chatId) return;

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                // No parse_mode -- plain text, same reasoning as the contact
                // route: avoids Telegram's markdown escaping entirely.
                ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
            }),
        });
    } catch (e) {
        console.error('Telegram sendMessage failed:', e);
    }
}

// Builds the reply_markup for a single "📋 Copy Code" button that copies
// `code` to the admin's clipboard on tap -- Telegram's native copy_text
// inline button (Bot API 7.x+), no extra bot logic needed to handle a tap.
export function copyCodeButton(code) {
    return {
        inline_keyboard: [[
            { text: '📋 Copy Code', copy_text: { text: code } },
        ]],
    };
}