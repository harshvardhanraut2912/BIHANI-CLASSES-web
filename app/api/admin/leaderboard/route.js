// 📂 SAVE THIS FILE AT: app/api/admin/leaderboard/route.js
//
// Admin version of /api/exam/leaderboard. Two differences from the student
// route it's copied from:
//   1. No student session/token gate — this whole path already sits behind
//      the admin cookie (proxy.js gates every /api/admin/* request), so
//      there's no "which student is asking" check to do here.
//   2. The "results not declared yet" block is intentionally NOT applied —
//      admins can see the live leaderboard for a scheduled exam even before
//      result_declared_at, which is the whole point of this route existing.
//
// GET /api/admin/leaderboard            -> list of exam products to pick from
// GET /api/admin/leaderboard?productId=X -> full leaderboard for that product
//
// Scoring logic is identical to app/api/exam/leaderboard/route.js — kept in
// sync manually, same as that file's own note about review.html.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const productId = searchParams.get('productId');

    // No productId -> just list exam products for the picker dropdown.
    if (!productId) {
      const { data: products, error: prodErr } = await supabaseAdmin
        .from('products')
        .select('id, title, is_scheduled, scheduled_start_at, scheduled_end_at, result_declared_at')
        .eq('product_type', 'exam')
        .order('created_at', { ascending: false });

      if (prodErr) throw prodErr;
      return NextResponse.json({ products: products || [] });
    }

    const { data: productRow, error: productErr } = await supabaseAdmin
      .from('products')
      .select('title, linked_exam_v2_id, is_scheduled, scheduled_start_at, scheduled_end_at, result_declared_at')
      .eq('id', productId)
      .maybeSingle();

    if (productErr || !productRow) {
      return NextResponse.json({ error: 'Exam product not found.' }, { status: 404 });
    }

    // NOTE: no "results not declared yet" gate here on purpose — admins can
    // watch the leaderboard live, before result_declared_at, unlike students.

    const v2RowId = productRow.linked_exam_v2_id || productId;

    const { data: keyRow } = await supabaseAdmin
      .from('exam_answer_keys_v2')
      .select('answer_manifest')
      .eq('id', v2RowId)
      .single();

    const rawAnswerManifest = keyRow
      ? (typeof keyRow.answer_manifest === 'string' ? JSON.parse(keyRow.answer_manifest) : keyRow.answer_manifest)
      : [];

    const answerManifest = rawAnswerManifest.map((q) => ({
      q_id: q.q_id,
      sub_id: q.q_section || 'General',
      test_q_num: q.q_num,
      answer_key: q.answer_key,
    }));

    const sections = buildSectionsFromManifest(rawAnswerManifest);

    const { data: allResults, error: resultsErr } = await supabaseAdmin
      .from('exam_results')
      .select('student_id, submitted_at, raw_response_matrix')
      .eq('test_id', productId)
      .order('submitted_at', { ascending: true });

    if (resultsErr) throw resultsErr;

    const byStudent = {};
    (allResults || []).forEach(row => {
      if (!byStudent[row.student_id]) byStudent[row.student_id] = [];
      byStudent[row.student_id].push(row);
    });

    const studentEmails = Object.keys(byStudent);

    // Same email -> auth user id -> profiles.full_name resolution as the
    // student-facing route (profiles.email isn't reliably populated for
    // Google-OAuth students).
    const wantedEmails = new Set(studentEmails.map(e => e.toLowerCase()));
    const emailToId = {};
    const authAvatarByEmail = {}; // Google / auth profile photo, used when profiles.avatar_url is empty

    let page = 1;
    const perPage = 200;
    while (wantedEmails.size > Object.keys(emailToId).length) {
      const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (listErr || !pageData?.users?.length) break;

      pageData.users.forEach(u => {
        const email = (u.email || '').toLowerCase();
        if (wantedEmails.has(email)) {
          emailToId[email] = u.id;
          const meta = u.user_metadata || {};
          authAvatarByEmail[email] = meta.avatar_url || meta.picture || '';
        }
      });

      if (pageData.users.length < perPage) break;
      page += 1;
    }

    const studentIds = Object.values(emailToId);

    const { data: profileRows } = studentIds.length
      ? await supabaseAdmin
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', studentIds)
      : { data: [] };

    const nameById = {};
    (profileRows || []).forEach(p => { nameById[p.id] = p.full_name || 'Student'; });

    const avatarById = {};
    (profileRows || []).forEach(p => { avatarById[p.id] = p.avatar_url || ''; });

    const nameMap = {};
    const avatarMap = {};
    studentEmails.forEach(email => {
      const id = emailToId[email.toLowerCase()];
      nameMap[email] = (id && nameById[id]) ? nameById[id] : 'Student';
      avatarMap[email] = (id && avatarById[id]) || authAvatarByEmail[email.toLowerCase()] || '';
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
        avatarUrl: avatarMap[email] || '',
        email,
        isYou: false, // no "current student" concept on the admin view
        attempts,
        bestPercentage
      };
    });

    const sortedByBest = [...leaderboard].sort((a, b) => b.bestPercentage - a.bestPercentage);

    // "Live Results" — same rule as the student route: only a student's
    // first-ever attempt counts, and only if it was submitted inside the
    // scheduled window. This is what makes the admin view usable WHILE a
    // scheduled exam is still running / before results are declared.
    let liveLeaderboard = null;
    if (productRow.is_scheduled) {
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
        .map(s => ({ fullName: s.fullName, avatarUrl: s.avatarUrl, email: s.email, isYou: false, percentage: s.attempts.find(a => a.attemptNumber === 1).percentage }));
    }

    return NextResponse.json({
      productTitle: productRow.title,
      isScheduled: !!productRow.is_scheduled,
      resultDeclared: !productRow.is_scheduled || (!!productRow.result_declared_at && new Date() >= new Date(productRow.result_declared_at)),
      totalStudents: sortedByBest.length,
      leaderboard: sortedByBest,
      liveLeaderboard
    });

  } catch (err) {
    console.error("Admin Leaderboard Exception:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
