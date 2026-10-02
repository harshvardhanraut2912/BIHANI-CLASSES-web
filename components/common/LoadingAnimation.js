'use client';

// components/common/LoadingAnimation.js
//
// Plays /public/loading.json with a message below it.
//
// Previously this loaded the <lottie-player> web component from
// unpkg.com/@lottiefiles/lottie-player at runtime (dynamically injecting a
// <script> tag), mirroring public/exam.html's ui-canvas-loader. That works
// fine in exam.html because it's a static HTML page with the script tag
// hard-coded in <head>, guaranteed to load before anything else runs. Inside
// a Next.js client component, however, the dynamic-injection promise
// (loadLottiePlayer) was silently never resolving OR rejecting in practice --
// neither the animation nor even the CSS spinner fallback ever appeared,
// meaning both branches (ready / failed) stayed false forever.
//
// Fixed by switching to the `lottie-web` npm package (bundled into the app,
// no external network call at runtime) and driving it imperatively via a
// ref + lottie.loadAnimation(), same JSON file, same visual result, but no
// dependency on a CDN <script> tag loading correctly inside React.
//
// Usage: <LoadingAnimation message="Loading your content…" />

import { useEffect, useRef, useState } from 'react';

export default function LoadingAnimation({ message = 'Loading your content…' }) {
    const containerRef = useRef(null);
    const animRef = useRef(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        import('lottie-web')
            .then((mod) => {
                if (cancelled || !containerRef.current) return;
                const lottie = mod?.default ?? mod;
                animRef.current = lottie.loadAnimation({
                    container: containerRef.current,
                    renderer: 'svg',
                    loop: true,
                    autoplay: true,
                    path: '/loading.json',
                });
                animRef.current.addEventListener('data_failed', () => {
                    if (!cancelled) setFailed(true);
                });
            })
            .catch((err) => {
                console.error('LoadingAnimation: lottie-web failed to load:', err);
                if (!cancelled) setFailed(true);
            });

        return () => {
            cancelled = true;
            if (animRef.current) {
                animRef.current.destroy();
                animRef.current = null;
            }
        };
    }, []);

    return (
        <div className="la-wrap" role="status" aria-live="polite">
            <div
                ref={containerRef}
                className="la-lottie"
                style={{ width: 160, height: 160, display: failed ? 'none' : 'block' }}
            />
            {failed ? <div className="la-spinner" aria-hidden="true" /> : null}
            <div className="la-message">{message}</div>
            <style jsx>{`
                .la-wrap {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 48px 20px;
                    width: 100%;
                }
                .la-spinner {
                    width: 42px;
                    height: 42px;
                    border: 4px solid #d9e8f5;
                    border-top-color: var(--primary-blue, #0b4f8a);
                    border-radius: 50%;
                    animation: la-spin 0.8s linear infinite;
                }
                @keyframes la-spin {
                    to { transform: rotate(360deg); }
                }
                .la-message {
                    margin-top: 8px;
                    font-size: 14.5px;
                    font-weight: 600;
                    color: var(--text-muted, #5c6b7a);
                    text-align: center;
                }
            `}</style>
        </div>
    );
}
