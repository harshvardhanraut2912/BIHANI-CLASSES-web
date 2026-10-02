'use client';

// components/dashboard/AttentionTip.js
//
// Port of dashboard.html's showAttentionTip/removeAttentionTip: a small blue
// pointer popup used for onboarding nudges (e.g. "select a section here").
// Positions itself against a target element (by id) the same way the old
// code did -- via getBoundingClientRect -- just recomputed in a
// useLayoutEffect instead of imperative DOM writes.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './dashboard.module.css';

export default function AttentionTip({ text, targetId, arrowSide = 'right', onDismiss, autoDismissMs = 6000 }) {
    const tipRef = useRef(null);
    const [style, setStyle] = useState({ opacity: 0, top: -9999, left: -9999 });

    useLayoutEffect(() => {
        const target = document.getElementById(targetId);
        const tipEl = tipRef.current;
        if (!target || !tipEl) {
            onDismiss?.();
            return;
        }

        const rect = target.getBoundingClientRect();
        const tipWidth = tipEl.offsetWidth;
        const top = rect.bottom + 12;
        let left = arrowSide === 'left' ? rect.left - 8 : rect.right - tipWidth + 8;
        left = Math.max(10, Math.min(left, window.innerWidth - tipWidth - 10));

        setStyle({ top, left, opacity: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetId, arrowSide]);

    useEffect(() => {
        if (!autoDismissMs) return undefined;
        const timer = setTimeout(() => onDismiss?.(), autoDismissMs);
        return () => clearTimeout(timer);
    }, [autoDismissMs, onDismiss]);

    return (
        <div
            ref={tipRef}
            className={`${styles.attentionTip} ${arrowSide === 'left' ? styles.arrowLeft : styles.arrowRight}`}
            style={style}
            onClick={onDismiss}
        >
            {text}
        </div>
    );
}
