'use client';

// app/dashboard/layout.js
//
// WHY THIS FILE EXISTS: in the App Router, a layout.js persists across
// navigation within its route tree, but a page.js is torn down and
// recreated on every URL change -- even between two URLs matched by the
// SAME [[...slug]] page.js file. That's why session/mainSections/tree were
// all being refetched on every single click between subsections/chapters:
// they lived in page.js state, which was being reset to its initial empty
// values on every navigation.
//
// Fix: all of that state now lives HERE, in the layout, which does not
// remount when only the slug changes. page.js (the sibling file under
// [[...slug]]/) is now a thin, stateless consumer that just reads
// useDashboard() and renders whichever grid the current stage calls for.
// Same tree-loader logic as before -- refetches only when navigating to a
// DIFFERENT main section (treeForMainId !== activeMain.id) -- but now that
// guard actually works, because the state it guards no longer gets wiped
// out on every render.

import { useEffect, useState, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fetchMainSections, fetchSubsections, fetchSubsectionContent, fetchChapterProducts } from '@/lib/dashboardQueries';
import { hydrateAttemptStatusMap } from '@/lib/examActions';
import { getAndIncrementOpenCount, saveLastPosition, readLastPosition } from '@/lib/onboarding';
import MainSidebar from '@/components/dashboard/MainSidebar';
import DashboardNavbar from '@/components/dashboard/DashboardNavbar';
import AttentionTip from '@/components/dashboard/AttentionTip';
import DocumentViewer from '@/components/dashboard/DocumentViewer';
import OnboardingCoachmarks from '@/components/dashboard/OnboardingCoachmarks';
import styles from '@/components/dashboard/dashboard.module.css';

export const STAGE = {
    SUBSECTIONS: 'subsections',
    CHAPTERS: 'chapters',
    PRODUCTS: 'products',
    NOTES: 'notes',
};

export const NOTES_SUBSECTION_ID = '__notes__';
export const NOTES_SLUG = 'notes';
export const notesVirtualSubsection = {
    id: NOTES_SUBSECTION_ID,
    name: 'Notes',
    icon_url: null,
    isVirtualNotes: true,
};

const DashboardContext = createContext(null);

// page.js (and any nested component) reads all dashboard state/handlers
// through this hook instead of props -- avoids drilling everything through
// the layout -> page boundary.
export function useDashboard() {
    const ctx = useContext(DashboardContext);
    if (!ctx) throw new Error('useDashboard must be used within app/dashboard/layout.js');
    return ctx;
}

