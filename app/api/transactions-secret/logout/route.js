// SAVE THIS FILE AT: app/api/transactions-secret/logout/route.js  (new file)

import { NextResponse } from "next/server";
import { TX_COOKIE_NAME } from "@/lib/transactionAuth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(TX_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
