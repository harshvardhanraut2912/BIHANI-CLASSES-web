// lib/dashboardQueries.js
//
// SECURITY NOTE: these functions used to query sidebar_main_sections /
// sidebar_subsections / products directly from the browser via the
// anon-key Supabase client, with enrollment filtering applied only in
// React state afterward. That's not a real access control -- anyone with
// devtools open could call supabase.from('products').select('*') directly
// and get every course's material regardless of enrollment.
//
// Both functions below now call server-side API routes
// (app/api/dashboard/main-sections, app/api/dashboard/tree) that run on
// the service role key and check the student's user_enrollments rows
// themselves before returning anything. A student can't bypass this by
// skipping the UI -- hitting the endpoint directly gets the exact same
// enforced filtering, because the filtering happens in code they can't see
// or run, not in the browser.
//
// Both endpoints identify the student via the same cet_session_token
// httpOnly-style cookie every other API route in this app already uses
// (see app/api/exam/start/route.js) -- no extra auth wiring needed here.

async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || `Request failed (${res.status})`);
    }
    return data;
}

// Returns only the main sections this student is allowed to see: every
// non-course section, plus any is_course section they have an
// enrollment row for. Filtering happens server-side -- see route file.
export async function fetchMainSections() {
    const data = await fetchJson('/api/dashboard/main-sections');
    return data.sections || [];
}

// ---------------------------------------------------------------------------
// Progressive dashboard loading -- three levels, cheapest first:
//   1. fetchSubsections      -- subsection list for a main section (fast,
//                                one query). Safe to call for EVERY course
//                                the student can see, not just the open one.
//   2. fetchSubsectionContent -- chapters (or leaf products) for ONE
//                                subsection. Only called for the currently
//                                open course.
//   3. fetchChapterProducts   -- products for every chapter of ONE
//                                subsection, in a single request. Only
//                                called after (2) resolves a chapters list,
//                                and only for the currently open course.
// This replaces the old single fetchCourseTree() call, which pulled every
// chapter and product of a course in one request before anything could
// render -- that's what caused the dashboard to sit on its loading screen.
// ---------------------------------------------------------------------------

// LEVEL 1: subsection list only, no chapters/products.
export async function fetchSubsections(mainSectionId) {
    const data = await fetchJson(`/api/dashboard/subsections?mainSectionId=${encodeURIComponent(mainSectionId)}`);
    return data.subsections || [];
}

// LEVEL 2: one subsection's chapters, or its leaf products if it has none.
// Returns { mode: 'chapters', chapters: [...] } | { mode: 'products', products: [...] }
export async function fetchSubsectionContent(mainSectionId, subsectionId) {
    const data = await fetchJson(
        `/api/dashboard/subsection-content?mainSectionId=${encodeURIComponent(mainSectionId)}&subsectionId=${encodeURIComponent(subsectionId)}`
    );
    return data.mode === 'chapters'
        ? { mode: 'chapters', chapters: data.chapters || [] }
        : { mode: 'products', products: data.products || [] };
}

// LEVEL 3: products for every chapter of one subsection, grouped by chapter_id.
export async function fetchChapterProducts(mainSectionId, chapterIds) {
    const data = await fetchJson(
        `/api/dashboard/chapter-products?mainSectionId=${encodeURIComponent(mainSectionId)}&chapterIds=${encodeURIComponent(chapterIds.join(','))}`
    );
    return data.productsByChapter || {};
}