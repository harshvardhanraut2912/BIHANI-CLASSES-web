// app/api/admin/dev/access/route.js  (new file)
//
// Developer-only (needs the developer cookie from /api/admin/dev/unlock).
//   GET  -> every admin account + which subjects are ON / OFF for each.
//   POST -> { email, subject, allowed } switch ONE subject for ONE admin.
// admin_users.password is never selected, so it can't leak to the browser.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireDev } from "@/lib/devAuth";
import { ALL_SUBJECTS, canonicalSubject } from "@/lib/subjectAccess";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const forbidden = () => NextResponse.json({ error: "Developer access required." }, { status: 403 });
const tableMissing = (e) =>
  e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));

export async function GET(request) {
  try {
    const dev = await requireDev(request);
    if (!dev) return forbidden();

    const { data: admins, error } = await supabaseAdmin
      .from("admin_users")
      .select("email, assigned_role")
      .order("email", { ascending: true });
    if (error) throw error;

    const { data: rows, error: accErr } = await supabaseAdmin
      .from("admin_subject_access")
      .select("admin_email, subject, allowed");
    let setupNeeded = false;
    if (accErr) {
      if (tableMissing(accErr)) setupNeeded = true;
      else throw accErr;
    }

    const off = {}; // email -> Set(subject)
    (rows || []).forEach((r) => {
      if (r.allowed === false) (off[String(r.admin_email).toLowerCase()] ||= new Set()).add(canonicalSubject(r.subject));
    });

    return NextResponse.json(
      {
        subjects: ALL_SUBJECTS,
        setupNeeded,
        me: dev.email,
        admins: (admins || []).map((a) => {
          const email = String(a.email || "").toLowerCase().trim();
          return {
            email,
            role: a.assigned_role || "admin",
            access: Object.fromEntries(ALL_SUBJECTS.map((s) => [s, !off[email]?.has(s)])),
          };
        }),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("dev access GET failed:", err);
    return NextResponse.json({ error: err.message || "Failed to load." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const dev = await requireDev(request);
    if (!dev) return forbidden();

    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").toLowerCase().trim();
    const subject = canonicalSubject(body.subject);
    if (!email || !ALL_SUBJECTS.includes(subject) || typeof body.allowed !== "boolean") {
      return NextResponse.json({ error: "email, subject and allowed (true/false) are required." }, { status: 400 });
    }

    const { data: exists, error: exErr } = await supabaseAdmin
      .from("admin_users").select("email").ilike("email", email).maybeSingle();
    if (exErr) throw exErr;
    if (!exists) return NextResponse.json({ error: "That admin does not exist." }, { status: 404 });

    const { error } = await supabaseAdmin.from("admin_subject_access").upsert(
      { admin_email: email, subject, allowed: body.allowed, updated_at: new Date().toISOString(), updated_by: dev.email },
      { onConflict: "admin_email,subject" }
    );
    if (error) {
      if (tableMissing(error)) {
        return NextResponse.json({ error: "Run sql/003_dev_panel_subject_access.sql in Supabase first." }, { status: 500 });
      }
      throw error;
    }
    return NextResponse.json({ success: true, email, subject, allowed: body.allowed });
  } catch (err) {
    console.error("dev access POST failed:", err);
    return NextResponse.json({ error: err.message || "Failed to save." }, { status: 500 });
  }
}
