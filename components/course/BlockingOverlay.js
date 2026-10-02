'use client';

// components/common/BlockingOverlay.js
//
// Small reusable full-screen "please wait" overlay. Blocks interaction with
// the page underneath (click-through disabled) and shows a spinner + message.
// Used by:
//   - ProductGrid.js  -> "Encrypting the engine, please wait..." while the
//                        exam engine is being secured/launched.
//   - BuyButton.js    -> "Payment gateway is active, please don't refresh
//                        the page." while Razorpay checkout is open.
//
// 🟢 FIX: rendered via a portal straight to document.body. Callers (e.g.
// ProductGrid's .productCard, which has `transform` on :hover) can sit
// between this component and <body> -- and per spec, `position: fixed`
// descendants of a transformed ancestor become fixed *to that ancestor*
// instead of the viewport. That caused the overlay to be sized/positioned
// against the card's own hover-transform box, visibly jumping/flickering
// as the card's transform animated back to none underneath it. Portaling
// out of the DOM tree entirely makes the overlay immune to this regardless
// of what transform/filter/will-change any future caller's ancestor uses.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import LoadingAnimation from './LoadingAnimation';

// useLottie: when true, plays /public/loading.json (via LoadingAnimation)
// instead of the plain CSS spinner. Used by BuyButton.js for the
// "payment is being processed" blocker; ProductGrid.js keeps the default
// spinner (prop omitted there, so behavior is unchanged for it).
export default function BlockingOverlay({ message, subMessage, useLottie = false }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    return createPortal(
        <div className="bo-overlay" role="alert" aria-live="assertive">
            <div className="bo-card">
                {useLottie ? (
                    <LoadingAnimation message={message} />
                ) : (
                    <>
                        <div className="bo-spinner" aria-hidden="true" />
                        <div className="bo-message">{message}</div>
                    </>
                )}
                {subMessage ? <div className="bo-submessage">{subMessage}</div> : null}
            </div>
            <style jsx>{`
                .bo-overlay {
                    position: fixed;
                    inset: 0;
                    z-index: 9999;
                    background: rgba(6, 20, 34, 0.72);
                    backdrop-filter: blur(2px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .bo-card {
                    background: #fff;
                    border-radius: 16px;
                    padding: 28px 32px;
                    max-width: 340px;
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
                }
                .bo-spinner {
                    width: 42px;
                    height: 42px;
                    border: 4px solid #d9e8f5;
                    border-top-color: var(--primary-blue, #0b4f8a);
                    border-radius: 50%;
                    animation: bo-spin 0.8s linear infinite;
                    margin-bottom: 16px;
                }
                .bo-message {
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--text-main, #0f1f2e);
                }
                .bo-submessage {
                    margin-top: 6px;
                    font-size: 12.5px;
                    color: var(--text-muted, #5c6b7a);
                }
                @keyframes bo-spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>,
        document.body
    );
}
