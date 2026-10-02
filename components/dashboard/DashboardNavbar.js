'use client';

// components/dashboard/DashboardNavbar.js
//
// Reuses the SAME global classes already defined + themed in app/globals.css
// (.navbar, .nav-brand, .nav-brand-text, .profile-trigger, .dropdown-menu,
// .theme-toggle-row, etc. -- including dark mode) instead of inventing new
// CSS. This is what was missing from the dashboard page before: it never
// rendered a <nav> at all.

import { useState, useEffect, useRef } from 'react';
import styles from './dashboard.module.css';

export default function DashboardNavbar({ session, onLogout, onHamburgerClick }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isDark, setIsDark] = useState(false);
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
        <nav className={`navbar ${styles.navbarShrink}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                    type="button"
                    id="dashboard-hamburger-btn"
                    className={styles.hamburgerBtn}
                    onClick={onHamburgerClick}
                    aria-label="Open menu"
                >
                    <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
                        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                    </svg>
                </button>
                <a href="/" className={`nav-brand ${styles.navBrandWrap}`}>
                    <span className={styles.navLogoWrap}>
                        <img
                            src="/images/other_images/ynclasses-logo.png"
                            alt="Y N Classes Logo"
                            className={`nav-logo-img ${styles.navLogoImg}`}
                        />
                    </span>
                    <span className={`nav-brand-text ${styles.navBrandText}`}>Y N CLASSES</span>
                </a>
            </div>

            <div className="nav-auth-zone" ref={wrapRef}>
                {session ? (
                    <div style={{ position: 'relative' }}>
                        <div
                            className="profile-trigger"
                            onClick={(e) => { e.stopPropagation(); setDropdownOpen((v) => !v); }}
                        >
                            {avatarUrl ? <img src={avatarUrl} alt="Profile" referrerPolicy="no-referrer" /> : initial}
                        </div>
                        <div className={`dropdown-menu${dropdownOpen ? ' active' : ''}`}>
                            <div className="dropdown-header">{email}</div>
                            <a href="/profile" className="dropdown-item">My Profile</a>

                            <div className="theme-toggle-row">
                                <span className="theme-label">Dark Mode</span>
                                <label className="theme-switch">
                                    <input type="checkbox" checked={isDark} onChange={toggleTheme} />
                                    <span className="theme-slider"></span>
                                </label>
                            </div>

                            <a href="/shop" className="dropdown-item">Purchase History</a>
                            <div
                                className="dropdown-item"
                                style={{ color: '#ef4444', cursor: 'pointer' }}
                                onClick={onLogout}
                            >
                                Logout
                            </div>
                        </div>
                    </div>
                ) : (
                    <a href="/login" className="btn-login">Sign In</a>
                )}
            </div>
        </nav>
    );
}