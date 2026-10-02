// SAVE THIS FILE AT: lib/pushSender.js  (new file)
//
// Thin wrapper around Expo's push HTTP API. No SDK dependency needed —
// it's a single JSON POST endpoint. Expo caps each request at 100
// messages, so this chunks automatically. Failures for individual tokens
// (e.g. a token was uninstalled) are swallowed here — the in-app
// notification (notification_recipients row) is the source of truth;
// the push is best-effort on top of it.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * @param {string[]} expoTokens - Expo push tokens ("ExponentPushToken[...]")
 * @param {string} title
 * @param {string} body
 * @param {object} [data] - extra payload delivered to the app (e.g. { notificationId })
 */
export async function sendExpoPush(expoTokens, title, body, data = {}) {
  const validTokens = [...new Set(expoTokens)].filter(
    (t) => typeof t === 'string' && t.startsWith('ExponentPushToken')
  );
  if (validTokens.length === 0) return { sent: 0, tickets: [] };

  // Android supports a "big picture" style banner via richContent.image —
  // no native rebuild needed, Expo's push service just adds it to the
  // notification it already builds. iOS doesn't show images in the OS
  // banner without a native Notification Service Extension, so this only
  // affects Android; iOS/Android in-app (the bell/list) already gets the
  // image separately via `data.imageUrl` + the my_notifications view.
  const imageUrl = data?.imageUrl;
  const messages = validTokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data,
    ...(imageUrl ? { richContent: { image: imageUrl } } : {}),
  }));

  const tickets = [];
  for (const batch of chunk(messages, CHUNK_SIZE)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      const json = await res.json();

      if (!res.ok) {
        console.error('[pushSender] Expo push HTTP error:', res.status, json);
      }

      if (Array.isArray(json?.data)) {
        tickets.push(...json.data);
        json.data.forEach((ticket, i) => {
          if (ticket.status === 'error') {
            console.error('[pushSender] Expo rejected a message:', {
              to: batch[i]?.to,
              message: ticket.message,
              details: ticket.details,
            });
          } else {
            console.log('[pushSender] ticket ok:', ticket.id, 'for', batch[i]?.to);
          }
        });
      } else if (json?.errors) {
        // Malformed top-level request (rare) -- Expo returns this shape
        // instead of a per-message data array.
        console.error('[pushSender] Expo push request-level error:', json.errors);
      }
    } catch (err) {
      console.error('[pushSender] Expo push batch failed:', err);
    }
  }

  return { sent: validTokens.length, tickets };
}