export default function DashboardLayout({ children }) {
    const router = useRouter();
    const params = useParams();

    // useParams() works in a layout too -- it reflects the params of
    // whichever page is currently matched below it, so this layout always
    // knows the current slug even though [[...slug]] is declared one
    // folder deeper.
    const slug = params?.slug || [];
    const [mainSlug, subSlug, chapterSlug] = slug;

    const [session, setSession] = useState(null);
    const [authChecked, setAuthChecked] = useState(false);

    const [mainSections, setMainSections] = useState([]);

    // ---------------- Progressive tree cache (3 levels) ----------------
    // LEVEL 1: subsections list per main section id. Loaded for EVERY
    // course the student can see, as soon as mainSections resolves -- it's
    // one cheap query per course, so this is the "1st subsections page"
    // that's kept ready for courses the student hasn't opened yet.
    const [subsectionsByMain, setSubsectionsByMain] = useState({});
    const [subsectionsLoadingMain, setSubsectionsLoadingMain] = useState({});
    const subsectionsRequestedRef = useRef(new Set());

    // LEVEL 2: chapters (or leaf products) for ONE subsection, keyed by
    // `${mainId}:${subsectionId}`. Only ever requested for subsections that
    // belong to the CURRENTLY OPEN course -- see the background-load effect
    // further down, keyed off activeMain.
    const [contentByKey, setContentByKey] = useState({});
    const contentRequestedRef = useRef(new Set());

    // LEVEL 3: products for every chapter of ONE subsection (single
    // request per subsection instead of one per chapter), keyed the same
    // way as contentByKey. Kicked off automatically right after a
    // subsection's chapters land.
    const [productsByChapterKey, setProductsByChapterKey] = useState({});
    const productsRequestedRef = useRef(new Set());

    // Tracks which course is "current" so background loaders started for a
    // course the student has since navigated away from can bail out instead
    // of continuing to spend requests on it.
    const activeMainIdRef = useRef(null);

    const [attemptStatusMap, setAttemptStatusMap] = useState({});

    // ---------------- Mobile drawer ----------------
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    // ---------------- Inline document viewer (INLINE_SWAP products) ----------------
    const [activeDocument, setActiveDocument] = useState(null);
    const handleOpenDocument = useCallback((product) => setActiveDocument(product), []);
    const handleCloseDocument = useCallback(() => setActiveDocument(null), []);

    // ---------------- Onboarding ----------------
    const [attentionTip, setAttentionTip] = useState(null);
    const openCountedRef = useRef(false);
    const [dashboardOpenCount, setDashboardOpenCount] = useState(0);
    const hasAttemptedRestoreRef = useRef(false);

    // ---------------- Derive active section/subsection/chapter/stage from the URL ----------------
    const activeMain = useMemo(() => {
        if (!mainSlug) return null;
        return mainSections.find((m) => String(m.id) === String(mainSlug)) || null;
    }, [mainSections, mainSlug]);

    // "tree ready" now just means level 1 (the subsection list) has landed
    // for this course -- it no longer waits on any chapter/product data.
    const activeSubsections = activeMain ? subsectionsByMain[activeMain.id] : undefined;
    const treeReady = !!activeMain && !!activeSubsections;
    const treeLoading = !!activeMain && !treeReady && !!subsectionsLoadingMain[activeMain.id];

    // Convenience "tree" shape so the rest of the file (and page.js, via
    // context) keeps reading tree.subsections like before.
    const tree = activeMain ? { subsections: activeSubsections || [] } : null;

    const activeSubsection = useMemo(() => {
        if (!subSlug) return null;
        if (subSlug === NOTES_SLUG) return notesVirtualSubsection;
        if (!treeReady) return null;
        return activeSubsections?.find((s) => String(s.id) === String(subSlug)) || null;
    }, [subSlug, treeReady, activeSubsections]);

    const activeContentKey = activeMain && activeSubsection && !activeSubsection.isVirtualNotes
        ? `${activeMain.id}:${activeSubsection.id}`
        : null;

    // LEVEL 2 content for the active subsection, with LEVEL 3 (per-chapter
    // products) merged in once it lands. Until level 2 resolves this is
    // null, which page.js reads as "still loading this subsection".
    const subsectionContent = useMemo(() => {
        if (!activeContentKey) return null;
        const base = contentByKey[activeContentKey];
        if (!base) return null;
        if (base.mode === 'chapters') {
            return { ...base, productsByChapter: productsByChapterKey[activeContentKey] || {} };
        }
        return base;
    }, [activeContentKey, contentByKey, productsByChapterKey]);

    const subsectionContentLoading = !!activeContentKey && !contentByKey[activeContentKey];
    const chapterProductsLoading = !!activeContentKey
        && subsectionContent?.mode === 'chapters'
        && !productsByChapterKey[activeContentKey];

    const activeChapter = useMemo(() => {
        if (!chapterSlug || subsectionContent?.mode !== 'chapters') return null;
        return subsectionContent.chapters?.find((c) => String(c.id) === String(chapterSlug)) || null;
    }, [chapterSlug, subsectionContent]);

    const stage = useMemo(() => {
        if (!activeSubsection) return STAGE.SUBSECTIONS;
        if (activeSubsection.isVirtualNotes) return STAGE.NOTES;
        if (subsectionContent?.mode === 'chapters') {
            return activeChapter ? STAGE.PRODUCTS : STAGE.CHAPTERS;
        }
        return STAGE.PRODUCTS;
    }, [activeSubsection, subsectionContent, activeChapter]);

    // ---------------- LEVEL 1 loader: subsection list for one course ----------------
    // Cheap (one query) -- safe to call for every course the student can
    // see, not just the open one. Guarded by a ref so repeated calls (e.g.
    // from both the "every course" prefetch effect and a direct click) are
    // no-ops once a fetch has been kicked off.
    const ensureSubsections = useCallback((mainId) => {
        if (!mainId || subsectionsRequestedRef.current.has(mainId)) return;
        subsectionsRequestedRef.current.add(mainId);
        setSubsectionsLoadingMain((prev) => ({ ...prev, [mainId]: true }));
        fetchSubsections(mainId)
            .then((subs) => {
                setSubsectionsByMain((prev) => ({ ...prev, [mainId]: subs }));
            })
            .catch((err) => {
                console.error(`Failed to load subsections for ${mainId}:`, err);
                subsectionsRequestedRef.current.delete(mainId); // allow retry on next visit
                setSubsectionsByMain((prev) => ({ ...prev, [mainId]: [] }));
            })
            .finally(() => {
                setSubsectionsLoadingMain((prev) => ({ ...prev, [mainId]: false }));
            });
    }, []);

    // ---------------- LEVEL 3 loader: products for every chapter of one subsection ----------------
    const ensureChapterProducts = useCallback((mainId, subsectionId, chapters) => {
        const key = `${mainId}:${subsectionId}`;
        if (productsRequestedRef.current.has(key)) return;
        if (!chapters || chapters.length === 0) return;
        productsRequestedRef.current.add(key);

        fetchChapterProducts(mainId, chapters.map((c) => c.id))
            .then((productsByChapter) => {
                setProductsByChapterKey((prev) => ({ ...prev, [key]: productsByChapter }));
                const allIds = Object.values(productsByChapter).flat().map((p) => p.id);
                if (allIds.length > 0) {
                    hydrateAttemptStatusMap(session?.user?.email, allIds).then((map) => {
                        setAttemptStatusMap((prev) => ({ ...prev, ...map }));
                    });
                }
            })
            .catch((err) => {
                console.error(`Failed to load chapter products for ${key}:`, err);
                productsRequestedRef.current.delete(key);
            });
    }, [session]);

    // ---------------- LEVEL 2 loader: one subsection's chapters/products ----------------
    // On success, if the subsection turned out to have chapters, immediately
    // (and silently, in the background) kicks off LEVEL 3 for it.
    const ensureSubsectionContent = useCallback((mainId, subsectionId) => {
        if (!mainId || !subsectionId) return;
        const key = `${mainId}:${subsectionId}`;
        if (contentRequestedRef.current.has(key)) return;
        contentRequestedRef.current.add(key);

        fetchSubsectionContent(mainId, subsectionId)
            .then((content) => {
                setContentByKey((prev) => ({ ...prev, [key]: content }));
                if (content.mode === 'chapters') {
                    ensureChapterProducts(mainId, subsectionId, content.chapters);
                } else {
                    const ids = content.products.map((p) => p.id);
                    if (ids.length > 0) {
                        hydrateAttemptStatusMap(session?.user?.email, ids).then((map) => {
                            setAttemptStatusMap((prev) => ({ ...prev, ...map }));
                        });
                    }
                }
            })
            .catch((err) => {
                console.error(`Failed to load subsection content for ${key}:`, err);
                contentRequestedRef.current.delete(key);
            });
    }, [session, ensureChapterProducts]);

    // ---------------- PRIORITY loader: the deep-linked page itself ----------------
    // On a fresh /dashboard/<course>/<subsection>/<chapter> load, the two
    // loaders above are gated behind React state that hasn't landed yet --
    // Level 1 waits for the full mainSections list, Level 2 waits for
    // Level 1's result to resolve `activeSubsection`. That turns into a
    // visible waterfall (main-course skeleton -> subsections skeleton ->
    // products skeleton) even though the URL already tells us exactly
    // which course/subsection is wanted, with no lookup required. Fire
    // straight off the raw slug values instead, in parallel with
    // everything else -- this is what actually makes the CURRENT page
    // load first while the rest keeps filling in in the background.
    useEffect(() => {
        if (!mainSlug) return;
        ensureSubsections(mainSlug);
        if (subSlug && subSlug !== NOTES_SLUG) {
            ensureSubsectionContent(mainSlug, subSlug);
        }
    }, [mainSlug, subSlug, ensureSubsections, ensureSubsectionContent]);

    // ---------------- URL helpers / navigation ----------------
    const buildUrl = useCallback((mainId, subsectionId, chapterId) => {
        const parts = ['/dashboard'];
        if (mainId) parts.push(String(mainId));
        if (subsectionId) parts.push(String(subsectionId));
        if (chapterId) parts.push(String(chapterId));
        return parts.join('/');
    }, []);

    const handleSelectMain = useCallback((mainSection) => {
        setAttentionTip(null);
        router.push(buildUrl(mainSection.id));
        if (typeof window !== 'undefined' && window.innerWidth <= 900) setMobileSidebarOpen(false);
    }, [router, buildUrl]);

    const handleSelectSubsection = useCallback((subsection) => {
        if (!activeMain) return;
        const subId = subsection.isVirtualNotes ? NOTES_SLUG : subsection.id;
        // Give this subsection priority: if it hasn't been fetched yet (the
        // background loader above hasn't gotten to it), request it right
        // now instead of waiting for its turn in that loop.
        if (!subsection.isVirtualNotes) ensureSubsectionContent(activeMain.id, subsection.id);
        router.push(buildUrl(activeMain.id, subId));
        if (typeof window !== 'undefined' && window.innerWidth <= 900) setMobileSidebarOpen(false);
    }, [router, buildUrl, activeMain, ensureSubsectionContent]);

    const handleSelectChapter = useCallback((chapter) => {
        if (!activeMain || !activeSubsection) return;
        router.push(buildUrl(activeMain.id, activeSubsection.id, chapter.id));
    }, [router, buildUrl, activeMain, activeSubsection]);

    // Goes up exactly one stage in the course tree (Products -> Chapters/
    // Subsections -> Subsections), regardless of how the user arrived at
    // the current page. Deliberately NOT router.back(): browser history
    // can contain unrelated stops (e.g. the exam/review static pages),
    // and router.back() would land back on those instead of the parent
    // level of the course tree.
    const handleBackOneLevel = useCallback(() => {
        if (!activeMain) return;
        if (stage === STAGE.PRODUCTS && activeChapter) {
            // Products under a chapter -> back to that subsection's chapters.
            router.push(buildUrl(activeMain.id, activeSubsection.id));
        } else {
            // Chapters, Notes, or Products directly under a subsection
            // (no chapter level) -> back to the subsections list.
            router.push(buildUrl(activeMain.id));
        }
    }, [router, buildUrl, activeMain, activeSubsection, activeChapter, stage]);

    const jumpToSubsectionsStage = useCallback(() => {
        if (!activeMain) return;
        router.push(buildUrl(activeMain.id));
    }, [router, buildUrl, activeMain]);

    const jumpToSubsectionStage = useCallback(() => {
        if (!activeMain || !activeSubsection) return;
        const subId = activeSubsection.isVirtualNotes ? NOTES_SLUG : activeSubsection.id;
        router.push(buildUrl(activeMain.id, subId));
    }, [router, buildUrl, activeMain, activeSubsection]);

    // ---------------- Auth boot ----------------
    // Runs on every hard page load of /dashboard, including the ones that
    // land here from the exam/review static pages (those are plain
    // `location.href`/`location.replace` navigations, not client-side
    // router pushes, so this whole layout remounts cold each time). On a
    // cold reload, supabase.auth.getSession() reading from localStorage
    // and the cet_session_token cookie sync can occasionally lose a race
    // (storage not fully settled yet) and come back empty for a moment --
    // that's what was causing a flash redirect to /login before bouncing
    // straight back to /dashboard once the real session showed up a beat
    // later. One short retry below absorbs that race instead of bailing
    // to /login on the first empty read.
    useEffect(() => {
        let cancelled = false;

        async function readSession() {
            let { data: { session: sess } } = await supabase.auth.getSession();
            if (!sess) {
                const match = document.cookie.match(/(^| )cet_session_token=([^;]+)/);
                if (match && match[2]) {
                    const { data: syncData } = await supabase.auth.setSession({
                        access_token: match[2],
                        refresh_token: match[2],
                    });
                    if (syncData?.session) sess = syncData.session;
                }
            }
            return sess;
        }

        async function boot() {
            try {
                let sess = await readSession();

                if (!sess && !cancelled) {
                    // First read came back empty -- give storage/cookies a
                    // brief moment to settle, then try exactly once more
                    // before concluding the student really is logged out.
                    await new Promise((resolve) => setTimeout(resolve, 400));
                    if (cancelled) return;
                    sess = await readSession();
                }

                if (cancelled) return;
                if (!sess) {
                    router.replace('/login');
                    return;
                }
                setSession(sess);
            } catch (err) {
                console.error('Auth sync error:', err);
                if (!cancelled) router.replace('/login');
            } finally {
                if (!cancelled) setAuthChecked(true);
            }
        }

        boot();
        const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
            setSession(sess);
        });

        return () => {
            cancelled = true;
            sub?.subscription?.unsubscribe();
        };
    }, [router]);

    // ---------------- Load main sections once authenticated ----------------
    useEffect(() => {
        if (!session) return;
        let cancelled = false;
        fetchMainSections()
            .then((rows) => { if (!cancelled) setMainSections(rows); })
            .catch((err) => console.error('Failed to load main sections:', err));
        return () => { cancelled = true; };
    }, [session]);

    // ---------------- Onboarding open-count (once per boot) ----------------
    useEffect(() => {
        if (!session || openCountedRef.current) return;
        openCountedRef.current = true;
        setDashboardOpenCount(getAndIncrementOpenCount());
    }, [session]);

    // Keep a ref to the current course so background loops below can bail
    // as soon as the student navigates to a different one.
    useEffect(() => {
        activeMainIdRef.current = activeMain?.id ?? null;
    }, [activeMain]);

    // ---------------- Level 1 for EVERY visible course ----------------
    // As soon as the sidebar list is known, fetch just the subsection list
    // for each course -- this is the "1st subsections page" that's kept
    // ready for courses the student hasn't opened yet, and it's what makes
    // switching courses in the sidebar feel instant.
    useEffect(() => {
        mainSections.forEach((section) => ensureSubsections(section.id));
    }, [mainSections, ensureSubsections]);

    // ---------------- Level 2 (+3) for the CURRENTLY OPEN course only ----------------
    // Once that course's subsection list has landed, background-load each
    // subsection's chapters/products. A direct click on a subsection (see
    // handleSelectSubsection) calls ensureSubsectionContent too, which is a
    // no-op here if this loop already started it -- but if the student
    // clicks before this effect gets to it, the click still fires the
    // request immediately rather than waiting its turn.
    useEffect(() => {
        if (!activeMain || !activeSubsections) return;
        activeSubsections.forEach((sub) => {
            if (activeMainIdRef.current !== activeMain.id) return; // student already left this course
            ensureSubsectionContent(activeMain.id, sub.id);
        });
    }, [activeMain, activeSubsections, ensureSubsectionContent]);

    // ---------------- Route-level prefetching (RSC payload, not data) ----------------
    // Everything above pre-loads the SUPABASE DATA for a page ahead of time,
    // but Next.js's router still has to fetch that route's RSC payload the
    // first time you push() to it -- and, since handleBackOneLevel below
    // uses router.push() instead of router.back() (needed so "Back" always
    // goes up the course tree instead of wherever browser history happens
    // to point), a "Back" click no longer gets the automatic instant-cache
    // treatment that true browser back navigation gets for free. We already
    // know exactly which URLs the student can go to next, so just prefetch
    // those routes too, the same way we prefetch their data.
    //
    // IMPORTANT: router.prefetch(href) on its own only does a "partial"
    // prefetch (the static shell up to the nearest loading boundary) for
    // fully-dynamic routes like these -- it does NOT fetch the actual page
    // payload, so the ?_rsc=... request still fires on click even though
    // prefetch() was already called. Passing { kind: 'full' } forces the
    // complete payload to be fetched and cached ahead of time, which is
    // what actually eliminates that request later.
    const prefetchFull = useCallback((href) => {
        try {
            router.prefetch(href, { kind: 'full' });
        } catch (e) {
            router.prefetch(href); // older Next versions without the options arg
        }
    }, [router]);

    // Prefetch the "Back" destination as soon as we know it -- this is the
    // one most likely to otherwise feel slow, since it's a router.push()
    // (see handleBackOneLevel), not a real history-back.
    useEffect(() => {
        if (!activeMain) return;
        if (stage === STAGE.PRODUCTS && activeChapter && activeSubsection) {
            prefetchFull(buildUrl(activeMain.id, activeSubsection.id));
        } else if (stage !== STAGE.SUBSECTIONS) {
            prefetchFull(buildUrl(activeMain.id));
        }
    }, [prefetchFull, buildUrl, activeMain, activeSubsection, activeChapter, stage]);

    // Prefetch every subsection route for the currently open course, once
    // its subsection list has landed -- makes tapping any of them instant.
    useEffect(() => {
        if (!activeMain || !activeSubsections) return;
        activeSubsections.forEach((sub) => {
            const subId = sub.isVirtualNotes ? NOTES_SLUG : sub.id;
            prefetchFull(buildUrl(activeMain.id, subId));
        });
    }, [prefetchFull, buildUrl, activeMain, activeSubsections]);

    // Prefetch every chapter route for the currently open subsection, once
    // its chapters have landed -- makes tapping any chapter instant too.
    useEffect(() => {
        if (!activeMain || !activeSubsection || subsectionContent?.mode !== 'chapters') return;
        (subsectionContent.chapters || []).forEach((chapter) => {
            prefetchFull(buildUrl(activeMain.id, activeSubsection.id, chapter.id));
        });
    }, [prefetchFull, buildUrl, activeMain, activeSubsection, subsectionContent]);

    // ---------------- Restore last-viewed position (once, only at bare /dashboard) ----------------
    useEffect(() => {
        if (mainSections.length === 0 || hasAttemptedRestoreRef.current) return;
        hasAttemptedRestoreRef.current = true;

        if (slug.length > 0) return;

        const { mainId, subsectionId, chapterId } = readLastPosition();
        if (!mainId) return;

        const savedMain = mainSections.find((m) => String(m.id) === String(mainId));
        if (!savedMain) return;

        const subId = subsectionId === NOTES_SUBSECTION_ID ? NOTES_SLUG : subsectionId;
        router.replace(buildUrl(savedMain.id, subId, chapterId));
    }, [mainSections, slug.length, router, buildUrl]);

    // ---------------- Persist position whenever it changes ----------------
    useEffect(() => {
        if (!hasAttemptedRestoreRef.current) return;
        saveLastPosition({
            mainId: activeMain?.id ?? null,
            subsectionId: activeSubsection
                ? (activeSubsection.isVirtualNotes ? NOTES_SUBSECTION_ID : activeSubsection.id)
                : null,
            chapterId: activeChapter?.id ?? null,
        });
    }, [activeMain, activeSubsection, activeChapter]);

    // ---------------- Onboarding tip: nudge toward the section selector ----------------
    useEffect(() => {
        if (mainSections.length === 0 || activeMain) return;
        if (dashboardOpenCount === 0 || dashboardOpenCount > 5) return;

        const timer = setTimeout(() => {
            const isMobile = window.innerWidth <= 900;
            setAttentionTip({
                text: isMobile ? '☰ Tap here to browse your courses' : '👉 Select a section here to study',
                targetId: isMobile ? 'dashboard-hamburger-btn' : 'dashboard-first-section-item',
                arrowSide: isMobile ? 'left' : 'right',
            });
        }, 300);

        return () => clearTimeout(timer);
    }, [mainSections, activeMain, dashboardOpenCount]);

    const handleHamburgerClick = useCallback(() => {
        setAttentionTip(null);
        setMobileSidebarOpen((v) => !v);
    }, []);

    const handleLogout = useCallback(async () => {
        try {
            document.cookie = 'cet_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            await supabase.auth.signOut();
        } finally {
            router.replace('/');
        }
    }, [router]);

    if (!authChecked) {
        return <div className={styles.stateMessage}>Loading dashboard…</div>;
    }

    const contextValue = {
        session,
        mainSections,
        tree,
        treeLoading,
        subsectionContentLoading,
        chapterProductsLoading,
        attemptStatusMap,
        activeMain,
        activeSubsection,
        activeChapter,
        subsectionContent,
        stage,
        handleSelectMain,
        handleSelectSubsection,
        handleSelectChapter,
        handleBackOneLevel,
        jumpToSubsectionsStage,
        jumpToSubsectionStage,
        handleOpenDocument,
    };

    return (
        <DashboardContext.Provider value={contextValue}>
            <DashboardNavbar session={session} onLogout={handleLogout} onHamburgerClick={handleHamburgerClick} />
            <OnboardingCoachmarks />

            {mobileSidebarOpen ? (
                <div
                    className={`${styles.mobileDrawerOverlay} ${styles.overlayOpen}`}
                    onClick={() => setMobileSidebarOpen(false)}
                />
            ) : null}

            {attentionTip ? (
                <AttentionTip
                    text={attentionTip.text}
                    targetId={attentionTip.targetId}
                    arrowSide={attentionTip.arrowSide}
                    onDismiss={() => setAttentionTip(null)}
                />
            ) : null}

            <div className={styles.appLayout}>
                <MainSidebar
                    sections={mainSections}
                    activeId={activeMain?.id}
                    onSelect={handleSelectMain}
                    mobileOpen={mobileSidebarOpen}
                />

                <main className={styles.main}>
                    {!activeMain ? (
                        <div className={styles.welcomeScreen}>
                            <div className={styles.welcomeEmoji}>📚</div>
                            <h2>What are you planning to study today?</h2>
                            <p>Pick a section from the panel on the left to jump back into your material.</p>
                        </div>
                    ) : (
                        children
                    )}
                </main>
            </div>

            {activeDocument ? (
                <DocumentViewer
                    product={activeDocument}
                    accessToken={session?.access_token}
                    onClose={handleCloseDocument}
                />
            ) : null}
        </DashboardContext.Provider>
    );
}
