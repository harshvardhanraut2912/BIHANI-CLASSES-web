// SAVE THIS FILE AT: lib/transactionAuth.js  (new file)
//
// Completely separate from the site's normal admin login (lib/adminAuth.js).
// This page has its own password (TRANSACTION_PASS, in .env.local) and its
// own signed httpOnly cookie. The password check happens ONLY in
// /api/transactions-secret/login (server-side) — the browser never sees
// TRANSACTION_PASS.
//
// Same Web Crypto HMAC approach as lib/adminAuth.js, kept independent so
// this page's session can't be forged even by someone who knows the site's
// main ADMIN_SESSION_SECRET, and vice versa.

const TX_COOKIE_NAME = "tx_secret_token";
const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str) {
  const padded = str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(str.length + ((4 - (str.length % 4)) % 4), "=");
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
 * Signs a session token. Payload is just a marker + expiry — there's no
 * user identity here, only "this browser passed the TRANSACTION_PASS check".
 */
export async function signTxToken(secret) {
  const enc = new TextEncoder();
  const fullPayload = { ok: true, exp: Date.now() + SESSION_DURATION_MS };
  const payloadBytes = enc.encode(JSON.stringify(fullPayload));
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(signature));

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies a session token. Returns true only if the signature matches
 * (i.e. it was issued by this server using the current TRANSACTION_PASS)
 * AND it hasn't expired.
 */
export async function verifyTxToken(token, secret) {
  try {
    if (!token || typeof token !== "string" || !token.includes(".")) return false;

    const [payloadB64, sigB64] = token.split(".");
    if (!payloadB64 || !sigB64) return false;

    const key = await getHmacKey(secret);
    const enc = new TextEncoder();
    const expectedSig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    const expectedSigB64 = base64UrlEncode(new Uint8Array(expectedSig));

    if (expectedSigB64 !== sigB64) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (!payload.exp || Date.now() > payload.exp) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Call this at the top of every /api/transactions-secret/* route (except
 * /login itself) to gate access. Reads the cookie from the request,
 * verifies it against TRANSACTION_PASS, and returns true/false.
 */
export async function isTxSessionValid(request) {
  const token = request.cookies.get(TX_COOKIE_NAME)?.value;
  const rawB64 = process.env.TRANSACTION_PASS_B64;
  if (!rawB64) return false;
  let secret;
  try {
    secret = Buffer.from(rawB64, "base64").toString("utf8");
  } catch {
    return false;
  }
  if (!secret) return false;
  return verifyTxToken(token, secret);
}

export { TX_COOKIE_NAME };
