// SAVE THIS FILE AT: app/api/transactions-secret/summary/route.js  (new file)
//
// Returns the 4 top-box numbers. Always UNFILTERED (ignores any date
// filter the user has set on the page) — per spec, box 1/3/4 are totals
// "without any filter". The filtered row list itself is a separate route
// (Part 3).
//
// GET only. Gated by the tx_secret_token cookie — anyone without a valid
// session gets 401, same as every other route under transactions-secret
// except /login.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isTxSessionValid } from "@/lib/transactionAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Client's cut, as a fraction of total transaction_history revenue.
// Box 3 ("how much I need to earn") = TOTAL_RECEIVED * CLIENT_SHARE.
const CLIENT_SHARE = 0.3;

export async function GET(request) {
  const authorized = await isTxSessionValid(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    // Box 1: total received to date, ALL captured transactions, no filter.
    // Supabase doesn't do server-side SUM() through the JS client without
    // an RPC, so we page through final_price only (light column) and
    // reduce in JS. Fine at this data volume; revisit with an RPC/view if
    // transaction_history grows into the tens of thousands of rows.
    let totalReceived = 0;
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
        if (data.length < pageSize) break;
        from += pageSize;
      }
    }

    // Box 4: total of client_admin_transactions (what the client has paid you).
    let clientAdminTotal = 0;
    {
      let from = 0;
      const pageSize = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabaseAdmin
          .from("client_admin_transactions")
          .select("amount")
          .range(from, from + pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        for (const row of data) clientAdminTotal += Number(row.amount) || 0;
        if (data.length < pageSize) break;
        from += pageSize;
      }
    }

    const owedToYou = totalReceived * CLIENT_SHARE; // Box 3

    return NextResponse.json({
      ok: true,
      totalReceived,        // Box 1
      owedToYou,             // Box 3 (30% of Box 1)
      clientAdminTotal,      // Box 4 (also the total on the client-admin page)
      clientSharePct: CLIENT_SHARE * 100,
    });
  } catch (e) {
    console.error("transactions-secret summary error:", e);
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}
