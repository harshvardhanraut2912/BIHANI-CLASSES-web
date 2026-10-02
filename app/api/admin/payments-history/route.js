// SAVE THIS FILE AT: app/api/admin/payments-history/route.js  (new file)
//
// GET /api/admin/payments-history?page=1&pageSize=25
//
// Backs the "View all students →" screen under the app's Payments section.
// Same source table + same captured-only rows as the summary route above
// and as the hidden /admin/transactions-secret page, just:
//   - gated by the regular admin cookie (proxy.js), not tx_secret_token
//   - each row resolved to the student's display name from `profiles`
//     (transaction_history only stores student_email, same as the
//     transactions-secret history table shows)
//
// Newest first, same as transactions-secret/history.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));

    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    const { data, error, count } = await supabaseAdmin
      .from("transaction_history")
      .select(
        "id, created_at, student_email, course_name, final_price, payment_status",
        { count: "exact" }
      )
      .eq("payment_status", "captured")
      .order("created_at", { ascending: false })
      .range(start, end);

    if (error) throw error;

    const rows = data || [];

    // Resolve each row's student_email -> profiles.full_name. Only look up
    // the emails actually on this page (cheap, and keeps this route fast
    // even once transaction_history grows large).
    const emails = [...new Set(rows.map((r) => r.student_email).filter(Boolean))];
    let nameByEmail = {};
    if (emails.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .in("email", emails);
      if (profilesError) throw profilesError;

      nameByEmail = Object.fromEntries(
        (profiles || [])
          .filter((p) => p.email)
          .map((p) => [p.email, p.full_name || null])
      );
    }

    const enrichedRows = rows.map((r) => ({
      ...r,
      student_name: (r.student_email && nameByEmail[r.student_email]) || null,
    }));

    return NextResponse.json({
      rows: enrichedRows,
      page,
      pageSize,
      totalRows: count ?? 0,
      totalPages: count ? Math.ceil(count / pageSize) : 1,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
