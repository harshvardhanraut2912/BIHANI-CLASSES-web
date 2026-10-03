'use client';

import { useState } from 'react';
import { Ico } from './icons';
import { CONTACT } from '@/lib/siteConfig';
import s from './site.module.css';

const CLASSES = ['Class 11 (HSC)', 'Class 12 (HSC)', 'Class 11 + 12 (Full course)', 'Dropper / Repeater', 'Foundation (Class 8–10)'];
const EXAMS = ['MHT-CET', 'JEE', 'NEET', 'Board Exam Only', 'Not sure yet'];

function cleanPhone(v) {
  return v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
}

// Posts the same payload as the old contact.html to the existing /api/contact route.
export default function ContactForm() {
  const [f, setF] = useState({ name: '', mobile: '', email: '', classInterested: '', targetExam: '', message: '', demo: false });
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | done | failed

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function validate() {
    const er = {};
    if (!f.name.trim()) er.name = 'Please enter the student\'s name.';
    if (!/^[6-9]\d{9}$/.test(cleanPhone(f.mobile))) er.mobile = 'Enter a valid 10-digit mobile number.';
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) er.email = 'That email address does not look right.';
    setErrors(er);
    return Object.keys(er).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    if (status === 'sending' || !validate()) return;
    setStatus('sending');
    const note = f.message.trim();
    const payload = {
      name: f.name.trim(),
      email: f.email.trim(),
      mobile: cleanPhone(f.mobile),
      classInterested: f.classInterested,
      targetExam: f.targetExam,
      message: f.demo ? `[Demo lecture requested] ${note}`.trim() : note,
    };
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error('Submission failed');
      setStatus('done');
    } catch (err) {
      console.error('Enquiry submit failed:', err);
      setStatus('failed');
    }
  }

  function reset() {
    setF({ name: '', mobile: '', email: '', classInterested: '', targetExam: '', message: '', demo: false });
    setErrors({});
    setStatus('idle');
  }

  if (status === 'done') {
    return (
      <div className={s.formCard} role="status">
        <div className={s.doneBox}>
          <span className={s.doneIcon}><Ico name="check" size={30} /></span>
          <h2 className={s.formH}>Thank you, we have your enquiry.</h2>
          <p className={s.formSub}>Our team will call you during class hours. For a faster reply, message us on WhatsApp.</p>
          <div className={s.doneBtns}>
            <a href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer" className={s.solidBtn}><Ico name="whatsapp" size={18} /> Chat on WhatsApp</a>
            <button type="button" className={s.textBtn} onClick={reset}>Send another enquiry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className={s.formCard} onSubmit={submit} noValidate>
      <h2 className={s.formH}>Send an enquiry</h2>
      <p className={s.formSub}>Tell us a little about the student and we will get back to you the same working day.</p>

      <div className={s.field}>
        <label className={s.label} htmlFor="enq-name">Student name *</label>
        <input id="enq-name" className={s.input} value={f.name} onChange={set('name')} autoComplete="name" placeholder="Full name" aria-invalid={!!errors.name} />
        {errors.name && <span className={s.err}>{errors.name}</span>}
      </div>

      <div className={s.row2}>
        <div className={s.field}>
          <label className={s.label} htmlFor="enq-phone">Mobile number *</label>
          <input id="enq-phone" className={s.input} value={f.mobile} onChange={set('mobile')} inputMode="tel" autoComplete="tel" placeholder="98765 43210" aria-invalid={!!errors.mobile} />
          {errors.mobile && <span className={s.err}>{errors.mobile}</span>}
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="enq-email">Email (optional)</label>
          <input id="enq-email" type="email" className={s.input} value={f.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" aria-invalid={!!errors.email} />
          {errors.email && <span className={s.err}>{errors.email}</span>}
        </div>
      </div>

      <div className={s.row2}>
        <div className={s.field}>
          <label className={s.label} htmlFor="enq-class">Class / batch</label>
          <select id="enq-class" className={s.input} value={f.classInterested} onChange={set('classInterested')}>
            <option value="">Select class</option>
            {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="enq-exam">Target exam</label>
          <select id="enq-exam" className={s.input} value={f.targetExam} onChange={set('targetExam')}>
            <option value="">Select exam</option>
            {EXAMS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className={s.field}>
        <label className={s.label} htmlFor="enq-message">Message</label>
        <textarea id="enq-message" className={`${s.input} ${s.textarea}`} rows={4} value={f.message} onChange={set('message')} placeholder="Ask about batches, timings, fees or the demo lecture…" />
      </div>

      <label className={s.check}>
        <input type="checkbox" checked={f.demo} onChange={set('demo')} />
        <span>I would like to attend a <strong>demo lecture</strong> before enrolling.</span>
      </label>

      {status === 'failed' && (
        <p className={s.formError} role="alert">
          Something went wrong while sending your enquiry. Please try again, or reach us on <a href={CONTACT.whatsappHref} target="_blank" rel="noopener noreferrer">WhatsApp</a>.
        </p>
      )}

      <button type="submit" className={s.submit} disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Submit enquiry'}
      </button>
      <p className={s.fine}>By submitting you agree to be contacted about your enquiry. See our <a href="/privacypolicy" className={s.inlineLink}>Privacy Policy</a>.</p>
    </form>
  );
}
