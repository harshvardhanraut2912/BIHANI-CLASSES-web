'use client';

// components/dashboard/ChapterGrid.js
//
// Right panel, stage 2 (only reached when the selected subsection has
// chapters): shows chapters as boxes, e.g. "Rotational Dynamics",
// "Mechanical Properties of Fluids" under Physics.

import styles from './dashboard.module.css';
import { resolveImageUrl } from '@/lib/resolveImageUrl';

export default function ChapterGrid({ subsectionName, chapters, onSelect, loading }) {
    if (loading) {
        return <div className={styles.stateMessage}>Loading chapters…</div>;
    }

    if (chapters.length === 0) {
        return <div className={styles.stateMessage}>No chapters added under {subsectionName} yet.</div>;
    }

    return (
        <div className={styles.cardGrid}>
            {chapters.map((chapter) => (
                <button
                    key={chapter.id}
                    type="button"
                    className={styles.gridCard}
                    onClick={() => onSelect(chapter)}
                >
                    <span className={styles.gridCardIconWrap}>
                        {chapter.icon_url ? (
                            <img
                                src={resolveImageUrl(chapter.icon_url)}
                                alt=""
                                className={styles.gridCardIcon}
                            />
                        ) : (
                            <span className={styles.gridCardIconFallback}>{chapter.name.charAt(0)}</span>
                        )}
                    </span>
                    <span className={styles.gridCardLabel}>{chapter.name}</span>
                    <span className={styles.gridCardArrow}>›</span>
                </button>
            ))}
        </div>
    );
}