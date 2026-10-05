// app/api/admin/student-courses/route.js  (new file)
//
// GET -> { courses: [{ id, name }] }  every course (sidebar_main_sections with
// is_course = true). Feeds the "+ Add enrollment" picker on the Students screen.
// Enrollments are stored against course_id, so the picker must list courses.
// Behind the admin session gate in proxy.js (path is under /api/admin/).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("sidebar_main_sections")
      .select("id, name")
      .eq("is_course", true)
      .order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ courses: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    console.error("student-courses GET failed:", err);
    return NextResponse.json({ error: err.message || "Failed to load courses." }, { status: 500 });
  }
}
