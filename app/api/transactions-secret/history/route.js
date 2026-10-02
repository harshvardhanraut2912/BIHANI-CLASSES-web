// SAVE THIS FILE AT: app/api/transactions-secret/history/route.js  (new file)
//
// GET /api/transactions-secret/history?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&pageSize=25
// `from`/`to` are optional (omit either/both to mean "no lower/upper bound").
// This is the ONLY route that respects the date filter — the summary boxes
// (Part 2) stay unfiltered on purpose, per spec.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isTxSessionValid } from "@/lib/transactionAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  const authorized = await isTxSessionValid(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10)));

    if (from && !DATE_RE.test(from)) {
      return NextResponse.json({ ok: false, message: "Invalid 'from' date." }, { status: 400 });
    }
    if (to && !DATE_RE.test(to)) {
      return NextResponse.json({ ok: false, message: "Invalid 'to' date." }, { status: 400 });
    }

    let query = supabaseAdmin
      .from("transaction_history")
      .select(
        "id, created_at, student_email, course_name, final_price, original_price, discount_amount, coupon_code, payment_status, currency",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
    if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    query = query.range(start, end);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      rows: data || [],
      page,
      pageSize,
      totalRows: count ?? 0,
      totalPages: count ? Math.ceil(count / pageSize) : 1,
    });
  } catch (e) {
    console.error("transactions-secret history error:", e);
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}
