'use client';

// components/dashboard/OnboardingCoachmarks.js
//
// Two onboarding nudges shown once per dashboard mount, styled to match
// the homepage's .hamburger-coachmark-tooltip (gradient bubble + arrow +
// pulsing ring on the target, auto-hides after 5s):
//
//   1. Hamburger coachmark (mobile only) -- points at #dashboard-hamburger-btn,
//      "Tap here to select your course". Not gated behind visit count, same
//      as the homepage's version -- shows every time the dashboard mounts
//      on a mobile-width screen.
//   2. "Explore new batches" box, fixed to the right edge of the screen,
//      links to /cources. It stays visible as a permanent call-to-action;
//      only its accompanying info-label tooltip auto-hides after 5s.
//
// Uses the same CSS custom properties as the homepage (--primary-blue,
// --accent-blue, --brand-orange, --brand-yellow, --nav-height,
// --shadow-hover) with hard-coded fallbacks in case this ever renders
// somewhere those aren't defined.
//
// NOTE: layout.js also has an AttentionTip effect for onboarding, but its
// mobile/hamburger branch was removed so it no longer overlaps with the
// hamburger tooltip rendered here -- on mobile this component is now the
// only thing nudging toward the hamburger.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const AUTO_SHOW_DELAY_MS = 400;
const AUTO_HIDE_AFTER_MS = 5000;

// Hamburger ("tap here to select your course") banner: stays up for 8s
// instead of 5, but any tap/click anywhere on the screen dismisses it
// immediately -- whichever comes first.
const HAMBURGER_AUTO_HIDE_MS = 8000;

// "Explore new batches" idle-expand box only auto-expands the first 3
// times it goes idle in a given tab session -- after that it stays as the
// small pill (still tappable, just no more auto-popup nudging).
const BATCHES_TIP_SESSION_KEY = 'bihaniclasses_batches_tip_count';
const BATCHES_TIP_MAX_PER_SESSION = 3;

// Batches box idle behaviour: starts (and returns to) a small round
// emoji-only pill. If the user leaves the screen untouched for
// IDLE_BEFORE_EXPAND_MS it eases open into the full glowing label. The
// moment the user touches/clicks anywhere, a COMPRESS_DELAY_MS timer
// starts that shrinks it back down to just the circle+emoji, and the
// idle clock restarts from there.
const IDLE_BEFORE_EXPAND_MS = 10000;
const COMPRESS_DELAY_MS = 1000;

