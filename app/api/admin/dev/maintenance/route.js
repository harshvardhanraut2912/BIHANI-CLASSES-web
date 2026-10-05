// app/api/admin/dev/maintenance/route.js  (new file)
//
// Developer-only maintenance switches. Same maintenance_settings row that
// proxy.js (website) and the mobile app (app_enabled) already read -- but here
// the toggle needs NO extra password: the developer cookie is the proof.
//   GET  -> { enabled, appEnabled, ...who/when }
//   POST -> { enabled?: boolean, appEnabled?: boolean }

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireDev } from "@/lib/devAuth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const forbidden = () => NextResponse.json({ error: "Developer access required." }, { status: 403 });

export async function GET(request) {
  try {
    if (!(await requireDev(request))) return forbidden();
    const { data, error } = await supabaseAdmin
      .from("maintenance_settings")
      .select("enabled, updated_at, updated_by, app_enabled, app_updated_at, app_updated_by")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(
      {
        enabled: data?.enabled === true,
        updatedAt: data?.updated_at || null,
        updatedBy: data?.updated_by || null,
        appEnabled: data?.app_enabled === true,
        appUpdatedAt: data?.app_updated_at || null,
        appUpdatedBy: data?.app_updated_by || null,
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("dev maintenance GET failed:", err);
    return NextResponse.json({ error: err.message || "Failed to load." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const dev = await requireDev(request);
    if (!dev) return forbidden();

    const { enabled, appEnabled } = await request.json().catch(() => ({}));
    if (typeof enabled !== "boolean" && typeof appEnabled !== "boolean") {
      return NextResponse.json({ error: 'Send "enabled" (website) and/or "appEnabled" (app) as true/false.' }, { status: 400 });
    }

    const row = { id: true };
    if (typeof enabled === "boolean") { row.enabled = enabled; row.updated_by = dev.email; }
    if (typeof appEnabled === "boolean") { row.app_enabled = appEnabled; row.app_updated_by = dev.email; }

    const { error } = await supabaseAdmin.from("maintenance_settings").upsert(row);
    if (error) throw error;
    return NextResponse.json({ success: true, enabled, appEnabled });
  } catch (err) {
    console.error("dev maintenance POST failed:", err);
    return NextResponse.json({ error: err.message || "Failed to update." }, { status: 500 });
  }
}
