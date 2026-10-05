// app/api/admin/exam-papers/build.js  (new file, server only)
//
// Turns the picked questions into the SAME two manifests the old
// /api/deploy-test-v2 route stored -- nothing about the format changed:
//   exam_question_data_v2.questions_manifest  (question_html + options, no answers)
//   exam_answer_keys_v2.answer_manifest       (same + chapter_id, answer_key, solution_html)
// Numbering rules are the old assembler's: Physics -> Chemistry -> Mathematics -> Biology,
// chapters of one subject interleaved (never the same chapter twice in a row when avoidable),
// test_q_num running 1..N, sub_id = "<abbrev>_sec".

const SUBJECT_ORDER = ["Physics", "Chemistry", "Mathematics", "Biology"];
const SUBJECT_META = {
  physics: { abbrev: "phy", subId: "phy_sec" },
  chemistry: { abbrev: "chem", subId: "chem_sec" },
  mathematics: { abbrev: "math", subId: "math_sec" },
  biology: { abbrev: "bio", subId: "bio_sec" },
};

export function subjectMeta(subject) {
  const key = String(subject || "").trim().toLowerCase();
  if (SUBJECT_META[key]) return SUBJECT_META[key];
  const abbrev = key.slice(0, 4) || "gen";
  return { abbrev, subId: `${abbrev}_sec` };
}

const subjectRank = (s) => {
  const i = SUBJECT_ORDER.indexOf(s);
  return i === -1 ? SUBJECT_ORDER.length : i;
};

// Same slug rule as the old page (lower-case, spaces -> "_"), minus characters that break URLs/ids.
export function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
}

function interleave(lists) {
  const queues = lists.map((l) => [...l]);
  const out = [];
  let prev = -1;
  while (queues.some((q) => q.length)) {
    const live = queues.map((_, i) => i).filter((i) => queues[i].length);
    const preferred = live.filter((i) => i !== prev);
    const pool = preferred.length ? preferred : live;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    out.push(queues[pick].shift());
    prev = pick;
  }
  return out;
}

// The two per-question payloads (question side / answer side) for one slot.
export function slotPayloads(item, slot) {
  const base = {
    q_id: item.q_id,
    q_num: slot.test_q_num,
    test_q_num: slot.test_q_num,
    sub_id: slot.sub_id,
    q_section: slot.q_section,
    options: item.options,
    section: item.section ?? null,
    ques_type: item.ques_type ?? item.question_type ?? null,
    source_id: item.source_id ?? null,
    exam_history: item.exam_history ?? [],
    question_html: item.question_html,
  };
  return {
    question: base,
    answer: { ...base, chapter_id: item.chapter_id || null, answer_key: item.answer_key, solution_html: item.solution_html ?? null },
  };
}

export function missingField(item) {
  if (!item || !item.q_id) return "q_id";
  if (!item.question_html) return "question_html";
  if (!item.options) return "options";
  if (!item.answer_key) return "answer_key";
  return "";
}

// groups: [{ subject, chapter, chapter_id, questions: [...] }]  (one per chapter, any order)
export function buildManifests(groups) {
  const bySubject = new Map();
  [...groups]
    .sort((a, b) => subjectRank(a.subject) - subjectRank(b.subject))
    .forEach((g) => {
      const items = (g.questions || []).map((q) => ({ ...q, chapter_id: q.chapter_id || g.chapter_id || null, _subject: g.subject }));
      if (!items.length) return;
      if (!bySubject.has(g.subject)) bySubject.set(g.subject, []);
      bySubject.get(g.subject).push(items);
    });

  const ordered = [];
  bySubject.forEach((lists) => ordered.push(...interleave(lists)));

  const questionManifest = [];
  const answerManifest = [];
  for (let i = 0; i < ordered.length; i++) {
    const item = ordered[i];
    const n = i + 1;
    const bad = missingField(item);
    if (bad) throw Object.assign(new Error(`Question ${n} is missing ${bad}.`), { status: 400 });
    const meta = subjectMeta(item._subject);
    const { question, answer } = slotPayloads(item, { test_q_num: n, sub_id: meta.subId, q_section: item._subject });
    questionManifest.push(question);
    answerManifest.push(answer);
  }
  return { questionManifest, answerManifest };
}
