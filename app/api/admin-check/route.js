// SAVE THIS FILE AT: C:\dev\app\api\admin-check\route.js  (replace the existing file)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signAdminToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { logAdminAccess } from "@/lib/logAdminAccess";

// Server-only client — uses the service role key so it can safely read
// admin_users regardless of RLS, but this file NEVER runs in the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const path = "/api/admin-check";
  let email = "";

  try {
    const body = await request.json();
    email = body.email || "";

    if (!email) {
      await logAdminAccess({
        request, attempted_email: email, path, method: "POST",
        result: "missing_email", success: false, entry_method: null, reason: "missing_email",
      });
      return NextResponse.json({ ok: false, message: "Email is required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("email, assigned_role")
      .ilike("email", email.trim())
      .maybeSingle();

    if (error || !data) {
      // This is someone whose regular Supabase session email does NOT
      // match admin_users trying to hit an admin-only check — worth
      // watching if it happens repeatedly from the same IP.
      await logAdminAccess({
        request, attempted_email: email, path, method: "POST",
        result: "not_admin", success: false, entry_method: null, reason: "not_in_admin_users",
      });
      return NextResponse.json({ ok: false });
    }

    if (!process.env.ADMIN_SESSION_SECRET) {
      console.error("❌ ADMIN_SESSION_SECRET is missing from environment variables.");
      await logAdminAccess({
        request, attempted_email: email, path, method: "POST",
        result: "server_misconfig", success: false, entry_method: null, reason: "missing_session_secret",
      });
      return NextResponse.json({ ok: false, message: "Server misconfiguration." }, { status: 500 });
    }

    // Same cookie issuance as /api/admin-login — this path (already logged
    // in via regular Supabase auth, email happens to match admin_users)
    // must ALSO get the signed httpOnly cookie.
    const token = await signAdminToken(
      { email: data.email, role: data.assigned_role },
      process.env.ADMIN_SESSION_SECRET
    );

    const response = NextResponse.json({ ok: true, role: data.assigned_role });
    response.cookies.set(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    // Entered via an already-valid Supabase session, not by typing the
    // admin password on the admin-login form.
    await logAdminAccess({
      request, attempted_email: data.email, path, method: "POST",
      result: "success", success: true, entry_method: "session_cookie", reason: null,
    });

    return response;
  } catch (e) {
    console.error("admin-check error:", e);
    await logAdminAccess({
      request, attempted_email: email, path, method: "POST",
      result: "server_error", success: false, entry_method: null, reason: "exception",
    });
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}