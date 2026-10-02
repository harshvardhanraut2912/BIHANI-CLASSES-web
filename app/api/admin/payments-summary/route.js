// SAVE THIS FILE AT: app/api/admin/payments-summary/route.js  (new file)
//
// Powers the "Payments" section on the admin app's Home screen — just the
// one headline number (total capital received from students so far) plus
// a row count. Deliberately unfiltered, same spirit as Box 1 on the
// /admin/transactions-secret page (app/api/transactions-secret/summary),
// but gated by the normal cet_admin_token admin cookie (via proxy.js)
// instead of the separate tx_secret_token — the app already carries the
// regular admin cookie on every /api/admin/* call, so this avoids making
// the app do a second, separate "transactions" login just to show one
// total on the home screen.
//
// Reads transaction_history — the same table the hidden transactions page
// reads, and the same table a new row lands in every time a payment comes
// through (see app/api/payment/verify/route.js).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    // Supabase's JS client has no server-side SUM() without an RPC, so we
    // page through the (light) final_price column and reduce in JS — same
    // approach the transactions-secret summary route already uses.
    let totalReceived = 0;
    let totalTransactions = 0;
    {
      let from = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("transaction_history")
          .select("final_price")
          .eq("payment_status", "captured")
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        for (const row of data) totalReceived += Number(row.final_price) || 0;
        totalTransactions += data.length;
        if (data.length < pageSize) break;
        from += pageSize;
      }
    }

    return NextResponse.json({
      total_received: totalReceived,
      total_transactions: totalTransactions,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
