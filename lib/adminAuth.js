// SAVE THIS FILE AT: C:\dev\lib\adminAuth.js  (replace the existing file)
//
// Signs and verifies the admin session cookie using HMAC-SHA256 via the
// Web Crypto API (globalThis.crypto.subtle) — deliberately NOT Node's
// `crypto` module, because this needs to run inside proxy.js (edge
// runtime), where Node's crypto module isn't available. Web Crypto works
// identically in both the edge runtime and modern Node, so the exact
// same functions are reused in proxy.js AND any /api/admin/* route.
//
// Token shape: `${base64url(payloadJson)}.${base64url(hmacSignature)}`
// The signature covers the payload bytes, signed with ADMIN_SESSION_SECRET
// (server-only env var, never sent to the browser). Nobody can forge a
// valid token without that secret — manually pasting a cookie into dev
// tools' Application tab will simply fail verification.

const ADMIN_COOKIE_NAME = "cet_admin_token";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(secret) {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Signs an admin session payload ({ email, role }) into a cookie-ready token.
 * Adds `exp` (expiry timestamp) automatically.
 */
export async function signAdminToken(payload, secret) {
  const enc = new TextEncoder();
  const fullPayload = { ...payload, exp: Date.now() + SESSION_DURATION_MS };
  const payloadBytes = enc.encode(JSON.stringify(fullPayload));
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));

  return `${payloadB64}.${sigB64}`;
}

/**
 * Detailed verification — returns WHY a token failed, not just null.
 * Used by proxy.js so the access log can tell apart:
 *   - no_token            → visitor never had a cookie at all (normal denied)
 *   - malformed            → cookie present but not shaped like our token
 *   - invalid_signature    → cookie present, correctly shaped, but the HMAC
 *                            signature does NOT match — this is the strongest
 *                            signal of an actual forgery/tampering attempt,
 *                            since the only way to get here is to hand-craft
 *                            or edit a token without knowing ADMIN_SESSION_SECRET
 *   - expired              → signature is valid (it WAS a real token we
 *                            issued) but the 12h window has passed — this is
 *                            just a normal logged-out session, not an attack
 *   - valid                → good token, not expired
 *
 * Returns: { valid: boolean, reason: string, payload: object|null }
 */
export async function verifyAdminTokenDetailed(token, secret) {
  try {
    if (!token || typeof token !== "string") {
      return { valid: false, reason: "no_token", payload: null };
    }
    if (!token.includes(".")) {
      return { valid: false, reason: "malformed", payload: null };
    }

    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) {
      return { valid: false, reason: "malformed", payload: null };
    }

    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    const expectedSig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSig));

    if (expectedSigB64 !== sigB64) {
      return { valid: false, reason: "invalid_signature", payload: null };
    }

    let payload;
    try {
      const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
      payload = JSON.parse(payloadJson);
    } catch {
      // Signature matched but payload doesn't decode/parse — shouldn't
      // happen in practice, but treat as tampering, not a normal case.
      return { valid: false, reason: "malformed", payload: null };
    }

    if (!payload.exp || Date.now() > payload.exp) {
      return { valid: false, reason: "expired", payload };
    }

    return { valid: true, reason: "valid", payload };
  } catch (e) {
    return { valid: false, reason: "error", payload: null };
  }
}

/**
 * Original simple verifier — kept as-is so any existing caller expecting
 * "payload object or null" keeps working unchanged.
 */
export async function verifyAdminToken(token, secret) {
  const result = await verifyAdminTokenDetailed(token, secret);
  return result.valid ? result.payload : null;
}

export { ADMIN_COOKIE_NAME };