'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import styles from './home.module.css';

const LINKS = [
  { label: 'Home', url: '/' },
  { label: 'Courses', url: '/cources' },
  { label: 'Dashboard', url: '/dashboard' },
  { label: 'Contact', url: '/contact' },
];

export default function HomeNavbar({ fontClass = '' }) {
  const [session, setSession] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSession(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    const closeMenu = () => setMenuOpen(false);
    document.addEventListener('click', closeMenu);
    return () => { alive = false; sub.subscription.unsubscribe(); document.removeEventListener('click', closeMenu); };
  }, []);

  async function logout() {
    try { await supabase.auth.signOut(); } catch (e) {}
    document.cookie = 'cet_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
    window.location.replace('/');
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
        <div className={styles.authZone}>
          {session ? (
            <>
              <button type="button" className={styles.avatar} aria-label="Account menu" onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}>
                {avatarUrl && !avatarBroken ? (
                  <img src={avatarUrl} alt="Profile" referrerPolicy="no-referrer" onError={() => setAvatarBroken(true)} />
                ) : email.charAt(0)}
              </button>
              <div className={`${styles.menu} ${menuOpen ? styles.on : ''}`} onClick={(e) => e.stopPropagation()}>
                <div className={styles.menuHead}>{email}</div>
                <a href="/dashboard" className={styles.menuItem}>My Dashboard</a>
                <a href="/profile" className={styles.menuItem}>My Profile</a>
                <button type="button" className={`${styles.menuItem} ${styles.menuOut}`} onClick={logout}>Logout</button>
              </div>
            </>
          ) : (<a href="/login" className={styles.btnLogin}>Sign In</a>)}
        </div>
        <div className={styles.quickSignin}>{!session && <a href="/login" className={styles.btnLogin}>Sign In</a>}</div>
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
            <button type="button" className={`${styles.menuItem} ${styles.menuOut}`} onClick={logout}>Logout</button>
          </>
        ) : (<a href="/login" className={styles.btnLogin}>Sign In</a>)}
      </aside>
    </div>
  );
}
