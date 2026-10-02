import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode, key } = body;

    // Every mode requires the correct security key, checked fresh
    // against the server-only env var on every single request. This
    // is intentional: the "unlocked" state on the client is only a UI
    // convenience, never what actually gates the create step below.
    if (!key || key !== process.env.ADMIN_PASSWORD_KEY) {
      return NextResponse.json({ error: "Invalid security key." }, { status: 403 });
    }

    // --- STAGE 1: just confirm the key is correct ---
    if (mode === "verify") {
      return NextResponse.json({ ok: true });
    }

    // --- STAGE 2: create the new admin row ---
    if (mode === "create") {
      const { email, password, assigned_role } = body;

      if (!email || !password) {
        return NextResponse.json(
          { error: "Email and password are required." },
          { status: 400 }
        );
      }

      // Guard against duplicate admin emails before inserting
      const { data: existing, error: lookupErr } = await supabase
        .from("admin_users")
        .select("email")
        .eq("email", email)
        .maybeSingle();

      if (lookupErr) throw lookupErr;

      if (existing) {
        return NextResponse.json(
          { error: "An admin with this email already exists." },
          { status: 409 }
        );
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("admin_users")
        .insert({
          email,
          password,
          assigned_role: assigned_role || "admin",
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      return NextResponse.json({ admin: inserted });
    }

    return NextResponse.json({ error: "Unknown mode." }, { status: 400 });
  } catch (err) {
    console.error(err);

    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}