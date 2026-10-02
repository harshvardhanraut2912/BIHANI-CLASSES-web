import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Reads from app_installs — one row per physical device that has ever
// launched the app (see lib/installTracking.ts on the app side + the
// 001_app_installs.sql migration). Row count = real installs, not raw
// APK downloads, and it does not grow when an existing install just
// updates the app.
export async function GET() {
  try {
    const { count: total, error: totalErr } = await supabaseAdmin
      .from("app_installs")
      .select("*", { count: "exact", head: true });
    if (totalErr) throw totalErr;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: activeLast7d, error: activeErr } = await supabaseAdmin
      .from("app_installs")
      .select("*", { count: "exact", head: true })
      .gte("last_seen", sevenDaysAgo);
    if (activeErr) throw activeErr;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newLast30d, error: newErr } = await supabaseAdmin
      .from("app_installs")
      .select("*", { count: "exact", head: true })
      .gte("first_seen", thirtyDaysAgo);
    if (newErr) throw newErr;

    return NextResponse.json({
      total_installs: total ?? 0,
      active_last_7_days: activeLast7d ?? 0,
      new_last_30_days: newLast30d ?? 0,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
