// app/api/admin/dashboard-stats/route.js  (new file)
//
// GET /api/admin/dashboard-stats
// Count-only numbers for the admin homepage. Gated by proxy.js (everything
// under /api/admin/ needs a valid admin cookie). Every count is fetched
// independently, so one missing table/column returns null for that card
// instead of breaking the whole dashboard.
//
// NOTE: revenue / payment amounts are deliberately NOT included here --
// those live behind the separate transactions password.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const head = { count: "exact", head: true };

async function count(build) {
  try {
    const { count: c, error } = await build();
    if (error) return null;
    return c ?? 0;
  } catch {
    return null;
  }
}

export async function GET() {
  const [students, enrollments, products, inquiriesTotal, inquiriesRead, reportsTotal, reportsResolved] =
    await Promise.all([
      count(() => supabaseAdmin.from("profiles").select("id", head)),
      count(() => supabaseAdmin.from("user_enrollments").select("*", head)),
      count(() => supabaseAdmin.from("products").select("*", head)),
      count(() => supabaseAdmin.from("contact_inquiries").select("*", head)),
      count(() => supabaseAdmin.from("contact_inquiries").select("*", head).ilike("status", "read")),
      count(() => supabaseAdmin.from("error_reports").select("*", head)),
      count(() => supabaseAdmin.from("error_reports").select("*", head).ilike("status", "resolved")),
    ]);

  const diff = (total, done) =>
    total === null || done === null ? null : Math.max(0, total - done);

  return NextResponse.json(
    {
      students,
      enrollments,
      products,
      unreadInquiries: diff(inquiriesTotal, inquiriesRead),
      pendingReports: diff(reportsTotal, reportsResolved),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
