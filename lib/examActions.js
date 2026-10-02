// lib/examActions.js
//
// Direct port of the "EXAM ROUTING & GLOBAL UTILITIES" block from the old
// public/dashboard.html (hydrateUserAttemptStatusMap, redirectToSecureReview,
// triggerSecureExamLaunch). Logic is unchanged -- same tables, same columns,
// same /api/exam/start contract -- only the DOM button mutation is swapped
// for React state so components stay declarative.

import { supabase } from './supabase';

// Per-student attempt status: testId -> { hasAttempted, firstAttemptAt }.
// firstAttemptAt is the earliest submitted_at across all their attempts —
// used by ProductGrid to permanently flag a scheduled exam as "missed" if
// that earliest attempt (or the total absence of one) falls after the
// scheduled window closed, even if they go on to attempt it later once
// results are declared and the exam reopens.
export async function hydrateAttemptStatusMap(studentEmail, testIds) {
    if (!studentEmail || !testIds || testIds.length === 0) return {};
    try {
        const { data, error } = await supabase
            .from('exam_results')
            .select('test_id, submitted_at')
            .eq('student_id', studentEmail)
            .in('test_id', testIds)
            .order('submitted_at', { ascending: true });

        if (error) throw error;

        const map = {};
        (data || []).forEach((row) => {
            if (!map[row.test_id]) {
                map[row.test_id] = { hasAttempted: true, firstAttemptAt: row.submitted_at };
            }
        });
        return map;
    } catch (err) {
        console.error('Attempt status fetch failed:', err);
        // Same fallback behaviour as the old code: on failure, treat as
        // "no known attempts" rather than throwing, so cards still render
        // (falling back to "Start Exam").
        return {};
    }
}

// Mirrors redirectToSecureReview(testId): looks up the most recent
// attempt_sessions token for this student+test and sends them to the
// review page. Returns nothing -- navigates via window.location like before.
export async function redirectToSecureReview(testId, studentEmail) {
    if (!studentEmail) return;
    try {
        const { data, error } = await supabase
            .from('attempt_sessions')
            .select('token')
            .eq('test_id', testId)
            .eq('student_id', studentEmail)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        if (data && data.token) {
            window.location.href = `/review.html?token=${data.token}`;
        } else {
            alert('Unable to locate a secure session token for this test layout.');
        }
    } catch (err) {
        console.error(err);
        alert('An error occurred loading your performance matrix.');
    }
}

// Mirrors triggerSecureExamLaunch(testId, buttonElement). The caching of the
// card thumbnail into localStorage (used by exam.html as its landing banner
// graphic) is preserved -- callers pass the raw thumbnail_url/thumb path
// straight off the product row instead of scraping it back out of an <img>.
//
// onStatusChange(status) is called with 'launching' | 'idle' so the caller's
// button can show "Securing Engine..." / re-enable itself, same as the old
// buttonElement.innerText / disabled toggling.
export async function triggerSecureExamLaunch(testId, thumbnailPath, onStatusChange) {
    try {
        if (thumbnailPath) {
            localStorage.setItem(`THUMBNAIL_${testId}`, thumbnailPath);
        }
    } catch (cacheErr) {
        console.warn('Non-blocking failure caching landing banner graphic:', cacheErr);
    }

    onStatusChange?.('launching');

    try {
        const response = await fetch('/api/exam/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ test_id: testId }),
        });
        const data = await response.json();

        if (response.ok && data.url) {
            window.location.href = data.url;
            return; // navigating away -- no need to reset status
        }

        alert('Security clearance failed: ' + (data.error || 'Unknown error'));
        onStatusChange?.('idle');
    } catch (err) {
        console.error(err);
        alert('Network error while securing connection.');
        onStatusChange?.('idle');
    }
}
