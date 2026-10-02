/**
 * MHT-CET ACADEMIC PORTAL ENGINE - ZERO-TRUST CORE LOGIC
 * File Name: exam-engine.js
 * Requires: auth.js to be loaded first (Supabase initialization)
 *
 * v2: Structure/marking now comes from `products`, question identity from
 * exam_question_data, both served through /api/exam/manifest — never
 * exam_configurations, never a client-guessed file path. Images are
 * requested from /api/images by q_id only. Pause/resume state is
 * authoritative on the server (attempt_sessions.exam_state), with
 * localStorage kept only as a fast local mirror.
 *
 * v3 (this file): autosave widened to 30s (was 10s); per-question time
 * tracking added (examState[i].timeSpentSeconds); save-progress payload
 * now also carries current_question_label / current_section_name for
 * the dashboard "Resume — QX, Subject" preview columns. Tab-switch was
 * already NOT pausing anything (only 'pagehide' does) — that behavior
 * is unchanged and now also covers the per-question timer.
 *
 * NOTE: window.CET_recordQuestionSwitch(gIndex) is new and must be
 * called from exam.html's jumpToQuestion() for per-question tracking
 * to actually advance between questions. Until that one-line hook is
 * added in exam.html, time will keep accumulating only against
 * whichever question was active when the timer started — everything
 * else in this file works correctly on its own regardless.
 */

// ==========================================
// 1. GLOBAL ENGINE MEMORY & CONFIG STATES
// ==========================================
window.CURRENT_EXAM_CONFIG = null;
let examState = [];
let currentActivePaperId = 1;
let timeRemainingSeconds = 0;
let timerInterval = null;
let CACHE_STORAGE_KEY = "";
let secureToken = ""; // Global reference for the encrypted attempt token
let timerStarted = false; // Guards against double-starting via resumeExamTimer

// Per-question time tracking — which question the clock is currently
// crediting. Advanced only via window.CET_recordQuestionSwitch().
let activeTimedGIndex = null;

// ==========================================
// EXAM ACTIVE STATUS FLAG (profiles.is_exam_active) — unchanged
// ==========================================
async function setExamActiveStatus(isActive) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;

        const { error } = await supabaseClient
            .from('profiles')
            .update({ is_exam_active: isActive })
            .eq('id', session.user.id);

        if (error) console.error("is_exam_active update failed:", error.message);
    } catch (err) {
        console.error("is_exam_active update exception:", err);
    }
}

// ==========================================
// 2. BOOTSTRAPPER — now hits /api/exam/manifest instead of
//    querying exam_configurations directly.
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    secureToken = urlParams.get('token');

    if (!secureToken) {
        alert("Security Token Missing! Unauthorized access.");
        window.location.replace('/dashboard');
        return;
    }

    CACHE_STORAGE_KEY = `CET_CACHE_${secureToken}`;

    try {
        const response = await fetch(`/api/exam/manifest?token=${encodeURIComponent(secureToken)}`);
        const manifestData = await response.json();

        if (!response.ok) {
            console.error("Manifest fetch failure:", manifestData.error);
            alert(manifestData.error || "Unable to load this exam. Returning to Dashboard.");
            window.location.replace('/dashboard');
            return;
        }

        window.CURRENT_EXAM_CONFIG = {
            testId: manifestData.testId,
            testTitle: manifestData.testTitle,
            durationMins: manifestData.durationMins,
            cacheExpirationMinutes: 180,
            sections: manifestData.sections,
            papers: manifestData.papers
        };

        // Import the per-session AES-GCM key the manifest handed us.
        // Every /api/exam/question-chunk response for this attempt is
        // decrypted with this same key, client-side, via Web Crypto.
        const rawKeyBytes = Uint8Array.from(atob(manifestData.k), c => c.charCodeAt(0));
        window.CET_SESSION_KEY = await crypto.subtle.importKey(
            'raw',
            rawKeyBytes,
            { name: 'AES-GCM' },
            false,
            ['decrypt']
        );

        const uiTitleElement = document.getElementById('ui-test-title');
        const uiSlugElement = document.getElementById('ui-test-id-slug');
        if (uiTitleElement) uiTitleElement.textContent = window.CURRENT_EXAM_CONFIG.testTitle;
        if (uiSlugElement) uiSlugElement.textContent = `ID: ${window.CURRENT_EXAM_CONFIG.testId}`;

        await setExamActiveStatus(true);

        initializeExamEngine(manifestData.questions, manifestData.resumeState);

    } catch (err) {
        console.error("Fatal exception captured:", err);
        alert("A critical infrastructure connection error occurred.");
        window.location.replace('/dashboard');
    }
});