export default function OnboardingCoachmarks() {
    const [isMobile, setIsMobile] = useState(false);
    const [showHamburgerTip, setShowHamburgerTip] = useState(false);
    const [showBatchesTip, setShowBatchesTip] = useState(false);
    const [batchesExpanded, setBatchesExpanded] = useState(false);

    const idleTimerRef = useRef(null);
    const compressTimerRef = useRef(null);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 900);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        const showHamburger = setTimeout(() => setShowHamburgerTip(true), AUTO_SHOW_DELAY_MS);
        const hideHamburger = setTimeout(() => setShowHamburgerTip(false), AUTO_SHOW_DELAY_MS + HAMBURGER_AUTO_HIDE_MS);
        return () => {
            clearTimeout(showHamburger);
            clearTimeout(hideHamburger);
        };
    }, []);

    // Dismiss the hamburger banner the instant the student taps/clicks
    // ANYWHERE on the screen -- whichever comes first, this or the 8s timer
    // above.
    useEffect(() => {
        if (!showHamburgerTip) return;
        const dismiss = () => setShowHamburgerTip(false);
        window.addEventListener('touchstart', dismiss, { passive: true });
        window.addEventListener('mousedown', dismiss);
        return () => {
            window.removeEventListener('touchstart', dismiss);
            window.removeEventListener('mousedown', dismiss);
        };
    }, [showHamburgerTip]);

    // Idle -> expand -> touch -> compress cycle for the batches box.
    useEffect(() => {
        const clearIdleTimer = () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
        const clearCompressTimer = () => {
            if (compressTimerRef.current) clearTimeout(compressTimerRef.current);
        };

        const getBatchesTipCount = () => {
            try {
                return parseInt(sessionStorage.getItem(BATCHES_TIP_SESSION_KEY) || '0', 10) || 0;
            } catch (e) {
                return 0;
            }
        };

        const armIdleTimer = () => {
            clearIdleTimer();
            // Capped to BATCHES_TIP_MAX_PER_SESSION auto-expansions per tab
            // session -- once used up, stop re-arming entirely (box just
            // stays a compressed pill, still clickable).
            if (getBatchesTipCount() >= BATCHES_TIP_MAX_PER_SESSION) return;

            idleTimerRef.current = setTimeout(() => {
                if (getBatchesTipCount() >= BATCHES_TIP_MAX_PER_SESSION) return;
                try {
                    sessionStorage.setItem(BATCHES_TIP_SESSION_KEY, String(getBatchesTipCount() + 1));
                } catch (e) {
                    // sessionStorage unavailable -- still fine to expand once here
                }
                setBatchesExpanded(true);
                setShowBatchesTip(true);
                setTimeout(() => setShowBatchesTip(false), AUTO_HIDE_AFTER_MS);
            }, IDLE_BEFORE_EXPAND_MS);
        };

        const onUserInteraction = () => {
            // Any touch/click restarts the "shrink back to a circle"
            // countdown and, once it fires, the idle clock too.
            clearCompressTimer();
            compressTimerRef.current = setTimeout(() => {
                setBatchesExpanded(false);
                setShowBatchesTip(false);
                armIdleTimer();
            }, COMPRESS_DELAY_MS);
        };

        armIdleTimer();

        window.addEventListener('touchstart', onUserInteraction, { passive: true });
        window.addEventListener('mousedown', onUserInteraction);

        return () => {
            clearIdleTimer();
            clearCompressTimer();
            window.removeEventListener('touchstart', onUserInteraction);
            window.removeEventListener('mousedown', onUserInteraction);
        };
    }, []);

    // Pulses the actual hamburger DOM node (rendered elsewhere, in
    // DashboardNavbar) the same way the homepage script does -- by id,
    // toggling a class -- rather than needing DashboardNavbar itself to
    // know about this component.
    useEffect(() => {
        if (!isMobile) return;
        const el = document.getElementById('dashboard-hamburger-btn');
        if (!el) return;
        el.classList.toggle('ynCoachPulse', showHamburgerTip);
        return () => el.classList.remove('ynCoachPulse');
    }, [isMobile, showHamburgerTip]);

    return (
        <>
            <style>{`
                .ynCoachPulse { position: relative; z-index: 1003; }
                .ynCoachPulse::after {
                    content: '';
                    position: absolute;
                    inset: -10px;
                    border-radius: 50%;
                    background: rgba(23, 42, 133, 0.28);
                    animation: ynCoachPulseAnim 1.1s ease-out infinite;
                    z-index: -1;
                }
                @keyframes ynCoachPulseAnim {
                    0% { transform: scale(0.7); opacity: 0.9; }
                    70% { transform: scale(2.1); opacity: 0; }
                    100% { transform: scale(2.1); opacity: 0; }
                }

                .ynCoachTooltip {
                    position: fixed;
                    background: var(--navy-deep, #0f1c5e);
                    color: #fff;
                    padding: 10px 16px;
                    border-radius: 12px;
                    font-size: 12.5px;
                    font-weight: 700;
                    line-height: 1.35;
                    box-shadow: var(--shadow-hover, 0 20px 40px rgba(11, 79, 138, 0.15));
                    z-index: 1004;
                    max-width: 220px;
                    opacity: 0;
                    transform: translateY(-8px);
                    transition: opacity 0.35s ease, transform 0.35s ease;
                    pointer-events: none;
                }
                .ynCoachTooltip.show { opacity: 1; transform: translateY(0); }

                .ynCoachTooltip.hamburger {
                    top: calc(var(--topbar-h, 64px) + 8px);
                    left: 16px;
                    /* Below the mobile sidebar (z-index 900) and its drawer
                       overlay (880) -- when the sidebar auto-opens over this
                       banner, the sidebar panel visually covers it instead
                       of the banner floating on top of the open panel. */
                    z-index: 850;
                }
                .ynCoachTooltip.hamburger::before {
                    content: '';
                    position: absolute;
                    top: -6px;
                    left: 22px;
                    width: 12px;
                    height: 12px;
                    background: var(--navy-deep, #0f1c5e);
                    transform: rotate(45deg);
                }

                .ynBatchesBox {
                    position: fixed;
                    right: 16px;
                    bottom: 20px;
                    top: auto;
                    z-index: 999;
                    isolation: isolate;
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    gap: 0;
                    background: var(--navy-deep, #0f1c5e);
                    color: #fff;
                    width: 34px;
                    height: 34px;
                    padding: 0;
                    border-radius: 17px;
                    font-weight: 700;
                    font-size: 14px;
                    text-decoration: none;
                    overflow: hidden;
                    white-space: nowrap;
                    opacity: 0.75;
                    box-shadow: 0 4px 10px rgba(15, 28, 94, 0.25);
                    will-change: width, opacity;
                    transform: translateZ(0);
                    transition: width 0.55s cubic-bezier(0.65, 0, 0.35, 1),
                                opacity 0.45s ease,
                                box-shadow 0.45s ease;
                }
                .ynBatchesBox .ynBatchesEmoji {
                    flex: 0 0 34px;
                    width: 34px;
                    height: 34px;
                    font-size: 15px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .ynBatchesBox .ynBatchesLabel {
                    display: inline-block;
                    opacity: 0;
                    transition: opacity 0.35s ease;
                    padding-right: 14px;
                    white-space: nowrap;
                }
                .ynBatchesBox.expanded {
                    width: 172px;
                    opacity: 0.92;
                }
                .ynBatchesBox.expanded .ynBatchesLabel {
                    opacity: 1;
                    transition: opacity 0.35s ease 0.2s;
                }
                .ynBatchesBox.expanded::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    box-shadow: 0 6px 20px rgba(15, 28, 94, 0.45);
                    opacity: 0;
                    animation: ynBatchesGlow 2.4s ease-in-out infinite;
                    animation-delay: 0.4s;
                    pointer-events: none;
                }
                .ynBatchesBox:hover {
                    opacity: 1;
                    box-shadow: 0 8px 18px rgba(15, 28, 94, 0.35);
                }
                @keyframes ynBatchesGlow {
                    0%, 100% { opacity: 0; }
                    50% { opacity: 1; }
                }

                .ynCoachTooltip.batches {
                    top: auto;
                    bottom: 68px;
                    right: 16px;
                    transform: translateY(8px);
                    background: var(--navy-deep, #0f1c5e);
                }
                .ynCoachTooltip.batches.show { transform: translateY(0); }
                .ynCoachTooltip.batches::after {
                    content: '';
                    position: absolute;
                    top: auto;
                    bottom: -6px;
                    right: 24px;
                    width: 12px;
                    height: 12px;
                    margin-top: 0;
                    background: var(--navy-deep, #0f1c5e);
                    transform: rotate(45deg);
                }
            `}</style>

            {isMobile && (
                <div className={`ynCoachTooltip hamburger ${showHamburgerTip ? 'show' : ''}`}>
                    👆 Tap here to select your course
                </div>
            )}

            <Link
                href="/cources"
                className={`ynBatchesBox ${batchesExpanded ? 'expanded' : ''}`}
            >
                <span className="ynBatchesEmoji">🎓</span>
                <span className="ynBatchesLabel">Explore new batches</span>
            </Link>

            {batchesExpanded && (
                <div className={`ynCoachTooltip batches ${showBatchesTip ? 'show' : ''}`}>
                    📚 Check out our latest batches here!
                </div>
            )}
        </>
    );
}
