'use client';

// components/dashboard/MainSidebar.js
//
// Left panel: lists ONLY sidebar_main_sections rows. Clicking one notifies
// the parent (app/dashboard/page.js), which swaps the right-hand panel.
// This panel itself never re-renders its list based on selection -- only
// the active highlight changes.

import styles from './dashboard.module.css';
import { resolveImageUrl } from '@/lib/resolveImageUrl';

export default function MainSidebar({ sections, activeId, onSelect, mobileOpen }) {
    return (
        <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''}`}>
            <div className={styles.sidebarLabel}>Sections</div>
            <nav className={styles.sidebarNav}>
                {sections.map((section, index) => (
                    <button
                        key={section.id}
                        type="button"
                        id={index === 0 ? 'dashboard-first-section-item' : undefined}
                        className={`${styles.sidebarItem} ${activeId === section.id ? styles.sidebarItemActive : ''}`}
                        onClick={() => onSelect(section)}
                    >
                        {section.icon_url ? (
                            <img
                                src={resolveImageUrl(section.icon_url)}
                                alt=""
                                className={styles.sidebarIcon}
                            />
                        ) : (
                            <span className={styles.sidebarIconFallback}>{section.name.charAt(0)}</span>
                        )}
                        <span className={styles.sidebarItemLabel}>{section.name}</span>
                        {section.badge_label ? (
                            <span className={styles.sidebarBadge}>{section.badge_label}</span>
                        ) : null}
                    </button>
                ))}
                {sections.length === 0 ? (
                    <div className={styles.sidebarEmpty}>No sections yet.</div>
                ) : null}
            </nav>
        </aside>
    );
}