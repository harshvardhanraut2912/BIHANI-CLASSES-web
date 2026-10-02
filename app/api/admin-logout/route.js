// SAVE THIS FILE AT: C:\dev\app\api\admin-logout\route.js  (new file)
//
// Clears the real, server-enforced admin session cookie. This is what
// actually revokes access — clearing sessionStorage on the client (the
// old UI-only flag) does nothing to this cookie, and the middleware gate
// in proxy.js checks THIS cookie, not sessionStorage, on every request.
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { logAdminAccess } from "@/lib/logAdminAccess";

export async function POST(request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });

  await logAdminAccess({
    request,
    attempted_email: null,
    path: "/api/admin-logout",
    method: "POST",
    result: "logout",
    success: true,
    entry_method: null,
    reason: null,
  });

  return response;
}