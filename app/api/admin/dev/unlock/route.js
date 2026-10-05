// app/api/admin/dev/unlock/route.js  (new file)
//
// Gate for Settings -> Developers.
//   GET    -> { unlocked: boolean }   is the developer cookie still valid?
//   POST   -> { password }            checked on the server against ADMIN_PASSWORD_KEY;
//                                     on success sets the short-lived developer cookie.
//   DELETE -> removes the developer cookie (called when the tab is left).
// Already behind the admin session gate in proxy.js (path is under /api/admin/).

import { NextResponse } from "next/server";
import { logAdminAccess } from "@/lib/logAdminAccess";
import {
  DEV_COOKIE_NAME, devCookieOptions, getAdminFromRequest, makeDevToken, passwordMatches, requireDev,
} from "@/lib/devAuth";

export const dynamic = "force-dynamic";

// Best-effort brute-force brake (per server instance): 5 wrong tries -> 10 min pause.
const attempts = new Map(); // key -> { n, until }
const MAX_TRIES = 5;
const PAUSE_MS = 10 * 60 * 1000;

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  const dev = await requireDev(request);
  return NextResponse.json({ unlocked: !!dev }, { headers: noStore });
}

export async function POST(request) {
  const path = "/api/admin/dev/unlock";
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ADMIN_PASSWORD_KEY || !process.env.ADMIN_SESSION_SECRET) {
    console.error("dev unlock: ADMIN_PASSWORD_KEY or ADMIN_SESSION_SECRET is not set");
    return NextResponse.json({ error: "Server is not configured for this action." }, { status: 500 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const key = `${admin.email}|${ip}`;
  const rec = attempts.get(key);
  if (rec && rec.until > Date.now()) {
    const mins = Math.ceil((rec.until - Date.now()) / 60000);
    return NextResponse.json({ error: `Too many wrong attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.` }, { status: 429 });
  }

  let password = "";
  try { ({ password } = await request.json()); } catch {}

  if (!passwordMatches(password)) {
    const n = (rec && rec.until <= Date.now() ? 0 : rec?.n || 0) + 1;
    attempts.set(key, { n, until: n >= MAX_TRIES ? Date.now() + PAUSE_MS : 0 });
    await logAdminAccess({
      request, attempted_email: admin.email, path, method: "POST",
      result: "dev_panel_bad_password", success: false, entry_method: null, reason: "bad_dev_password",
    });
    return NextResponse.json({ error: "Incorrect password." }, { status: 403 });
  }

  attempts.delete(key);
  await logAdminAccess({
    request, attempted_email: admin.email, path, method: "POST",
    result: "dev_panel_unlocked", success: true, entry_method: "dev_password", reason: null,
  });

  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(DEV_COOKIE_NAME, await makeDevToken(admin.email), devCookieOptions);
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { headers: noStore });
  res.cookies.set(DEV_COOKIE_NAME, "", { ...devCookieOptions, maxAge: 0 });
  return res;
}
