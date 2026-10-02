// app/api/exam/review/route.js
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/examAuth';

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    // getAuthenticatedUser() reads the cet_session_token cookie itself and
    // wraps supabaseAdmin.auth.getUser() with a hard timeout — a slow/hung
    // Supabase Auth response now fails cleanly (504) instead of leaving
    // this route (and the review screen's "Loading your review…" spinner)
    // hanging indefinitely.
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, errorResponseInit } = await getAuthenticatedUser(request, supabaseAdmin);
    if (!user) {
      return NextResponse.json(errorResponseInit.body, { status: errorResponseInit.status });
    }

    // 1. Token must belong to this student AND be completed — the answer
    //    key must never be reachable for an in_progress/paused attempt.
    const { data: sessionData, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('test_id, status')
      .eq('token', token)
      .eq('student_id', user.email)
      .single();

    if (sessionErr || !sessionData) {
      return NextResponse.json({ error: 'Invalid or unauthorized exam token.' }, { status: 403 });
    }
    if (sessionData.status !== 'completed') {
      return NextResponse.json({ error: 'This attempt has not been submitted yet.' }, { status: 403 });
    }

    const mockExamId = sessionData.test_id; // == products.id

    const { data: productRow, error: prodErr } = await supabaseAdmin
      .from('products')
      .select('title, linked_exam_v2_id, is_scheduled, result_declared_at, sections')
      .eq('id', mockExamId)
      .maybeSingle();

    if (prodErr) throw prodErr;

    // Scheduled exam whose result isn't declared yet — no review access,
    // even with a valid, completed, own-attempt token.
    if (productRow?.is_scheduled && (!productRow.result_declared_at || new Date() < new Date(productRow.result_declared_at))) {
      return NextResponse.json({ error: 'Results have not been declared yet for this exam.' }, { status: 403 });
    }

    // Resolve the linked exam_answer_keys_v2 row the same way manifest
    // does — fall back to the product id itself for manually-created
    // attempts that skip the product-link entirely.
    const v2RowId = productRow?.linked_exam_v2_id || mockExamId;

    const { data: keyRow, error: keyErr } = await supabaseAdmin
      .from('exam_answer_keys_v2')
      .select('answer_manifest')
      .eq('id', v2RowId)
      .single();

    if (keyErr || !keyRow) {
      return NextResponse.json({ error: 'Test content not found.' }, { status: 404 });
    }

    const rawManifest = Array.isArray(keyRow.answer_manifest)
      ? keyRow.answer_manifest
      : JSON.parse(keyRow.answer_manifest || '[]');

    // Normalize field names to what review.html / solutions.html expect,
    // and carry question_html/options/solution_html straight through —
    // this is a completed attempt's own review, so there's no live-exam
    // secrecy concern the way there is for /api/exam/question-chunk.
    const manifest = rawManifest.map((q) => ({
      q_id: q.q_id,
      sub_id: q.q_section || 'General',
      test_q_num: q.q_num,
      answer_key: q.answer_key,
      question_html: q.question_html,
      options: q.options,
      solution_html: q.solution_html || null,
    }));

    // Marking scheme (positive/negative marks per section) lives on
    // products.sections, keyed by section id or name — same resolution
    // as /api/exam/manifest. Previously this route hardcoded +1/-0 for
    // every section instead of reading this config, which is why review
    // scores showed raw correct-answer counts instead of the actual
    // weighted score (e.g. "4/20" instead of "8/40" for a +2/section
    // scheme). Index by both id and name so either shape matches.
    const productSectionsRaw = Array.isArray(productRow?.sections)
      ? productRow.sections
      : JSON.parse(productRow?.sections || '[]');
    const marksBySectionId = {};
    productSectionsRaw.forEach((s) => {
      const marks = {
        positiveMarks: typeof s.positiveMarks === 'number' ? s.positiveMarks : 1,
        negativeMarks: typeof s.negativeMarks === 'number' ? s.negativeMarks : 0,
      };
      if (s?.id) marksBySectionId[s.id] = marks;
      if (s?.name) marksBySectionId[s.name] = marks;
    });

    // Build section config dynamically from whatever subjects exist in
    // this manifest — mirrors /api/exam/manifest's logic exactly, so
    // sectionId values line up with what was saved in exam_state.
    const sectionOrder = [];
    const sectionMap = {};
    manifest.forEach((q) => {
      const secName = q.sub_id;
      if (!sectionMap[secName]) {
        const marks = marksBySectionId[secName] || { positiveMarks: 1, negativeMarks: 0 };
        sectionMap[secName] = {
          id: secName,
          name: secName,
          paperAllocation: /math/i.test(secName) ? 2 : 1,
          positiveMarks: marks.positiveMarks,
          negativeMarks: marks.negativeMarks,
          totalQuestions: 0,
        };
        sectionOrder.push(secName);
      }
      sectionMap[secName].totalQuestions += 1;
    });
    const sections = sectionOrder.map((name) => sectionMap[name]);

    // 2. Bonus/voided questions — scored correct for everyone regardless
    //    of what they selected.
    const { data: voidRows } = await supabaseAdmin
      .from('question_voids')
      .select('test_q_num')
      .eq('mock_test_name', mockExamId);

    const voidedQuestions = (voidRows || []).map((r) => r.test_q_num);

    // 3. Full attempt history for this test (for the attempt dropdown).
    const { data: resultsData, error: resultsErr } = await supabaseAdmin
      .from('exam_results')
      .select('*')
      .eq('test_id', mockExamId)
      .eq('student_id', user.email)
      .order('submitted_at', { ascending: false });

    if (resultsErr) console.error('Results history fetch failed:', resultsErr.message);

    return NextResponse.json({
      config: {
        title: productRow?.title || mockExamId,
        sections,
      },
      answerManifest: manifest,
      questionManifest: manifest, // same array — solutions.html reads question_html/options from here
      resultsHistory: resultsData || [],
      voidedQuestions,
    });
  } catch (err) {
    console.error('Review Proxy Exception:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
