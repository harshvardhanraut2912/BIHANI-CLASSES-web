'use client';

// components/dashboard/NotesPanel.js
//
// The "Notes" box every course gets by default on the dashboard (added
// automatically in app/dashboard/page.js, not a real sidebar_subsections
// row). Opening it skips chapters/products entirely -- it's just a plain
// screen showing whatever plain text is in that course's
// sidebar_main_sections.notes column, editable from Admin -> Products ->
// course modal.

import styles from './dashboard.module.css';

export default function NotesPanel({ text }) {
    if (!text || !text.trim()) {
        return (
            <div className={styles.stateMessage}>
                No notes have been added for this course yet.
            </div>
        );
    }

    return (
        <div
            style={{
                background: 'var(--white, #fff)',
                border: '1px solid var(--card-border, rgba(226, 232, 240, 0.8))',
                borderRadius: 'var(--radius-lg, 14px)',
                padding: '24px',
                fontSize: '14.5px',
                lineHeight: 1.7,
                color: 'var(--text-main, #0f172a)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
            }}
        >
            {text}
        </div>
    );
}