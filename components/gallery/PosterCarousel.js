'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import s from './gallery.module.css';

const INTERVAL = 4000;
const TRANSITION = 550;

export default function PosterCarousel({ posters }) {
  const n = posters.length;
  const [index, setIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(null);
  const [animating, setAnimating] = useState(false);
  const timerRef = useRef(null);
  const touchX = useRef(null);

  const finishTransition = useCallback(() => {
    if (nextIndex === null) return;
    setIndex(nextIndex);
    setNextIndex(null);
    setAnimating(false);
  }, [nextIndex]);

  const go = useCallback((direction = 1) => {
    if (n < 2 || animating) return;
    setNextIndex((index + direction + n) % n);
    setAnimating(true);
  }, [n, animating, index]);

  useEffect(() => {
    if (n < 2 || animating) return undefined;
    timerRef.current = setTimeout(() => go(1), INTERVAL);
    return () => clearTimeout(timerRef.current);
  }, [n, index, animating, go]);

  useEffect(() => {
    if (!animating) return undefined;
    const id = setTimeout(finishTransition, TRANSITION);
    return () => clearTimeout(id);
  }, [animating, finishTransition]);

  if (!n) return null;

  const current = posters[index];
  const incoming = nextIndex === null ? null : posters[nextIndex];
  const ratio = current?.w && current?.h ? `${current.w} / ${current.h}` : undefined;

  return (
    <div
      className={s.carousel}
      role="region"
      aria-roledescription="carousel"
      aria-label="Bihani Classes posters"
    >
      <div
        className={s.stage}
        style={ratio ? { '--poster-ratio': ratio } : undefined}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (touchX.current ?? 0);
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          touchX.current = null;
        }}
      >
        <div className={`${s.slide} ${s.currentSlide} ${animating ? s.leaveLeft : ''}`}>
          <img
            src={current.src}
            alt={`Bihani Chemistry Classes poster ${index + 1}`}
            className={s.slideImg}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            draggable={false}
          />
        </div>

        {incoming && (
          <div className={`${s.slide} ${s.incomingSlide} ${animating ? s.enterLeft : ''}`}>
            <img
              src={incoming.src}
              alt={`Bihani Chemistry Classes poster ${nextIndex + 1}`}
              className={s.slideImg}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              draggable={false}
            />
          </div>
        )}
      </div>
    </div>
  );
}
