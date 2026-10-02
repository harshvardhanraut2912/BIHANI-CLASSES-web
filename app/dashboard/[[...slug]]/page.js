'use client';

// app/dashboard/[[...slug]]/page.js
//
// Deliberately thin: all state (session, mainSections, tree, handlers)
// lives in ../layout.js, which persists across navigation. This file just
// reads that state via useDashboard() and renders whichever grid the
// current stage calls for. Being lightweight here is what stops the
// flicker/refetch -- Next.js DOES remount page.js on every navigation
// (that's normal, unavoidable App Router behavior), but since there's no
// data-fetching or top-level state left in it, remounting it is now free.

import { useDashboard, STAGE, notesVirtualSubsection } from '../layout';
import SubsectionGrid from '@/components/dashboard/SubsectionGrid';
import ChapterGrid from '@/components/dashboard/ChapterGrid';
import ProductGrid from '@/components/dashboard/ProductGrid';
import PanelHeader from '@/components/dashboard/PanelHeader';
import NotesPanel from '@/components/dashboard/NotesPanel';

export default function DashboardStagePage() {
    const {
        session,
        tree,
        treeLoading,
        attemptStatusMap,
        activeMain,
        activeSubsection,
        activeChapter,
        subsectionContent,
        subsectionContentLoading,
        chapterProductsLoading,
        stage,
        handleSelectSubsection,
        handleSelectChapter,
        handleBackOneLevel,
        jumpToSubsectionsStage,
        jumpToSubsectionStage,
        handleOpenDocument,
    } = useDashboard();

    // activeMain is guaranteed non-null here -- the layout only renders
    // {children} (this page) once a main section is active; otherwise it
    // shows the welcome screen itself.

    const chapters = subsectionContent?.mode === 'chapters' ? subsectionContent.chapters : [];
    const products = stage === STAGE.PRODUCTS
        ? (activeChapter
            ? (subsectionContent?.productsByChapter?.[activeChapter.id] || [])
            : (subsectionContent?.products || []))
        : [];

    const trail = [];
    if (activeMain) {
        trail.push({
            label: activeMain.name,
            onClick: stage !== STAGE.SUBSECTIONS ? jumpToSubsectionsStage : undefined,
        });
    }
    if (activeSubsection && (stage === STAGE.CHAPTERS || stage === STAGE.PRODUCTS || stage === STAGE.NOTES)) {
        trail.push({
            label: activeSubsection.name,
            onClick: stage === STAGE.PRODUCTS && activeChapter ? jumpToSubsectionStage : undefined,
        });
    }
    if (activeChapter && stage === STAGE.PRODUCTS) {
        trail.push({ label: activeChapter.name });
    }

    return (
        <>
            <PanelHeader trail={trail} showBack={stage !== STAGE.SUBSECTIONS} onBack={handleBackOneLevel} />

            {stage === STAGE.SUBSECTIONS && (
                <SubsectionGrid
                    mainSectionName={activeMain.name}
                    subsections={
                        activeMain.is_course
                            ? [notesVirtualSubsection, ...(tree?.subsections || [])]
                            : (tree?.subsections || [])
                    }
                    onSelect={handleSelectSubsection}
                    loading={treeLoading}
                />
            )}

            {stage === STAGE.NOTES && (
                <NotesPanel text={activeMain.notes} />
            )}

            {stage === STAGE.CHAPTERS && (
                <ChapterGrid
                    subsectionName={activeSubsection?.name}
                    chapters={chapters}
                    onSelect={handleSelectChapter}
                    loading={subsectionContentLoading}
                />
            )}

            {stage === STAGE.PRODUCTS && (
                <ProductGrid
                    heading={activeChapter?.name || activeSubsection?.name}
                    products={products}
                    loading={activeChapter ? chapterProductsLoading : subsectionContentLoading}
                    studentEmail={session?.user?.email}
                    attemptStatusMap={attemptStatusMap}
                    onOpenDocument={handleOpenDocument}
                />
            )}
        </>
    );
}