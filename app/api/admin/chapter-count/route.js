import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side client using the service role key — bypasses RLS/grant issues
// the same way /api/admin/exam-summary and /api/admin/subject-bundle already do.
// NEVER import this client into any "use client" component.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const chapterId = searchParams.get("chapter_id");
  const questionType = searchParams.get("question_type");

  if (!chapterId || !questionType) {
    return NextResponse.json(
      { error: "chapter_id and question_type are required." },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("question_bundles_v2")
      .select("questions")
      .eq("chapter_id", chapterId)
      .eq("question_type", questionType)
      .maybeSingle();

    if (error) throw error;

    const count = Array.isArray(data?.questions) ? data.questions.length : 0;
    return NextResponse.json({ count });
  } catch (err) {
    console.error("chapter-count fetch failed:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch count." }, { status: 500 });
  }
}