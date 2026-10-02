// SAVE THIS FILE AT: app/api/transactions-secret/client-admin/route.js  (new file)
//
// GET  -> list all client_admin_transactions (newest first)
// POST -> insert a new one { transaction_date, amount, note }
// PUT  -> edit an existing one { id, transaction_date, amount, note }
//
// This table has NO RLS policies (per the SQL you ran), so only this
// server route — using the service-role key — can touch it. Gated by the
// same tx session cookie as every other transactions-secret route.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isTxSessionValid } from "@/lib/transactionAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function validAmount(amount) {
  return typeof amount === "number" && isFinite(amount) && amount >= 0;
}

function validDate(d) {
  return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

export async function GET(request) {
  const authorized = await isTxSessionValid(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("client_admin_transactions")
      .select("id, created_at, transaction_date, amount, note, updated_at")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const total = (data || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

    return NextResponse.json({ ok: true, rows: data || [], total });
  } catch (e) {
    console.error("client-admin GET error:", e);
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}

export async function POST(request) {
  const authorized = await isTxSessionValid(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const amount = Number(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : null;
    // transaction_date is optional on insert — table default is CURRENT_DATE,
    // i.e. "insertion date" as you asked. Pass one explicitly to backdate.
    const transaction_date = body.transaction_date;

    if (!validAmount(amount)) {
      return NextResponse.json({ ok: false, message: "Amount must be a positive number." }, { status: 400 });
    }
    if (transaction_date !== undefined && transaction_date !== null && !validDate(transaction_date)) {
      return NextResponse.json({ ok: false, message: "Invalid transaction_date." }, { status: 400 });
    }

    const insertRow = { amount, note: note || null };
    if (transaction_date) insertRow.transaction_date = transaction_date;

    const { data, error } = await supabaseAdmin
      .from("client_admin_transactions")
      .insert(insertRow)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    console.error("client-admin POST error:", e);
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}

export async function PUT(request) {
  const authorized = await isTxSessionValid(request);
  if (!authorized) {
    return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id } = body;
    const amount = Number(body.amount);
    const note = typeof body.note === "string" ? body.note.trim() : null;
    const transaction_date = body.transaction_date;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ ok: false, message: "Missing id." }, { status: 400 });
    }
    if (!validAmount(amount)) {
      return NextResponse.json({ ok: false, message: "Amount must be a positive number." }, { status: 400 });
    }
    if (!validDate(transaction_date)) {
      return NextResponse.json({ ok: false, message: "Invalid transaction_date." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("client_admin_transactions")
      .update({ amount, note: note || null, transaction_date })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, row: data });
  } catch (e) {
    console.error("client-admin PUT error:", e);
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}
