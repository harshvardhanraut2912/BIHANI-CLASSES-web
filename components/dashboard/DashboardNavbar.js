'use client';

// components/dashboard/DashboardNavbar.js
//
// Bihani Classes dashboard top bar. Same session/theme/logout props and
// behaviour as before -- only the markup + styling changed (own CSS module
// classes, Bihani logo/brand, quick links, "Student Dashboard" pill).

import { useState, useEffect, useRef } from 'react';
import styles from './dashboard.module.css';

export default function DashboardNavbar({ session, onLogout, onHamburgerClick }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const [avatarBroken, setAvatarBroken] = useState(false);
    const wrapRef = useRef(null);

    useEffect(() => {
        const saved = localStorage.getItem('theme') || 'light';
        setIsDark(saved === 'dark');
    }, []);

    useEffect(() => {
        function handleOutsideClick(e) {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, []);

    function toggleTheme(e) {
        const next = e.target.checked ? 'dark' : 'light';
        setIsDark(e.target.checked);
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
    }

    const email = session?.user?.email || '';
    const initial = email.charAt(0).toUpperCase();
    const avatarUrl = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || '';

    return (
        <nav className={styles.topbar}>
            <div className={styles.topLeft}>
                <button
                    type="button"
                    id="dashboard-hamburger-btn"
                    className={styles.hamburgerBtn}
                    onClick={onHamburgerClick}
                    aria-label="Open menu"
                >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                    </svg>
                </button>
                <a href="/" className={styles.brand}>
                    <img
                        src="/images/other_images/bihaniclasses-logo.png"
                        alt="Bihani Chemistry Classes logo"
                        className={styles.brandLogo}
                    />
                    <span className={styles.brandWords}>
                        <span className={styles.brandText}>Bihani Classes</span>
                        <span className={styles.brandTag}>Chemistry · Sangamner</span>
                    </span>
                </a>
            </div>

            <div className={styles.topLinks}>
                <a href="/" className={styles.topLink}>Home</a>
                <a href="/cources" className={styles.topLink}>Courses</a>
                <a href="/dashboard" className={`${styles.topLink} ${styles.topLinkActive}`}>Dashboard</a>
                <a href="/contact" className={styles.topLink}>Contact</a>
            </div>

            <div className={styles.topRight} ref={wrapRef}>
                <span className={styles.deskPill}>
                    <span className={styles.deskPillDot} />
                    Student Desk
                </span>
                {session ? (
                    <>
                        <button
                            type="button"
                            className={styles.avatar}
                            aria-label="Account menu"
                            aria-expanded={dropdownOpen}
                            onClick={(e) => { e.stopPropagation(); setDropdownOpen((v) => !v); }}
                        >
                            {avatarUrl && !avatarBroken ? (
                                <img src={avatarUrl} alt="Profile" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} />
                            ) : initial}
                        </button>
                        <div className={`${styles.menu} ${dropdownOpen ? styles.menuOpen : ''}`}>
                            <div className={styles.menuHead}>{email}</div>
                            <a href="/profile" className={styles.menuItem}>My Profile</a>
                            <a href="/cources" className={styles.menuItem}>Explore Courses</a>

                            <div className={styles.themeRow}>
                                <span className={styles.themeLabel}>Dark Mode</span>
                                <label className={styles.switch}>
                                    <input type="checkbox" checked={isDark} onChange={toggleTheme} />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>

                            <a href="/shop" className={styles.menuItem}>Purchase History</a>
                            <button type="button" className={`${styles.menuItem} ${styles.menuOut}`} onClick={onLogout}>
                                Logout
                            </button>
                        </div>
                    </>
                ) : (
                    <a href="/login" className={styles.signIn}>Sign In</a>
                )}
            </div>
        </nav>
    );
}
