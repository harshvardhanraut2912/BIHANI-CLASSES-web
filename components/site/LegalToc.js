'use client';

import { useEffect, useState } from 'react';
import s from './site.module.css';

// Sticky "On this page" list with scroll-spy. On phones it becomes a
// horizontally scrolling row of chips (see site.module.css).
export default function LegalToc({ items }) {
  const [active, setActive] = useState(items[0]?.id);

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: '-18% 0px -68% 0px', threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items]);

  function go(e, id) {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try { history.replaceState(null, '', `#${id}`); } catch (err) {}
    setActive(id);
  }

  return (
    <nav aria-label="On this page" className={s.toc}>
      <p className={s.tocTitle}>On this page</p>
      <ol className={s.tocList}>
        {items.map((i, n) => (
          <li key={i.id}>
            <a href={`#${i.id}`} onClick={(e) => go(e, i.id)} className={`${s.tocLink} ${active === i.id ? s.tocOn : ''}`}>
              <span className={s.tocNo}>{String(n + 1).padStart(2, '0')}</span>
              {i.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
