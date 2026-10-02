'use client';

// SAVE THIS FILE AT: components/payment/PaymentSuccessOverlay.js
//
// Shown immediately after Razorpay payment succeeds.
// - PDF generated client-side via jsPDF (npm, no CDN needed).
// - NO auto-redirect timer — overlay stays until the user clicks a button.
//
// Props:
//   receipt  — the `receipt` object returned by /api/payment/verify
//   onClose  — called when the student clicks "Go to Dashboard"

import { useRef, useState } from 'react';

// Dynamic import so jsPDF (a large lib) is only bundled into the client
// chunk for this component, not the whole app.
async function getJsPDF() {
    try {
        const mod = await import('jspdf');
        const JsPDF = mod.jsPDF || mod.default?.jsPDF || mod.default;
        if (!JsPDF) throw new Error('jsPDF not found in module: ' + JSON.stringify(Object.keys(mod)));
        return JsPDF;
    } catch(err) {
        console.error('[jsPDF] import failed:', err);
        throw err;
    }
}

// Convert an image URL to base64 data-URI so jsPDF can embed it
function toDataURL(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

async function generateAndDownloadReceipt(receipt) {
    const JsPDF = await getJsPDF();
    const doc = new JsPDF({ unit: 'pt', format: 'a4' });

    const W      = doc.internal.pageSize.getWidth();
    const margin = 48;
    const cW     = W - margin * 2;
    let   y      = margin;

    const blue  = [11,  79,  138];
    const dark  = [15,  31,  46];
    const muted = [92,  107, 122];
    const green = [16,  185, 129];
    const line  = [203, 220, 232];

    // ── Letterhead: logo + big "Y N Classes" headline (left), contact (right) ──
    const logoURL = await toDataURL('/images/other_images/ynclasses-logo.png')
        || await toDataURL('/images/other_images/ynclasses-logo.svg');

    let textX = margin;
    if (logoURL) {
        const tmp = new Image();
        await new Promise(r => { tmp.onload = r; tmp.onerror = r; tmp.src = logoURL; });
        const logoH = 42;
        const logoW = Math.min((tmp.naturalWidth / (tmp.naturalHeight || 1)) * logoH, 140);
        doc.addImage(logoURL, 'PNG', margin, y, logoW, logoH);
        textX = margin + logoW + 14;
    }

    // Big brand headline, vertically centered against the logo block
    doc.setFontSize(24).setFont('helvetica', 'bold').setTextColor(...blue);
    doc.text('Y N Classes', textX, y + 22);
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(...muted);
    doc.text('Coaching for CET & Board Excellence', textX, y + 37);

    // Company contact info (right-aligned)
    doc.setFontSize(8).setTextColor(...muted);
    doc.text('ynclassses2016@gmail.com', W - margin, y + 8,  { align: 'right' });
    doc.text('+91 96194 15869',          W - margin, y + 19, { align: 'right' });
    doc.text('ynclasses.in',             W - margin, y + 30, { align: 'right' });
    y += 58;

    // ── Divider ───────────────────────────────────────────────────────────────
    doc.setDrawColor(...line).setLineWidth(1).line(margin, y, W - margin, y);
    y += 22;

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.setFillColor(...blue);
    doc.roundedRect(margin, y - 14, 118, 22, 4, 4, 'F');
    doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(255, 255, 255);
    doc.text('PAYMENT RECEIPT', margin + 12, y + 1);
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(...muted);
    doc.text('Thank you for your purchase!', W - margin, y + 1, { align: 'right' });
    y += 26;

    // ── Meta block (2 columns) ────────────────────────────────────────────────
    const col2    = margin + cW / 2;
    const metaRows = [
        ['Payment ID',  receipt.paymentId],
        ['Order ID',    receipt.orderId],
        ['Date & Time', receipt.purchaseTimeIST],
        ['Billed To',   receipt.studentEmail],
        ['Course ID',   receipt.productId],
        ['Course Name', receipt.courseName],
    ];
    doc.setFontSize(9);
    metaRows.forEach(([label, value], i) => {
        const lx   = i % 2 === 0 ? margin : col2;
        const rowY = y + Math.floor(i / 2) * 22;
        doc.setFont('helvetica', 'bold').setTextColor(...dark).text(label, lx, rowY);
        doc.setFont('helvetica', 'normal').setTextColor(...muted).text(String(value || '—'), lx, rowY + 11, { maxWidth: cW / 2 - 16 });
    });
    y += Math.ceil(metaRows.length / 2) * 22 + 12;

    doc.setDrawColor(...line).line(margin, y, W - margin, y);
    y += 18;

    // ── Table header ──────────────────────────────────────────────────────────
    doc.setFillColor(...blue);
    doc.rect(margin, y, cW, 22, 'F');
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(255, 255, 255);
    doc.text('Description',    margin + 8,   y + 14);
    doc.text('Amount (INR)',   W - margin - 8, y + 14, { align: 'right' });
    y += 22;

    // ── Course row ────────────────────────────────────────────────────────────
    doc.setFillColor(240, 246, 252);
    doc.rect(margin, y, cW, 22, 'F');
    doc.setFont('helvetica', 'normal').setTextColor(...dark).setFontSize(9);
    doc.text(receipt.courseName || 'Course Enrollment', margin + 8, y + 14, { maxWidth: cW * 0.65 });
    doc.text(`Rs. ${(receipt.originalPrice ?? receipt.amount).toFixed(2)}`, W - margin - 8, y + 14, { align: 'right' });
    y += 22;

    // ── Coupon row (if any) ───────────────────────────────────────────────────
    if (receipt.couponCode && receipt.discountAmount > 0) {
        doc.setFillColor(240, 253, 248);
        doc.rect(margin, y, cW, 22, 'F');
        doc.setTextColor(...green);
        doc.text(`Coupon: ${receipt.couponCode}`, margin + 8, y + 14);
        doc.text(`- Rs. ${receipt.discountAmount.toFixed(2)}`, W - margin - 8, y + 14, { align: 'right' });
        y += 22;
    }

    // ── Total row ─────────────────────────────────────────────────────────────
    doc.setFillColor(...blue);
    doc.rect(margin, y, cW, 26, 'F');
    doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(255, 255, 255);
    doc.text('Total Paid',                   margin + 8,   y + 17);
    doc.text(`Rs. ${receipt.amount.toFixed(2)}`, W - margin - 8, y + 17, { align: 'right' });
    y += 42;

    // ── Razorpay note ─────────────────────────────────────────────────────────
    doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(...muted);
    doc.text('Payment processed securely via Razorpay  ·  Currency: INR', margin, y);
    y += 22;

    // ── Success stamp ─────────────────────────────────────────────────────────
    doc.setFillColor(232, 248, 240);
    doc.roundedRect(margin, y, cW, 32, 4, 4, 'F');
    doc.setFontSize(11).setFont('helvetica', 'bold').setTextColor(...green);
    doc.text('Payment Successful - Access Granted', margin + 12, y + 20);
    y += 46;

    // ── Footer note ───────────────────────────────────────────────────────────
    doc.setFontSize(8).setFont('helvetica', 'normal').setTextColor(...muted);
    doc.text(
        'This is a system-generated receipt. For support: +91 96194 15869 or ynclassses2016@gmail.com.',
        margin, y, { maxWidth: cW }
    );

    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...line).line(margin, pageH - 36, W - margin, pageH - 36);
    doc.setFontSize(8).setTextColor(...muted);
    doc.text('Y N Classes  ·  ynclasses.in', margin, pageH - 22);
    doc.text('Page 1 of 1', W - margin, pageH - 22, { align: 'right' });

    doc.save(`YNClasses_Receipt_${receipt.paymentId}.pdf`);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PaymentSuccessOverlay({ receipt, onClose }) {
    const [downloading, setDownloading] = useState(false);
    const [dlError,     setDlError]     = useState('');
    const overlayRef = useRef(null);

    // NO auto-redirect timer — user must click a button

    async function handleDownload() {
        setDlError('');
        setDownloading(true);
        try {
            await generateAndDownloadReceipt(receipt);
        } catch (err) {
            console.error('Receipt generation error:', err);
            // Surface the real error message instead of a generic string so
            // it's actually possible to diagnose from the UI / a screenshot.
            setDlError(`Could not generate PDF: ${err?.message || err}`);
        } finally {
            setDownloading(false);
        }
    }

    const amountDisplay = `Rs. ${receipt.amount.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

    return (
        <>
            {/* Backdrop */}
            <div className="pso-backdrop" aria-hidden="true" />

            {/* Modal */}
            <div
                className="pso-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="pso-title"
                ref={overlayRef}
                tabIndex={-1}
            >
                {/* Success icon */}
                <div className="pso-icon-wrap" aria-hidden="true">
                    <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="pso-check-svg">
                        <circle cx="30" cy="30" r="30" fill="#10b981" fillOpacity="0.12" />
                        <circle cx="30" cy="30" r="22" fill="#10b981" />
                        <path d="M19 30.5L26.5 38L41 23" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <h2 className="pso-title" id="pso-title">Payment Successful!</h2>
                <p className="pso-subtitle">You&apos;re now enrolled. Here&apos;s your order summary.</p>

                {/* Summary card */}
                <div className="pso-card">
                    <div className="pso-amount">{amountDisplay}</div>
                    <div className="pso-amount-label">Total Paid · INR · Captured</div>

                    <div className="pso-divider" />

                    <div className="pso-rows">
                        <div className="pso-row">
                            <span className="pso-row-label">Order ID</span>
                            <span className="pso-row-value pso-mono">{receipt.orderId}</span>
                        </div>
                        <div className="pso-row">
                            <span className="pso-row-label">Payment ID</span>
                            <span className="pso-row-value pso-mono">{receipt.paymentId}</span>
                        </div>
                        <div className="pso-row">
                            <span className="pso-row-label">Course</span>
                            <span className="pso-row-value">{receipt.courseName}</span>
                        </div>
                        <div className="pso-row">
                            <span className="pso-row-label">Account</span>
                            <span className="pso-row-value">{receipt.studentEmail}</span>
                        </div>
                        {receipt.couponCode && (
                            <div className="pso-row">
                                <span className="pso-row-label">Coupon</span>
                                <span className="pso-row-value pso-green">
                                    {receipt.couponCode} (−Rs.{receipt.discountAmount.toFixed(2)})
                                </span>
                            </div>
                        )}
                        <div className="pso-row">
                            <span className="pso-row-label">Date & Time</span>
                            <span className="pso-row-value">{receipt.purchaseTimeIST}</span>
                        </div>
                    </div>
                </div>

                {dlError && (
                    <p className="pso-dl-error" role="alert">{dlError}</p>
                )}

                {/* Actions — user MUST click one of these, no timer */}
                <div className="pso-actions">
                    <button
                        className="pso-btn pso-btn-receipt"
                        onClick={handleDownload}
                        disabled={downloading}
                    >
                        {downloading ? (
                            <>
                                <span className="pso-spinner" aria-hidden="true" />
                                Generating PDF…
                            </>
                        ) : (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download Receipt (PDF)
                            </>
                        )}
                    </button>

                    <button className="pso-btn pso-btn-dashboard" onClick={onClose}>
                        Go to Dashboard →
                    </button>
                </div>
            </div>

            <style jsx>{`
                .pso-backdrop {
                    position: fixed; inset: 0;
                    background: rgba(11, 31, 46, 0.72);
                    backdrop-filter: blur(4px);
                    z-index: 1000;
                    animation: pso-fade-in 0.2s ease;
                }
                .pso-modal {
                    position: fixed; inset: 0; z-index: 1001;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 24px 16px 32px;
                    overflow-y: auto; outline: none;
                }
                .pso-modal > * { width: 100%; max-width: 480px; }
                .pso-icon-wrap {
                    display: flex; justify-content: center;
                    margin-top: 16px; margin-bottom: 16px;
                    animation: pso-pop 0.35s cubic-bezier(0.34,1.56,0.64,1);
                }
                .pso-check-svg { width: 72px; height: 72px; }
                .pso-title {
                    text-align: center;
                    font-family: 'Manrope', sans-serif;
                    font-size: 24px; font-weight: 800;
                    color: #ffffff; margin: 0 0 6px;
                    text-shadow: 0 1px 3px rgba(0,0,0,0.25);
                }
                .pso-subtitle {
                    text-align: center; font-size: 14px;
                    color: #e6f0fa; margin: 0 0 20px;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                }
                .pso-card {
                    background: #fff; border: 1px solid #cbdce8;
                    border-radius: 16px; padding: 20px 22px;
                    box-shadow: 0 20px 40px -5px rgba(11,79,138,0.12);
                    margin-bottom: 16px;
                    animation: pso-slide-up 0.3s ease;
                }
                .pso-amount {
                    font-family: 'Manrope', sans-serif;
                    font-size: 36px; font-weight: 800;
                    color: #0b4f8a; letter-spacing: -0.5px;
                }
                .pso-amount-label {
                    font-size: 12px; color: #5c6b7a;
                    margin-top: 2px; margin-bottom: 14px;
                    text-transform: uppercase; letter-spacing: 0.04em; font-weight: 600;
                }
                .pso-divider { height: 1px; background: #e8eff5; margin: 14px 0; }
                .pso-rows { display: flex; flex-direction: column; gap: 10px; }
                .pso-row {
                    display: flex; justify-content: space-between;
                    align-items: flex-start; gap: 12px; font-size: 13px;
                }
                .pso-row-label {
                    color: #5c6b7a; font-weight: 600;
                    flex-shrink: 0; min-width: 90px;
                }
                .pso-row-value {
                    color: #0f1f2e; font-weight: 500;
                    text-align: right; word-break: break-all;
                }
                .pso-mono {
                    font-family: 'Menlo','Consolas',monospace;
                    font-size: 12px; color: #1d7fd6;
                }
                .pso-green { color: #10b981; font-weight: 700; }
                .pso-dl-error {
                    color: #b42318; background: #fdecea;
                    border: 1px solid #ef4444; border-radius: 10px;
                    font-size: 13px; padding: 10px 14px;
                    margin-bottom: 12px; width: 100%; max-width: 480px;
                }
                .pso-actions {
                    display: flex; flex-direction: column;
                    gap: 10px; margin-bottom: 12px;
                }
                .pso-btn {
                    display: flex; align-items: center; justify-content: center;
                    gap: 8px; width: 100%; padding: 14px 20px;
                    border: none; border-radius: 12px;
                    font-size: 15px; font-weight: 700;
                    cursor: pointer;
                    transition: transform 0.15s ease, opacity 0.15s ease;
                }
                .pso-btn:hover:not(:disabled) { transform: translateY(-2px); }
                .pso-btn:disabled { opacity: 0.65; cursor: not-allowed; }
                .pso-btn-receipt {
                    background: linear-gradient(135deg, #0b4f8a, #1d7fd6);
                    color: #fff;
                    box-shadow: 0 4px 14px rgba(11,79,138,0.35);
                }
                .pso-btn-dashboard {
                    background: #f0f6ff; color: #0b4f8a;
                    border: 1px solid #cbdce8;
                }
                .pso-btn-dashboard:hover:not(:disabled) { background: #e0edf8; }
                .pso-spinner {
                    display: inline-block; width: 16px; height: 16px;
                    border: 2.5px solid rgba(255,255,255,0.35);
                    border-top-color: #fff; border-radius: 50%;
                    animation: pso-spin 0.7s linear infinite; flex-shrink: 0;
                }
                @keyframes pso-fade-in  { from { opacity: 0 } to { opacity: 1 } }
                @keyframes pso-pop      { from { transform: scale(0.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
                @keyframes pso-slide-up { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
                @keyframes pso-spin     { to { transform: rotate(360deg) } }
                @media (max-width: 520px) {
                    .pso-amount { font-size: 28px; }
                    .pso-title  { font-size: 20px; }
                }
            `}</style>
        </>
    );
}