// ==========================================
// 3. CORE PROCESSING ENGINE CONTROL MATRIX
// ==========================================
function initializeExamEngine(manifestQuestions, resumeState) {
    // Server state is authoritative. If it exists, this is a genuine
    // resume (either the page was simply reloaded mid-exam, or the
    // student paused and clicked "Resume" on the dashboard) — restore
    // it exactly and skip the landing screen entirely.
    if (resumeState && Array.isArray(resumeState.examState) && resumeState.examState.length > 0) {
        examState = resumeState.examState;
        currentActivePaperId = resumeState.currentActivePaperId;
        timeRemainingSeconds = resumeState.timeRemainingSeconds;
        window.CET_RESUMED_FROM_CACHE = true;

        // Resumed sessions saved before per-question timing existed won't
        // have this field yet — default it so later accumulation is safe.
        examState.forEach(q => {
            if (typeof q.timeSpentSeconds !== 'number') q.timeSpentSeconds = 0;
        });
    } else {
        generateDynamicExamState(manifestQuestions);
    }

    // Timer is deliberately NOT started here — exam.html calls
    // window.resumeExamTimer() once the landing screen (and, on
    // mobile, the instructions popup) is dismissed. For a resumed
    // session, exam.html's ExamEngineReady handler checks
    // window.CET_RESUMED_FROM_CACHE and calls resumeExamTimer()
    // immediately, skipping the landing screen.
    window.resumeExamTimer = function() {
        if (timerStarted) return;
        timerStarted = true;
        startPhaseTimer();
    };

    setTimeout(() => {
        window.dispatchEvent(new Event('ExamEngineReady'));
    }, 0);
}

// ==========================================
// PER-QUESTION TIME TRACKING
// ==========================================
// Called by exam.html whenever the student's active question changes
// (jumpToQuestion). Just points the running clock at the new index —
// the actual accumulation happens once a second inside startPhaseTimer,
// same tick that already drives the countdown, so there's no separate
// timing mechanism to get out of sync.
window.CET_recordQuestionSwitch = function(gIndex) {
    if (typeof gIndex === 'number' && examState[gIndex]) {
        activeTimedGIndex = gIndex;
    }
};

// ==========================================
// RECONNECT — silently re-links this tab to its attempt_sessions row.
// Calling /api/exam/start again with the same test_id is idempotent: if
// the session was flipped to 'paused' by a false pagehide (tab switch,
// screen lock, bfcache eviction), the server flips it back to
// 'in_progress' and hands back the same token; if it's still
// 'in_progress' this is a harmless no-op. Never navigates -- the caller
// just retries whatever request originally failed.
// ==========================================
let reconnectInFlight = null;
window.CET_reconnectSession = function() {
    if (reconnectInFlight) return reconnectInFlight;

    const testId = window.CURRENT_EXAM_CONFIG?.testId;
    if (!testId) return Promise.resolve(false);

    reconnectInFlight = fetch('/api/exam/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_id: testId }),
    })
        .then((res) => res.ok)
        .catch((err) => {
            console.error('Reconnect attempt failed:', err);
            return false;
        })
        .finally(() => {
            reconnectInFlight = null;
        });

    return reconnectInFlight;
};

