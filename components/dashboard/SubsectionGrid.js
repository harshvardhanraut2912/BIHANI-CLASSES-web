'use client';

// components/dashboard/SubsectionGrid.js
//
// Right panel, stage 1: shows the subsections of the currently selected
// main section as boxes with an icon, name, and a ">" arrow -- same idea
// as the Physics/Chemistry/Maths grid in the reference screenshot.

import styles from './dashboard.module.css';
import { resolveImageUrl } from '@/lib/resolveImageUrl';
import LoadingAnimation from '@/components/common/LoadingAnimation';

export default function SubsectionGrid({ mainSectionName, subsections, onSelect, loading }) {
    if (loading) {
        return <LoadingAnimation message="Loading your content…" />;
    }

    if (subsections.length === 0) {
        return <div className={styles.stateMessage}>Nothing has been added under {mainSectionName} yet.</div>;
    }

    return (
        <>
            <div className={styles.batchBanner}>
                <div className={styles.batchBannerText}>
                    <span className={styles.batchBannerEyebrow}>Currently studying</span>
                    <h1 className={styles.batchBannerTitle}>{mainSectionName}</h1>
                    <span className={styles.batchBannerMeta}>
                        {`${subsections.length} ${subsections.length === 1 ? 'section' : 'sections'} available · Notes, tests & practice material`}
                    </span>
                </div>
                <div className={styles.bannerCountWrap} aria-hidden="true">
                    <span className={styles.bannerCount}>{String(subsections.length).padStart(2, '0')}</span>
                    <span className={styles.bannerCountLabel}>{subsections.length === 1 ? 'Section' : 'Sections'}</span>
                </div>
            </div>

            <div className={styles.gridHeading}>Sections</div>
            <div className={styles.cardGrid}>
                {subsections.map((sub, i) => (
                    <button
                        key={sub.id}
                        type="button"
                        className={styles.gridCard}
                        onClick={() => onSelect(sub)}
                    >
                        <span className={styles.tileTop}>
                            <span className={styles.gridCardIconWrap}>
                                {sub.icon_url ? (
                                    <img
                                        src={resolveImageUrl(sub.icon_url)}
                                        alt=""
                                        className={styles.gridCardIcon}
                                    />
                                ) : (
                                    <span className={styles.gridCardIconFallback}>{sub.name.charAt(0)}</span>
                                )}
                            </span>
                            <span className={styles.tileNo}>{String(i + 1).padStart(2, '0')}</span>
                        </span>
                        <span className={styles.gridCardLabel}>{sub.name}</span>
                        <span className={styles.gridCardArrow}>Open <span aria-hidden="true">→</span></span>
                    </button>
                ))}
            </div>

            <div className={styles.helpStrip}>
                <div className={styles.helpStripItem}>
                    <span className={styles.helpStripIcon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4z" /></svg></span>
                    <div>
                        <div className={styles.helpStripTitle}>Stuck on a topic?</div>
                        <div className={styles.helpStripText}>Revisit chapter-wise notes anytime from the Notes section.</div>
                    </div>
                </div>
                <div className={styles.helpStripItem}>
                    <span className={styles.helpStripIcon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 9h6M9 13h6M9 17h3" /></svg></span>
                    <div>
                        <div className={styles.helpStripTitle}>Practice regularly</div>
                        <div className={styles.helpStripText}>Chapterwise and full-syllabus tests track your progress automatically.</div>
                    </div>
                </div>
                <div className={styles.helpStripItem}>
                    <span className={styles.helpStripIcon}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H9l-5 4z" /></svg></span>
                    <div>
                        <div className={styles.helpStripTitle}>Need help?</div>
                        <div className={styles.helpStripText}>Reach out to Bihani Classes for doubts or guidance anytime.</div>
                    </div>
                </div>
            </div>
        </>
    );
}