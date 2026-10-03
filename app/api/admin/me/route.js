// app/api/admin/me/route.js  (new file)
//
// GET /api/admin/me -> { email, role } of the signed-in admin.
// The admin cookie is httpOnly, so the browser can't read it; this lets the
// navbar show who is logged in. Gated by proxy.js as well, and re-verifies
// the cookie here (defense in depth).

import { NextResponse } from "next/server";
import { verifyAdminToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const payload = secret ? await verifyAdminToken(token, secret) : null;

  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { email: payload.email || null, role: payload.role || null },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
