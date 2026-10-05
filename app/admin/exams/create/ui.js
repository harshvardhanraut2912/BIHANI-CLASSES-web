// app/admin/exams/create/ui.js  (new file)
//
// Small pieces shared by the Select screen (create) and the Preview screen (saved exams),
// so both look exactly the same.
"use client";

// One colour per subject so Physics / Chemistry / Maths / Biology are clearly separated.
const TONE = {
  Physics: { dark: "#172a85", tint: "#eef1ff" },
  Chemistry: { dark: "#0f6b4f", tint: "#e9f7f1" },
  Mathematics: { dark: "#b4540a", tint: "#fff3e8" },
  Biology: { dark: "#7a2a7a", tint: "#f8ecf8" },
};
export const toneOf = (subj) => TONE[subj] || { dark: "#33405f", tint: "#f3f5f9" };

// Coloured bar that starts each subject block.
export function SubjectBar({ subject, chapters, have, need, first }) {
  const tone = toneOf(subject);
  return (
    <div
      style={{
        marginTop: first ? 0 : 28,
        marginBottom: 10,
        padding: "10px 16px",
        background: tone.dark,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 2,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase" }}>{subject}</span>
      <span style={{ fontSize: 13, fontWeight: 700 }}>
        {chapters} chapter{chapters === 1 ? "" : "s"} &middot; {have} / {need} questions
      </span>
    </div>
  );
}

export function RegenIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
