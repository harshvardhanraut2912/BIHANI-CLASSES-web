'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './home.module.css';

/* ---------- pH beaker: universal-indicator colours ---------- */
const STOPS = ['#d7191c', '#e8332a', '#ef5a24', '#f58a1f', '#f8b81d', '#f2d517', '#bfd930', '#4fb848',
  '#2fae8a', '#1d9fb0', '#2f7fc9', '#4a5cc4', '#6a49b8', '#7d3aa8', '#8a2a96'];

const MATCHES = [[1.5, 'battery acid'], [2.5, 'lemon juice'], [3.5, 'vinegar'], [5, 'tomato juice'],
  [6.2, 'black coffee'], [6.9, 'milk'], [7.1, 'pure water'], [7.8, 'blood'], [9, 'baking soda solution'],
  [11, 'milk of magnesia'], [12, 'household ammonia'], [13, 'bleach'], [14.1, 'drain cleaner']];

function colourAt(ph) {
  const i = Math.min(13, Math.floor(ph));
  const t = ph - i;
  const rgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const [a, b] = [rgb(STOPS[i]), rgb(STOPS[i + 1])];
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(',')})`;
}

export function PhBeaker() {
  const [ph, setPh] = useState(7);
  const kind = ph < 6.5 ? 'acidic' : ph > 7.5 ? 'basic' : 'neutral';
  const match = MATCHES.find(([limit]) => ph <= limit)[1];
  const track = `linear-gradient(90deg, ${STOPS.join(',')})`;

  return (
    <div className={styles.toolBox}>
      <svg className={styles.beaker} viewBox="0 0 260 300" role="img" aria-label={`Beaker of universal indicator showing pH ${ph.toFixed(1)}`}>
        <defs>
          <clipPath id="beakerClip"><path d="M64 34V248Q64 268 84 268H176Q196 268 196 248V34Z" /></clipPath>
        </defs>
        <g clipPath="url(#beakerClip)">
          <rect className={styles.liquid} x="60" y="110" width="140" height="165" fill={colourAt(ph)} />
          <rect x="60" y="110" width="140" height="6" fill="#fff" opacity=".35" />
          {[90, 118, 146].map((x, i) => (
            <circle key={x} className={styles.bubble} cx={x} cy={250} r={4 + i} style={{ animationDelay: `${i * 0.9}s` }} />
          ))}
        </g>
        <path d="M64 34V248Q64 268 84 268H176Q196 268 196 248V34" fill="none" stroke="#172a85" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M52 30H208" stroke="#172a85" strokeWidth="6" strokeLinecap="round" />
        {[80, 120, 160, 200].map((y) => (
          <path key={y} d={`M64 ${y}H84`} stroke="#172a85" strokeWidth="3" strokeLinecap="round" />
        ))}
      </svg>
      <input
        className={styles.range}
        style={{ '--track': track }}
        type="range" min="0" max="14" step="0.1" value={ph}
        onChange={(e) => setPh(parseFloat(e.target.value))}
        aria-label="pH value"
      />
      <p className={styles.read}><strong>pH {ph.toFixed(1)}</strong>, {kind}</p>
      <p className={styles.readSmall}>[H⁺] = 10<sup>−{ph.toFixed(1)}</sup> mol/L. Closest everyday match: {match}.</p>
    </div>
  );
}

/* ---------- Photo with graceful fallback until real images are added ---------- */
export function Photo({ src, alt, label, className }) {
  const [bad, setBad] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setBad(true);
  }, []);
  if (bad) return <div className={`${className} ${styles.photoFallback}`}>{label}</div>;
  return <img ref={ref} src={src} alt={alt} className={className} loading="lazy" onError={() => setBad(true)} />;
}

/* ---------- Student avatar: photo if the file exists, otherwise initials ---------- */
export function AchieverPhoto({ src, name }) {
  const [bad, setBad] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setBad(true);
  }, []);
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  if (bad || !src) return <span className={`${styles.achAvatar} ${styles.achInitials}`} aria-hidden="true">{initials}</span>;
  return <img ref={ref} src={src} alt={name} className={styles.achAvatar} loading="lazy" onError={() => setBad(true)} />;
}

/* ---------- Loads the existing cookie banner + app popup scripts ----------
   Both listen for DOMContentLoaded, which has already fired by the time a
   client component mounts, so we fire it once after both have loaded. */
let booted = false;
export function LegacyScripts() {
  useEffect(() => {
    if (booted) return;
    booted = true;
    const srcs = ['/cookie-consent.js', '/app-download-popup.js'];
    let loaded = 0;
    srcs.forEach((src) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => {
        loaded += 1;
        if (loaded === srcs.length) document.dispatchEvent(new Event('DOMContentLoaded'));
      };
      document.body.appendChild(s);
    });
  }, []);
  return null;
}

/* ---------- Molar mass calculator ---------- */
const MASS = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, Na: 22.99, Mg: 24.305, Al: 26.982, P: 30.974, S: 32.06,
  Cl: 35.45, K: 39.098, Ca: 40.078, Mn: 54.938, Fe: 55.845, Cu: 63.546, Zn: 65.38, Br: 79.904, Ag: 107.868, I: 126.904 };

function parseFormula(f) {
  // supports nested brackets and subscripts, e.g. Ca(OH)2, Al2(SO4)3, CuSO4.5H2O
  let total = 0; const parts = [];
  for (const chunk of f.replace(/\s/g, '').split(/[.·*]/)) {
    const m0 = chunk.match(/^(\d+)/); const mult = m0 ? +m0[1] : 1;
    const body = m0 ? chunk.slice(m0[1].length) : chunk;
    const stack = [{}]; let i = 0;
    while (i < body.length) {
      const ch = body[i];
      if (ch === '(' || ch === '[') { stack.push({}); i++; }
      else if (ch === ')' || ch === ']') {
        i++; const n = body.slice(i).match(/^\d+/); const k = n ? +n[0] : 1; if (n) i += n[0].length;
        const top = stack.pop(); if (!stack.length) return null;
        for (const e in top) stack[stack.length - 1][e] = (stack[stack.length - 1][e] || 0) + top[e] * k;
      } else {
        const m = body.slice(i).match(/^([A-Z][a-z]?)(\d*)/);
        if (!m || !(m[1] in MASS)) return null;
        i += m[0].length; stack[stack.length - 1][m[1]] = (stack[stack.length - 1][m[1]] || 0) + (m[2] ? +m[2] : 1);
      }
    }
    if (stack.length !== 1) return null;
    for (const e in stack[0]) { total += MASS[e] * stack[0][e] * mult; parts.push(`${e}×${stack[0][e] * mult}`); }
  }
  return parts.length ? { total, parts } : null;
}

export function MolarCalc() {
  const [f, setF] = useState('H2SO4');
  const r = parseFormula(f);
  return (
    <div className={styles.toolBox}>
      <label htmlFor="formula"><strong>Type a formula</strong></label>
      <input id="formula" className={styles.input} value={f} onChange={(e) => setF(e.target.value)} spellCheck="false" autoComplete="off" />
      {r ? (
        <>
          <p className={styles.answer}>{r.total.toFixed(2)} g/mol</p>
          <p className={styles.parts}>{r.parts.join('  ')}</p>
        </>
      ) : (
        <p className={styles.parts}>Use capital letters for elements, like Ca(OH)2 or CuSO4.5H2O.</p>
      )}
      <div className={styles.chips}>
        {['H2O', 'NaOH', 'KMnO4', 'Al2(SO4)3', 'C6H12O6'].map((x) => (
          <button key={x} type="button" className={styles.chip} onClick={() => setF(x)}>{x}</button>
        ))}
      </div>
    </div>
  );
}

/* ---------- Formula sheet ---------- */
const SHEETS = {
  Physical: [
    ['Moles', 'n = m / M'], ['Molarity', 'M = moles of solute / volume (L)'], ['Molality', 'm = moles of solute / mass of solvent (kg)'],
    ['Ideal gas law', 'PV = nRT'], ['Gibbs energy', 'ΔG = ΔH − TΔS'], ['pH', 'pH = −log[H⁺]'],
    ['Buffer (Henderson)', 'pH = pKa + log([salt]/[acid])'], ['First-order rate constant', 'k = (2.303/t) log([A]₀/[A])'],
    ['First-order half-life', 't½ = 0.693 / k'], ['Nernst equation (298 K)', 'E = E° − (0.0591/n) log Q'],
  ],
  Organic: [
    ['Degree of unsaturation', '(2C + 2 + N − H − X) / 2'], ['Aromaticity (Hückel)', '4n + 2 π electrons'],
    ['SN1 rate', 'rate = k[R–X]'], ['SN2 rate', 'rate = k[R–X][Nu]'], ['Carbocation stability', '3° > 2° > 1° > methyl'],
  ],
  Inorganic: [
    ['Bond order (MOT)', '(Nb − Na) / 2'], ['Formal charge', 'V − N − B/2'],
    ['Spin-only magnetic moment', 'μ = √(n(n+2)) BM'], ['Effective atomic number', 'EAN = Z − oxidation state + 2 × ligands'],
  ],
};

export function FormulaSheet() {
  const [k, setK] = useState('Physical');
  return (
    <div className={styles.toolBox}>
      <div className={styles.chips} style={{ marginTop: 0, marginBottom: 12 }}>
        {Object.keys(SHEETS).map((x) => (
          <button key={x} type="button" className={styles.chip} aria-pressed={k === x} style={k === x ? { background: '#172a85', color: '#fff' } : undefined} onClick={() => setK(x)}>{x}</button>
        ))}
      </div>
      <ul className={styles.formulaList}>
        {SHEETS[k].map(([a, b]) => (<li key={a}><span>{a}</span><span>{b}</span></li>))}
      </ul>
    </div>
  );
}

/* ---------- Tool tabs ---------- */
const TOOLS = [
  { id: 'ph', name: 'pH Scale', text: 'Drag the slider to see how colour, [H⁺] and everyday examples change from acidic to basic.', view: <PhBeaker /> },
  { id: 'mm', name: 'Molar Mass Calculator', text: 'Enter a chemical formula, brackets and hydrates included, and get its molar mass with the element breakdown.', view: <MolarCalc /> },
  { id: 'fs', name: 'Formula Sheet', text: 'Quick revision of important physical, organic and inorganic chemistry relations.', view: <FormulaSheet /> },
];

export function ToolTabs() {
  const [i, setI] = useState(0);
  const t = TOOLS[i];
  return (
    <div>
      <div className={styles.tabs} role="tablist">
        {TOOLS.map((x, k) => (<button key={x.id} type="button" role="tab" aria-selected={k === i} className={styles.tab} onClick={() => setI(k)}>{x.name}</button>))}
      </div>
      <div className={`${styles.toolBody} ${t.id === 'fs' ? styles.single : ''}`}>
        <div><h3 className={styles.stepName}>{t.name}</h3><p className={styles.sub} style={{ marginBottom: 0 }}>{t.text}</p></div>
        {t.view}
      </div>
    </div>
  );
}