function saveActiveSessionSnapshot() {
    if (!CACHE_STORAGE_KEY || !window.CURRENT_EXAM_CONFIG) return;
    const sessionSnapshot = {
        examState: examState,
        currentActivePaperId: currentActivePaperId,
        timeRemainingSeconds: timeRemainingSeconds,
        lastSavedTimestamp: Date.now()
    };

    // Fast local mirror — not the source of truth anymore, just a
    // resilience layer in case a server save is in flight/slow.
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(sessionSnapshot));

    // Authoritative copy — fire-and-forget, doesn't block the UI.
    // Also sends the currently active question's label/section so the
    // dashboard can show "Resume — QX, Subject" without parsing exam_state.
    const activeQ = (activeTimedGIndex !== null) ? examState[activeTimedGIndex] : null;

    const savePayload = JSON.stringify({
        token: secureToken,
        exam_state: sessionSnapshot,
        current_question_label: activeQ ? activeQ.visualLabel : null,
        current_section_name: activeQ ? activeQ.sectionName : null
    });

    const postSave = () => fetch('/api/exam/save-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: savePayload
    });

    postSave()
        .then((res) => {
            if (res.ok) return;
            // Non-2xx (e.g. a stale/expired token) -- try reconnecting the
            // session once, then retry this exact save silently. If it
            // fails again we just let the next autosave tick pick it up,
            // same as a plain network failure always did.
            return window.CET_reconnectSession().then((reconnected) => {
                if (reconnected) return postSave();
            });
        })
        .catch(err => console.error("Server autosave failed (will retry on next tick):", err));
}

function generateDynamicExamState(manifestQuestions) {
    examState = [];
    let globalIndexCounter = 0;

    const initialPaper = window.CURRENT_EXAM_CONFIG.papers.find(p => p.id === currentActivePaperId);
    timeRemainingSeconds = initialPaper.durationMinutes * 60;

    window.CURRENT_EXAM_CONFIG.sections.forEach(section => {
        const paperAllocId = parseInt(section.paperAllocation);

        // Pull this section's questions from the manifest (already
        // stripped to {q_id, sub_id, test_q_num} by the server) and
        // sort them by their recorded question number.
        const sectionQuestions = manifestQuestions
            .filter(q => q.sub_id === section.id)
            .sort((a, b) => a.test_q_num - b.test_q_num);

        sectionQuestions.forEach(q => {
            examState.push({
                globalIndex: globalIndexCounter,
                paperAllocation: paperAllocId,
                sectionId: section.id,
                sectionName: section.name,
                visualLabel: q.test_q_num,
                q_id: q.q_id,          // primary key for image requests
                sub_id: q.sub_id,      // fallback pair for legacy rows missing q_id
                test_q_num: q.test_q_num,
                status: 'unvisited',
                selectedOption: null,
                isLocked: (paperAllocId !== currentActivePaperId),
                timeSpentSeconds: 0
            });
            globalIndexCounter++;
        });
    });
}

function startPhaseTimer() {
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        timeRemainingSeconds--;

        // Credit one second to whichever question is currently active.
        // Deliberately NOT gated by tab visibility — a tab switch should
        // not pause this any more than it pauses the exam clock itself.
        if (activeTimedGIndex !== null && examState[activeTimedGIndex]) {
            const q = examState[activeTimedGIndex];
            q.timeSpentSeconds = (q.timeSpentSeconds || 0) + 1;
        }

        if (timeRemainingSeconds % 30 === 0) {
            saveActiveSessionSnapshot();
        }

        if (timeRemainingSeconds <= 0) {
            handlePhaseTransition();
        }
    }, 1000);
}

