// lib/pdfgen/paper.js  (new file, server only)
//
// A saved exam (answer_manifest + chapter names)  ->  the "paper" the Word builder prints:
//   - only the chosen subject's questions (or all subjects),
//   - in the exam's own order, renumbered 1..N for this sheet (each subject sheet starts at 1),
//   - the chapter line and the subject label shown in the page header.

const norm = (s) => String(s || "").trim().toLowerCase();

const rankOf = (subject) => {
  const i = ["physics", "chemistry", "mathematics", "biology"].indexOf(norm(subject));
  return i === -1 ? 99 : i;
};

// Subjects of an exam with their question counts, in Physics -> Chemistry -> Maths -> Biology order.
export function subjectCounts(questions) {
  const map = new Map();
  (questions || []).forEach((q) => {
    const s = String(q.q_section || "").trim() || "Other";
    map.set(s, (map.get(s) || 0) + 1);
  });
  return [...map.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => rankOf(a.subject) - rankOf(b.subject) || a.subject.localeCompare(b.subject));
}

export const ALL_SUBJECTS_KEY = "__all";

export function subjectLabel(subjects) {
  const set = new Set(subjects.map(norm));
  const has = (...n) => n.every((x) => set.has(x)) && set.size === n.length;
  if (has("physics", "chemistry", "mathematics")) return "PCM";
  if (has("physics", "chemistry", "biology")) return "PCB";
  // 1 subject: PHYSICS.  2 subjects: PHYSICS & CHEMISTRY.  Otherwise: A, B & C.
  const names = [...subjects].sort((a, b) => rankOf(a) - rankOf(b)).map((s) => String(s).toUpperCase());
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// options arrive as { A: html, B: ... } (usual), { a: ... }, or an array [html, html, ...] /
// [{ label|key|id, text|html|value }] -> always { A, B, C, D }.
function normalizeOptions(raw) {
  const out = {};
  const L = ["A", "B", "C", "D"];
  let src = raw;
  if (typeof src === "string") { try { src = JSON.parse(src); } catch { src = {}; } }
  if (Array.isArray(src)) {
    src.forEach((o, i) => {
      if (o && typeof o === "object") {
        const key = String(o.label ?? o.key ?? o.id ?? L[i] ?? "").trim().toUpperCase();
        const val = o.text ?? o.html ?? o.value ?? o.option ?? "";
        if (L.includes(key)) out[key] = String(val ?? "");
      } else if (L[i]) out[L[i]] = String(o ?? "");
    });
    return out;
  }
  Object.entries(src && typeof src === "object" ? src : {}).forEach(([k, v]) => {
    const key = String(k).trim().toUpperCase().replace(/^OPTION[\s_-]*/, "");
    if (L.includes(key)) out[key] = typeof v === "string" ? v : String(v?.text ?? v?.html ?? v ?? "");
  });
  return out;
}

// exam = { name, questions: answer_manifest[], chapters: { [chapter_id]: { name, subject } } }
export function buildPaper(exam, { subject = ALL_SUBJECTS_KEY } = {}) {
  const all = Array.isArray(exam.questions) ? exam.questions : [];
  const picked = subject === ALL_SUBJECTS_KEY ? all : all.filter((q) => norm(q.q_section) === norm(subject));

  const ordered = picked
    .map((q, idx) => ({ q, idx }))
    .sort((a, b) => (Number(a.q.test_q_num) || 0) - (Number(b.q.test_q_num) || 0) || a.idx - b.idx)
    .map((x) => x.q);

  const chapterNames = [];
  const seen = new Set();
  ordered.forEach((q) => {
    const name = exam.chapters?.[q.chapter_id]?.name;
    if (name && !seen.has(name)) { seen.add(name); chapterNames.push(name); }
  });

  const subjects = [];
  ordered.forEach((q) => {
    const s = String(q.q_section || "").trim();
    if (s && !subjects.includes(s)) subjects.push(s);
  });

  const questions = ordered.map((q, i) => ({
    num: i + 1,
    html: q.question_html || "",
    options: normalizeOptions(q.options),
    answer: String(q.answer_key ?? q.correct_option ?? q.correct_answer ?? q.answer ?? "").trim().toLowerCase(),
    solutionHtml: q.solution_html || "",
  }));

  return { questions, chapterNames, subjects, subjectText: subjectLabel(subjects) };
}

/* ---------------------------------------------------------------- dates */
const IST = "Asia/Kolkata";

// "d/M/yyyy" exactly like the sample sheet ("3/10/2026"). `iso` = "yyyy-mm-dd" or empty -> today (IST).
export function formatSheetDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const probe = new Date(Date.UTC(y, mo - 1, d));
    if (probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d) return `${d}/${mo}/${y}`;
  }
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: IST, day: "numeric", month: "numeric", year: "numeric" }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return `${get("day")}/${get("month")}/${get("year")}`;
}
