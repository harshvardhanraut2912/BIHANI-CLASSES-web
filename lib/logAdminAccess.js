// SAVE THIS FILE AT: C:\dev\app\lib\logAdminAccess.js  (new file)
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Fire-and-forget logger for admin_access_logs.
// Never throws — a logging failure should never break the actual
// login/check/logout flow.
//
// entry_method: 'credentials' | 'session_cookie' | 'invalid_cookie' | null
// success: boolean — did this request actually result in access being granted
// reason: short machine-readable detail, e.g. 'bad_password', 'not_in_admin_users'
export async function logAdminAccess({
  request,
  attempted_email,
  path,
  method,
  result,
  success = false,
  entry_method = null,
  reason = null,
}) {
  try {
    const ip_address =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;
    const user_agent = request.headers.get("user-agent") || null;

    const { error } = await supabaseAdmin.from("admin_access_logs").insert({
      attempted_email: attempted_email || null,
      path,
      method,
      result,
      success,
      entry_method,
      reason,
      ip_address,
      user_agent,
    });

    if (error) {
      console.error("admin_access_logs insert failed:", error);
    }
  } catch (e) {
    console.error("logAdminAccess error:", e);
  }
}