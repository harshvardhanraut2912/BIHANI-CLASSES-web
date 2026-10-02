// SAVE THIS FILE AT: components/admin/TransactionDateFilter.jsx  (new file)
"use client";

import { useMemo, useState } from "react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Spec asks for "2026+27 entire calendar" — hard-limit navigation to this
// window rather than a free-scrolling calendar.
const MIN_YEAR = 2026;
const MAX_YEAR = 2027;

function toISODate(year, monthIndex, day) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function firstWeekday(year, monthIndex) {
  return new Date(year, monthIndex, 1).getDay(); // 0 = Sunday
}

function MiniCalendar({ year, monthIndex, onNavigate, selected, onPick, minISO, maxISO }) {
  const total = daysInMonth(year, monthIndex);
  const offset = firstWeekday(year, monthIndex);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);

  const atMin = year === MIN_YEAR && monthIndex === 0;
  const atMax = year === MAX_YEAR && monthIndex === 11;

  return (
    <div className="tx-cal">
      <div className="tx-cal-header">
        <button
          type="button"
          className="tx-cal-nav"
          disabled={atMin}
          onClick={() => onNavigate(monthIndex === 0 ? -1 : 0, monthIndex === 0 ? 11 : monthIndex - 1)}
        >
          ‹
        </button>
        <span>{MONTH_NAMES[monthIndex]} {year}</span>
        <button
          type="button"
          className="tx-cal-nav"
          disabled={atMax}
          onClick={() => onNavigate(monthIndex === 11 ? 1 : 0, monthIndex === 11 ? 0 : monthIndex + 1)}
        >
          ›
        </button>
      </div>
      <div className="tx-cal-weekdays">
        {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="tx-cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={i} className="tx-cal-cell tx-cal-empty" />;
          const iso = toISODate(year, monthIndex, d);
          const isSelected = iso === selected;
          const disabled = (minISO && iso < minISO) || (maxISO && iso > maxISO);
          return (
            <button
              type="button"
              key={i}
              className={`tx-cal-cell${isSelected ? " tx-cal-selected" : ""}`}
              disabled={disabled}
              onClick={() => onPick(iso)}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * onChange(from, to) fires whenever either bound changes — both may be null
 * (no bound on that side). `from`/`to` are ISO date strings (YYYY-MM-DD).
 */
export default function TransactionDateFilter({ from, to, onChange }) {
  const now = new Date();
  const startYear = now.getFullYear() >= MIN_YEAR && now.getFullYear() <= MAX_YEAR ? now.getFullYear() : MIN_YEAR;
  const startMonth = startYear === now.getFullYear() ? now.getMonth() : 0;

  const [fromView, setFromView] = useState({ year: startYear, month: startMonth });
  const [toView, setToView] = useState({ year: startYear, month: startMonth });
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (!from && !to) return "All dates";
    if (from && to) return `${from} → ${to}`;
    if (from) return `From ${from}`;
    return `Up to ${to}`;
  }, [from, to]);

  function clear() {
    onChange(null, null);
  }

  return (
    <div className="tx-filter">
      <button type="button" className="tx-btn tx-btn-ghost" onClick={() => setOpen((o) => !o)}>
        📅 {label}
      </button>
      {(from || to) && (
        <button type="button" className="tx-filter-clear" onClick={clear}>
          Clear
        </button>
      )}

      {open && (
        <div className="tx-filter-popover">
          <div className="tx-filter-cals">
            <div>
              <p className="tx-filter-cal-label">From</p>
              <MiniCalendar
                year={fromView.year}
                monthIndex={fromView.month}
                onNavigate={(yDelta, m) => setFromView((v) => ({ year: v.year + yDelta, month: m }))}
                selected={from}
                onPick={(iso) => onChange(iso, to && iso > to ? iso : to)}
                maxISO={to || `${MAX_YEAR}-12-31`}
                minISO={`${MIN_YEAR}-01-01`}
              />
            </div>
            <div>
              <p className="tx-filter-cal-label">To</p>
              <MiniCalendar
                year={toView.year}
                monthIndex={toView.month}
                onNavigate={(yDelta, m) => setToView((v) => ({ year: v.year + yDelta, month: m }))}
                selected={to}
                onPick={(iso) => onChange(from && iso < from ? iso : from, iso)}
                minISO={from || `${MIN_YEAR}-01-01`}
                maxISO={`${MAX_YEAR}-12-31`}
              />
            </div>
          </div>
          <div className="tx-filter-actions">
            <button type="button" className="tx-btn tx-btn-primary" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
