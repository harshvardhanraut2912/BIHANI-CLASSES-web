// app/api/admin/exam-pdf/route.js  (new file)
//
// Exam sheet generation (Teacher copy / Student copy) for the Exams -> PDF window.
//
//   GET  ?id=<exam id>   -> small summary for the form: name, exam type and the subjects
//                           with their question counts (no question HTML is sent).
//   POST                 -> builds the Word sheet (lib/pdfgen/docx.js -- same structure as the
//                           sample files), converts it to PDF on the server and streams it back.
//                           { id, copy: "teacher"|"student", title, marks, subject,
//                             columns: 1|2, useCurrentDate, date ("yyyy-mm-dd"),
//                             time?, testId?, logo? (data:image/... URL: printed top-left and used
//                             as a faded, blurred watermark), format?: "pdf"(default)|"docx" }
//                           The student copy is questions only (no Answer Key / solutions pages).
//
// PIPELINE:  exam (answer_manifest) -> paper model -> .docx -> .pdf
//   PART 1: header block, watermark, footer, 1/2 columns, question table, Ans./Sol. rows (teacher).
//   PART 2: equations, embedded figures (fetched server-side),
//           Answer Key + Hints & Solutions pages for the student copy.
//   EQUATIONS: for a PDF every MathML equation is drawn to a picture (lib/pdfgen/mathimg.js), because
//   LibreOffice drops Word equations when its Math module is not installed (empty options, missing
//   formulas). For a .docx download they stay real, editable Word equations.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminTokenDetailed, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { denyIfSubjectBlocked } from "@/lib/subjectAccess";
import { SITE } from "@/lib/siteConfig";
import { buildPaper, subjectCounts, formatSheetDate, ALL_SUBJECTS_KEY } from "@/lib/pdfgen/paper";
import { buildDocx } from "@/lib/pdfgen/docx";
import { imageSrcs } from "@/lib/pdfgen/html";
import { loadImages } from "@/lib/pdfgen/images";
import { prepareMath } from "@/lib/pdfgen/mathimg";
import { prepareLogo } from "@/lib/pdfgen/logo";
import { docxToPdf } from "@/lib/pdfgen/convert";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120; // room for a sleeping converter service to wake up

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WATERMARK = process.env.PDF_WATERMARK_TEXT || SITE.short;
const SECTION_TITLE = "Single Correct Answer Type";

async function requireAdmin(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) return false;
  const check = await verifyAdminTokenDetailed(token, secret);
  return !!check.valid;
}

const forbidden = () => NextResponse.json({ error: "Forbidden: Admin authentication required." }, { status: 403 });
const bad = (error, status = 400, extra = {}) => NextResponse.json({ error, ...extra }, { status });
const asArray = (v) => (Array.isArray(v) ? v : typeof v === "string" ? JSON.parse(v || "[]") : []);
const clean = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// One exam: answer_manifest (question + options + answer + solution) and its chapter names.
async function loadExam(id) {
  const { data: row, error } = await supabaseAdmin
    .from("exam_answer_keys_v2")
    .select("id, exam, mock_test_name, answer_manifest")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const questions = asArray(row.answer_manifest);
  const ids = [...new Set(questions.map((q) => q.chapter_id).filter(Boolean))];
  const chapters = {};
  if (ids.length) {
    const { data: rows, error: chErr } = await supabaseAdmin.from("syllabus_chapters_v2").select("id, subject, chapter_name").in("id", ids);
    if (chErr) throw chErr;
    (rows || []).forEach((c) => { chapters[String(c.id)] = { name: c.chapter_name, subject: c.subject }; });
  }
  return { id: row.id, exam: row.exam, name: row.mock_test_name, questions, chapters };
}

const fileSlug = (s) => String(s || "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "exam";

/* ------------------------------------------------------------------ GET */
export async function GET(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return bad("id is required.");
    const exam = await loadExam(id);
    if (!exam) return bad("Exam not found.", 404);
    return NextResponse.json({
      id: exam.id,
      name: exam.name,
      exam: exam.exam,
      total: exam.questions.length,
      subjects: subjectCounts(exam.questions),
    });
  } catch (err) {
    console.error("exam-pdf GET error:", err);
    return bad(err.message || "Failed to load the exam.", 500);
  }
}

