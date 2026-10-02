'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

// Calls the server for real now -- /api/coupon/validate is the single
// source of truth for whether a code is valid and what it's worth. This
// component never invents a discount number itself; it only ever displays
// what the server returned. onApply passes { code, discount_amount } up to
// BuyBox once validated (or null when removed/invalid).
export default function CouponBox({ onApply }) {
    const [code, setCode] = useState('');
    const [status, setStatus] = useState('idle'); // idle | checking | applied | error
    const [errorMsg, setErrorMsg] = useState('');
    const [open, setOpen] = useState(false);

    const handleApply = async () => {
        const trimmed = code.trim();
        if (!trimmed) return;

        // Must be logged in to apply a coupon -- send straight to login,
        // and back to this exact page once signed in.
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
            return;
        }

        setStatus('checking');
        setErrorMsg('');
        try {
            const res = await fetch('/api/coupon/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: trimmed }),
            });
            const data = await res.json();

            if (!res.ok || !data.valid) {
                setStatus('error');
                setErrorMsg(data.error || 'Invalid coupon code.');
                if (onApply) onApply(null);
                return;
            }

            setStatus('applied');
            setCode(data.code);
            if (onApply) onApply({ code: data.code, discount_amount: data.discount_amount });
        } catch (err) {
            setStatus('error');
            setErrorMsg('Could not validate coupon right now.');
            if (onApply) onApply(null);
        }
    };

    const handleRemove = () => {
        setCode('');
        setStatus('idle');
        setErrorMsg('');
        if (onApply) onApply(null);
    };

    if (!open && status === 'idle') {
        return (
            <button type="button" className="cb-toggle" onClick={() => setOpen(true)}>
                <span className="cb-toggle-icon">%</span>
                Have a coupon code?
                <style jsx>{`
                    .cb-toggle {
                        width: 100%;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        background: var(--faint-blue, #e8f1fb);
                        border: 1px dashed var(--primary-blue, #0b4f8a);
                        color: var(--primary-blue, #0b4f8a);
                        font-weight: 600;
                        font-size: 14px;
                        padding: 10px 14px;
                        border-radius: 10px;
                        cursor: pointer;
                        margin-top: 10px;
                    }
                    .cb-toggle-icon {
                        width: 20px;
                        height: 20px;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        background: var(--primary-blue, #0b4f8a);
                        color: #fff;
                        border-radius: 6px;
                        font-size: 12px;
                    }
                `}</style>
            </button>
        );
    }

    return (
        <div className="cb-box">
            {status === 'applied' ? (
                <div className="cb-applied">
                    <span>
                        Coupon <strong>{code}</strong> applied
                    </span>
                    <button type="button" className="cb-remove" onClick={handleRemove}>
                        Remove
                    </button>
                </div>
            ) : (
                <>
                    <div className="cb-row">
                        <input
                            type="text"
                            placeholder="Enter coupon code"
                            value={code}
                            onChange={(e) => {
                                setCode(e.target.value.toUpperCase());
                                if (status === 'error') { setStatus('idle'); setErrorMsg(''); }
                            }}
                            className="cb-input"
                            disabled={status === 'checking'}
                        />
                        <button type="button" className="cb-apply" onClick={handleApply} disabled={status === 'checking'}>
                            {status === 'checking' ? 'Checking…' : 'Apply'}
                        </button>
                    </div>
                    {status === 'error' && <div className="cb-error-msg">{errorMsg}</div>}
                </>
            )}
            <style jsx>{`
                .cb-box { margin-top: 10px; }
                .cb-row { display: flex; gap: 8px; }
                .cb-input {
                    flex: 1;
                    padding: 10px 12px;
                    border-radius: 10px;
                    border: 1px solid var(--card-border, #cbdce8);
                    font-size: 14px;
                    outline: none;
                    background: var(--card-bg, #fff);
                    color: var(--text-main, #0f1f2e);
                }
                .cb-input:focus { border-color: var(--primary-blue, #0b4f8a); }
                .cb-apply {
                    padding: 10px 18px;
                    border-radius: 10px;
                    border: none;
                    background: var(--primary-blue, #0b4f8a);
                    color: #fff;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .cb-apply:disabled { opacity: 0.6; cursor: not-allowed; }
                .cb-applied {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #e8f8f0;
                    border: 1px solid var(--success, #10b981);
                    color: #0f5132;
                    padding: 10px 14px;
                    border-radius: 10px;
                    font-size: 14px;
                }
                .cb-remove {
                    background: none;
                    border: none;
                    color: var(--danger, #ef4444);
                    font-weight: 600;
                    font-size: 13px;
                    cursor: pointer;
                }
                .cb-error-msg {
                    margin-top: 8px;
                    background: #fdecea;
                    border: 1px solid var(--danger, #ef4444);
                    color: #b42318;
                    font-size: 13px;
                    font-weight: 600;
                    padding: 8px 12px;
                    border-radius: 8px;
                }
            `}</style>
        </div>
    );
}