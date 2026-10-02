// lib/onboarding.js
//
// Direct port of the onboarding open-count tracker from dashboard.html
// (getAndIncrementOpenCount). Used to cap first-time nudge tooltips to the
// student's first few dashboard opens instead of showing them forever.

const OPEN_COUNT_KEY = 'ynclasses_open_count';

export function getAndIncrementOpenCount() {
    try {
        let count = parseInt(localStorage.getItem(OPEN_COUNT_KEY) || '0', 10);
        if (Number.isNaN(count)) count = 0;
        count += 1;
        localStorage.setItem(OPEN_COUNT_KEY, String(count));
        return count;
    } catch (e) {
        // localStorage unavailable (private mode, etc.) -- treat as first open
        // so the tip can still show once per session.
        return 1;
    }
}

// ---- Last-viewed section/subsection/chapter recall ----
// Mirrors dashboard.html's `cetwalle_last_subsection_id` persistence, but
// tracks all three levels so returning to the dashboard restores the exact
// main section -> subsection -> chapter the student was last looking at.

const KEYS = {
    main: 'ynclasses_last_main_id',
    subsection: 'ynclasses_last_subsection_id',
    chapter: 'ynclasses_last_chapter_id',
};

export function saveLastPosition({ mainId, subsectionId, chapterId }) {
    try {
        if (mainId != null) localStorage.setItem(KEYS.main, String(mainId));
        else localStorage.removeItem(KEYS.main);

        if (subsectionId != null) localStorage.setItem(KEYS.subsection, String(subsectionId));
        else localStorage.removeItem(KEYS.subsection);

        if (chapterId != null) localStorage.setItem(KEYS.chapter, String(chapterId));
        else localStorage.removeItem(KEYS.chapter);
    } catch (e) {
        // ignore -- private mode / storage disabled
    }
}

export function readLastPosition() {
    try {
        return {
            mainId: localStorage.getItem(KEYS.main),
            subsectionId: localStorage.getItem(KEYS.subsection),
            chapterId: localStorage.getItem(KEYS.chapter),
        };
    } catch (e) {
        return { mainId: null, subsectionId: null, chapterId: null };
    }
}
