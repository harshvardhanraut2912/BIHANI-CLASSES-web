'use client';

// components/onboarding/ProfileOnboarding.js
//
// React counterpart to public/onboarding.js -- same mechanism, same
// bottom-right slide-up banner style as the cookie-consent banner.
// Bihani Chemistry Classes theme: blue / red / yellow, lab-glassware motifs,
// periodic-table style choice tiles, bubbling + orbiting-electron animations.
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


// ---- Chemistry-theme helpers (presentation only, no logic) ----------------

// Per-step lab glyph shown inside the header badge.
function StepIcon({ step }) {
    const common = { viewBox: '0 0 24 24', fill: 'none', stroke: '#ffffff', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', className: 'ob-icon-svg' };
    if (step === 'full_name') {
        // atom
        return (
            <svg {...common}>
                <ellipse cx="12" cy="12" rx="9.5" ry="3.8" />
                <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" />
                <ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" />
                <circle cx="12" cy="12" r="1.6" fill="#ffffff" stroke="none" />
            </svg>
        );
    }
    if (step === 'mobile_number') {
        // molecule (3 bonded atoms)
        return (
            <svg {...common}>
                <path d="M7.8 8.4 10.4 15.2M16.2 8.4 13.6 15.2M8.9 6.5h6.2" />
                <circle cx="6.5" cy="6.5" r="2.6" fill="#ffffff" fillOpacity="0.25" />
                <circle cx="17.5" cy="6.5" r="2.6" fill="#ffffff" fillOpacity="0.25" />
                <circle cx="12" cy="17.5" r="2.8" fill="#ffffff" fillOpacity="0.25" />
            </svg>
        );
    }
    if (step === 'current_class') {
        // conical flask
        return (
            <svg {...common}>
                <path d="M9.5 3h5M10.5 3v6L4.8 18.6A2 2 0 0 0 6.5 21.5h11a2 2 0 0 0 1.7-2.9L13.5 9V3" />
                <path d="M7.4 15.2h9.2" />
                <circle cx="11" cy="18" r="0.7" fill="#ffffff" stroke="none" />
                <circle cx="14" cy="17" r="0.7" fill="#ffffff" stroke="none" />
            </svg>
        );
    }
    // benzene ring
    return (
        <svg {...common}>
            <path d="M12 3 19.8 7.5V16.5L12 21 4.2 16.5V7.5Z" />
            <circle cx="12" cy="12" r="4" />
        </svg>
    );
}

// Periodic-table style tile data for the choice buttons (UI only).
const CLASS_TILES = { '11th': { num: 11, sym: 'Na' }, '12th': { num: 12, sym: 'Mg' }, 'Dropper': { num: 75, sym: 'Re' } };
function examTile(exam) {
    return { num: exam.slice(-2), sym: exam.startsWith('MHT') ? 'Ce' : 'Hs' };
}

const BUBBLES = [
    { x: '8%', s: 7, d: '5.2s', dl: '0s' },
    { x: '22%', s: 5, d: '6.4s', dl: '-2s' },
    { x: '41%', s: 9, d: '7.1s', dl: '-4s' },
    { x: '63%', s: 6, d: '5.8s', dl: '-1s' },
    { x: '79%', s: 8, d: '6.8s', dl: '-3s' },
    { x: '92%', s: 5, d: '5.5s', dl: '-5s' },
];

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
                    0%, 100% { box-shadow: 0 20px 45px rgba(16, 24, 58, 0.2), 0 4px 12px rgba(16, 24, 58, 0.08), 0 0 0 0 var(--acc-soft); }
                    50%      { box-shadow: 0 20px 45px rgba(16, 24, 58, 0.2), 0 4px 12px rgba(16, 24, 58, 0.08), 0 0 0 8px rgba(255, 255, 255, 0); }
                }
                @keyframes ob-dot-ping {
                    0%   { transform: scale(1); opacity: 1; }
                    75%, 100% { transform: scale(2.2); opacity: 0; }
                }
                @keyframes ob-backdrop-in { 0% { opacity: 0; } 100% { opacity: 1; } }
                @keyframes ob-spin { to { transform: rotate(360deg); } }
                @keyframes ob-spin-rev { to { transform: rotate(-360deg); } }
                @keyframes ob-bubble-rise {
                    0%   { transform: translateY(0) scale(0.6); opacity: 0; }
                    15%  { opacity: 0.8; }
                    100% { transform: translateY(-160px) scale(1.15); opacity: 0; }
                }
                @keyframes ob-float { 50% { transform: translateY(-5px); } }
                @keyframes ob-icon-pop {
                    0%   { opacity: 0; transform: scale(0.4) rotate(-40deg); }
                    70%  { opacity: 1; transform: scale(1.12) rotate(6deg); }
                    100% { opacity: 1; transform: scale(1) rotate(0); }
                }
                @keyframes ob-step-in {
                    0%   { opacity: 0; transform: translateX(14px); }
                    100% { opacity: 1; transform: translateX(0); }
                }
                @keyframes ob-shimmer {
                    0%   { background-position: -120% 0; }
                    100% { background-position: 220% 0; }
                }
                @keyframes ob-liquid {
                    0%, 100% { background-position: 0% 50%; }
                    50%      { background-position: 100% 50%; }
                }
                @keyframes ob-stripe {
                    0%, 100% { background-position: 0% 50%; }
                    50%      { background-position: 100% 50%; }
                }

                /* Palette: blue / red / yellow (+ green as 4th indicator colour) */
                .ob-banner {
                    --blue: #1f6feb; --blue-d: #1348b8;
                    --red: #e0242c;  --red-d: #a8141b;
                    --yellow: #f5b81d; --yellow-d: #d98e00;
                    --green: #22a45d; --green-d: #147a40;
                    --ink: #10183a; --muted: #55607a; --line: #dde3f0; --soft: #f7f9ff;
                    --acc: var(--blue); --acc-d: var(--blue-d); --acc-soft: rgba(31, 111, 235, 0.22); --acc-ink: #ffffff;
                }
                .ob-banner.ob-step-1 { --acc: var(--red); --acc-d: var(--red-d); --acc-soft: rgba(224, 36, 44, 0.22); }
                .ob-banner.ob-step-2 { --acc: var(--yellow); --acc-d: var(--yellow-d); --acc-soft: rgba(245, 184, 29, 0.35); --acc-ink: #3a2a00; }
                .ob-banner.ob-step-3 { --acc: var(--green); --acc-d: var(--green-d); --acc-soft: rgba(34, 164, 93, 0.22); }

                .ob-backdrop {
                    position: fixed; inset: 0; z-index: 8999; pointer-events: none;
                    background:
                        radial-gradient(circle at bottom right, rgba(31, 111, 235, 0.2), rgba(31, 111, 235, 0) 50%),
                        radial-gradient(circle at 85% 100%, rgba(224, 36, 44, 0.12), rgba(224, 36, 44, 0) 40%),
                        radial-gradient(circle at 60% 100%, rgba(245, 184, 29, 0.16), rgba(245, 184, 29, 0) 40%);
                    animation: ob-backdrop-in 0.5s ease-out;
                }
                .ob-banner {
                    position: fixed; right: 18px; bottom: 18px;
                    max-width: 400px; width: calc(100vw - 32px);
                    max-height: calc(100vh - 32px); overflow-x: hidden; overflow-y: auto;
                    background: linear-gradient(180deg, #ffffff 0%, var(--soft) 100%);
                    border: 1.5px solid var(--line);
                    border-radius: 20px; padding: 24px 26px 22px;
                    box-shadow: 0 20px 45px rgba(16, 24, 58, 0.2), 0 4px 12px rgba(16, 24, 58, 0.08);
                    font-family: var(--font-body, 'DM Sans'), 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    z-index: 9000; color: var(--ink);
                    animation: ob-slide-up 0.55s cubic-bezier(0.22, 1, 0.36, 1), ob-card-glow 2.6s ease-in-out 0.6s 3;
                }
                .ob-banner.ob-leaving { animation: ob-slide-down 0.3s cubic-bezier(0.4, 0, 1, 1) forwards; }
                .ob-banner > *:not(.ob-decor) { position: relative; z-index: 1; }

                /* decorative lab layer: tri-colour stripe, benzene rings, rising bubbles */
                .ob-decor { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; border-radius: 18px; }
                .ob-decor::before {
                    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 5px;
                    background: linear-gradient(90deg, var(--blue), var(--red), var(--yellow), var(--green), var(--blue));
                    background-size: 200% 100%; animation: ob-stripe 6s ease-in-out infinite;
                }
                .ob-ring {
                    position: absolute; top: -22px; right: -26px; width: 130px; height: 130px;
                    opacity: 0.35; animation: ob-spin 40s linear infinite;
                }
                .ob-ring-2 {
                    position: absolute; bottom: 70px; left: -34px; width: 92px; height: 92px;
                    opacity: 0.3; animation: ob-spin-rev 55s linear infinite;
                }
                .ob-bubble {
                    position: absolute; bottom: -12px; border-radius: 50%;
                    border: 1.5px solid var(--bc, var(--blue));
                    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.9), var(--bg, rgba(31,111,235,0.18)));
                    opacity: 0; animation: ob-bubble-rise ease-in infinite;
                }
                .ob-bubble:nth-of-type(4n+1) { --bc: var(--blue);   --bg: rgba(31, 111, 235, 0.22); }
                .ob-bubble:nth-of-type(4n+2) { --bc: var(--red);    --bg: rgba(224, 36, 44, 0.2); }
                .ob-bubble:nth-of-type(4n+3) { --bc: var(--yellow); --bg: rgba(245, 184, 29, 0.35); }
                .ob-bubble:nth-of-type(4n+4) { --bc: var(--green);  --bg: rgba(34, 164, 93, 0.22); }

                .ob-top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
                .ob-icon {
                    position: relative;
                    flex: none; width: 44px; height: 44px; border-radius: 13px;
                    background: linear-gradient(135deg, var(--acc), var(--acc-d));
                    display: flex; align-items: center; justify-content: center;
                    box-shadow: 0 6px 16px var(--acc-soft);
                    animation: ob-float 3.2s ease-in-out infinite;
                    transition: background 0.4s ease;
                }
                .ob-icon::before {
                    content: ''; position: absolute; inset: -6px; border-radius: 17px;
                    border: 1.5px dashed var(--acc);
                    animation: ob-spin 14s linear infinite;
                }
                .ob-icon-svg { width: 24px; height: 24px; animation: ob-icon-pop 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
                .ob-step-2 .ob-icon-svg { stroke: #3a2a00; }
                .ob-step-2 .ob-icon-svg [fill="#ffffff"] { fill: #3a2a00; }
                .ob-icon-dot {
                    position: absolute; top: -3px; right: -3px; width: 10px; height: 10px;
                    border-radius: 50%; background: var(--red); border: 2px solid #fff;
                }
                .ob-step-1 .ob-icon-dot { background: var(--yellow); }
                .ob-step-1 .ob-icon-dot::after { background: var(--yellow); }
                .ob-icon-dot::after {
                    content: ''; position: absolute; inset: -2px; border-radius: 50%;
                    background: var(--red); animation: ob-dot-ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
                }
                .ob-tag { display: flex; flex-direction: column; line-height: 1.2; }
                .ob-tag b { font-size: 10.5px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink); }
                .ob-tag span { font-size: 11.5px; font-weight: 700; color: var(--muted); margin-top: 2px; }
                .ob-tag span::before {
                    content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%;
                    background: var(--acc); margin-right: 6px; vertical-align: 0;
                }

                .ob-banner h3 {
                    margin: 0 0 2px; font-size: 19px; font-weight: 800; color: var(--ink); letter-spacing: -0.02em;
                    font-family: var(--font-display, 'Bricolage Grotesque'), var(--font-body, 'DM Sans'), 'Inter', sans-serif;
                    animation: ob-step-in 0.35s ease-out;
                }
                .ob-banner h3::after {
                    content: ''; display: block; width: 46px; height: 4px; border-radius: 999px; margin: 6px 0 8px;
                    background: linear-gradient(90deg, var(--blue) 0 33%, var(--red) 33% 66%, var(--yellow) 66% 100%);
                }
                .ob-banner p { margin: 0 0 16px; font-size: 13px; line-height: 1.6; color: var(--muted); }
                .ob-banner h3 + p, .ob-banner h3 ~ .ob-input, .ob-banner h3 ~ .ob-phone-wrap, .ob-banner h3 ~ .ob-choice-grid { animation: ob-step-in 0.4s ease-out; }

                /* progress: atoms joined by bonds, one indicator colour per step */
                .ob-progress { display: flex; gap: 14px; margin: 4px 6px 16px 0; }
                .ob-dot { --c: var(--blue); position: relative; flex: 1; height: 4px; border-radius: 999px; background: var(--line); transition: background 0.3s ease; }
                .ob-dot:nth-child(2) { --c: var(--red); }
                .ob-dot:nth-child(3) { --c: var(--yellow); }
                .ob-dot:nth-child(4) { --c: var(--green); }
                .ob-dot::after {
                    content: ''; position: absolute; right: -5px; top: 50%; width: 11px; height: 11px;
                    transform: translateY(-50%); border-radius: 50%; background: #ffffff;
                    border: 2px solid var(--line); box-sizing: border-box; z-index: 1; transition: all 0.3s ease;
                }
                .ob-dot.is-active {
                    background: linear-gradient(90deg, var(--c), #ffffff 50%, var(--c)); background-size: 220% 100%;
                    animation: ob-shimmer 1.8s linear infinite;
                }
                .ob-dot.is-active::after { border-color: var(--c); background: var(--c); box-shadow: 0 0 0 3px var(--acc-soft); }
                .ob-dot.is-done { background: var(--c); }
                .ob-dot.is-done::after { border-color: var(--c); background: var(--c); }

                .ob-input {
                    width: 100%; box-sizing: border-box; background: #ffffff;
                    border: 1.5px solid var(--line); border-radius: 12px; padding: 12px 14px;
                    font-size: 15px; font-weight: 500; color: var(--ink); outline: none;
                    font-family: inherit; transition: border-color 0.2s ease, box-shadow 0.2s ease;
                }
                .ob-input:focus { border-color: var(--acc); box-shadow: 0 0 0 3px var(--acc-soft); }
                .ob-phone-wrap { position: relative; display: flex; align-items: center; }
                .ob-phone-prefix {
                    position: absolute; left: 12px; display: flex; align-items: center; gap: 6px;
                    font-size: 13px; font-weight: 700; color: var(--ink);
                    border-right: 1px solid var(--line); padding-right: 8px; height: 18px; user-select: none;
                }
                .ob-phone-prefix img { width: 16px; border-radius: 2px; }
                .ob-input.ob-phone-input { padding-left: 68px; }

                /* choice buttons = periodic-table tiles, each in its own colour */
                .ob-choice-grid { display: flex; flex-direction: column; gap: 8px; }
                .ob-choice {
                    --c: var(--blue); --c-ink: #ffffff; --c-soft: rgba(31, 111, 235, 0.12);
                    position: relative; width: 100%; text-align: left; background: #ffffff; border: 1.5px solid var(--line);
                    border-radius: 12px; padding: 8px 12px; font-size: 13.5px; font-weight: 600;
                    color: var(--ink); cursor: pointer; transition: all 0.18s ease; font-family: inherit;
                    display: flex; align-items: center; gap: 12px;
                }
                .ob-choice:nth-child(2) { --c: var(--red);    --c-soft: rgba(224, 36, 44, 0.1); }
                .ob-choice:nth-child(3) { --c: var(--yellow); --c-soft: rgba(245, 184, 29, 0.22); --c-ink: #3a2a00; }
                .ob-choice:nth-child(4) { --c: var(--green);  --c-soft: rgba(34, 164, 93, 0.12); }
                .ob-choice:hover { border-color: var(--c); transform: translateX(2px); }
                .ob-tile {
                    position: relative; flex: none; width: 38px; height: 38px; border-radius: 8px;
                    border: 1.5px solid var(--c); color: var(--c); background: var(--c-soft);
                    display: flex; align-items: center; justify-content: center;
                    font-family: var(--font-display, 'Bricolage Grotesque'), 'Inter', sans-serif;
                    font-size: 15px; font-weight: 800; transition: all 0.2s ease;
                }
                .ob-choice:nth-child(3) .ob-tile { color: var(--yellow-d); }
                .ob-tile small { position: absolute; top: 2px; left: 4px; font-size: 8px; font-weight: 700; opacity: 0.85; }
                .ob-choice-label { flex: 1; }
                .ob-choice.is-checked { background: var(--c-soft); border-color: var(--c); font-weight: 700; }
                .ob-choice.is-checked .ob-tile { background: var(--c); color: var(--c-ink); box-shadow: 0 0 0 3px var(--c-soft); }
                .ob-choice.is-checked::after {
                    content: '\\2713'; flex: none; width: 20px; height: 20px; border-radius: 50%;
                    background: var(--c); color: var(--c-ink); font-size: 12px; font-weight: 800;
                    display: flex; align-items: center; justify-content: center;
                    animation: ob-icon-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1);
                }

                .ob-error {
                    margin-top: 10px; background: #fdecea; border: 1px solid #e0242c; color: #b42318;
                    font-size: 12px; font-weight: 600; padding: 8px 11px; border-radius: 8px;
                }
                .ob-note { margin-top: 12px; font-size: 11.5px; color: #7b86a0; line-height: 1.5; }
                .ob-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; gap: 10px; }
                .ob-btn-back { background: transparent; border: none; color: var(--muted); font-size: 13px; font-weight: 700; cursor: pointer; padding: 8px 4px; font-family: inherit; }
                .ob-btn-back:hover { color: var(--ink); }
                .ob-btn-next {
                    background: linear-gradient(135deg, var(--acc), var(--acc-d), var(--acc)); background-size: 200% 100%;
                    color: var(--acc-ink); border: none; font-family: inherit;
                    padding: 11px 26px; border-radius: 12px; font-size: 13.5px; font-weight: 700;
                    cursor: pointer; margin-left: auto; box-shadow: 0 6px 16px var(--acc-soft);
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                    animation: ob-liquid 5s ease-in-out infinite;
                }
                .ob-btn-next:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 20px var(--acc-soft), 0 0 0 3px var(--acc-soft); }
                .ob-btn-next:disabled { opacity: 0.7; cursor: not-allowed; }

                [data-theme="dark"] .ob-banner {
                    --ink: #eef0fb; --muted: #a3acc7; --line: rgba(255, 255, 255, 0.12); --soft: #0b0f24;
                    background: linear-gradient(180deg, #131833 0%, #0b0f24 100%);
                }
                [data-theme="dark"] .ob-note { color: #8a93b0; }
                [data-theme="dark"] .ob-input, [data-theme="dark"] .ob-choice { background: #181e3f; }
                [data-theme="dark"] .ob-dot::after { background: #131833; }
                [data-theme="dark"] .ob-icon-dot { border-color: #131833; }
                [data-theme="dark"] .ob-ring, [data-theme="dark"] .ob-ring-2 { opacity: 0.5; }
                [data-theme="dark"] .ob-choice:nth-child(3) .ob-tile { color: var(--yellow); }
                [data-theme="dark"] .ob-choice:nth-child(3).is-checked .ob-tile { color: #3a2a00; }
                [data-theme="dark"] .ob-choice:nth-child(1) .ob-tile { color: #6ea8ff; }

                @media (max-width: 420px) { .ob-banner { right: 8px; bottom: 8px; padding: 20px 18px 16px; } }
                @media (prefers-reduced-motion: reduce) {
                    .ob-ring, .ob-ring-2, .ob-bubble, .ob-icon, .ob-icon::before, .ob-dot.is-active, .ob-btn-next, .ob-decor::before { animation: none; }
                }
            `}</style>

            {!leaving && <div className="ob-backdrop" />}
            <div className={`ob-banner ob-step-${stepIndex} ${leaving ? 'ob-leaving' : ''}`} role="dialog" aria-live="polite">
                <div className="ob-decor" aria-hidden="true">
                    <svg className="ob-ring" viewBox="0 0 100 100" fill="none" strokeWidth="3" strokeLinejoin="round">
                        <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" stroke="#1f6feb" />
                        <polygon points="50,22 74,36 74,64 50,78 26,64 26,36" stroke="#e0242c" strokeWidth="2" />
                        <circle cx="50" cy="50" r="9" stroke="#f5b81d" />
                    </svg>
                    <svg className="ob-ring-2" viewBox="0 0 100 100" fill="none" stroke="#22a45d" strokeWidth="4" strokeLinejoin="round">
                        <polygon points="50,6 88,28 88,72 50,94 12,72 12,28" />
                    </svg>
                    {BUBBLES.map((b, i) => (
                        <span
                            key={i} className="ob-bubble"
                            style={{ left: b.x, width: b.s, height: b.s, animationDuration: b.d, animationDelay: b.dl }}
                        />
                    ))}
                </div>

                <div className="ob-progress">
                    {STEPS.map((s, i) => (
                        <span key={s} className={`ob-dot ${i === stepIndex ? 'is-active' : i < stepIndex ? 'is-done' : ''}`} />
                    ))}
                </div>

                <div className="ob-top">
                    <div className="ob-icon">
                        <StepIcon key={step} step={step} />
                        <span className="ob-icon-dot" />
                    </div>
                    <div className="ob-tag">
                        <b>Bihani Chemistry Classes</b>
                        <span>Step {stepIndex + 1} of {STEPS.length}</span>
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
                                    <span className="ob-tile"><small>{CLASS_TILES[opt.value].num}</small>{CLASS_TILES[opt.value].sym}</span>
                                    <span className="ob-choice-label">{opt.label}</span>
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
                                    <span className="ob-tile"><small>{examTile(exam).num}</small>{examTile(exam).sym}</span>
                                    <span className="ob-choice-label">{exam}</span>
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
