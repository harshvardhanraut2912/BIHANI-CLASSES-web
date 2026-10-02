// app/api/exam/leaderboard/route.js
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

// Same scoring logic as review.html's computeAttemptScoring — kept in sync
// manually since one runs server-side (all students) and one client-side
// (just the viewing student). If you change the marking rules in one place,
// change them here too.
function scorePercentage(rawMatrix, sections, answerManifest) {
  const sectionMap = {};
  (sections || []).forEach(sec => {
    sectionMap[sec.id] = {
      positiveMarks: parseFloat(sec.positiveMarks) || 0,
      negativeMarks: parseFloat(sec.negativeMarks) || 0,
      maxMarks: (parseFloat(sec.positiveMarks) || 0) * (parseInt(sec.totalQuestions) || 0),
      score: 0
    };
  });

  function resolveCorrectIndex(rawKeyVal) {
    if (rawKeyVal === null || rawKeyVal === undefined) return null;
    const val = String(rawKeyVal).trim().toUpperCase();
    if (val === 'A' || val === '1') return 0;
    if (val === 'B' || val === '2') return 1;
    if (val === 'C' || val === '3') return 2;
    if (val === 'D' || val === '4') return 3;
    const n = parseInt(val);
    return isNaN(n) ? null : n;
  }

  function findKeyEntry(q) {
    if (q.q_id) {
      const byId = answerManifest.find(k => k.q_id === q.q_id);
      if (byId) return byId;
    }
    return answerManifest.find(k => k.sub_id === q.sub_id && k.test_q_num === q.test_q_num);
  }

  (rawMatrix || []).forEach(q => {
    const bucket = sectionMap[q.sectionId];
    if (!bucket) return;
    const keyEntry = findKeyEntry(q);
    const correctIdx = keyEntry ? resolveCorrectIndex(keyEntry.answer_key) : null;
    const userPick = (q.selectedOption === null || q.selectedOption === undefined) ? null : parseInt(q.selectedOption);

    if (userPick === null || isNaN(userPick)) return; // unanswered — 0
    if (correctIdx !== null && userPick === correctIdx) {
      bucket.score += bucket.positiveMarks;
    } else {
      bucket.score -= bucket.negativeMarks;
    }
  });

  let totalScore = 0, totalMax = 0;
  Object.values(sectionMap).forEach(s => { totalScore += s.score; totalMax += s.maxMarks; });

  return totalMax > 0 ? (totalScore / totalMax * 100) : 0;
}

