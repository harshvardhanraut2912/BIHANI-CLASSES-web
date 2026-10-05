// lib/devAuth.js  (new file, server only -- used by /api/admin/dev/* routes)
//
// Second lock for the Settings -> Developers tab. An admin who is already signed
// in still has to type ADMIN_PASSWORD_KEY (checked here, on the server). A correct
// password sets a short-lived, httpOnly, signed cookie. Every /api/admin/dev/*
// route re-checks that cookie, so the lock can't be bypassed from the browser.

import { createHash, timingSafeEqual } from "crypto";
import { signAdminToken, verifyAdminToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export const DEV_COOKIE_NAME = "cet_dev_token";
export const DEV_SESSION_MS = 30 * 60 * 1000; // 30 minutes

const sha = (v) => createHash("sha256").update(String(v)).digest();

// Constant-time comparison against ADMIN_PASSWORD_KEY.
export function passwordMatches(input) {
  const expected = process.env.ADMIN_PASSWORD_KEY;
  if (!expected || typeof input !== "string" || !input) return false;
  return timingSafeEqual(sha(input), sha(expected));
}

// Signed-in admin from the normal admin cookie -> { email, role } | null
export async function getAdminFromRequest(request) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!secret || !token) return null;
  const payload = await verifyAdminToken(token, secret);
  if (!payload?.email) return null;
  return { email: String(payload.email).toLowerCase().trim(), role: payload.role || null };
}

// Admin cookie valid AND developer cookie valid AND both belong to the same admin.
export async function requireDev(request) {
  const admin = await getAdminFromRequest(request);
  if (!admin) return null;
  const secret = process.env.ADMIN_SESSION_SECRET;
  const devToken = request.cookies.get(DEV_COOKIE_NAME)?.value;
  if (!devToken) return null;
  const dev = await verifyAdminToken(devToken, secret);
  if (!dev || dev.scope !== "dev") return null;
  if (String(dev.email || "").toLowerCase().trim() !== admin.email) return null;
  return admin;
}

export async function makeDevToken(email) {
  return signAdminToken({ email, scope: "dev" }, process.env.ADMIN_SESSION_SECRET, DEV_SESSION_MS);
}

export const devCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: DEV_SESSION_MS / 1000,
};
