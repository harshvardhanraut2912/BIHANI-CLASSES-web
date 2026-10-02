'use client';

// components/onboarding/ProfileOnboarding.js
//
// React counterpart to public/onboarding.js -- same mechanism, same
// bottom-right slide-up banner style as the cookie-consent banner.
// Mounted globally in app/layout.js so it covers every app-router page
// (dashboard, profile, cources/*). Skips /admin and /exam.
//
// Silent background check first: does this student's profiles row have
// every column onboarding actually collects (full_name, mobile_number,
// current_class, target_exams)? Other columns (username, avatar_url,
// email, current_session_id, is_online, is_exam_active, last_seen_at,
// updated_at) are system/internal fields this never touches or checks.
// If everything required is already filled, nothing renders, anywhere,
// for the rest of the session. If something's missing, the banner asks
// only for what's missing and tells the student they can change it
// later from their Profile page.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const STEPS = ['full_name', 'mobile_number', 'current_class', 'target_exams'];
const TARGET_EXAM_OPTIONS = ['MHT-CET 2027', 'MHT-CET 2028', 'HSC Boards 2027', 'HSC Boards 2028'];

function isMissing(record) {
    return (
        !record.full_name?.trim() ||
        !record.mobile_number?.trim() ||
        !record.current_class?.trim() ||
        !Array.isArray(record.target_exams) || record.target_exams.length === 0
    );
}

function firstMissingStep(record) {
    if (!record.full_name?.trim()) return 'full_name';
    if (!record.mobile_number?.trim()) return 'mobile_number';
    if (!record.current_class?.trim()) return 'current_class';
    return 'target_exams';
}

