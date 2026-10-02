'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import s from './periodic.module.css';
import { ELEMENTS, CATEGORIES, CAT, BLOCKS, STATES } from './periodicData';

const MODES = [
  { id: 'category', label: 'Category' },
  { id: 'block', label: 'Block' },
  { id: 'state', label: 'State at 25 °C' },
  { id: 'en', label: 'Electronegativity' },
];
const EN_MAX = 3.98;

function enColor(en) {
  if (en == null) return { bg: '#eceff1', fg: '#78909c' };
  const t = (en - 0.7) / (EN_MAX - 0.7);
  const a = [255, 241, 118], b = [233, 30, 99], c = [74, 20, 140];
  const [p, q, u] = t < 0.5 ? [a, b, t * 2] : [b, c, (t - 0.5) * 2];
  const rgb = p.map((v, i) => Math.round(v + (q[i] - v) * u));
  return { bg: `rgb(${rgb.join(',')})`, fg: t > 0.45 ? '#fff' : '#0c1438' };
}

function keyOf(e, mode) {
  if (mode === 'category') return e.category;
  if (mode === 'block') return e.block;
  if (mode === 'state') return e.state;
  return null;
}
function colorOf(e, mode) {
  if (mode === 'en') return enColor(e.en);
  const list = mode === 'category' ? CATEGORIES : mode === 'block' ? BLOCKS : STATES;
  return { bg: list.find((x) => x.id === keyOf(e, mode)).color, fg: '#0c1438' };
}

const fmtTemp = (k) => (k == null ? 'Unknown' : `${Math.round(k * 100) / 100} K (${Math.round((k - 273.15) * 10) / 10} °C)`);
const fmtDensity = (e) => (e.density == null ? 'Unknown' : `${e.density} ${e.state === 'Gas' ? 'g/L' : 'g/cm³'}`);
const ordinal = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[n] || `${n}th`);

/* ---------- Animated Bohr model: the "image" of each atom ---------- */
function BohrAtom({ el }) {
  const c = colorOf(el, 'category').bg;
  const n = el.shells.length;
  const step = n > 5 ? 11.5 : 14;
  return (
    <svg viewBox="0 0 220 220" className={s.bohr} role="img" aria-label={`Bohr model of ${el.name}: ${el.shells.join(', ')} electrons per shell`}>
      <defs>
        <radialGradient id="nuc" cx="35%" cy="35%">
          <stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor={c} />
        </radialGradient>
      </defs>
      {el.shells.map((count, i) => {
        const r = 26 + i * step;
        const dur = 6 + i * 3;
        return (
          <g key={i}>
            <circle cx="110" cy="110" r={r} className={s.orbit} />
            <g className={s.spin} style={{ animationDuration: `${dur}s`, animationDirection: i % 2 ? 'reverse' : 'normal' }}>
              {Array.from({ length: count }, (_, k) => {
                const a = (k / count) * Math.PI * 2;
                return <circle key={k} cx={110 + r * Math.cos(a)} cy={110 + r * Math.sin(a)} r={count > 18 ? 2.3 : 3.2} className={s.electron} />;
              })}
            </g>
          </g>
        );
      })}
      <circle cx="110" cy="110" r="17" fill="url(#nuc)" stroke="#172a85" strokeWidth="1.5" />
      <text x="110" y="115" textAnchor="middle" className={s.nucText}>{el.sym}</text>
    </svg>
  );
}

