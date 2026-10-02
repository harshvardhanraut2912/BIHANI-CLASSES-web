// SAVE THIS FILE AT: app/api/transactions-secret/login/route.js  (new file)
//
// Checks the submitted password against TRANSACTION_PASS server-side only.
// The env value never reaches the browser — this route just returns
// ok:true/false and, on success, sets the signed httpOnly session cookie.

import { NextResponse } from "next/server";
import { signTxToken, TX_COOKIE_NAME } from "@/lib/transactionAuth";

export async function POST(request) {
  try {
    const { password } = await request.json();

    // Read as base64 and decode, rather than reading the password
    // plain-text from the env file. This sidesteps every dotenv quoting/
    // escaping quirk (values getting cut at '#', '$' expansion, etc.) —
    // base64 only ever contains [A-Za-z0-9+/=], which no .env parser can
    // misinterpret, regardless of what the real password contains.
    const rawB64 = process.env.TRANSACTION_PASS_B64;
    let expected;
    try {
      expected = rawB64 ? Buffer.from(rawB64, "base64").toString("utf8") : null;
    } catch {
      expected = null;
    }

    if (!expected) {
      console.error("❌ TRANSACTION_PASS_B64 is missing or invalid in environment variables.");
      return NextResponse.json({ ok: false, message: "Server misconfiguration." }, { status: 500 });
    }

    if (!password || typeof password !== "string" || password.trim() !== expected.trim()) {
      // Deliberately generic message — don't hint whether it's close/wrong length/etc.
      return NextResponse.json({ ok: false, message: "Incorrect password." }, { status: 401 });
    }

    const token = await signTxToken(expected);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(TX_COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 12, // 12 hours, matches token expiry
    });

    return response;
  } catch (e) {
    console.error("transactions-secret login error:", e);
    return NextResponse.json({ ok: false, message: "Server error." }, { status: 500 });
  }
}
