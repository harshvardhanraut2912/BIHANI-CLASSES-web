// app/api/admin/exam-reports/route.js  (new file)
//
// Student error reports, grouped by EXAM (for Admin -> Exams -> "Error reports").
// error_reports.test_id is a product id; products.linked_exam_v2_id points at the exam,
// so every product linked to an exam contributes its reports to that exam
// (a report whose test_id is the exam id itself is counted too).
//
//   GET                         -> { counts: { <examId>: { total, pending } } }
//   GET ?exam=<id>              -> { exam, reports, bonus: [test_q_num...] }
//   GET ?exam=<id>&q_id=<q>     -> the question as saved in the exam (html, options, answer, solution)
//   PATCH  { ids, status }      -> set the status of reports ("Resolved" / "Pending Review")
//   POST   { action:"bonus", exam, test_q_num, reason } -> mark that question number as a bonus
//                                  (question_voids) on every product linked to the exam
//   DELETE { exam, test_q_num } -> remove the bonus again

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminTokenDetailed, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function requireAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const check = await verifyAdminTokenDetailed(token, secret);
  return !!check.valid;
}

const forbidden = () => NextResponse.json({ error: "Forbidden: Admin authentication required." }, { status: 403 });
const asArray = (v) => (Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v || "[]") : []);
const isResolved = (s) => String(s || "").toLowerCase() === "resolved";

// product ids that run this exam (or the exam id itself when no product exists)
async function targetsFor(examId) {
  const { data, error } = await supabaseAdmin.from("products").select("id, title").eq("linked_exam_v2_id", examId);
  if (error) throw error;
  const products = data || [];
  return { ids: products.length ? products.map((p) => p.id) : [examId], products };
}

export async function GET(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();
    const url = new URL(request.url);
    const examId = url.searchParams.get("exam");
    const qId = url.searchParams.get("q_id");

    /* ---- counts for the exams list ---- */
    if (!examId) {
      const [{ data: prods, error: pErr }, { data: reps, error: rErr }] = await Promise.all([
        supabaseAdmin.from("products").select("id, linked_exam_v2_id").not("linked_exam_v2_id", "is", null),
        supabaseAdmin.from("error_reports").select("test_id, status"),
      ]);
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const examOf = {};
      (prods || []).forEach((p) => { examOf[p.id] = p.linked_exam_v2_id; });
      const counts = {};
      (reps || []).forEach((r) => {
        const ex = examOf[r.test_id] || r.test_id; // fallback: test_id is the exam id
        const c = (counts[ex] = counts[ex] || { total: 0, pending: 0 });
        c.total += 1;
        if (!isResolved(r.status)) c.pending += 1;
      });
      return NextResponse.json({ counts });
    }

    /* ---- one question of the exam (for the inspect window) ---- */
    if (qId) {
      const { data: row, error } = await supabaseAdmin
        .from("exam_answer_keys_v2")
        .select("answer_manifest")
        .eq("id", examId)
        .maybeSingle();
      if (error) throw error;
      const q = row ? asArray(row.answer_manifest).find((x) => x.q_id === qId) : null;
      if (!q) return NextResponse.json({ error: "This question is no longer in the exam (it may have been replaced)." }, { status: 404 });
      return NextResponse.json({
        q_id: q.q_id,
        test_q_num: q.test_q_num ?? q.q_num ?? null,
        question_html: q.question_html || "",
        options: q.options || {},
        answer_key: q.answer_key ?? q.correct_option ?? q.correct_answer ?? q.answer ?? "",
        solution_html: q.solution_html || "",
      });
    }

    /* ---- all reports of one exam ---- */
    const { ids, products } = await targetsFor(examId);
    const [{ data: reports, error: rErr }, { data: voids, error: vErr }, { data: exRow }] = await Promise.all([
      supabaseAdmin.from("error_reports").select("*").in("test_id", ids).order("created_at", { ascending: false }),
      supabaseAdmin.from("question_voids").select("test_q_num").in("mock_test_name", ids),
      supabaseAdmin.from("exam_question_data_v2").select("id, mock_test_name, exam").eq("id", examId).maybeSingle(),
    ]);
    if (rErr) throw rErr;
    if (vErr) throw vErr;
    return NextResponse.json({
      exam: { id: examId, name: exRow?.mock_test_name || examId, type: exRow?.exam || "" },
      products: products.map((p) => ({ id: p.id, title: p.title })),
      reports: reports || [],
      bonus: [...new Set((voids || []).map((v) => v.test_q_num))],
    });
  } catch (err) {
    console.error("exam-reports GET error:", err);
    return NextResponse.json({ error: err.message || "Failed to load reports." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();
    const { ids, status } = await request.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ error: "No reports given." }, { status: 400 });
    const next = isResolved(status) ? "Resolved" : "Pending Review";
    const { error } = await supabaseAdmin.from("error_reports").update({ status: next }).in("id", ids);
    if (error) throw error;
    return NextResponse.json({ success: true, status: next, updated: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to update." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();
    const { action, exam, test_q_num, reason } = await request.json();
    if (action !== "bonus" || !exam || !test_q_num) return NextResponse.json({ error: "exam and test_q_num are required." }, { status: 400 });
    const { ids } = await targetsFor(exam);
    const rows = ids.map((id) => ({ mock_test_name: id, test_q_num, reason: reason || null }));
    const { error } = await supabaseAdmin.from("question_voids").upsert(rows, { onConflict: "mock_test_name,test_q_num" });
    if (error) throw new Error(`Failed to mark the question as bonus: ${error.message}`);
    return NextResponse.json({ success: true, products: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to mark as bonus." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();
    const { exam, test_q_num } = await request.json();
    if (!exam || !test_q_num) return NextResponse.json({ error: "exam and test_q_num are required." }, { status: 400 });
    const { ids } = await targetsFor(exam);
    const { error } = await supabaseAdmin.from("question_voids").delete().in("mock_test_name", ids).eq("test_q_num", test_q_num);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to remove the bonus." }, { status: 500 });
  }
}
