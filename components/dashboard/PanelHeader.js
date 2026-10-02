'use client';

// components/dashboard/PanelHeader.js
//
// Heading + back button + breadcrumb trail for the right-hand panel.
// `trail` is an array of { label, onClick } — onClick omitted/undefined
// for the current (last) crumb.

import styles from './dashboard.module.css';

export default function PanelHeader({ trail, onBack, showBack }) {
    // On mobile the full "Main / Subsection / Chapter" chain wraps onto
    // multiple lines and looks messy, so only the single most-relevant
    // crumb is shown there (see .mobileCrumb / .breadcrumb media query
    // toggle below) -- always the LAST entry in the trail, which is
    // exactly "whichever level you're one step below": browsing a
    // section's subsections shows the section name, browsing a
    // subsection's chapters shows the subsection name, browsing a
    // chapter's products shows the chapter name.
    const currentLabel = trail.length ? trail[trail.length - 1].label : '';

    return (
        <div className={`${styles.panelHeader} ${styles.panelHeaderShrink}`}>
            {showBack ? (
                <button type="button" className={styles.backBtn} onClick={onBack}>
                    ‹ Back
                </button>
            ) : null}

            <div className={styles.breadcrumb}>
                {trail.map((crumb, i) => (
                    <span key={i} className={styles.breadcrumbSegment}>
                        {crumb.onClick ? (
                            <button type="button" className={styles.breadcrumbLink} onClick={crumb.onClick}>
                                {crumb.label}
                            </button>
                        ) : (
                            <span className={styles.breadcrumbCurrent}>{crumb.label}</span>
                        )}
                        {i < trail.length - 1 ? <span className={styles.breadcrumbSep}>/</span> : null}
                    </span>
                ))}
            </div>

            <div className={styles.mobileCrumb}>{currentLabel}</div>
        </div>
    );
}
