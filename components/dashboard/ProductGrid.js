'use client';

// components/dashboard/ProductGrid.js
//
// Right panel, final stage: the actual product cards (notes, tests, etc.)
// under a chapter (or directly under a subsection for legacy 2-level
// sections that have no chapters).
//
// Exam-launch logic ported 1:1 from dashboard.html's generateCourseCardMarkup
// + triggerSecureExamLaunch/redirectToSecureReview (see lib/examActions.js):
// a card's action button is driven by card.product_type_info.handling_strategy
//   - REDIRECT     -> "Start Exam" (or "Review" + "Re-attempt" if the
//                      student already has a completed exam_results row,
//                      via attemptStatusMap)
//   - INLINE_SWAP   -> secure in-page document viewer (NOT wired up yet --
//                      that's the PDF.js/DRM viewer, a separate follow-up,
//                      same as it was left in the old code's comments)
//   - anything else -> "Pending Update" (disabled), same fallback as before

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './dashboard.module.css';
import { triggerSecureExamLaunch, redirectToSecureReview } from '@/lib/examActions';
import { resolveImageUrl } from '@/lib/resolveImageUrl';
import BlockingOverlay from '@/components/common/BlockingOverlay';

function formatWhen(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Small centered info popup used for the "Scheduled" / "Submitted" states —
// clicking those buttons explains the timing instead of launching anything.
// Rendered via a portal straight into document.body: the dashboard layout
// has transformed ancestors somewhere in its tree, and position:fixed
// inside a transformed ancestor is fixed to THAT element, not the real
// viewport -- which was pinning this popup near the clicked card instead
// of centering it on screen. A portal escapes all of that.
function InfoPopup({ title, body, onClose }) {
    if (typeof document === 'undefined') return null;
    return createPortal(
        <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={onClose}
        >
            <div
                style={{ background: '#fff', borderRadius: 12, padding: '20px 22px', maxWidth: 340, width: '90%', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>{body}</div>
                <button
                    type="button"
                    onClick={onClose}
                    style={{ marginTop: 16, width: '100%', padding: '9px 0', borderRadius: 8, border: 'none', background: '#1e3a8a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                    Got it
                </button>
            </div>
        </div>,
        document.body
    );
}

// Yellow, live-ticking "time left in this exam's window" pill. Only ever
// rendered once the window has actually opened (see `liveNow` below) --
// counts down to `endAt` and disappears on its own once time's up (the
// next render after that will naturally fall through to the
// already-existing missedLive / awaitingResult states instead).
function LiveWindowTimer({ endAt }) {
    const [remainingMs, setRemainingMs] = useState(() => endAt.getTime() - Date.now());

    useEffect(() => {
        const tick = () => setRemainingMs(endAt.getTime() - Date.now());
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [endAt]);

    if (remainingMs <= 0) return null;

    const totalSeconds = Math.floor(remainingMs / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: '#fef9c3',
                color: '#854d0e',
                border: '1px solid #fde047',
                borderRadius: 6,
                padding: '2px 7px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.2,
            }}
        >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308', flexShrink: 0 }} />
            Ends in {h}:{m}:{s}
        </span>
    );
}

function ProductCard({ product, studentEmail, hasAttempted, firstAttemptAt, onOpenDocument }) {
    const [launchStatus, setLaunchStatus] = useState('idle'); // 'idle' | 'launching'
    const [popup, setPopup] = useState(null); // null | { title, body }

    const strategyInfo = product.product_type_info || {};
    const handlingStrategy = strategyInfo.handling_strategy || 'EXTERNAL';
    const actionButtonLabel = strategyInfo.button_label || 'Open Material';

    const handleStart = () => {
        triggerSecureExamLaunch(product.id, product.thumbnail_url, setLaunchStatus);
    };

    const handleReview = () => {
        redirectToSecureReview(product.id, studentEmail);
    };

    // ---- Scheduled-exam state derivation (all from product's own timestamps,
    // same source of truth the backend routes use — no separate status field) ----
    const now = new Date();
    const isScheduled = handlingStrategy === 'REDIRECT' && !!product.is_scheduled;
    const startAt = product.scheduled_start_at ? new Date(product.scheduled_start_at) : null;
    const endAt = product.scheduled_end_at ? new Date(product.scheduled_end_at) : null;
    const resultAt = product.result_declared_at ? new Date(product.result_declared_at) : null;
    const resultDeclared = isScheduled && resultAt && now >= resultAt;
    const beforeWindow = isScheduled && !resultDeclared && startAt && now < startAt;
    const awaitingResult = isScheduled && !resultDeclared && hasAttempted && !beforeWindow;
    // Permanent "missed the live window" flag — deliberately NOT tied to
    // hasAttempted (which flips true the moment they re-attempt after
    // results are declared). What matters here is whether their EARLIEST
    // attempt (if any) happened before the window closed. Once a student
    // misses the live window this stays true forever, even after they go
    // back and attempt the reopened, unlimited-attempt version of the test.
    const missedLive = isScheduled && endAt && now > endAt &&
        (!firstAttemptAt || new Date(firstAttemptAt) > endAt);
    // Window is currently open: started, not yet closed, student hasn't
    // attempted (once they have, awaitingResult/resultDeclared already
    // take over the meta line above). This is purely a display concern --
    // the actual start/end enforcement already lives server-side in
    // /api/exam/start, this just gives the student a live heads-up.
    const liveNow = isScheduled && !resultDeclared && !beforeWindow && !awaitingResult &&
        endAt && now < endAt;

    let actionEl = null;
    let metaOverride = null;

    if (handlingStrategy === 'REDIRECT' && beforeWindow) {
        metaOverride = `Starts: ${formatWhen(product.scheduled_start_at)}`;
        actionEl = (
            <button
                type="button"
                className={`${styles.productAction} ${styles.productActionOutline}`}
                onClick={() => setPopup({
                    title: 'Scheduled',
                    body: `This exam opens on ${formatWhen(product.scheduled_start_at)}.`,
                })}
            >
                Scheduled
            </button>
        );
    } else if (handlingStrategy === 'REDIRECT' && awaitingResult) {
        metaOverride = `Result on: ${formatWhen(product.result_declared_at)}`;
        actionEl = (
            <button
                type="button"
                className={`${styles.productAction} ${styles.productActionOutline}`}
                onClick={() => setPopup({
                    title: 'Submitted',
                    body: `You have submitted the exam successfully. The results will be live at ${formatWhen(product.result_declared_at)}.`,
                })}
            >
                Submitted
            </button>
        );
    } else if (handlingStrategy === 'REDIRECT') {
        // Normal exam, OR a scheduled exam whose result is already declared —
        // once resultDeclared is true this behaves exactly like an
        // unlimited-attempt product, same Review/Re-attempt pair as before.
        // missedLive (below) only swaps the meta line, never this button.
        if (hasAttempted) {
            actionEl = (
                <div className={styles.productActionRow}>
                    <button
                        type="button"
                        className={`${styles.productAction} ${styles.productActionOutline}`}
                        onClick={handleReview}
                    >
                        {resultDeclared ? 'Check Result' : 'Review'}
                    </button>
                    <button
                        type="button"
                        className={styles.productAction}
                        onClick={handleStart}
                        disabled={launchStatus === 'launching'}
                    >
                        {launchStatus === 'launching' ? 'Securing Engine…' : 'Re-attempt'}
                    </button>
                </div>
            );
        } else {
            actionEl = (
                <button
                    type="button"
                    className={styles.productAction}
                    onClick={handleStart}
                    disabled={launchStatus === 'launching'}
                >
                    {launchStatus === 'launching' ? 'Securing Engine…' : actionButtonLabel}
                </button>
            );
        }
    } else if (handlingStrategy === 'INLINE_SWAP') {
        actionEl = (
            <button
                type="button"
                className={styles.productAction}
                onClick={() => onOpenDocument(product)}
            >
                {actionButtonLabel}
            </button>
        );
    } else {
        actionEl = (
            <button type="button" className={`${styles.productAction} ${styles.productActionDisabled}`} disabled>
                Pending Update
            </button>
        );
    }

    // Live-window meta — window's open, student hasn't attempted yet.
    // Mutually exclusive with missedLive below (that only fires once the
    // window has actually closed).
    if (liveNow) {
        metaOverride = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                    Window ends: {formatWhen(product.scheduled_end_at)}
                </span>
                <LiveWindowTimer endAt={endAt} />
            </div>
        );
    }

    // Permanent missed-live-window note — wins over any other meta text
    // (including "Valid Till: Lifetime") for as long as this fact is true,
    // which per missedLive's definition above is forever.
    if (missedLive) {
        metaOverride = (
            <span style={{ color: '#dc2626', fontSize: 11, fontWeight: 600 }}>
                Missed — window closed {formatWhen(product.scheduled_end_at)}
            </span>
        );
    }

    return (
        <div className={styles.productCard}>
            {launchStatus === 'launching' && (
                <BlockingOverlay
                    useLottie
                    message="Starting the exam…"
                    subMessage="Please wait, this will only take a moment."
                />
            )}
            {popup && <InfoPopup title={popup.title} body={popup.body} onClose={() => setPopup(null)} />}
            <div className={styles.productThumbWrap}>
                {product.thumbnail_url ? (
                    <img
                        src={resolveImageUrl(product.thumbnail_url)}
                        alt=""
                        className={styles.productThumb}
                    />
                ) : (
                    <span className={styles.productThumbFallback}>{product.title?.charAt(0) || '?'}</span>
                )}
                {product.badge_label ? (
                    <span className={styles.productBadge}>{product.badge_label}</span>
                ) : null}
            </div>
            <div className={styles.productBody}>
                <div className={styles.productTitle}>{product.title}</div>
                {metaOverride ? (
                    <div className={styles.productMeta}>{metaOverride}</div>
                ) : product.validity_text ? (
                    <div className={styles.productMeta}>{product.validity_text}</div>
                ) : null}
                <div style={{ marginTop: 6 }}>{actionEl}</div>
            </div>
        </div>
    );
}

export default function ProductGrid({ heading, products, loading, studentEmail, attemptStatusMap, onOpenDocument }) {
    if (loading) {
        return <div className={styles.stateMessage}>Loading…</div>;
    }

    if (products.length === 0) {
        return <div className={styles.stateMessage}>No items added under {heading} yet.</div>;
    }

    return (
        <div className={styles.productGrid}>
            {products.map((product) => (
                <ProductCard
                    key={product.id}
                    product={product}
                    studentEmail={studentEmail}
                    hasAttempted={!!attemptStatusMap?.[product.id]?.hasAttempted}
                    firstAttemptAt={attemptStatusMap?.[product.id]?.firstAttemptAt || null}
                    onOpenDocument={onOpenDocument}
                />
            ))}
        </div>
    );
}
