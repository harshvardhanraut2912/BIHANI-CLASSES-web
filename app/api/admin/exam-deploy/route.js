// app/api/admin/exam-deploy/route.js  (new file)
//
// Helper for the "Online exam" column on Admin -> Exams.
//
//   GET                -> { linked: { <examId>: [ {id,title,is_paid,price,is_scheduled,
//                          scheduled_start_at,scheduled_end_at,path} ] } }
//                         every exam that already has a product (product_type = exam,
//                         linked_exam_v2_id = exam id). `path` = "Course > Subsection > Chapter".
//   GET ?exam=<id>     -> { id, name, exam, total, subjects: [{ name, count }] }
//                         question counts per subject, read from the saved question manifest
//                         (used to pre-fill the marking scheme + duration in the wizard).
//
// The product itself is created with the existing POST /api/admin/products route, so a
// deployed exam is exactly the same kind of product the Courses page creates.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminTokenDetailed, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const check = await verifyAdminTokenDetailed(token, secret);
  return !!check.valid;
}

const asArray = (v) => (Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v || "[]") : []);

async function linkedMap() {
  const { data: prods, error } = await supabaseAdmin
    .from("products")
    .select("id, title, is_paid, price, chapter_id, linked_exam_v2_id, is_scheduled, scheduled_start_at, scheduled_end_at")
    .eq("product_type", "exam")
    .not("linked_exam_v2_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const list = prods || [];

  // chapter -> subsection -> course names, so the admin can see where each one is listed
  const chapterIds = [...new Set(list.map((p) => p.chapter_id).filter(Boolean))];
  const chapters = {};
  const subs = {};
  const courses = {};
  if (chapterIds.length) {
    const { data: chRows } = await supabaseAdmin.from("sidebar_chapters").select("id, name, subsection_id").in("id", chapterIds);
    (chRows || []).forEach((c) => { chapters[c.id] = c; });
    const subIds = [...new Set((chRows || []).map((c) => c.subsection_id).filter(Boolean))];
    if (subIds.length) {
      const { data: sRows } = await supabaseAdmin.from("sidebar_subsections").select("id, name, main_section_id").in("id", subIds);
      (sRows || []).forEach((r) => { subs[r.id] = r; });
      const mainIds = [...new Set((sRows || []).map((r) => r.main_section_id).filter(Boolean))];
      if (mainIds.length) {
        const { data: mRows } = await supabaseAdmin.from("sidebar_main_sections").select("id, name").in("id", mainIds);
        (mRows || []).forEach((r) => { courses[r.id] = r; });
      }
    }
  }

  const linked = {};
  list.forEach((p) => {
    const ch = chapters[p.chapter_id];
    const sub = ch && subs[ch.subsection_id];
    const course = sub && courses[sub.main_section_id];
    const path = [course?.name, sub?.name, ch?.name].filter(Boolean).join(" \u203A ");
    (linked[p.linked_exam_v2_id] = linked[p.linked_exam_v2_id] || []).push({
      id: p.id,
      title: p.title,
      is_paid: !!p.is_paid,
      price: p.price,
      is_scheduled: !!p.is_scheduled,
      scheduled_start_at: p.scheduled_start_at,
      scheduled_end_at: p.scheduled_end_at,
      path,
    });
  });
  return linked;
}

async function examInfo(id) {
  const { data: row, error } = await supabaseAdmin
    .from("exam_question_data_v2")
    .select("id, exam, mock_test_name, questions_manifest")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;
  const qs = asArray(row.questions_manifest);
  const counts = new Map();
  qs.forEach((q) => {
    const name = q.q_section || "General";
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return {
    id: row.id,
    name: row.mock_test_name || row.id,
    exam: row.exam || "",
    total: qs.length,
    subjects: [...counts.entries()].map(([name, count]) => ({ name, count })),
  };
}

export async function GET(request) {
  try {
    if (!(await requireAdmin(request))) {
      return NextResponse.json({ error: "Forbidden: Admin authentication required." }, { status: 403 });
    }
    const examId = new URL(request.url).searchParams.get("exam");
    if (!examId) return NextResponse.json({ linked: await linkedMap() });
    const info = await examInfo(examId);
    if (!info) return NextResponse.json({ error: "Exam not found." }, { status: 404 });
    return NextResponse.json(info);
  } catch (err) {
    console.error("exam-deploy GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load." }, { status: 500 });
  }
}
