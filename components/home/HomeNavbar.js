'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './home.module.css';

const LINKS = [
  { label: 'Home', url: '/' },
  { label: 'Courses', url: '/cources' },
  { label: 'Gallery', url: '/gallery' },
  { label: 'Dashboard', url: '/dashboard' },
  { label: 'Contact', url: '/contact' },
];

export default function HomeNavbar({ fontClass = '' }) {
  const [session, setSession] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [dark, setDark] = useState(false);
  const zoneRef = useRef(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    try { setDark(localStorage.getItem('theme') === 'dark'); } catch (e) {}
    // Close only when the click lands OUTSIDE the avatar/menu zone. (Next's app router
    // roots React at `document`, so stopPropagation can't be used to protect the toggle.)
    const closeMenu = (e) => { if (zoneRef.current && zoneRef.current.contains(e.target)) return; setMenuOpen(false); };
    const closeOnEsc = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', closeOnEsc);
    document.addEventListener('click', closeMenu);
    return () => { alive = false; sub.subscription.unsubscribe(); document.removeEventListener('click', closeMenu); document.removeEventListener('keydown', closeOnEsc); };
  }, []);

  async function logout() {
    try { await supabase.auth.signOut(); } catch (e) {}
    document.cookie = 'cet_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    window.location.replace('/');
  }

  function toggleTheme(e) {
    const on = e.target.checked;
    setDark(on);
    const t = on ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (err) {}
  }

  const email = session?.user?.email || 'User';
  const avatarUrl = session?.user?.user_metadata?.avatar_url || session?.user?.user_metadata?.picture || '';

  return (
    <div className={`${styles.navWrap} ${fontClass}`}>
      <nav className={styles.nav}>
        <a href="/" className={styles.brand}>
          <img src="/images/other_images/bihaniclasses-logo.png" alt="Bihani Chemistry Classes logo" className={styles.brandLogo} />
          <span className={styles.brandWords}>
            <span className={styles.brandText}>Bihani Classes</span>
            <span className={styles.brandTag}>Chemistry · Sangamner</span>
          </span>
        </a>
        <div className={styles.links}>
          {LINKS.map((l) => (<a key={l.url} href={l.url} className={styles.link}>{l.label}</a>))}
        </div>
        <div className={styles.authZone} ref={zoneRef}>
          {session ? (
            <>
              <button type="button" className={styles.avatar} aria-label="Account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
                {avatarUrl && !avatarBroken ? (
                  <img src={avatarUrl} alt="Profile" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} />
                ) : email.charAt(0)}
              </button>
              <div className={`${styles.menu} ${menuOpen ? styles.on : ''}`}>
                <div className={styles.menuHead}>{email}</div>
                <a href="/dashboard" className={styles.menuItem}>My Dashboard</a>
                <a href="/profile" className={styles.menuItem}>My Profile</a>
                <div className={styles.themeRow}>
                  <span className={styles.themeLabel}>Dark Mode</span>
                  <label className={styles.switch}>
                    <input type="checkbox" checked={dark} onChange={toggleTheme} aria-label="Toggle dark mode" />
                    <span className={styles.slider} />
                  </label>
                </div>
                <button type="button" className={`${styles.menuItem} ${styles.menuOut}`} onClick={logout}>Logout</button>
              </div>
            </>
          ) : (<a href="/login" className={styles.btnLogin}>Sign In</a>)}
        </div>
        {!session && <div className={styles.quickSignin}><a href="/login" className={styles.btnLogin}>Sign In</a></div>}
        <button type="button" className={styles.burger} aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="#172a85"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>
        </button>
      </nav>
      <div className={`${styles.overlay} ${drawerOpen ? styles.on : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`${styles.drawer} ${drawerOpen ? styles.on : ''}`}>
        {LINKS.map((l) => (<a key={l.url} href={l.url} className={styles.link}>{l.label}</a>))}
        {session ? (
          <>
            <a href="/profile" className={styles.link}>My Profile</a>
            <div className={styles.themeRow}>
              <span className={styles.themeLabel}>Dark Mode</span>
              <label className={styles.switch}>
                <input type="checkbox" checked={dark} onChange={toggleTheme} aria-label="Toggle dark mode" />
                <span className={styles.slider} />
              </label>
            </div>
            <button type="button" className={`${styles.menuItem} ${styles.menuOut}`} onClick={logout}>Logout</button>
          </>
        ) : (<a href="/login" className={styles.btnLogin}>Sign In</a>)}
      </aside>
    </div>
  );
}