function handlePhaseTransition() {
    clearInterval(timerInterval);

    const nextPaperId = currentActivePaperId + 1;
    const nextPaperConfig = window.CURRENT_EXAM_CONFIG.papers.find(p => p.id === nextPaperId);

    if (nextPaperConfig) {
        examState.forEach(question => {
            question.isLocked = (question.paperAllocation !== nextPaperId);
        });

        currentActivePaperId = nextPaperId;
        timeRemainingSeconds = nextPaperConfig.durationMinutes * 60;

        saveActiveSessionSnapshot();
        startPhaseTimer();

        alert(`Time expired for Paper 1! Choices locked. Shifting to Paper 2.`);

    } else {
        executeAbsoluteZeroFinalSubmission();
    }
}

window.forceSubmitCurrentPhase = function() {
    const confirmEarlySubmit = confirm("Are you sure you want to submit this section early? You will NOT be able to change your answers later.");
    if (confirmEarlySubmit) {
        handlePhaseTransition();
    }
};

function formatTime(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function executeAbsoluteZeroFinalSubmission() {
    clearInterval(timerInterval);
    console.warn("=== INITIATING SECURE SERVER EVALUATION SUBMISSION ===");

    const modal = document.getElementById('ui-submission-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.innerHTML = `<div class="modal-card"><lottie-player src="/loading.json" background="transparent" speed="1" style="width: 120px; height: 120px; margin: 0 auto;" loop autoplay></lottie-player><h3>Calculating your scores...</h3><p>Please wait while we submit your exam.</p></div>`;
    }

    const rawMatrix = examState.map(q => ({
        globalIndex: q.globalIndex,
        q_id: q.q_id,
        sub_id: q.sub_id,
        test_q_num: q.test_q_num,
        sectionId: q.sectionId,
        status: q.status,
        selectedOption: q.selectedOption,
        timeSpentSeconds: q.timeSpentSeconds || 0
    }));

    try {
        const submitBody = JSON.stringify({ token: secureToken, raw_response_matrix: rawMatrix });
        const requestSubmit = () => fetch('/api/exam/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: submitBody
        });

        let response = await requestSubmit();

        if (!response.ok) {
            // Same false-pause scenario as question-chunk/save-progress --
            // reconnect once and retry the submit itself before ever
            // showing the student an error on the one action that must
            // not fail.
            const reconnected = await window.CET_reconnectSession();
            if (reconnected) {
                response = await requestSubmit();
            }
        }

        const data = await response.json();

        if (response.ok && data.status === 'saved') {
            // Scheduled exam, result not declared yet — no review page.
            await setExamActiveStatus(false);
            localStorage.removeItem(CACHE_STORAGE_KEY);
            if (modal) {
                modal.innerHTML = `<div class="modal-card"><h3>Your attempt is saved successfully.</h3><p>Results are not available immediately for this scheduled exam. Head back to your dashboard — the result timing will be shown there.</p></div>`;
            }
            setTimeout(() => window.location.replace('/dashboard'), 2200);
        } else if (response.ok && data.url) {
            await setExamActiveStatus(false);
            localStorage.removeItem(CACHE_STORAGE_KEY);
            // location.replace (not .href) so the finished exam page is
            // REPLACED in browser history by the review page, instead of
            // sitting underneath it. Without this, tapping the mobile back
            // button on the review page lands the student back on the
            // now-submitted, stale exam page instead of returning to the
            // dashboard.
            window.location.replace(data.url);
        } else {
            alert("Submission blocked by server infrastructure: " + (data.error || "Unknown"));
            if (modal) modal.style.display = 'none';
        }
    } catch (err) {
        console.error("Submission fatal trace:", err);
        alert("Network connectivity interruption. Check your alignment metrics before retrying.");
        if (modal) modal.style.display = 'none';
    }
}

