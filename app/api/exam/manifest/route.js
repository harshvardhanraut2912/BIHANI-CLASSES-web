// app/api/exam/manifest/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// SECURITY FIX: this route reads a per-user session cookie and must
// NEVER be cached or reused across requests/users at the edge or in
// Next.js's Data Cache -- without this, Vercel/Next.js can serve one
// student's response (or coalesce request context) to a different
// student. See: https://vercel.com/docs/functions/configuring-functions/caching
export const dynamic = 'force-dynamic';


const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Per-session AES key: the client can only derive it by asking this
// authenticated route, and it changes for every token. Not "military
// grade" — just enough that the raw question payload never sits in
// the Network tab as readable JSON.
function deriveSessionKey(token) {
  return crypto
    .createHash('sha256')
    .update(`${process.env.ADMIN_SESSION_SECRET}:${token}`)
    .digest(); // 32 bytes -> AES-256 key
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing exam token.' }, { status: 400 });
    }

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('test_id, status, exam_state')
      .eq('token', token)
      .single();

    if (sessionErr || !session || session.status !== 'in_progress') {
      return NextResponse.json({ error: 'Invalid, expired, or completed exam token.' }, { status: 401 });
    }

    const testId = session.test_id; // == products.id

    // Resolve which exam_question_data_v2 row this product is linked to.
    // Falls back to using testId directly if no product row / link is
    // found — keeps manually-created attempt_sessions (local testing)
    // working without a product in between.
    let v2RowId = testId;
    const { data: productRow } = await supabaseAdmin
      .from('products')
      .select('linked_exam_v2_id, duration_mins, sections')
      .eq('id', testId)
      .maybeSingle();

    if (productRow?.linked_exam_v2_id) {
      v2RowId = productRow.linked_exam_v2_id;
    }

    const { data: qRow, error: qErr } = await supabaseAdmin
      .from('exam_question_data_v2')
      .select('mock_test_name, questions_manifest')
      .eq('id', v2RowId)
      .single();

    if (qErr || !qRow) {
      return NextResponse.json({ error: 'Test content not found.' }, { status: 404 });
    }

    const rawQuestions = Array.isArray(qRow.questions_manifest)
      ? qRow.questions_manifest
      : JSON.parse(qRow.questions_manifest || '[]');

    if (rawQuestions.length === 0) {
      return NextResponse.json({ error: 'This test has no questions.' }, { status: 404 });
    }

    // Marking scheme (positive/negative marks per section) lives on
    // products.sections, keyed by section id -- e.g.
    // [{ id: "math_sec", positiveMarks: 2, negativeMarks: 0, ... }].
    // We only trust its marks fields here; paperAllocation/totalQuestions
    // on that row are stale/manual and are recomputed below from the
    // actual question manifest instead. Falls back to 1/0 only for a
    // section with no matching config row.
    const productSectionsRaw = Array.isArray(productRow?.sections)
      ? productRow.sections
      : JSON.parse(productRow?.sections || '[]');
    const marksBySectionId = {};
    productSectionsRaw.forEach((s) => {
      const marks = {
        positiveMarks: typeof s.positiveMarks === 'number' ? s.positiveMarks : 1,
        negativeMarks: typeof s.negativeMarks === 'number' ? s.negativeMarks : 0,
      };
      // Fix: q.q_section (used as the lookup key below) matches this
      // section's human-readable `name` (e.g. "Mathematics"), not its
      // `id` (e.g. "math_sec") -- indexing by id alone meant this always
      // missed and silently fell back to +1/-0 regardless of the actual
      // configured scheme. Index by both so either shape matches.
      if (s?.id) marksBySectionId[s.id] = marks;
      if (s?.name) marksBySectionId[s.name] = marks;
    });


    // Build sections purely from whatever q_section values exist in
    // this manifest. Each section is classified into one of two
    // groups — 'B' (Maths/Biology) or 'A' (everything else, i.e.
    // Physics/Chemistry) — matching the old MHT-CET split. Which
    // *paper* each group actually ends up on is decided below, based
    // on which groups are genuinely present: a single-subject test
    // (e.g. Maths-only) collapses to one paper instead of leaving a
    // phantom empty Paper 1. sub_id below MUST equal this id exactly,
    // since exam-engine.js filters questions by `q.sub_id === section.id`.
    const sectionOrder = [];
    const sectionMap = {};
    rawQuestions.forEach((q) => {
      const secName = q.q_section || 'General';
      if (!sectionMap[secName]) {
        const marks = marksBySectionId[secName] || { positiveMarks: 1, negativeMarks: 0 };
        sectionMap[secName] = {
          id: secName,
          name: secName,
          group: /math|bio/i.test(secName) ? 'B' : 'A',
          positiveMarks: marks.positiveMarks,
          negativeMarks: marks.negativeMarks,
        };
        sectionOrder.push(secName);
      }
    });
    const sections = sectionOrder.map((name) => sectionMap[name]);

    // Only the groups that actually have questions become papers, in
    // stable A-then-B order, renumbered sequentially from 1 — so a
    // Maths-only manifest (group B only) becomes just "Paper 1",
    // never a Paper 2 with an empty Paper 1 in front of it.
    const groupsPresent = ['A', 'B'].filter((g) => sections.some((s) => s.group === g));
    const groupToPaperId = {};
    groupsPresent.forEach((g, i) => { groupToPaperId[g] = i + 1; });

    // 🟢 FIX: give each section its actual question count so the exam
    // landing screen's "X Questions" / "X.00 Max Marks" stat stops
    // showing NaN (it was reading a `totalQuestions` field that never
    // existed on these section objects). Purely additive -- everything
    // else about the sections/questions shape is unchanged.
    sections.forEach((section) => {
      section.paperAllocation = groupToPaperId[section.group];
      delete section.group;
      section.totalQuestions = rawQuestions.filter(
        (q) => (q.q_section || 'General') === section.name
      ).length;
    });

    const strippedQuestions = rawQuestions.map((q) => ({
      q_id: q.q_id,
      sub_id: q.q_section || 'General',
      test_q_num: q.q_num,
    }));

    // Duration now comes from products.duration_mins (falls back to
    // 180 only if that column is empty/unset). It's split evenly
    // across however many papers actually exist — the full duration
    // goes to the single paper when there's only one, and it's only
    // halved when both groups (and therefore both papers) are present.
    const totalDurationMins = productRow?.duration_mins || 180;
    const phaseDurationMins = Math.floor(totalDurationMins / groupsPresent.length);

    const paperLabel = { A: 'Phy & Chem', B: 'Maths / Bio' };
    const papers = groupsPresent.map((g, i) => ({
      id: i + 1,
      name: groupsPresent.length > 1 ? `Paper ${i + 1}: ${paperLabel[g]}` : `Paper ${i + 1}`,
      durationMinutes: phaseDurationMins,
    }));

    return NextResponse.json({
      testId,
      testTitle: qRow.mock_test_name || testId,
      durationMins: totalDurationMins,
      sections,
      papers,
      questions: strippedQuestions,
      resumeState: session.exam_state || null,
      // base64 AES-256 key, unique to this token, used to decrypt
      // every /api/exam/question-chunk response for this attempt.
      k: deriveSessionKey(token).toString('base64'),
    });
  } catch (err) {
    console.error('Exam Manifest Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
