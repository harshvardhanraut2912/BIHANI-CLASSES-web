'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import s from './gallery.module.css';

const INTERVAL = 5000; // ms between banners

export default function PosterCarousel({ posters }) {
  const n = posters.length;
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false); // user pressed pause
  const [hold, setHold] = useState(false); // pointer is on the banner
  const [tick, setTick] = useState(0); // bumps on manual change to restart the 5s timer
  const touchX = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPaused(true);
  }, []);

  const go = useCallback((d) => { setI((v) => (v + d + n) % n); setTick((t) => t + 1); }, [n]);
  const goTo = (k) => { setI(k); setTick((t) => t + 1); };

  useEffect(() => {
    if (n < 2 || paused || hold) return undefined;
    const id = setTimeout(() => { setI((v) => (v + 1) % n); setTick((t) => t + 1); }, INTERVAL);
    return () => clearTimeout(id);
  }, [i, tick, paused, hold, n]);

  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };

  return (
    <div className={s.carousel} role="region" aria-roledescription="carousel" aria-label="Bihani Classes posters">
      <div
        className={s.stage}
        tabIndex={0}
        onKeyDown={onKey}
        onMouseEnter={() => setHold(true)}
        onMouseLeave={() => setHold(false)}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; setHold(true); }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (touchX.current ?? 0);
          if (n > 1 && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null; setHold(false);
        }}
      >
        {posters.map((p, k) => (
          <div key={p.src} className={`${s.slide} ${k === i ? s.on : ''}`} aria-hidden={k !== i}>
            <img src={p.src} alt="" className={s.slideBg} loading={k === 0 ? 'eager' : 'lazy'} decoding="async" />
            <img src={p.src} alt={`Bihani Chemistry Classes poster ${k + 1}`} className={s.slideImg}
              loading={k === 0 ? 'eager' : 'lazy'} decoding="async" fetchPriority={k === 0 ? 'high' : 'auto'} draggable={false} />
          </div>
        ))}

        {n > 1 && (
          <>
            <button type="button" className={`${s.arrow} ${s.prev}`} onClick={() => go(-1)} aria-label="Previous poster">‹</button>
            <button type="button" className={`${s.arrow} ${s.next}`} onClick={() => go(1)} aria-label="Next poster">›</button>
            <div className={s.counter}>{i + 1} / {n}</div>
            <button type="button" className={s.playBtn} onClick={() => setPaused((v) => !v)} aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}>
              {paused ? '▶' : '❚❚'}
            </button>
            {!paused && !hold && <div key={`${i}-${tick}`} className={s.progress} style={{ animationDuration: `${INTERVAL}ms` }} />}
          </>
        )}
      </div>

      {n > 1 && (
        <div className={s.dots} role="tablist" aria-label="Choose poster">
          {posters.map((p, k) => (
            <button key={p.src} type="button" role="tab" aria-selected={k === i} aria-label={`Poster ${k + 1}`}
              className={`${s.dot} ${k === i ? s.dotOn : ''}`} onClick={() => goTo(k)} />
          ))}
        </div>
      )}
    </div>
  );
}
