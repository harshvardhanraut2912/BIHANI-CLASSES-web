// components/admin/AdminNavbar.js  (new file)
//
// Admin navbar -- same layout, height, logo lockup, typography and mobile
// drawer as the main-site homepage navbar (components/home/HomeNavbar.js),
// but with square buttons, no hover animations, and admin links.
'use client';

import { useEffect, useRef, useState } from 'react';
import s from './adminShell.module.css';

const LINKS = [
  { label: 'Dashboard', url: '/admin' },
  { label: 'CMS', url: '/admin/cms-v2' },
  { label: 'Users', url: '/admin/users' },
  { label: 'Products', url: '/admin/products' },
  { label: 'Inquiries', url: '/admin/inquiries' },
];

export default function AdminNavbar({ fontClass = '', onLogout, loggingOut = false }) {
  const [me, setMe] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const zoneRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setMe(d); })
      .catch(() => {});

    // Close the account menu only when the click lands OUTSIDE the avatar/menu zone.
    const closeMenu = (e) => { if (zoneRef.current && zoneRef.current.contains(e.target)) return; setMenuOpen(false); };
    const closeOnEsc = (e) => { if (e.key === 'Escape') { setMenuOpen(false); setDrawerOpen(false); } };
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', closeOnEsc);
    return () => {
      alive = false;
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('keydown', closeOnEsc);
    };
  }, []);

  const email = me?.email || 'Administrator';
  const role = me?.role || 'Admin';

  return (
    <div className={`${s.navWrap} ${fontClass}`}>
      <nav className={s.nav}>
        <a href="/admin" className={s.brand}>
          <img src="/images/other_images/bihaniclasses-logo.png" alt="Bihani Chemistry Classes logo" className={s.brandLogo} />
          <span className={s.brandWords}>
            <span className={s.brandText}>Bihani Classes</span>
            <span className={s.brandTag}>Admin Panel</span>
          </span>
        </a>

        <div className={s.links}>
          {LINKS.map((l, i) => (
            <a key={l.url} href={l.url} className={`${s.link} ${i === 0 ? s.linkActive : ''}`}>{l.label}</a>
          ))}
        </div>

        <div className={s.authZone} ref={zoneRef}>
          <button type="button" className={s.avatar} aria-label="Account menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            {email.charAt(0)}
          </button>
          <div className={`${s.menu} ${menuOpen ? s.on : ''}`}>
            <div className={s.menuHead}>
              <div className={s.menuEmail}>{email}</div>
              <div className={s.menuRole}>{role}</div>
            </div>
            <a href="/admin" className={s.menuItem}>Dashboard</a>
            <button type="button" className={`${s.menuItem} ${s.menuOut}`} onClick={onLogout} disabled={loggingOut}>
              {loggingOut ? 'Logging out...' : 'Logout'}
            </button>
          </div>
        </div>

        <button type="button" className={s.burger} aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
          <svg viewBox="0 0 24 24" width="32" height="32" fill="#172a85"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" /></svg>
        </button>
      </nav>

      <div className={`${s.overlay} ${drawerOpen ? s.on : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`${s.drawer} ${drawerOpen ? s.on : ''}`}>
        {LINKS.map((l) => (<a key={l.url} href={l.url} className={s.link}>{l.label}</a>))}
        <button type="button" className={`${s.link} ${s.menuItem} ${s.menuOut}`} onClick={onLogout} disabled={loggingOut}>
          {loggingOut ? 'Logging out...' : 'Logout'}
        </button>
      </aside>
    </div>
  );
}