// ==========================================
// PAUSE / DISRUPTION COUNTER — strict, server-side, debounced (see
// sql/2026-09-20_pause_count.sql). Only fires once the exam timer has
// actually started (ignores landing-screen/instructions-popup noise
// before the attempt is really live) and only for genuine disruptions:
// tab hidden/minimized, internet dropped, or the page actually closing.
// This is fire-and-forget telemetry — it must never block or slow down
// anything the student is doing.
// ==========================================
function reportPauseEvent() {
    if (!timerStarted || !secureToken) return;

    const payload = JSON.stringify({ token: secureToken });

    // sendBeacon survives page teardown (tab close) better than fetch,
    // and — being same-origin — still carries the request through
    // normally for the non-teardown cases (hidden/offline) too.
    if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        const sent = navigator.sendBeacon('/api/exam/pause-event', blob);
        if (sent) return;
    }

    fetch('/api/exam/pause-event', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: payload
    }).catch(() => {});
}

window.addEventListener('offline', reportPauseEvent);

// Leaving full-screen (Esc key, OS gesture, or the toggle button) is
// treated the same as any other disruption — one strict count, plus a
// hook exam.html uses to show the "don't leave full-screen" warning
// popup and offer a one-click way back in. Re-entering full-screen is
// not itself counted (mirrors the visibilitychange hidden/visible
// asymmetry above — only leaving is the disruption).
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && timerStarted) {
        reportPauseEvent();
        if (typeof window.CET_onFullscreenExit === 'function') {
            window.CET_onFullscreenExit();
        }
    }
});

// ==========================================
// 3b. TAB VISIBILITY — is_exam_active now tracks whether the student is
//     actually looking at the exam tab right now, not just "session open".
//     Hidden (switched tab / minimized) -> false immediately.
//     Visible again -> true again. This does NOT pause the exam itself
//     (timer, autosave, locking) — only the presence flag. Pausing the
//     attempt is still pagehide-only, per section 4 below.
// ==========================================
document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    setExamActiveStatus(!hidden);
    // Only the transition INTO hidden (tab switch / minimize) counts as
    // a disruption — coming back doesn't.
    if (hidden) reportPauseEvent();
});

// ==========================================
// 4. PAGE EXIT — flips exam to 'paused' (not just is_exam_active)
//    Still deliberately 'pagehide', not 'visibilitychange' — a tab
//    switch should never pause the exam, only a genuine close/nav-away.
//    Both PATCHes use keepalive so they survive the unload.
//    NOTE: requires an RLS policy letting a student UPDATE their own
//    attempt_sessions row (status, exam_state, last_active_at) —
//    same shape as the existing profiles UPDATE policy.
// ==========================================
window.addEventListener('pagehide', () => {
    // Counted separately from the visibilitychange(hidden) call above —
    // the DB-side debounce in increment_pause_count() collapses the two
    // into a single count when they fire back-to-back for the same
    // close/nav-away, so this is still exactly one legit pause, not two.
    reportPauseEvent();

    supabaseClient.auth.getSession().then(({ data: { session } }) => {
        if (!session) return;

        // Existing presence flag — unchanged.
        fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user.id}`, {
            method: 'PATCH',
            keepalive: true,
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${session.access_token}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ is_exam_active: false })
        });

        // New: pause the attempt and save the final snapshot.
        // The status=eq.in_progress filter makes this safe to fire
        // unconditionally — if the exam was already 'completed',
        // this filtered update simply matches zero rows.
        if (secureToken) {
            const finalSnapshot = {
                examState: examState,
                currentActivePaperId: currentActivePaperId,
                timeRemainingSeconds: timeRemainingSeconds,
                lastSavedTimestamp: Date.now()
            };

            fetch(`${SUPABASE_URL}/rest/v1/attempt_sessions?token=eq.${secureToken}&status=eq.in_progress`, {
                method: 'PATCH',
                keepalive: true,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${session.access_token}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    status: 'paused',
                    exam_state: finalSnapshot,
                    last_active_at: new Date().toISOString()
                })
            });
        }
    });
});