/* ---------- Detail popup ---------- */
function Detail({ el, onClose, onNav, fontVars }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const key = (ev) => {
      if (ev.key === 'Escape') onClose();
      if (ev.key === 'ArrowRight') onNav(1);
      if (ev.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose, onNav]);

  const cat = CAT[el.category];
  const rows = [
    ['Atomic number', el.z], ['Atomic mass', `${el.mass} u`], ['Category', cat.label],
    ['Group', el.group ?? 'f-block (inner transition)'], ['Period', el.period], ['Block', `${el.block}-block`],
    ['State at 25 °C', el.state], ['Melting point', fmtTemp(el.melt)], ['Boiling point', fmtTemp(el.boil)],
    ['Density', fmtDensity(el)], ['Electronegativity', el.en ?? 'Not defined'], ['Discovered', el.found],
  ];
  /* Rendered on document.body (outside the zoomed page) so the sheet always fits the real screen */
  return createPortal(
    <div className={s.portalRoot} style={fontVars}>
    <div className={s.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={s.modal} role="dialog" aria-modal="true" aria-label={`${el.name} details`} style={{ '--c': cat.color }}>
        <button ref={closeRef} type="button" className={s.close} onClick={onClose} aria-label="Close">×</button>
        <div className={s.mHead}>
          <div className={s.bigTile}>
            <span className={s.bigZ}>{el.z}</span>
            <span className={s.bigSym}>{el.sym}</span>
            <span className={s.bigMass}>{el.mass}</span>
          </div>
          <div>
            <h4 className={s.mName}>{el.name}</h4>
            <div className={s.badges}>
              <span className={s.badge} style={{ background: cat.color }}>{cat.label}</span>
              <span className={s.badge} style={{ background: '#e8eefc' }}>{el.state}</span>
              {el.radioactive && <span className={s.badge} style={{ background: '#ffd54f' }}>☢ Radioactive</span>}
            </div>
            <p className={s.fact}>{el.fact}</p>
          </div>
        </div>
        <div className={s.mBody}>
          <div className={s.atomBox}>
            <BohrAtom el={el} />
            <p className={s.atomCap}>Bohr model · electrons per shell</p>
            <p className={s.shellNums}>{el.shells.join(' · ')}</p>
          </div>
          <div>
            <dl className={s.props}>
              {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
            </dl>
            <div className={s.config}>
              <span>Electron configuration</span>
              <b>{el.config}</b>
            </div>
          </div>
        </div>
        <div className={s.navRow}>
          <button type="button" className={s.navBtn} onClick={() => onNav(-1)} disabled={el.z === 1}>← {el.z > 1 ? ELEMENTS[el.z - 2].name : ''}</button>
          <span className={s.navHint}>Use ← → keys · Esc to close</span>
          <button type="button" className={s.navBtn} onClick={() => onNav(1)} disabled={el.z === 118}>{el.z < 118 ? ELEMENTS[el.z].name : ''} →</button>
        </div>
      </div>
    </div>
    </div>,
    document.body
  );
}

/* ---------- Main table ---------- */
export function PeriodicTable() {
  const [mode, setMode] = useState('category');
  const [filter, setFilter] = useState(null);
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(null);
  const [open, setOpen] = useState(null);
  const [size, setSize] = useState('compact');
  const boxRef = useRef(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setSize(w > 860 ? 'wide' : w > 640 ? 'compact' : 'tiny');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (e) => {
    if (q && !(e.name.toLowerCase().includes(q) || e.sym.toLowerCase() === q || String(e.z) === q || e.sym.toLowerCase().startsWith(q))) return false;
    if (filter && keyOf(e, mode) !== filter) return false;
    return true;
  };
  const legend = mode === 'category' ? CATEGORIES : mode === 'block' ? BLOCKS : mode === 'state' ? STATES : [];
  const shown = hover || ELEMENTS[5];
  const nav = useMemo(() => (d) => setOpen((o) => (o ? ELEMENTS[Math.min(117, Math.max(0, o.z - 1 + d))] : o)), []);
  const close = useMemo(() => () => setOpen(null), []);
  const fontVars = () => {
    if (!boxRef.current) return {};
    const cs = getComputedStyle(boxRef.current);
    return { '--font-display': cs.getPropertyValue('--font-display'), '--font-body': cs.getPropertyValue('--font-body') };
  };
  const changeMode = (m) => { setMode(m); setFilter(null); };

  return (
    <div className={s.wrap} ref={boxRef} data-size={size}>
      <div className={s.toolbar}>
        <input className={s.search} type="search" placeholder="Search name, symbol or number…" value={query}
          onChange={(e) => setQuery(e.target.value)} aria-label="Search elements" />
        <div className={s.modes} role="group" aria-label="Colour by">
          {MODES.map((m) => (
            <button key={m.id} type="button" className={s.modeBtn} aria-pressed={mode === m.id} onClick={() => changeMode(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>

      <p className={s.swipe}>← Swipe the table sideways to see all groups →</p>
      <div className={s.scroll}>
        <div className={s.grid} role="group" aria-label="Periodic table of the elements">
          <div className={s.preview} style={{ background: colorOf(shown, mode).bg, color: colorOf(shown, mode).fg }}>
            <div className={s.pvSym}>{shown.sym}</div>
            <div>
              <div className={s.pvName}>{shown.name}</div>
              <div className={s.pvMeta}>Z = {shown.z} · {shown.mass} u</div>
              <div className={s.pvMeta}>{CAT[shown.category].label} · {shown.state}</div>
              <div className={s.pvTip}>Click any element for full details</div>
            </div>
          </div>

          {[1, 2, 3, 4, 5, 6, 7].map((p) => (
            <span key={p} className={s.periodNo} style={{ gridRow: p, gridColumn: 19 }}>{p}</span>
          ))}
          {Array.from({ length: 18 }, (_, i) => (
            <span key={i} className={s.groupNo} style={{ gridColumn: i + 1, gridRow: 11 }}>{i + 1}</span>
          ))}

          {ELEMENTS.map((e) => {
            const col = colorOf(e, mode);
            const on = matches(e);
            return (
              <button key={e.z} type="button" className={`${s.cell} ${on ? '' : s.dim} ${e.radioactive ? s.rad : ''}`}
                style={{ gridRow: e.row, gridColumn: e.col, background: col.bg, color: col.fg }}
                onClick={() => setOpen(e)} onMouseEnter={() => setHover(e)} onFocus={() => setHover(e)}
                aria-label={`${e.name}, atomic number ${e.z}`}>
                <span className={s.z}>{e.z}</span>
                <span className={s.sym}>{e.sym}</span>
                <span className={s.nm}>{e.name}</span>
              </button>
            );
          })}

          {[[6, 'lanthanide', '57–71'], [7, 'actinide', '89–103']].map(([row, id, label]) => (
            <button key={id} type="button" className={`${s.cell} ${s.ph} ${mode === 'category' && filter !== id && filter ? s.dim : ''}`}
              style={{ gridRow: row, gridColumn: 3, background: CAT[id].color }} aria-label={`${CAT[id].label} ${label}`}
              onClick={() => { setMode('category'); setFilter(filter === id ? null : id); }}>
              <span className={s.phTxt}>{label}</span>
            </button>
          ))}
          <span className={s.fLabel} style={{ gridRow: 9, gridColumn: '1 / 3' }}>Lanthanides</span>
          <span className={s.fLabel} style={{ gridRow: 10, gridColumn: '1 / 3' }}>Actinides</span>
        </div>
      </div>

      {mode === 'en' ? (
        <div className={s.gradient}>
          <span>Low (0.7)</span><i /><span>High (3.98)</span>
          <small>Grey = not defined</small>
        </div>
      ) : (
        <div className={s.legend} role="group" aria-label="Legend, click to filter">
          {legend.map((l) => (
            <button key={l.id} type="button" className={s.legItem} aria-pressed={filter === l.id}
              onClick={() => setFilter(filter === l.id ? null : l.id)}>
              <i style={{ background: l.color }} />{l.label}
            </button>
          ))}
          {filter && <button type="button" className={s.clear} onClick={() => setFilter(null)}>Clear filter</button>}
        </div>
      )}
      <p className={s.note}>Dashed border = radioactive element. Values at standard conditions; atomic masses in brackets are the most stable isotope.</p>

      {open && <Detail el={open} onClose={close} onNav={nav} fontVars={fontVars()} />}
    </div>
  );
}
