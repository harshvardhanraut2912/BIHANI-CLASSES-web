import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export async function GET() {
  try {
    const { data: reports, error: reportError } = await supabaseAdmin
      .from("error_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (reportError) throw reportError;
    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { id, status } = await request.json();
    const { data, error } = await supabaseAdmin
      .from("error_reports")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, report: data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Resolves the live question_html/options for a reported question, straight
// from exam_question_data_v2 — replaces the old GitHub PAT image proxy
// entirely. Looked up the same way manifest/review do: product ->
// linked_exam_v2_id -> exam_question_data_v2 row -> find by q_id.
export async function POST(request) {
  try {
    const { test_id, q_id } = await request.json();
    if (!test_id || !q_id) {
      return NextResponse.json({ error: "Missing test_id or q_id" }, { status: 400 });
    }

    const { data: productRow } = await supabaseAdmin
      .from("products")
      .select("linked_exam_v2_id")
      .eq("id", test_id)
      .maybeSingle();

    const v2RowId = productRow?.linked_exam_v2_id || test_id;

    const { data: qRow, error: qErr } = await supabaseAdmin
      .from("exam_question_data_v2")
      .select("questions_manifest")
      .eq("id", v2RowId)
      .single();

    if (qErr || !qRow) {
      return NextResponse.json({ error: "Question set not found for this test." }, { status: 404 });
    }

    const manifest = Array.isArray(qRow.questions_manifest)
      ? qRow.questions_manifest
      : JSON.parse(qRow.questions_manifest || "[]");

    const entry = manifest.find((q) => q.q_id === q_id);
    if (!entry) {
      return NextResponse.json({ error: "Question not found in this test's question set." }, { status: 404 });
    }

    return NextResponse.json({
      question_html: entry.question_html,
      options: entry.options,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}