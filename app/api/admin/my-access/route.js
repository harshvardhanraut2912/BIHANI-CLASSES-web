// app/api/admin/my-access/route.js  (new file)
//
// GET -> { denied: ["Physics", ...] }  subjects the signed-in admin may NOT use.
// The Create Exam screen reads this to show "You don't have access to this".
// (The real enforcement is server-side in the exam APIs, not this response.)

import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/devAuth";
import { getDeniedSubjects } from "@/lib/subjectAccess";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const denied = await getDeniedSubjects(admin.email);
    return NextResponse.json({ denied }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("my-access failed:", err);
    return NextResponse.json({ error: "Could not load your access." }, { status: 500 });
  }
}
