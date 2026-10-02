// SAVE THIS FILE AT: C:\dev\app\api\admin-login\route.js  (replace the existing file)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signAdminToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { logAdminAccess } from "@/lib/logAdminAccess";

// Server-only client — service role key stays on the server, never shipped to the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const path = "/api/admin-login";
  let email = "";

  try {
    const body = await request.json();
    email = body.email || "";
    const { password } = body;

    if (!email || !password) {
      await logAdminAccess({
        request, attempted_email: email, path, method: "POST",
        result: "missing_fields", success: false, entry_method: null, reason: "missing_fields",
      });
      return NextResponse.json(
        { ok: false, message: "Email and password are required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("admin_users")
      .select("email, password, assigned_role")
      .ilike("email", email.trim())
      .maybeSingle();

    // NOTE: this compares plain-text passwords because that's how admin_users
    // is currently structured. Strongly recommend switching this column to a
    // hashed value (e.g. via pgcrypto's crypt()/bcrypt) and comparing hashes
    // here instead.
    if (error || !data) {
      await logAdminAccess({
        request, attempted_email: email, path, method: "POST",
        result: "invalid_credentials", success: false, entry_method: null, reason: "not_in_admin_users",
      });
      return NextResponse.json({ ok: false, message: "Invalid admin email or password." });
    }

    if (String(data.password).trim() !== password.trim()) {
      await logAdminAccess({
        request, attempted_email: email, path, method: "POST",
        result: "invalid_credentials", success: false, entry_method: null, reason: "bad_password",
      });
      return NextResponse.json({ ok: false, message: "Invalid admin email or password." });
    }

    if (!process.env.ADMIN_SESSION_SECRET) {
      console.error("❌ ADMIN_SESSION_SECRET is missing from environment variables.");
      await logAdminAccess({
        request, attempted_email: email, path, method: "POST",
        result: "server_misconfig", success: false, entry_method: null, reason: "missing_session_secret",
      });
      return NextResponse.json({ ok: false, message: "Server misconfiguration." }, { status: 500 });
    }

    // Sign a server-verified session token and set it as an httpOnly cookie.
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
      maxAge: 60 * 60 * 12, // 12 hours, matches SESSION_DURATION_MS in lib/adminAuth.js
    });

    // Real, successful admin login via typed credentials.
    await logAdminAccess({
      request, attempted_email: data.email, path, method: "POST",
      result: "success", success: true, entry_method: "credentials", reason: null,
    });

    return response;
  } catch (e) {
    console.error("admin-login error:", e);
    await logAdminAccess({
      request, attempted_email: email, path, method: "POST",
      result: "server_error", success: false, entry_method: null, reason: "exception",
    });
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}