// Mirrors /api/exam/manifest and /api/exam/review — builds section config
// dynamically from whichever q_section subjects exist in the v2 answer
// manifest, instead of relying on (now-unused) products.sections.
function buildSectionsFromManifest(answerManifest) {
  const order = [];
  const map = {};
  answerManifest.forEach((q) => {
    const secName = q.q_section || 'General';
    if (!map[secName]) {
      map[secName] = {
        id: secName,
        name: secName,
        positiveMarks: 1,
        negativeMarks: 0,
        totalQuestions: 0,
      };
      order.push(secName);
    }
    map[secName].totalQuestions += 1;
  });
  return order.map((name) => map[name]);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const sessionToken = request.cookies.get('cet_session_token')?.value;

    if (!token || !sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // getAuthenticatedUser() wraps supabaseAdmin.auth.getUser() with a
    // hard timeout — a slow/hung Supabase Auth response now fails
    // cleanly (504) instead of hanging indefinitely. review.tsx calls
    // this route and /api/exam/review in parallel, so this one was
    // doubling up on the exact same unguarded call.
    const { user, errorResponseInit } = await getAuthenticatedUser(request, supabaseAdmin);
    if (!user) {
      return NextResponse.json(errorResponseInit.body, { status: errorResponseInit.status });
    }

    // Verify this token belongs to the requesting student and is completed —
    // same gate as the review route, so leaderboard can't be probed with an
    // arbitrary token to see another test's rankings.
    const { data: sessionData, error: sessionErr } = await supabaseAdmin
      .from('attempt_sessions')
      .select('test_id, status')
      .eq('token', token)
      .eq('student_id', user.email)
      .single();

    if (sessionErr || !sessionData || sessionData.status !== 'completed') {
      return NextResponse.json({ error: 'Invalid or unauthorized exam token.' }, { status: 403 });
    }

    const testId = sessionData.test_id; // == products.id

    const { data: productRow } = await supabaseAdmin
      .from('products')
      .select('linked_exam_v2_id, is_scheduled, scheduled_start_at, scheduled_end_at, result_declared_at')
      .eq('id', testId)
      .maybeSingle();

    // Scheduled exam whose result isn't declared yet — leaderboard stays hidden.
    if (productRow?.is_scheduled && (!productRow.result_declared_at || new Date() < new Date(productRow.result_declared_at))) {
      return NextResponse.json({ error: 'Results have not been declared yet for this exam.' }, { status: 403 });
    }

    const v2RowId = productRow?.linked_exam_v2_id || testId;

    const { data: keyRow } = await supabaseAdmin
      .from('exam_answer_keys_v2')
      .select('answer_manifest')
      .eq('id', v2RowId)
      .single();

    const rawAnswerManifest = keyRow
      ? (typeof keyRow.answer_manifest === 'string' ? JSON.parse(keyRow.answer_manifest) : keyRow.answer_manifest)
      : [];

    // Normalize to sub_id/test_q_num, same as /api/exam/review, so
    // scorePercentage's findKeyEntry matches what's stored in raw_response_matrix.
    const answerManifest = rawAnswerManifest.map((q) => ({
      q_id: q.q_id,
      sub_id: q.q_section || 'General',
      test_q_num: q.q_num,
      answer_key: q.answer_key,
    }));

    const sections = buildSectionsFromManifest(rawAnswerManifest);

    // Every attempt, by every student, for this test.
    const { data: allResults, error: resultsErr } = await supabaseAdmin
      .from('exam_results')
      .select('student_id, submitted_at, raw_response_matrix')
      .eq('test_id', testId)
      .order('submitted_at', { ascending: true }); // oldest first, so attempt numbering is stable

    if (resultsErr) throw resultsErr;

    // Group by student, assign attempt numbers (1 = their earliest attempt).
    const byStudent = {};
    (allResults || []).forEach(row => {
      if (!byStudent[row.student_id]) byStudent[row.student_id] = [];
      byStudent[row.student_id].push(row);
    });

    const studentEmails = Object.keys(byStudent);

    // NOTE: profiles.email is NOT reliably populated for Google-OAuth
    // students (it lives on the auth.users row created by Supabase Auth,
    // not on the profiles row this app writes to) — a direct
    // `profiles.email = student_id` join silently matches nothing for most
    // students and every name falls back to "Student". Instead: resolve
    // each attempt's email -> auth user id via the Admin API (which does
    // have real emails), then join profiles.id -> full_name on that id.
    const wantedEmails = new Set(studentEmails.map(e => e.toLowerCase()));
    const emailToId = {};

    let page = 1;
    const perPage = 200;
    while (wantedEmails.size > Object.keys(emailToId).length) {
      const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (listErr || !pageData?.users?.length) break;

      pageData.users.forEach(u => {
        const email = (u.email || '').toLowerCase();
        if (wantedEmails.has(email)) emailToId[email] = u.id;
      });

      if (pageData.users.length < perPage) break; // last page reached
      page += 1;
    }

    const studentIds = Object.values(emailToId);

    const { data: profileRows } = studentIds.length
      ? await supabaseAdmin
          .from('profiles')
          .select('id, full_name')
          .in('id', studentIds)
      : { data: [] };

    const nameById = {};
    (profileRows || []).forEach(p => { nameById[p.id] = p.full_name || 'Student'; });

    const nameMap = {};
    studentEmails.forEach(email => {
      const id = emailToId[email.toLowerCase()];
      nameMap[email] = (id && nameById[id]) ? nameById[id] : 'Student';
    });

    const leaderboard = studentEmails.map(email => {
      const attempts = byStudent[email].map((row, idx) => ({
        attemptNumber: idx + 1,
        percentage: scorePercentage(row.raw_response_matrix, sections, answerManifest),
        submittedAt: row.submitted_at
      }));
      const bestPercentage = Math.max(...attempts.map(a => a.percentage));

      return {
        fullName: nameMap[email] || 'Student',
        isYou: email === user.email,
        attempts,
        bestPercentage
      };
    });

    // Rank = position by best-score-across-attempts, one entry per student.
    const sortedByBest = [...leaderboard].sort((a, b) => b.bestPercentage - a.bestPercentage);
    const currentRank = sortedByBest.findIndex(s => s.isYou) + 1;

    // "Live Results" tab (scheduled exams only) — a strictly separate view
    // from best/attemptwise: only a student's FIRST-EVER attempt counts, and
    // only if that attempt was actually submitted inside the scheduled
    // window. Re-attempts made after result declaration never appear here,
    // even if they scored higher — this tab is a live-timing record, not a
    // leaderboard of best scores.
    let liveLeaderboard = null;
    if (productRow?.is_scheduled) {
      const startAt = productRow.scheduled_start_at ? new Date(productRow.scheduled_start_at) : null;
      const endAt = productRow.scheduled_end_at ? new Date(productRow.scheduled_end_at) : null;

      liveLeaderboard = leaderboard
        .filter(s => {
          const firstAttempt = s.attempts.find(a => a.attemptNumber === 1);
          if (!firstAttempt || !firstAttempt.submittedAt) return false;
          const submittedAt = new Date(firstAttempt.submittedAt);
          if (startAt && submittedAt < startAt) return false;
          if (endAt && submittedAt > endAt) return false;
          return true;
        })
        .map(s => {
          const firstAttempt = s.attempts.find(a => a.attemptNumber === 1);
          return { fullName: s.fullName, isYou: s.isYou, percentage: firstAttempt.percentage };
        });
    }

    return NextResponse.json({
      isScheduled: !!productRow?.is_scheduled,
      totalStudents: leaderboard.length,
      currentStudentRank: currentRank || null,
      leaderboard, // client sorts/filters this by "best score" or "by attempt number"
      liveLeaderboard // only present for scheduled exams; see notes above
    });

  } catch (err) {
    console.error("Leaderboard Exception:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