/* ----------------------------------------------------------------- POST */
export async function POST(request) {
  try {
    if (!(await requireAdmin(request))) return forbidden();

    const body = await request.json().catch(() => ({}));
    const copy = body.copy === "teacher" || body.copy === "student" ? body.copy : null;
    if (!body.id) return bad("id is required.");
    if (!copy) return bad("Choose Teacher copy or Student copy.");

    const title = clean(body.title, 120);
    if (!title) return bad("Enter a title for the exam sheet.");

    if (body.useCurrentDate === false && !/^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ""))) {
      return bad('Pick the exam date, or choose "Use current date".');
    }

    const exam = await loadExam(String(body.id));
    if (!exam) return bad("Exam not found.", 404);

    const subject = clean(body.subject, 40) || ALL_SUBJECTS_KEY;
    const paper = buildPaper(exam, { subject });
    if (!paper.questions.length) return bad(subject === ALL_SUBJECTS_KEY ? "This exam has no questions." : `This exam has no ${subject} questions.`);

    // Per-admin subject switches (same rule as the other exam APIs).
    const blocked = await denyIfSubjectBlocked(request, paper.subjects);
    if (blocked) return blocked;

    const chapterLine =
      paper.chapterNames.length === 0 ? "" : paper.chapterNames.length <= 4 ? paper.chapterNames.map((n) => n.toUpperCase()).join(", ") : "MIXED CHAPTERS";

    // Student copy = questions only (no Answer Key, no Hints and Solutions pages).
    // Only the teacher copy carries the answer and solution under every question.
    const appendKey = false;
    const withSolutions = copy === "teacher";

    // Fetch every picture the sheet uses (question, options and, when printed, solutions).
    const srcs = [];
    paper.questions.forEach((q) => {
      srcs.push(...imageSrcs(q.html));
      Object.values(q.options || {}).forEach((o) => srcs.push(...imageSrcs(o)));
      if (withSolutions) srcs.push(...imageSrcs(q.solutionHtml));
    });
    const wantDocx = body.format === "docx";
    const mathMode = wantDocx || process.env.PDF_MATH_MODE === "omml" ? "omml" : "image";
    const [images, logo] = await Promise.all([
      loadImages(srcs),
      body.logo ? prepareLogo(body.logo) : null, // top-left logo + faded blurred watermark (null = no logo)
      mathMode === "image" ? prepareMath() : null,
    ]);

    const docx = await buildDocx({
      mathMode,
      appendKey,
      images,
      logo,
      copy,
      columns: Number(body.columns) === 1 ? 1 : 2,
      title,
      dateText: formatSheetDate(body.useCurrentDate === false ? body.date : ""),
      timeText: clean(body.time, 20),
      testId: clean(body.testId, 20),
      marksText: clean(body.marks, 20) || String(paper.questions.length),
      subjectText: paper.subjectText,
      chapterLine,
      sectionTitle: SECTION_TITLE,
      watermark: WATERMARK,
      questions: paper.questions,
    });

    let out = docx;
    if (!wantDocx) {
      try {
        out = await docxToPdf(docx);
      } catch (e) {
        console.error("exam-pdf conversion error:", e);
        const missing = e.code === "CONVERTER_MISSING";
        return bad(e.message || "PDF conversion failed.", missing ? 501 : 502, { code: e.code || "CONVERTER_FAILED" });
      }
    }

    const ext = wantDocx ? "docx" : "pdf";
    const filename = `${fileSlug(title)}-${copy}-copy.${ext}`;
    return new Response(out, {
      status: 200,
      headers: {
        "Content-Type": wantDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Filename": filename,
        "X-Logo-Used": logo ? "1" : "0",
        "X-Math-Fallbacks": String(docx.mathFallbacks || 0), // equations printed as text (0 = all drawn)
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("exam-pdf POST error:", err);
    return bad(err.message || "Failed to generate the sheet.", err.status || 500);
  }
}