export default function ProfileOnboarding() {
    const pathname = usePathname();
    const skip = pathname?.startsWith('/admin') || pathname?.startsWith('/exam');

    const [visible, setVisible] = useState(false);
    const [userId, setUserId] = useState(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [leaving, setLeaving] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [formData, setFormData] = useState({
        full_name: '', mobile_number: '', current_class: '', target_exams: [],
    });

    // Silent background check, every mount with a live session -- so it
    // also re-opens on a later login if a required field is still empty.
    useEffect(() => {
        if (skip) return;
        let cancelled = false;

        (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const { data: record, error } = await supabase
                    .from('profiles')
                    .select('full_name, mobile_number, current_class, target_exams')
                    .eq('id', session.user.id)
                    .single();

                if (cancelled || error || !record) return;
                if (!isMissing(record)) return; // fully filled -> never renders, anywhere

                setUserId(session.user.id);
                setFormData({
                    full_name: record.full_name || '',
                    mobile_number: record.mobile_number || '',
                    current_class: record.current_class || '',
                    target_exams: Array.isArray(record.target_exams) ? record.target_exams : [],
                });
                setStepIndex(STEPS.indexOf(firstMissingStep(record)));
                setVisible(true);
            } catch (err) {
                console.error('Onboarding profile check failed:', err);
            }
        })();

        return () => { cancelled = true; };
    }, [skip, pathname]);

    if (skip || !visible) return null;

    const step = STEPS[stepIndex];
    const isLastStep = stepIndex === STEPS.length - 1;

    function updateField(name, value) {
        setFormData((prev) => ({ ...prev, [name]: value }));
        setErrorMsg('');
    }

    function toggleExam(exam) {
        setFormData((prev) => ({
            ...prev,
            target_exams: prev.target_exams.includes(exam)
                ? prev.target_exams.filter((t) => t !== exam)
                : [...prev.target_exams, exam],
        }));
        setErrorMsg('');
    }

    function validateStep() {
        if (step === 'full_name' && !formData.full_name.trim()) return 'Please enter your name.';
        if (step === 'mobile_number' && !/^[6-9][0-9]{9}$/.test(formData.mobile_number.trim())) return 'Enter a valid 10-digit mobile number.';
        if (step === 'current_class' && !formData.current_class) return 'Please choose one option.';
        if (step === 'target_exams' && formData.target_exams.length === 0) return 'Select at least one target milestone.';
        return '';
    }

    async function handleNext() {
        const err = validateStep();
        if (err) { setErrorMsg(err); return; }

        if (!isLastStep) { setStepIndex((i) => i + 1); return; }

        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: formData.full_name.trim(),
                    mobile_number: formData.mobile_number.trim(),
                    current_class: formData.current_class,
                    target_exams: formData.target_exams,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', userId);
            if (error) throw error;

            setLeaving(true);
            setTimeout(() => setVisible(false), 280);
        } catch (err) {
            console.error(err);
            setErrorMsg('Could not save right now. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    function handleBack() {
        setErrorMsg('');
        setStepIndex((i) => Math.max(0, i - 1));
    }

    return (
        <>
            <style jsx global>{`
                @keyframes ob-slide-up {
                    0%   { opacity: 0; transform: translateY(40px) scale(0.9); }
                    60%  { opacity: 1; transform: translateY(-4px) scale(1.02); }
                    100% { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes ob-slide-down {
                    0% { opacity: 1; transform: translateY(0) scale(1); }
                    100% { opacity: 0; transform: translateY(24px) scale(0.97); }
                }
                @keyframes ob-card-glow {
                    0%, 100% { box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08), 0 0 0 0 rgba(29, 127, 214, 0.45); }
                    50%      { box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08), 0 0 0 7px rgba(29, 127, 214, 0); }
                }
                @keyframes ob-dot-ping {
                    0%   { transform: scale(1); opacity: 1; }
                    75%, 100% { transform: scale(2.2); opacity: 0; }
                }
                @keyframes ob-backdrop-in { 0% { opacity: 0; } 100% { opacity: 1; } }
                .ob-backdrop {
                    position: fixed; inset: 0; z-index: 8999; pointer-events: none;
                    background: radial-gradient(circle at bottom right, rgba(6, 49, 92, 0.16), rgba(6, 49, 92, 0) 55%);
                    animation: ob-backdrop-in 0.5s ease-out;
                }
                .ob-banner {
                    position: fixed; right: 18px; bottom: 18px;
                    max-width: 400px; width: calc(100vw - 32px);
                    max-height: calc(100vh - 32px); overflow: auto;
                    background: linear-gradient(180deg, #ffffff 0%, #f7f9fc 100%);
                    border: 1.5px solid rgba(29, 127, 214, 0.4);
                    border-radius: 20px; padding: 24px 26px 22px;
                    box-shadow: 0 20px 45px rgba(6, 49, 92, 0.18), 0 4px 12px rgba(6, 49, 92, 0.08);
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                    z-index: 9000; color: #0f1f2e;
                    animation: ob-slide-up 0.55s cubic-bezier(0.22, 1, 0.36, 1), ob-card-glow 2.6s ease-in-out 0.6s 3;
                }
                .ob-banner.ob-leaving { animation: ob-slide-down 0.3s cubic-bezier(0.4, 0, 1, 1) forwards; }
                .ob-top { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
                .ob-icon {
                    position: relative;
                    flex: none; width: 40px; height: 40px; border-radius: 12px;
                    background: linear-gradient(135deg, #1d7fd6, #0b4f8a);
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 6px 16px rgba(11, 79, 138, 0.35);
                }
                .ob-icon-dot {
                    position: absolute; top: -3px; right: -3px; width: 10px; height: 10px;
                    border-radius: 50%; background: #ff5757; border: 2px solid #fff;
                }
                .ob-icon-dot::after {
                    content: ''; position: absolute; inset: -2px; border-radius: 50%;
                    background: #ff5757; animation: ob-dot-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
                }
                .ob-banner h3 { margin: 0 0 2px; font-size: 18px; font-weight: 800; color: #06315c; letter-spacing: -0.01em; }
                .ob-banner p { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: #5c6b7a; }
                .ob-progress { display: flex; gap: 6px; margin-bottom: 14px; }
                .ob-dot { flex: 1; height: 4px; border-radius: 999px; background: #e2e8f0; }
                .ob-dot.is-active { background: #1d7fd6; }
                .ob-dot.is-done { background: #0b4f8a; }
                .ob-input {
                    width: 100%; box-sizing: border-box; background: #f7f9fc;
                    border: 1px solid #dbe6f0; border-radius: 10px; padding: 12px 14px;
                    font-size: 15px; font-weight: 500; color: #0f1f2e; outline: none;
                }
                .ob-input:focus { border-color: #1d7fd6; box-shadow: 0 0 0 3px rgba(29,127,214,0.12); }
                .ob-phone-wrap { position: relative; display: flex; align-items: center; }
                .ob-phone-prefix {
                    position: absolute; left: 12px; display: flex; align-items: center; gap: 6px;
                    font-size: 13px; font-weight: 700; color: #0f1f2e;
                    border-right: 1px solid #dbe6f0; padding-right: 8px; height: 18px; user-select: none;
                }
                .ob-phone-prefix img { width: 16px; border-radius: 2px; }
                .ob-input.ob-phone-input { padding-left: 68px; }
                .ob-choice-grid { display: flex; flex-direction: column; gap: 8px; }
                .ob-choice {
                    width: 100%; text-align: left; background: #f7f9fc; border: 1px solid #dbe6f0;
                    border-radius: 10px; padding: 11px 14px; font-size: 13.5px; font-weight: 600;
                    color: #0f1f2e; cursor: pointer; transition: all 0.15s ease;
                }
                .ob-choice:hover { border-color: #1d7fd6; }
                .ob-choice.is-checked { background: #eaf3fc; border-color: #0b4f8a; color: #0b4f8a; font-weight: 700; }
                .ob-error {
                    margin-top: 10px; background: #fdecea; border: 1px solid #ef4444; color: #b42318;
                    font-size: 12px; font-weight: 600; padding: 8px 11px; border-radius: 8px;
                }
                .ob-note { margin-top: 12px; font-size: 11.5px; color: #8494a5; line-height: 1.5; }
                .ob-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; gap: 10px; }
                .ob-btn-back { background: transparent; border: none; color: #5c6b7a; font-size: 13px; font-weight: 700; cursor: pointer; padding: 8px 4px; }
                .ob-btn-back:hover { color: #0f1f2e; }
                .ob-btn-next {
                    background: linear-gradient(135deg, #1d7fd6, #0b4f8a); color: #fff; border: none;
                    padding: 11px 24px; border-radius: 999px; font-size: 13.5px; font-weight: 700;
                    cursor: pointer; margin-left: auto; box-shadow: 0 6px 16px rgba(11, 79, 138, 0.28);
                }
                .ob-btn-next:hover:not(:disabled) { transform: translateY(-1px); }
                .ob-btn-next:disabled { opacity: 0.7; cursor: not-allowed; }
                [data-theme="dark"] .ob-banner { background: linear-gradient(180deg, #0e1a2b 0%, #0a1522 100%); border-color: rgba(29,127,214,0.25); }
                [data-theme="dark"] .ob-banner h3 { color: #eaf2fb; }
                [data-theme="dark"] .ob-banner p, [data-theme="dark"] .ob-note { color: #93a3b8; }
                [data-theme="dark"] .ob-input, [data-theme="dark"] .ob-choice { background: #16233a; border-color: rgba(29,127,214,0.25); color: #eaf2fb; }
                @media (max-width: 420px) { .ob-banner { right: 8px; bottom: 8px; padding: 18px 18px 16px; } }
            `}</style>

            {!leaving && <div className="ob-backdrop" />}
            <div className={`ob-banner ${leaving ? 'ob-leaving' : ''}`} role="dialog" aria-live="polite">
                <div className="ob-progress">
                    {STEPS.map((s, i) => (
                        <span key={s} className={`ob-dot ${i === stepIndex ? 'is-active' : i < stepIndex ? 'is-done' : ''}`} />
                    ))}
                </div>

                <div className="ob-top">
                    <div className="ob-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="8" r="4" />
                            <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
                        </svg>
                        <span className="ob-icon-dot" />
                    </div>
                </div>

                {step === 'full_name' && (
                    <>
                        <h3>What's your name?</h3>
                        <p>This is how we'll address you across the portal.</p>
                        <input
                            type="text" className="ob-input" placeholder="Enter your full name"
                            value={formData.full_name}
                            onChange={(e) => updateField('full_name', e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                            autoFocus
                        />
                    </>
                )}

                {step === 'mobile_number' && (
                    <>
                        <h3>Your mobile number?</h3>
                        <p>We'll use this for important exam & batch updates.</p>
                        <div className="ob-phone-wrap">
                            <span className="ob-phone-prefix">
                                <img src="https://flagcdn.com/w20/in.png" alt="India Flag" /> +91
                            </span>
                            <input
                                type="tel" className="ob-input ob-phone-input" placeholder="9876543210"
                                value={formData.mobile_number}
                                onChange={(e) => updateField('mobile_number', e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                                autoFocus
                            />
                        </div>
                    </>
                )}

                {step === 'current_class' && (
                    <>
                        <h3>What are you looking for?</h3>
                        <p>Boards, MHT-CET, or Engineering prep.</p>
                        <div className="ob-choice-grid">
                            {[
                                { value: '11th', label: '11th Standard' },
                                { value: '12th', label: '12th Standard' },
                                { value: 'Dropper', label: 'Dropper / Repeater' },
                            ].map((opt) => (
                                <button
                                    type="button" key={opt.value}
                                    className={`ob-choice ${formData.current_class === opt.value ? 'is-checked' : ''}`}
                                    onClick={() => updateField('current_class', opt.value)}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {step === 'target_exams' && (
                    <>
                        <h3>Target milestones?</h3>
                        <p>Select all that apply.</p>
                        <div className="ob-choice-grid">
                            {TARGET_EXAM_OPTIONS.map((exam) => (
                                <button
                                    type="button" key={exam}
                                    className={`ob-choice ${formData.target_exams.includes(exam) ? 'is-checked' : ''}`}
                                    onClick={() => toggleExam(exam)}
                                >
                                    {exam}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {errorMsg && <div className="ob-error">{errorMsg}</div>}
                <p className="ob-note">You can always update these later from your Profile page.</p>

                <div className="ob-actions">
                    {stepIndex > 0 ? (
                        <button type="button" className="ob-btn-back" onClick={handleBack} disabled={saving}>Back</button>
                    ) : <span />}
                    <button type="button" className="ob-btn-next" onClick={handleNext} disabled={saving}>
                        {saving ? 'Saving…' : isLastStep ? 'Finish' : 'Next'}
                    </button>
                </div>
            </div>
        </>
    );
}
