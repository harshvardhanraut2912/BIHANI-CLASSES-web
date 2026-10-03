// app/admin/exams/create/examConfig.js  (new file)
//
// Shared constants + pure helpers for the Create Exam screens.

export const SUBJECT_ORDER = ["Physics", "Chemistry", "Mathematics", "Biology"];
export const DEFAULT_SUBJECT_TOTAL = 50; // PCM / PCB: questions per subject by default

// Drop the official logo at public/images/exam_logos/<file>; until then a text badge shows.
export const EXAMS = [
  { id: "MHT-CET", label: "MHT-CET", logo: "/images/exam_logos/mht-cet.png", short: "CET", subjects: ["Physics", "Chemistry", "Mathematics", "Biology"], streams: ["PCM", "PCB", "SUBJECT"] },
  { id: "JEE", label: "JEE", logo: "/images/exam_logos/jee.png", short: "JEE", subjects: ["Physics", "Chemistry", "Mathematics"], streams: ["PCM", "SUBJECT"] },
  { id: "NEET", label: "NEET", logo: "/images/exam_logos/neet.png", short: "NEET", subjects: ["Physics", "Chemistry", "Biology"], streams: ["PCB", "SUBJECT"] },
];

export const STREAMS = {
  PCM: { name: "PCM", sub: "Physics, Chemistry, Maths", subjects: ["Physics", "Chemistry", "Mathematics"] },
  PCB: { name: "PCB", sub: "Physics, Chemistry, Biology", subjects: ["Physics", "Chemistry", "Biology"] },
  SUBJECT: { name: "Subject wise", sub: "Pick one or more subjects", subjects: null },
};

export const MODES = {
  auto: { name: "Automatic", sub: "Random questions are picked for you. You can regenerate them." },
  manual: { name: "Manual", sub: "You choose every question yourself from the chapter." },
};

export const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
export const sum = (list) => list.reduce((t, x) => t + x, 0);
export const chapterKey = (subject, name) => `${subject}||${name}`;

export function normalizeStd(value) {
  const t = String(value ?? "").trim().toLowerCase();
  if (t.includes("11")) return "11th";
  if (t.includes("12")) return "12th";
  return "";
}

function leadingNumber(name) {
  const m = String(name || "").match(/^\s*(\d+)/);
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
}

// Keep only what the screens need (never question content).
export function slimChapters(rows) {
  return (rows || [])
    .map((r) => ({
      name: String(r.chapter_name ?? "").trim(),
      subject: String(r.subject ?? "").trim(),
      std: normalizeStd(r.std ?? r.standard ?? r.class),
      count: Number(r.question_count) || 0,
      weight: Number(r.default_weight) || 0,
      chapterId: r.chapter_id ? String(r.chapter_id) : "",
    }))
    .filter((c) => c.name && c.subject)
    .sort((a, b) => leadingNumber(a.name) - leadingNumber(b.name) || a.name.localeCompare(b.name));
}

const clamp = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));

// Splits `total` questions across chapters (never more than a chapter has),
// following each chapter's default_weight, or its size when no weights exist.
export function distribute(total, list) {
  const caps = list.map((c) => c.count);
  const target = Math.max(0, Math.min(Math.floor(total) || 0, sum(caps)));
  const out = list.map(() => 0);
  if (!target) return out;

  let weights = list.map((c, i) => (caps[i] > 0 && c.weight > 0 ? c.weight : 0));
  if (sum(weights) === 0) weights = caps.slice();
  const wSum = sum(weights);
  const ideal = weights.map((w) => (target * w) / wSum);

  list.forEach((_, i) => { out[i] = Math.min(Math.floor(ideal[i]), caps[i]); });
  let left = target - sum(out);
  while (left > 0) {
    const order = list
      .map((_, i) => i)
      .filter((i) => out[i] < caps[i])
      .sort((a, b) => ideal[b] - out[b] - (ideal[a] - out[a]));
    if (!order.length) break;
    for (const i of order) {
      if (left <= 0) break;
      out[i] += 1;
      left -= 1;
    }
  }
  return out;
}

// The final list of {chapter, how many questions} the exam needs.
export function buildPlan({ stream, mode, bySubject, subjects, picked, perChapter, subjectTotals }) {
  const items = [];
  const push = (subj, c, count) =>
    items.push({ key: chapterKey(subj, c.name), subject: subj, name: c.name, std: c.std, chapterId: c.chapterId, available: c.count, count });

  if (stream === "PCM" || stream === "PCB") {
    STREAMS[stream].subjects.forEach((subj) => {
      const list = bySubject[subj] || [];
      if (mode === "manual") {
        list.forEach((c) => push(subj, c, clamp(perChapter[chapterKey(subj, c.name)], c.count)));
      } else {
        const total = subjectTotals[subj] ?? DEFAULT_SUBJECT_TOTAL;
        const counts = distribute(total, list);
        list.forEach((c, i) => push(subj, c, counts[i]));
      }
    });
  } else if (stream === "SUBJECT") {
    subjects.forEach((subj) => {
      (bySubject[subj] || [])
        .filter((c) => picked[subj]?.[c.name])
        .forEach((c) => push(subj, c, clamp(perChapter[chapterKey(subj, c.name)], c.count)));
    });
  }
  return items.filter((i) => i.count > 0);
}
