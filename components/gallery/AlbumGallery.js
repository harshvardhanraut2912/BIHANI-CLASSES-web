'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './gallery.module.css';

/* ---------- Full-screen viewer (rendered on <body> so page zoom/overflow can't clip it) ---------- */
function Lightbox({ album, index, onClose, onMove }) {
  const img = album.images[index];
  const touchX = useRef(null);
  const total = album.images.length;

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onMove(1);
      if (e.key === 'ArrowLeft') onMove(-1);
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose, onMove]);

  // warm the neighbours so next/prev feels instant
  useEffect(() => {
    [1, -1].forEach((d) => { const n = album.images[(index + d + total) % total]; if (n) new Image().src = n.src; });
  }, [index, album, total]);

  return createPortal(
    <div className={s.lb} role="dialog" aria-modal="true" aria-label={`${album.label} photo viewer`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? 0);
        if (total > 1 && Math.abs(dx) > 50) onMove(dx < 0 ? 1 : -1);
      }}>
      <button type="button" className={s.lbClose} onClick={onClose} aria-label="Close">×</button>
      {total > 1 && <button type="button" className={`${s.lbNav} ${s.lbPrev}`} onClick={() => onMove(-1)} aria-label="Previous photo">‹</button>}
      <img key={img.src} src={img.src} alt={`${album.label} photo ${index + 1}`} className={s.lbImg} draggable={false} />
      {total > 1 && <button type="button" className={`${s.lbNav} ${s.lbNext}`} onClick={() => onMove(1)} aria-label="Next photo">›</button>}
      <div className={s.lbCap} style={{ '--accent': album.accent }}><b>{album.label}</b> · {index + 1} / {total}</div>
    </div>,
    document.body
  );
}

/* ---------- Album picker + abstract (masonry) arrangement ---------- */
export default function AlbumGallery({ albums }) {
  const [slug, setSlug] = useState(albums[0].slug);
  const [open, setOpen] = useState(null); // index of photo in lightbox

  useEffect(() => {
    const want = new URLSearchParams(window.location.search).get('album');
    if (want && albums.some((a) => a.slug === want)) setSlug(want);
  }, [albums]);

  const album = albums.find((a) => a.slug === slug) || albums[0];
  const total = album.images.length;

  const choose = (a) => {
    setSlug(a.slug); setOpen(null);
    try { window.history.replaceState(null, '', `?album=${a.slug}#albums`); } catch (e) { /* ignore */ }
  };
  const move = useCallback((d) => setOpen((o) => (o === null ? o : (o + d + total) % total)), [total]);
  const close = useCallback(() => setOpen(null), []);

  return (
    <div className={s.albums} style={{ '--accent': album.accent }}>
      <aside className={s.side}>
        <p className={s.eyebrowSm}>Album</p>
        <h3 className={s.albumTitle}>{album.label}</h3>
        <p className={s.count}>{total} {total === 1 ? 'PHOTO' : 'PHOTOS'}</p>
        {album.blurb && <p className={s.blurb}>{album.blurb}</p>}

        {albums.length > 1 && (
          <div className={s.pills} role="tablist" aria-label="Choose album">
            {albums.map((a) => (
              <button key={a.slug} type="button" role="tab" aria-selected={a.slug === album.slug}
                className={s.pill} style={{ '--accent': a.accent }} onClick={() => choose(a)}>
                <span className={s.pillDot} />
                <span className={s.pillName}>{a.label}</span>
                <span className={s.pillNum}>{a.images.length}</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <div className={s.masonry} key={album.slug}>
        {album.images.map((im, k) => (
          <button key={im.src} type="button" className={s.tile} style={{ '--i': Math.min(k, 14) }}
            onClick={() => setOpen(k)} aria-label={`Open ${album.label} photo ${k + 1}`}>
            <img src={im.src} alt={`${album.label} photo ${k + 1}`} width={im.w || undefined} height={im.h || undefined}
              loading={k < 6 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
            <span className={s.zoomIcon} aria-hidden="true">⤢</span>
          </button>
        ))}
      </div>

      {open !== null && <Lightbox album={album} index={open} onClose={close} onMove={move} />}
    </div>
  );
}
