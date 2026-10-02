"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import "./addexamimages.css";

// Same sanitize approach as CMS v2 — DOMPurify from CDN, with MathML tags
// allow-listed since question_html/solution_html carry inline <math> markup.
// A malformed single question must never blank the whole preview, so this
// always falls back to a minimal manual strip rather than throwing.
function sanitizeHtml(raw) {
  if (!raw) return "";
  try {
    if (typeof window !== "undefined" && window.DOMPurify) {
      const result = window.DOMPurify.sanitize(raw, {
        ADD_TAGS: ["math", "mi", "mo", "mn", "mrow", "mfrac", "msup", "msub", "msqrt", "mtext", "mspace", "msubsup", "mtable", "mtr", "mtd", "mover", "munder", "munderover", "mroot", "mfenced", "mpadded", "mstyle"],
        ADD_ATTR: ["mathvariant", "xmlns", "stretchy", "fence", "style", "displaystyle"],
      });
      if (result && result.trim().length > 0) return result;
    }
  } catch (e) {
    console.error("sanitizeHtml threw on this item, falling back to manual strip:", e, raw?.slice(0, 200));
  }
  return (raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on[a-z]+="[^"]*"/gi, "");
}

// Renders one question's stem + four options — used by both the manual-select
// and random-preview overlays, in place of the old <img src={question_img_url}>.
function QuestionPreviewBlock({ q }) {
  if (!q) return null;
  return (
    <div className="aei-html-preview">
      <div className="aei-html-question" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.question_html) }} />
      <div className="aei-html-options">
        {["A", "B", "C", "D"].map((letter) => (
          <div key={letter} className="aei-html-option">
            <span className="aei-html-option-letter">{letter}</span>
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.options?.[letter]) }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 🟢 STATIC CONFIG: Subject → filename abbreviation + sub_id
// ============================================================
const SUBJECT_META = {
  physics: { abbrev: "phy", subId: "phy_sec", label: "Physics" },
  chemistry: { abbrev: "chem", subId: "chem_sec", label: "Chemistry" },
  mathematics: { abbrev: "math", subId: "math_sec", label: "Mathematics" },
  biology: { abbrev: "bio", subId: "bio_sec", label: "Biology" },
};

function getSubjectMeta(subjectRaw) {
  const key = (subjectRaw || "").trim().toLowerCase();
  if (SUBJECT_META[key]) return SUBJECT_META[key];
  const fallbackAbbrev = key.slice(0, 4) || "gen";
  return { abbrev: fallbackAbbrev, subId: `${fallbackAbbrev}_sec`, label: subjectRaw || "General" };
}

const EXAM_OPTIONS = ["MHT-CET", "JEE", "NEET"];

// Fixed subject order the uploaded/numbered manifest must always follow,
// regardless of the alphabetical order chapters come back from Supabase in.
const SUBJECT_ORDER = ["Physics", "Chemistry", "Mathematics", "Biology"];
const SINGLE_SUBJECT_STREAMS = ["PHY_ONLY", "CHEM_ONLY", "MATH_ONLY", "BIO_ONLY"];
function subjectRank(subject) {
  const idx = SUBJECT_ORDER.indexOf(subject);
  return idx === -1 ? SUBJECT_ORDER.length : idx;
}

// Decides whether a chapter is excluded for the current Stream/Class picks — // PCM zeroes out Biology, PCB zeroes out Mathematics, and picking a single
// class zeroes out chapters belonging to the other class.
// Round-robins across a subject's per-chapter question lists so that, // wherever more than one chapter has questions left, two chapters never end
// up back-to-back in the final upload order. Falls back to picking from the
// same chapter only when every other chapter for that subject is exhausted.
function interleaveByChapter(chapterItemLists) {
  const queues = chapterItemLists.map((list) => [...list]);
  const result = [];
  let prevQueueIdx = -1;
  while (queues.some((q) => q.length > 0)) {
    const withItems = queues.map((_, i) => i).filter((i) => queues[i].length > 0);
    const preferred = withItems.filter((i) => i !== prevQueueIdx);
    const pool = preferred.length > 0 ? preferred : withItems;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    result.push(queues[pick].shift());
    prevQueueIdx = pick;
  }
  return result;
}

function normalizeClassValue(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();

  if (text.includes("11")) return "11th";
  if (text.includes("12")) return "12th";
  if (text === "both") return "both";
  return "both";
}

function isChapterExcluded(ch, streamType, classFilter) {
  if (streamType === "PCM" && ch.subject === "Biology") return true;
  if (streamType === "PCB" && ch.subject === "Mathematics") return true;
  if (streamType === "PHY_ONLY" && ch.subject !== "Physics") return true;
  if (streamType === "CHEM_ONLY" && ch.subject !== "Chemistry") return true;
  if (streamType === "MATH_ONLY" && ch.subject !== "Mathematics") return true;
  if (streamType === "BIO_ONLY" && ch.subject !== "Biology") return true;

  const chapterClass = normalizeClassValue(ch.std ?? ch.standard ?? ch.class);
  const requestedClass = normalizeClassValue(classFilter);

  if (requestedClass === "12th" && chapterClass === "11th") return true;
  if (requestedClass === "11th" && chapterClass === "12th") return true;
  return false;
}

export default function AddExamImagesPage() {
  // Load DOMPurify from CDN once — needed since previews now render live
  // question_html/options HTML+MathML instead of showing an <img>.
  useEffect(() => {
    if (typeof window === "undefined" || window.DOMPurify) return;
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.5/purify.min.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  // ==========================================
  // 🟢 TOP-LEVEL VIEW ROUTING
  // ==========================================
  const [view, setView] = useState("list"); // 'list' | 'setup'

  // ==========================================
  // 🟢 LIST VIEW: existing exam_question_data_v2 rows
  // ==========================================
  const [existingMocks, setExistingMocks] = useState([]);
  const [loadingMocks, setLoadingMocks] = useState(false);

  const fetchExistingMocks = useCallback(async () => {
    setLoadingMocks(true);
    try {
      // exam_question_data_v2 now stores one JSON manifest row per mock test.
      // Aggregate client-side by reading the manifest array length for the list view.
      const { data, error } = await supabase
        .from("exam_question_data_v2")
        .select("id, mock_slug, mock_test_name, exam, questions_manifest, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const byMock = {};
      (data || []).forEach((row) => {
        const count = Array.isArray(row.questions_manifest) ? row.questions_manifest.length : 0;
        if (!byMock[row.mock_slug]) {
          byMock[row.mock_slug] = {
            id: row.mock_slug,
            mock_slug: row.mock_slug,
            mock_test_name: row.mock_test_name,
            exam: row.exam,
            created_at: row.created_at,
            count,
          };
        } else {
          byMock[row.mock_slug].count = Math.max(byMock[row.mock_slug].count, count);
        }

        if (row.created_at < byMock[row.mock_slug].created_at) {
          byMock[row.mock_slug].created_at = row.created_at;
        }
      });

      setExistingMocks(Object.values(byMock).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      console.error("Failed to load existing mock ledger:", err);
    } finally {
      setLoadingMocks(false);
    }
  }, []);

  useEffect(() => {
    if (view === "list") fetchExistingMocks();
  }, [view, fetchExistingMocks]);

  // ==========================================
  // 🟢 SETUP VIEW: Phase 1 — exam/name/slug
  // ==========================================
  const [exam, setExam] = useState("MHT-CET");
  const [streamType, setStreamType] = useState("PCM"); // 'PCM' | 'PCB'
  const [classFilter, setClassFilter] = useState("both"); // '11th' | '12th' | 'both'
  const [mockTestName, setMockTestName] = useState("");
  const [mockSlug, setMockSlug] = useState("");
  const [setupStage, setSetupStage] = useState("naming"); // 'naming' | 'assembler'

  // Track the last value we auto-suggested so we don't clobber a manual edit
  const lastAutoFolder = useRef("");

  // Autosuggest the mock slug (used as this mock's unique key across both
  // exam_question_data_v2 and exam_answer_keys_v2 rows) from the mock test name.
  useEffect(() => {
    const trimmed = mockTestName.trim();
    if (!trimmed) return;

    const suggestedFolder = trimmed.toLowerCase().replace(/\s+/g, "_");

    // Compare against the *currently committed* state (closed over from the
    // last render) before touching the ref — mutating the ref first was
    // causing the functional setState updater below to compare against the
    // already-updated ref, so the auto-suggestion would freeze after the
    // very first keystroke.
    if (mockSlug === "" || mockSlug === lastAutoFolder.current) {
      setMockSlug(suggestedFolder);
    }
    lastAutoFolder.current = suggestedFolder;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockTestName]);

  const resetSetupState = () => {
    setExam("MHT-CET");
    setStreamType("PCM");
    setClassFilter("both");
    setMockTestName("");
    setMockSlug("");
    lastAutoFolder.current = "";
    setSetupStage("naming");
    setChapters([]);
    setPool({});
    setChapterConfig({});
    setWeightMode("fixed");
    setExpandedSubjects({});
    setLoadedSubjects({});
    setLoadingSubjects({});
    setPreviewAllSubject(null);
  };

  const startNewMock = () => {
    resetSetupState();
    setView("setup");
  };

  const backToList = () => {
    resetSetupState();
    setView("list");
  };

  // ==========================================
  // 🟢 ASSEMBLER: chapters + weight blueprint
  // ==========================================
  const [weightMode, setWeightMode] = useState("fixed"); // 'fixed' | 'manual'
  const [chapters, setChapters] = useState([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // pool[chapterName] = array of merged question objects (Theory + Numerical),
  // populated lazily per-subject via fetchSubjectBundle below.
  const [pool, setPool] = useState({});

  // chapterConfig[chapterName] = { targetCount, mode: 'random'|'manual', selectedIds: [], previewIds: [] }
  const [chapterConfig, setChapterConfig] = useState({});

  // Subjects whose full question_bundles_v2 content has been fetched (or is
  // currently being fetched) — keyed by subject name.
  const [expandedSubjects, setExpandedSubjects] = useState({}); // { [subject]: true }
  const [loadedSubjects, setLoadedSubjects] = useState({}); // { [subject]: true } — bundle already in `pool`
  const [loadingSubjects, setLoadingSubjects] = useState({}); // { [subject]: true } — bundle fetch in flight
  const [previewAllSubject, setPreviewAllSubject] = useState(null);

  // Stage A — instant: chapter list + question_count only, no question HTML.
  // Powers the chapters screen the moment it mounts.
  const fetchChaptersAndPool = useCallback(async () => {
    setLoadingChapters(true);
    try {
      const res = await fetch(`/api/admin/exam-summary?exam=${encodeURIComponent(exam)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load exam summary.");

      const chaptersData = data.chapters || [];
      setChapters(chaptersData);
      setPool({});
      setExpandedSubjects({});
      setLoadedSubjects({});
      setLoadingSubjects({});

      // seed chapterConfig
      const seededConfig = {};
      chaptersData.forEach((ch) => {
        seededConfig[ch.chapter_name] = {
          targetCount: 0,
          mode: "random",
          selectedIds: [],
          previewIds: [],
        };
      });
      setChapterConfig(seededConfig);
    } catch (err) {
      console.error("Failed to load chapters:", err);
      alert(`Could not load syllabus data: ${err.message}`);
    } finally {
      setLoadingChapters(false);
    }
  }, [exam]);

  // Stage B — on demand: full question bundles for one subject, fetched the
  // first time that subject's row is expanded (or its Preview-all is opened),
  // then cached in `pool` for the rest of the session.
  const fetchSubjectBundle = useCallback(
    async (subject) => {
      if (loadedSubjects[subject] || loadingSubjects[subject]) return;
      setLoadingSubjects((prev) => ({ ...prev, [subject]: true }));
      try {
        const res = await fetch(
          `/api/admin/subject-bundle?exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed to load ${subject} questions.`);

        setPool((prev) => {
          const next = { ...prev };
          (data.bundles || []).forEach((row) => {
            const list = Array.isArray(row.questions) ? row.questions : [];
            if (!next[row.chapter]) next[row.chapter] = [];
            else next[row.chapter] = [...next[row.chapter]];
            list.forEach((q) => {
              next[row.chapter].push({
                ...q,
                subject: row.subject,
                chapter: row.chapter,
                chapter_id: row.chapter_id,
                question_type: row.question_type,
              });
            });
          });
          return next;
        });
        setLoadedSubjects((prev) => ({ ...prev, [subject]: true }));
      } catch (err) {
        console.error(`Failed to load ${subject} bundle:`, err);
        alert(`Could not load ${subject} questions: ${err.message}`);
      } finally {
        setLoadingSubjects((prev) => ({ ...prev, [subject]: false }));
      }
    },
    [exam, loadedSubjects, loadingSubjects]
  );

  const toggleSubjectRow = (subject) => {
    setExpandedSubjects((prev) => {
      const next = { ...prev, [subject]: !prev[subject] };
      return next;
    });
    if (!loadedSubjects[subject]) fetchSubjectBundle(subject);
  };

  const openPreviewAllSubject = (subject) => {
    // Make sure every chapter in this subject already has its randomly-assigned
    // question set generated (same engine the per-chapter "Preview" button uses)
    // so the subject-wide preview always reflects the full random assignment —
    // not just whatever the user has manually approved so far.
    setChapterConfig((prev) => {
      const next = { ...prev };
      chapters
        .filter((ch) => ch.subject === subject)
        .forEach((ch) => {
          const cfg = next[ch.chapter_name];
          const target = cfg?.targetCount || 0;
          if (target > 0 && (!cfg.previewIds || cfg.previewIds.length !== target)) {
            const ids = pickRandomIds(ch.chapter_name, target);
            next[ch.chapter_name] = { ...cfg, previewIds: ids };
          }
        });
      return next;
    });
    setPreviewAllSubject(subject);
    if (!loadedSubjects[subject]) fetchSubjectBundle(subject);
  };

  const proceedToAssembler = () => {
    if (!mockTestName.trim() || !mockSlug.trim()) {
      alert("Please enter a mock test name and a slug.");
      return;
    }
    setSetupStage("assembler");
    fetchChaptersAndPool();
  };

  // Apply fixed default_weight to all chapters (used when toggling to Fixed)
  // Safety net: if "Preview all" was opened before the subject bundle finished
  // loading, backfill previewIds as soon as the pool for this subject arrives.
  useEffect(() => {
    if (!previewAllSubject || !loadedSubjects[previewAllSubject]) return;
    setChapterConfig((prev) => {
      const next = { ...prev };
      let changed = false;
      chapters
        .filter((ch) => ch.subject === previewAllSubject)
        .forEach((ch) => {
          const cfg = next[ch.chapter_name];
          const target = cfg?.targetCount || 0;
          if (target > 0 && (!cfg.previewIds || cfg.previewIds.length !== target)) {
            const ids = pickRandomIds(ch.chapter_name, target);
            next[ch.chapter_name] = { ...cfg, previewIds: ids };
            changed = true;
          }
        });
      return changed ? next : prev;
    });
  }, [previewAllSubject, loadedSubjects, chapters, pool]);

  useEffect(() => {
    if (weightMode !== "fixed" || chapters.length === 0) return;
    setChapterConfig((prev) => {
      const next = { ...prev };
      chapters.forEach((ch) => {
        const cfg = next[ch.chapter_name] || { mode: "random", selectedIds: [], previewIds: [] };
        next[ch.chapter_name] = {
          ...cfg,
          targetCount: ch.default_weight || 0,
        };
      });
      return next;
    });
  }, [weightMode, chapters]);

  // Single-subject streams (Physics only / Chemistry only / etc.) have no
  // "Fixed" weightage concept — there's no meaningful default split across
  // one subject's chapters — so the toggle is hidden for them and every
  // chapter's target count is forced to 0 the moment such a stream is
  // picked, same as tapping "Manual" by hand.
  useEffect(() => {
    if (!SINGLE_SUBJECT_STREAMS.includes(streamType)) return;
    setWeightMode("manual");
    setChapterConfig((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((chapterName) => {
        if (next[chapterName]?.targetCount !== 0) {
          next[chapterName] = { ...next[chapterName], targetCount: 0 };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [streamType]);

  // Auto-zero any chapter excluded by the chosen Stream (PCM/PCB) or Class
  // (11th/12th/both) — e.g. selecting PCM zeroes every Biology chapter.
  useEffect(() => {
    if (chapters.length === 0) return;
    setChapterConfig((prev) => {
      let changed = false;
      const next = { ...prev };
      chapters.forEach((ch) => {
        if (!isChapterExcluded(ch, streamType, classFilter)) return;
        const cfg = next[ch.chapter_name];
        if (cfg && cfg.targetCount !== 0) {
          next[ch.chapter_name] = { ...cfg, targetCount: 0 };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [streamType, classFilter, chapters]);

  const updateChapterTarget = (chapterName, value) => {
    const n = Math.max(0, parseInt(value, 10) || 0);
    setChapterConfig((prev) => ({
      ...prev,
      [chapterName]: { ...prev[chapterName], targetCount: n },
    }));
  };

  const updateChapterMode = (chapterName, mode) => {
    setChapterConfig((prev) => ({
      ...prev,
      [chapterName]: { ...prev[chapterName], mode },
    }));
  };

  // Tapping "Manual" on the Weightage Mode toggle instantly zeroes every
  // chapter's target count, so the admin starts from a blank slate and
  // fills counts in by hand — rather than keeping whatever "Fixed" had set.
  const handleWeightModeManual = () => {
    setWeightMode("manual");
    setChapterConfig((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((chapterName) => {
        next[chapterName] = { ...next[chapterName], targetCount: 0 };
      });
      return next;
    });
  };

  // ==========================================
  // 🟢 RANDOM SELECTION ENGINE
  // ==========================================
  const pickRandomIds = (chapterName, n, excludeIds = []) => {
    const chapterPool = pool[chapterName] || [];
    const candidates = chapterPool.filter((q) => !excludeIds.includes(q.q_id));
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, n).map((q) => q.q_id);
  };

  const [randomPreviewChapter, setRandomPreviewChapter] = useState(null);
  const [randomPreviewIndex, setRandomPreviewIndex] = useState(0);

  const openRandomPreview = (chapterName) => {
    const cfg = chapterConfig[chapterName];
    const target = cfg?.targetCount || 0;
    if (target <= 0) {
      alert("Set a target question count greater than 0 before generating a random preview.");
      return;
    }
    const ids = cfg.previewIds.length === target ? cfg.previewIds : pickRandomIds(chapterName, target);
    setChapterConfig((prev) => ({
      ...prev,
      [chapterName]: { ...prev[chapterName], previewIds: ids },
    }));
    setRandomPreviewIndex(0);
    setRandomPreviewChapter(chapterName);
  };

  const regenerateAllRandom = (chapterName) => {
    const target = chapterConfig[chapterName]?.targetCount || 0;
    const ids = pickRandomIds(chapterName, target);
    setChapterConfig((prev) => ({
      ...prev,
      [chapterName]: { ...prev[chapterName], previewIds: ids },
    }));
    setRandomPreviewIndex(0);
  };

  const regenerateSingleRandom = (chapterName, indexInPreview) => {
    setChapterConfig((prev) => {
      const cfg = prev[chapterName];
      const currentIds = cfg.previewIds;
      const [replacementId] = pickRandomIds(chapterName, 1, currentIds);
      if (!replacementId) return prev; // pool exhausted
      const nextIds = [...currentIds];
      nextIds[indexInPreview] = replacementId;
      return { ...prev, [chapterName]: { ...cfg, previewIds: nextIds } };
    });
  };

  // ==========================================
  // 🟢 MANUAL SELECTION ENGINE (question-only grid, 1-at-a-time)
  // ==========================================
  const [manualGridChapter, setManualGridChapter] = useState(null);
  const [manualGridIndex, setManualGridIndex] = useState(0);

  const openManualGrid = (chapterName) => {
    setManualGridIndex(0);
    setManualGridChapter(chapterName);
  };

  // Small red toast for "you're trying to select more than the assigned count"
  const [limitToast, setLimitToast] = useState(null);
  const limitToastTimer = useRef(null);
  const showLimitToast = (message) => {
    setLimitToast(message);
    if (limitToastTimer.current) clearTimeout(limitToastTimer.current);
    limitToastTimer.current = setTimeout(() => setLimitToast(null), 2800);
  };
  useEffect(() => {
    return () => {
      if (limitToastTimer.current) clearTimeout(limitToastTimer.current);
    };
  }, []);

  const toggleManualSelection = (chapterName, qId) => {
    const cfg = chapterConfig[chapterName];
    if (!cfg) return;
    const already = cfg.selectedIds.includes(qId);

    // Blocking a new selection once the chapter's assigned count is already met
    if (!already && cfg.targetCount && cfg.selectedIds.length >= cfg.targetCount) {
      showLimitToast(
        `Only ${cfg.targetCount} question${cfg.targetCount === 1 ? "" : "s"} assigned for ${chapterName} — you're selecting more than that.`
      );
      return;
    }

    setChapterConfig((prev) => {
      const pcfg = prev[chapterName];
      const alreadyNow = pcfg.selectedIds.includes(qId);
      const nextIds = alreadyNow ? pcfg.selectedIds.filter((id) => id !== qId) : [...pcfg.selectedIds, qId];
      return { ...prev, [chapterName]: { ...pcfg, selectedIds: nextIds } };
    });
  };

  // ==========================================
  // 🟢 RUNNING COUNTER DASHBOARD
  // ==========================================
  const summary = useMemo(() => {
    const bySubject = {};
    let totalSelected = 0;
    let totalTarget = 0;
    chapters.forEach((ch) => {
      const cfg = chapterConfig[ch.chapter_name];
      if (!cfg) return;
      const selectedCount = cfg.mode === "manual" ? cfg.selectedIds.length : cfg.previewIds.length;
      totalSelected += selectedCount;
      totalTarget += cfg.targetCount || 0;
      const subj = ch.subject || "General";
      if (!bySubject[subj]) bySubject[subj] = { selected: 0, target: 0 };
      bySubject[subj].selected += selectedCount;
      bySubject[subj].target += cfg.targetCount || 0;
    });
    return { bySubject, totalSelected, totalTarget };
  }, [chapters, chapterConfig]);

  const allChaptersSatisfied = useMemo(() => {
    if (summary.totalTarget === 0) return false;
    return chapters.every((ch) => {
      const cfg = chapterConfig[ch.chapter_name];
      if (!cfg || !cfg.targetCount) return true; // 0-target chapters don't block
      const selectedCount = cfg.mode === "manual" ? cfg.selectedIds.length : cfg.previewIds.length;
      return selectedCount === cfg.targetCount;
    });
  }, [chapters, chapterConfig, summary.totalTarget]);

  // ==========================================
  // 🟢 DEPLOY PIPELINE: one JSON manifest row per mock test
  // ==========================================
  const [uploading, setUploading] = useState(false);
  const [uploadStageLabel, setUploadStageLabel] = useState("");
  const [uploadSuccessInfo, setUploadSuccessInfo] = useState(null);

  const buildFinalItems = () => {
    // Always walk chapters in Physics → Chemistry → Mathematics → Biology
    // order so test_q_num (and therefore the uploaded numbering) follows
    // that order no matter what order Supabase returned chapters in.
    const orderedChapters = [...chapters].sort(
      (a, b) => subjectRank(a.subject) - subjectRank(b.subject)
    );

    // Collect each chapter's own item list first (still respecting that
    // chapter's random/manual selection), grouped by subject so chapters
    // belonging to the same subject can be shuffled together afterwards.
    const subjectGroups = []; // [{ subject, chapterLists: [[items], [items], ...] }]
    const subjectGroupIndex = {};

    orderedChapters.forEach((ch) => {
      const cfg = chapterConfig[ch.chapter_name];
      if (!cfg || !cfg.targetCount) return;
      const ids = cfg.mode === "manual" ? cfg.selectedIds : cfg.previewIds;
      const chapterPool = pool[ch.chapter_name] || [];
      const chapterItems = [];
      ids.forEach((id) => {
        const q = chapterPool.find((x) => x.q_id === id);
        if (q) {
          chapterItems.push({
            subject: ch.subject,
            q_section: ch.subject,
            chapter: ch.chapter_name,
            chapter_id: q.chapter_id,
            question_type: q.question_type,
            q_num: q.q_num,
            q_id: q.q_id,
            options: q.options,
            section: q.section,
            ques_type: q.ques_type ?? q.question_type,
            source_id: q.source_id,
            answer_key: q.answer_key,
            exam_history: q.exam_history ?? [],
            question_html: q.question_html,
            // solution_html is deliberately NOT here — the pool no longer
            // carries it (stripped server-side to fix the statement_timeout),
            // so the deploy route looks it up itself from question_bundles_v2
            // using chapter_id + question_type + q_id, right before insert.
          });
        }
      });
      if (chapterItems.length === 0) return;

      if (!(ch.subject in subjectGroupIndex)) {
        subjectGroupIndex[ch.subject] = subjectGroups.length;
        subjectGroups.push({ subject: ch.subject, chapterLists: [] });
      }
      subjectGroups[subjectGroupIndex[ch.subject]].chapterLists.push(chapterItems);
    });

    // Within each subject, interleave questions across its chapters so the
    // same chapter never lands twice in a row — the subject blocks
    // themselves still stay in the fixed order from orderedChapters above.
    const items = [];
    subjectGroups.forEach((group) => {
      items.push(...interleaveByChapter(group.chapterLists));
    });

    // Assign per-subject running index (k), overall test_q_num, and sub_id —
    // these become part of each question row's globally-unique id, along with
    // mockSlug, so `${mockSlug}_q${test_q_num}` is unique per question, forever.
    const bySubjectCounter = {};
    let testQNum = 0;
    return items.map((it) => {
      testQNum += 1;
      const meta = getSubjectMeta(it.subject);
      bySubjectCounter[meta.abbrev] = (bySubjectCounter[meta.abbrev] || 0) + 1;

      return {
        ...it,
        test_q_num: testQNum,
        sub_id: meta.subId,
        abbrev: meta.abbrev,
        k: bySubjectCounter[meta.abbrev],
      };
    });
  };

  const handleUpload = async () => {
    const manifest = buildFinalItems();
    if (manifest.length === 0) {
      alert("No questions have been selected yet.");
      return;
    }
    if (!allChaptersSatisfied) {
      alert("Every chapter with a target count must have exactly that many questions selected before uploading.");
      return;
    }

    setUploading(true);
    setUploadStageLabel("Aggregating questions from question_bundles_v2...");
    try {
      setTimeout(() => setUploadStageLabel("Saving question manifest..."), 500);
      setTimeout(() => setUploadStageLabel("Saving answer manifest..."), 1200);

      // Server route now stores one JSON manifest row per mock in each table
      // using the service-role key — no GitHub, no image pipeline, the raw
      // MathML/HTML text is the payload itself.
      const res = await fetch("/api/deploy-test-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam,
          mockName: mockTestName,
          mockSlug,
          manifest,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deployment failed");

      setUploadSuccessInfo({
        mockTestName,
        mockSlug,
        count: manifest.length,
      });
    } catch (err) {
      console.error(err);
      alert(`Deployment pipeline failed: ${err.message}`);
    } finally {
      setUploading(false);
      setUploadStageLabel("");
    }
  };

  const closeSuccessAndReturn = () => {
    setUploadSuccessInfo(null);
    backToList();
  };

  // ==========================================
  // 🟢 RENDER: LIST VIEW
  // ==========================================
  if (view === "list") {
    return (
      <div className="aei-workspace">
        <div className="aei-topbar">
          <div className="aei-topbar-title">
            <span className="aei-title-main">Exam Image Deployment</span>
            <span className="aei-title-sub">Mock test assembler & question bank deploy ledger</span>
          </div>
        </div>

        <div className="aei-canvas">
          <div className="aei-grid-cards">
            <button type="button" className="aei-create-card" onClick={startNewMock}>
              <span className="aei-create-plus">+</span>
              <span className="aei-create-label">Create Exam Image Folder</span>
              <span className="aei-create-hint">Assemble a new mock test and deploy it to Supabase</span>
            </button>

            {loadingMocks ? (
              <div className="aei-empty-note">Loading deployed mock tests...</div>
            ) : existingMocks.length === 0 ? (
              <div className="aei-empty-note">No mock tests deployed yet. Create your first one.</div>
            ) : (
              existingMocks.map((mock) => (
                <div key={mock.id} className="aei-mock-card">
                  <div className="aei-mock-card-header">
                    <span className="aei-badge aei-badge-primary">{mock.exam}</span>
                    <span className="aei-mock-date">{new Date(mock.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="aei-mock-name">{mock.mock_test_name}</div>
                  <div className="aei-mock-folder">🔑 {mock.mock_slug}</div>
                  <div className="aei-mock-footer">
                    <span className="aei-badge aei-badge-success">{mock.count} questions</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 🟢 RENDER: SETUP VIEW — Stage 1: Naming
  // ==========================================
  if (view === "setup" && setupStage === "naming") {
    return (
      <div className="aei-workspace">
        <div className="aei-topbar">
          <button type="button" className="aei-back-btn" onClick={backToList}>← Back</button>
          <div className="aei-topbar-title">
            <span className="aei-title-main">New Exam Image Folder</span>
            <span className="aei-title-sub">Step 1 of 2 — Target &amp; naming</span>
          </div>
        </div>

        <div className="aei-canvas aei-canvas-centered">
          <div className="aei-naming-card">
            <label className="aei-field-label">Exam</label>
            <select className="aei-select" value={exam} onChange={(e) => setExam(e.target.value)}>
              {EXAM_OPTIONS.map((ex) => (
                <option key={ex} value={ex}>{ex}</option>
              ))}
            </select>

            <label className="aei-field-label">Stream</label>
            <select className="aei-select" value={streamType} onChange={(e) => setStreamType(e.target.value)}>
              <option value="PCM">PCM (Physics, Chemistry, Maths)</option>
              <option value="PCB">PCB (Physics, Chemistry, Biology)</option>
              <option value="PHY_ONLY">Physics only</option>
              <option value="CHEM_ONLY">Chemistry only</option>
              <option value="MATH_ONLY">Mathematics only</option>
              <option value="BIO_ONLY">Biology only</option>
            </select>
            <span className="aei-field-hint">
              {streamType === "PCM" && "Biology chapters will be excluded (auto-set to 0)."}
              {streamType === "PCB" && "Mathematics chapters will be excluded (auto-set to 0)."}
              {streamType === "PHY_ONLY" && "Only Physics chapters are included — every other subject is excluded (auto-set to 0)."}
              {streamType === "CHEM_ONLY" && "Only Chemistry chapters are included — every other subject is excluded (auto-set to 0)."}
              {streamType === "MATH_ONLY" && "Only Mathematics chapters are included — every other subject is excluded (auto-set to 0)."}
              {streamType === "BIO_ONLY" && "Only Biology chapters are included — every other subject is excluded (auto-set to 0)."}
            </span>

            <label className="aei-field-label">Class</label>
            <select className="aei-select" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
              <option value="both">11th + 12th</option>
              <option value="11th">11th only</option>
              <option value="12th">12th only</option>
            </select>
            <span className="aei-field-hint">
              {classFilter === "both"
                ? "Chapters from both standards are included."
                : classFilter === "12th"
                ? "11th std chapters will be excluded (auto-set to 0)."
                : "12th std chapters will be excluded (auto-set to 0)."}
            </span>

            <label className="aei-field-label">Mock Test Name</label>
            <input
              type="text"
              className="aei-input"
              placeholder="e.g. Mock Test 01"
              value={mockTestName}
              onChange={(e) => setMockTestName(e.target.value)}
            />

            <label className="aei-field-label">Mock Slug (unique identifier)</label>
            <input
              type="text"
              className="aei-input aei-input-mono"
              placeholder="e.g. mock_test_01"
              value={mockSlug}
              onChange={(e) => setMockSlug(e.target.value.trim().replace(/\s+/g, "_"))}
            />
            <span className="aei-field-hint">
              Used as this mock's unique key across <code>exam_question_data_v2</code> and{" "}
              <code>exam_answer_keys_v2</code> — each question's id becomes <code>{mockSlug || "…"}_q1</code>,{" "}
              <code>{mockSlug || "…"}_q2</code>, etc.
            </span>

            <button type="button" className="aei-btn aei-btn-primary aei-btn-full" onClick={proceedToAssembler}>
              Continue to Question Selection →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 🟢 RENDER: SETUP VIEW — Stage 2: Assembler
  // ==========================================
  return (
    <div className="aei-workspace">
      <div className="aei-topbar">
        <button type="button" className="aei-back-btn" onClick={() => setSetupStage("naming")}>← Back</button>
        <div className="aei-topbar-title">
          <span className="aei-title-main">{mockTestName}</span>
          <span className="aei-title-sub">{exam} · 🔑 {mockSlug}</span>
        </div>
        {!SINGLE_SUBJECT_STREAMS.includes(streamType) && (
          <div className="aei-weight-toggle-group">
            <span className="aei-toggle-label">Weightage Mode</span>
            <div className="aei-segmented">
              <button
                type="button"
                className={`aei-segment-btn ${weightMode === "fixed" ? "is-active" : ""}`}
                onClick={() => setWeightMode("fixed")}
              >
                Fixed
              </button>
              <button
                type="button"
                className={`aei-segment-btn ${weightMode === "manual" ? "is-active" : ""}`}
                onClick={handleWeightModeManual}
              >
                Manual
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="aei-info-banner">
        💡 Enter (or load) the number of questions per chapter, choose Random or Manual per row, then preview/select
        before uploading. The upload button unlocks once every target count is fully matched.
      </div>

      <div className="aei-canvas aei-canvas-table">
        {loadingChapters ? (
          <div className="aei-empty-note">Loading syllabus chapters...</div>
        ) : chapters.length === 0 ? (
          <div className="aei-empty-note">No syllabus chapters found for {exam}.</div>
        ) : chapters.filter((ch) => !isChapterExcluded(ch, streamType, classFilter)).length === 0 ? (
          <div className="aei-empty-note">
            No chapters match the selected Stream/Class combination.
          </div>
        ) : (
          <div className="aei-subject-list">
            {[...new Set(
                chapters
                  .filter((ch) => !isChapterExcluded(ch, streamType, classFilter))
                  .map((ch) => ch.subject)
              )]
              .sort((a, b) => subjectRank(a) - subjectRank(b))
              .map((subject) => {
                const subjectChapters = chapters.filter(
                  (ch) => ch.subject === subject && !isChapterExcluded(ch, streamType, classFilter)
                );
                const totalAvailable = subjectChapters.reduce(
                  (sum, ch) => sum + (Number(ch.question_count) || 0),
                  0
                );
                const totalTarget = subjectChapters.reduce(
                  (sum, ch) => sum + (chapterConfig[ch.chapter_name]?.targetCount || 0),
                  0
                );
                const totalSelected = subjectChapters.reduce((sum, ch) => {
                  const cfg = chapterConfig[ch.chapter_name];
                  if (!cfg) return sum;
                  return sum + (cfg.mode === "manual" ? cfg.selectedIds.length : cfg.previewIds.length);
                }, 0);
                const isOpen = !!expandedSubjects[subject];
                const isLoadingSubject = !!loadingSubjects[subject];
                const subjectSatisfied = totalTarget > 0 && totalSelected === totalTarget;

                return (
                  <div key={subject} className={`aei-subject-card ${isOpen ? "is-open" : ""}`}>
                    <button
                      type="button"
                      className="aei-subject-header"
                      onClick={() => toggleSubjectRow(subject)}
                    >
                      <span className={`aei-subject-chevron ${isOpen ? "is-open" : ""}`}>▸</span>
                      <span className="aei-subject-name">{subject}</span>
                      <span className="aei-subject-meta">
                        <span className="aei-availability-chip">{totalAvailable} available</span>
                        <span className={`aei-selected-tag ${subjectSatisfied ? "is-satisfied" : ""}`}>
                          Assigned: {totalSelected}/{totalTarget}
                        </span>
                        {isLoadingSubject && <span className="aei-subject-loading">Loading…</span>}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="aei-btn aei-btn-ghost aei-btn-sm aei-subject-preview-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPreviewAllSubject(subject);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            openPreviewAllSubject(subject);
                          }
                        }}
                      >
                        👁 Preview all
                      </span>
                    </button>

                    {isOpen && (
                      <div className="aei-table-wrapper aei-subject-body">
                        {isLoadingSubject && !loadedSubjects[subject] ? (
                          <div className="aei-empty-note aei-subject-loading-note">
                            Loading {subject} question bank…
                          </div>
                        ) : (
                          <table className="aei-matrix-table">
                            <thead>
                              <tr>
                                <th className="aei-col-chapter">Chapter</th>
                                <th className="aei-col-avail">Available</th>
                                <th className="aei-col-target">Questions to Take</th>
                                <th className="aei-col-mode">Selection Mode</th>
                                <th className="aei-col-action">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {subjectChapters.map((ch) => {
                                const cfg = chapterConfig[ch.chapter_name] || {
                                  targetCount: 0,
                                  mode: "random",
                                  selectedIds: [],
                                  previewIds: [],
                                };
                                const chapterPool = pool[ch.chapter_name] || [];
                                const available = loadedSubjects[subject]
                                  ? chapterPool.length
                                  : Number(ch.question_count) || 0;
                                const selectedCount =
                                  cfg.mode === "manual" ? cfg.selectedIds.length : cfg.previewIds.length;
                                const overAvailable = cfg.targetCount > available;
                                const satisfied = cfg.targetCount > 0 && selectedCount === cfg.targetCount;

                                return (
                                  <tr key={ch.id} className={overAvailable ? "aei-row-warning" : ""}>
                                    <td className="aei-col-chapter">
                                      <div className="aei-chapter-name-cell">
                                        <span className="aei-chapter-std">{ch.std}</span>
                                        <span>{ch.chapter_name}</span>
                                      </div>
                                    </td>
                                    <td className="aei-col-avail">
                                      <span className={`aei-availability-chip ${overAvailable ? "is-danger" : ""}`}>
                                        {available}
                                      </span>
                                    </td>
                                    <td className="aei-col-target">
                                      <input
                                        type="number"
                                        min="0"
                                        className="aei-count-input"
                                        value={cfg.targetCount}
                                        onChange={(e) => updateChapterTarget(ch.chapter_name, e.target.value)}
                                      />
                                      {overAvailable && (
                                        <span className="aei-warning-text">Only {available} available</span>
                                      )}
                                    </td>
                                    <td className="aei-col-mode">
                                      <div className="aei-segmented aei-segmented-sm">
                                        <button
                                          type="button"
                                          className={`aei-segment-btn ${cfg.mode === "random" ? "is-active" : ""}`}
                                          onClick={() => updateChapterMode(ch.chapter_name, "random")}
                                        >
                                          Random
                                        </button>
                                        <button
                                          type="button"
                                          className={`aei-segment-btn ${cfg.mode === "manual" ? "is-active" : ""}`}
                                          onClick={() => updateChapterMode(ch.chapter_name, "manual")}
                                        >
                                          Manual
                                        </button>
                                      </div>
                                      <span className={`aei-selected-tag ${satisfied ? "is-satisfied" : ""}`}>
                                        Selected: {selectedCount}/{cfg.targetCount || 0}
                                      </span>
                                    </td>
                                    <td className="aei-col-action">
                                      {cfg.mode === "random" ? (
                                        <button
                                          type="button"
                                          className="aei-btn aei-btn-ghost"
                                          onClick={() => openRandomPreview(ch.chapter_name)}
                                          disabled={!cfg.targetCount || !loadedSubjects[subject]}
                                        >
                                          👁 Preview
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="aei-btn aei-btn-ghost"
                                          onClick={() => openManualGrid(ch.chapter_name)}
                                          disabled={available === 0 || !loadedSubjects[subject]}
                                        >
                                          🗂 Select
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ======================================================== 
        🟢 STICKY RUNNING COUNTER DASHBOARD
        ======================================================== */}
      <div className="aei-sticky-footer">
        <div className="aei-counter-cluster">
          <div className="aei-counter-total">
            Total Selected: <strong>{summary.totalSelected} / {summary.totalTarget}</strong>
          </div>
          <div className="aei-counter-breakdown">
            {Object.entries(summary.bySubject).map(([subj, v]) => (
              <span key={subj} className="aei-counter-chip">
                {subj}: {v.selected}/{v.target}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="aei-btn aei-btn-primary aei-btn-upload"
          onClick={handleUpload}
          disabled={!allChaptersSatisfied || uploading}
        >
          {uploading ? "Deploying..." : "Upload Questions"}
        </button>
      </div>

      {/* ======================================================== 
        🟢 MANUAL SELECTION OVERLAY — scrollable, one question at a time
        ======================================================== */}
      {manualGridChapter && (
        <ManualSelectionOverlay
          chapterName={manualGridChapter}
          pool={pool[manualGridChapter] || []}
          cfg={chapterConfig[manualGridChapter]}
          currentIndex={manualGridIndex}
          setCurrentIndex={setManualGridIndex}
          onToggle={(qId) => toggleManualSelection(manualGridChapter, qId)}
          onClose={() => setManualGridChapter(null)}
        />
      )}

      {/* ======================================================== 
        🟢 RANDOM PREVIEW OVERLAY — scrollable, one question at a time + regenerate
        ======================================================== */}
      {randomPreviewChapter && (
        <RandomPreviewOverlay
          chapterName={randomPreviewChapter}
          pool={pool[randomPreviewChapter] || []}
          previewIds={chapterConfig[randomPreviewChapter]?.previewIds || []}
          currentIndex={randomPreviewIndex}
          setCurrentIndex={setRandomPreviewIndex}
          onRegenerateAll={() => regenerateAllRandom(randomPreviewChapter)}
          onRegenerateSingle={(idx) => regenerateSingleRandom(randomPreviewChapter, idx)}
          onClose={() => setRandomPreviewChapter(null)}
        />
      )}

      {/* ======================================================== 
        🟢 PREVIEW-ALL OVERLAY — every question in a subject, browse-only
        ======================================================== */}
      {previewAllSubject && (
        <SubjectPreviewAllOverlay
          subject={previewAllSubject}
          chapters={chapters.filter((ch) => ch.subject === previewAllSubject)}
          pool={pool}
          chapterConfig={chapterConfig}
          loading={!!loadingSubjects[previewAllSubject] && !loadedSubjects[previewAllSubject]}
          onRegenerateChapter={(chapterName) => regenerateAllRandom(chapterName)}
          onClose={() => setPreviewAllSubject(null)}
        />
      )}

      {/* ======================================================== 
        🟢 UPLOAD PROGRESS HUD
        ======================================================== */}
      {uploading && (
        <div className="aei-modal-backdrop">
          <div className="aei-hud-dialog">
            <div className="aei-hud-spinner" />
            <div className="aei-hud-stage-label">{uploadStageLabel}</div>
          </div>
        </div>
      )}

      {/* ======================================================== 
        🟢 SUCCESS POPUP
        ======================================================== */}
      {uploadSuccessInfo && (
        <div className="aei-modal-backdrop">
          <div className="aei-hud-dialog aei-success-dialog">
            <div className="aei-success-icon">✅</div>
            <div className="aei-success-title">Questions and answer keys deployed to Supabase successfully</div>
            <div className="aei-success-detail">
              {uploadSuccessInfo.count} questions deployed to <code>{uploadSuccessInfo.mockSlug}</code>
            </div>
            <button type="button" className="aei-btn aei-btn-primary" onClick={closeSuccessAndReturn}>
              Done
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== 
        🟢 LIMIT-EXCEEDED TOAST — small red popup, bottom center
        ======================================================== */}
      {limitToast && (
        <div className="aei-toast-danger" role="alert">
          {limitToast}
        </div>
      )}

      <style jsx>{`
        .aei-subject-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .aei-subject-card {
          background: linear-gradient(180deg, rgba(28, 31, 35, 0.96), rgba(23, 25, 28, 0.98));
          border: 1px solid rgba(201, 162, 75, 0.18);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
          transition: border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease;
        }
        .aei-subject-card:hover {
          border-color: rgba(201, 162, 75, 0.38);
          transform: translateY(-1px);
        }
        .aei-subject-card.is-open {
          border-color: rgba(201, 162, 75, 0.55);
          box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24), inset 0 1px 0 rgba(201, 162, 75, 0.12);
        }
        .aei-subject-header {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: linear-gradient(180deg, rgba(30, 33, 37, 0.98), rgba(25, 27, 31, 0.98));
          border: none;
          border-bottom: 1px solid transparent;
          cursor: pointer;
          text-align: left;
          font: inherit;
          color: #ecedee;
        }
        .aei-subject-card.is-open .aei-subject-header {
          background: linear-gradient(180deg, rgba(35, 38, 43, 0.98), rgba(29, 31, 34, 0.98));
          border-bottom-color: rgba(201, 162, 75, 0.18);
        }
        .aei-subject-chevron {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: #9a9da3;
          transition: transform 0.15s ease, color 0.15s ease;
          flex-shrink: 0;
        }
        .aei-subject-chevron.is-open {
          transform: rotate(90deg);
          color: #c9a24b;
        }
        .aei-subject-name {
          font-weight: 700;
          font-size: 14px;
          color: #ecedee;
          min-width: 130px;
          letter-spacing: 0.01em;
        }
        .aei-subject-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          flex-wrap: wrap;
        }
        .aei-subject-loading {
          font-size: 11px;
          color: #c9a24b;
          font-style: italic;
          font-weight: 700;
        }
        .aei-subject-preview-all {
          margin-left: auto;
          flex-shrink: 0;
          white-space: nowrap;
          background: rgba(24, 26, 30, 0.9);
          border: 1px solid #2a2d32;
          color: #ecedee;
          border-radius: 8px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .aei-subject-preview-all:hover,
        .aei-subject-preview-all:focus-visible {
          background: rgba(201, 162, 75, 0.1);
          border-color: #c9a24b;
          color: #c9a24b;
          outline: none;
        }
        .aei-btn-sm {
          padding: 7px 12px;
          font-size: 12px;
        }
        .aei-subject-body {
          padding: 12px 16px 16px;
          background: rgba(12, 13, 16, 0.72);
        }
        .aei-subject-loading-note {
          padding: 24px 0;
          text-align: center;
          color: #9a9da3;
        }
        .aei-preview-all-body {
          overflow-y: auto;
          max-height: 70vh;
          padding: 16px 20px;
        }
        .aei-preview-all-chapter {
          margin-bottom: 24px;
        }
        .aei-preview-all-chapter-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 14px;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #eceff3;
        }
        .aei-preview-all-grid {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .aei-preview-all-item {
          border: 1px solid #edeff3;
          border-radius: 8px;
          padding: 12px 14px;
          background: #fcfcfd;
        }
        .aei-preview-all-item-num {
          font-size: 12px;
          font-weight: 700;
          color: #8b5cf6;
          margin-bottom: 6px;
        }
      `}</style>
    </div>
  );
}

// ============================================================
// 🟢 SUB-COMPONENT: Subject "Preview all" Overlay (browse-only, by chapter)
// ============================================================
function SubjectPreviewAllOverlay({
  subject,
  chapters,
  pool,
  chapterConfig,
  loading,
  onRegenerateChapter,
  onClose,
}) {
  // Always show the chapter's randomly-assigned set (previewIds) — same pool
  // the per-chapter "🎲 Preview" button generates — never the manually
  // approved subset, so this reflects the full random draw for the subject.
  const getChapterSelection = (ch) => {
    const chapterPool = pool[ch.chapter_name] || [];
    const cfg = chapterConfig[ch.chapter_name];
    if (!cfg || !cfg.targetCount) return [];
    const ids = cfg.previewIds || [];
    if (ids.length === 0) return [];
    const byId = new Map(chapterPool.map((q) => [q.q_id, q]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
  };

  const totalQuestions = chapters.reduce((sum, ch) => sum + getChapterSelection(ch).length, 0);

  return (
    <div className="aei-modal-backdrop">
      <div className="aei-overlay-dialog aei-overlay-dialog-lg">
        <div className="aei-overlay-header">
          <div>
            <div className="aei-overlay-title">Preview all — {subject}</div>
            <div className="aei-overlay-subtitle">
              {loading ? "Loading question bank…" : `${totalQuestions} selected question${totalQuestions === 1 ? "" : "s"} across ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}`}
            </div>
          </div>
          <button type="button" className="aei-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="aei-preview-all-body">
          {loading ? (
            <div className="aei-empty-note">Loading {subject} question bank…</div>
          ) : totalQuestions === 0 ? (
            <div className="aei-empty-note">No questions selected yet for {subject}. Assign a target count to each chapter first.</div>
          ) : (
            chapters.map((ch) => {
              const chapterSelection = getChapterSelection(ch);
              if (chapterSelection.length === 0) return null;
              return (
                <div key={ch.id} className="aei-preview-all-chapter">
                  <div className="aei-preview-all-chapter-title">
                    <span className="aei-chapter-std">{ch.std}</span>
                    <span>{ch.chapter_name}</span>
                    <span className="aei-badge aei-badge-muted">{chapterSelection.length} questions</span>
                    <button
                      type="button"
                      className="aei-btn aei-btn-warning aei-btn-sm aei-preview-all-regenerate"
                      onClick={() => onRegenerateChapter?.(ch.chapter_name)}
                    >
                      🎲 Regenerate
                    </button>
                  </div>
                  <div className="aei-preview-all-grid">
                    {chapterSelection.map((q, i) => (
                      <div key={q.q_id || i} className="aei-preview-all-item">
                        <div className="aei-preview-all-item-num">Q{i + 1}</div>
                        <QuestionPreviewBlock q={q} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 🟢 SUB-COMPONENT: Manual Selection Overlay (question images only)
// ============================================================
function ManualSelectionOverlay({ chapterName, pool, cfg, currentIndex, setCurrentIndex, onToggle, onClose }) {
  const total = pool.length;
  const clampedIndex = Math.min(currentIndex, Math.max(0, total - 1));
  const current = pool[clampedIndex];
  const selectedCount = cfg?.selectedIds?.length || 0;
  const target = cfg?.targetCount || 0;

  const [zoom, setZoom] = useState(100);
  const zoomIn = () => setZoom((z) => Math.min(220, z + 15));
  const zoomOut = () => setZoom((z) => Math.max(40, z - 15));
  const zoomReset = () => setZoom(100);

  const goPrev = () => setCurrentIndex(Math.max(0, clampedIndex - 1));
  const goNext = () => setCurrentIndex(Math.min(total - 1, clampedIndex + 1));

  return (
    <div className="aei-modal-backdrop">
      <div className="aei-overlay-dialog aei-overlay-dialog-lg">
        <div className="aei-overlay-header">
          <div>
            <div className="aei-overlay-title">Manual Selection — {chapterName}</div>
            <div className="aei-overlay-subtitle">Question preview only · Selected {selectedCount}/{target}</div>
          </div>
          <button type="button" className="aei-close-btn" onClick={onClose}>✕</button>
        </div>

        {total > 0 && (
          <div className="aei-question-palette">
            {pool.map((q, i) => {
              const isSelected = cfg?.selectedIds?.includes(q.q_id);
              return (
                <button
                  key={q.q_id}
                  type="button"
                  title={q.q_id}
                  className={`aei-palette-item ${i === clampedIndex ? "is-current" : ""} ${
                    isSelected ? "is-selected" : ""
                  }`}
                  onClick={() => setCurrentIndex(i)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        )}

        <div className="aei-scroll-single-viewport">
          {total === 0 ? (
            <div className="aei-empty-note">No questions available in this chapter.</div>
          ) : (
            <div className="aei-single-slide" key={current?.q_id}>
              <div className="aei-slide-meta-row">
                <span className="aei-slide-index">Question {clampedIndex + 1} of {total}</span>
                <span className="aei-slide-qid">{current?.q_id}</span>
              </div>
              <div className="aei-slide-image-frame aei-slide-image-frame-zoomable">
                <div style={{ fontSize: `${zoom}%` }}>
                  <QuestionPreviewBlock q={current} />
                </div>
                <div className="aei-zoom-bar">
                  <button type="button" className="aei-zoom-btn" onClick={zoomOut} aria-label="Zoom out">−</button>
                  <span className="aei-zoom-value">{zoom}%</span>
                  <button type="button" className="aei-zoom-btn" onClick={zoomIn} aria-label="Zoom in">+</button>
                  <button type="button" className="aei-zoom-btn aei-zoom-reset" onClick={zoomReset}>Reset</button>
                </div>
              </div>
              <label className="aei-select-checkbox-row">
                <input
                  type="checkbox"
                  checked={cfg?.selectedIds?.includes(current?.q_id) || false}
                  onChange={() => onToggle(current.q_id)}
                />
                Select this question for the test
              </label>
            </div>
          )}
        </div>

        <div className="aei-overlay-nav">
          <button type="button" className="aei-btn aei-btn-ghost" onClick={goPrev} disabled={clampedIndex === 0}>
            ← Prev
          </button>
          <button type="button" className="aei-btn aei-btn-ghost" onClick={goNext} disabled={clampedIndex >= total - 1}>
            Next →
          </button>
          <button type="button" className="aei-btn aei-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 🟢 SUB-COMPONENT: Random Preview Overlay (with regenerate)
// ============================================================
function RandomPreviewOverlay({
  chapterName,
  pool,
  previewIds,
  currentIndex,
  setCurrentIndex,
  onRegenerateAll,
  onRegenerateSingle,
  onClose,
}) {
  const total = previewIds.length;
  const clampedIndex = Math.min(currentIndex, Math.max(0, total - 1));
  const currentId = previewIds[clampedIndex];
  const current = pool.find((q) => q.q_id === currentId);

  const goPrev = () => setCurrentIndex(Math.max(0, clampedIndex - 1));
  const goNext = () => setCurrentIndex(Math.min(total - 1, clampedIndex + 1));

  return (
    <div className="aei-modal-backdrop">
      <div className="aei-overlay-dialog">
        <div className="aei-overlay-header">
          <div>
            <div className="aei-overlay-title">Random Preview — {chapterName}</div>
            <div className="aei-overlay-subtitle">{total} questions selected randomly</div>
          </div>
          <button type="button" className="aei-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="aei-scroll-single-viewport">
          {total === 0 ? (
            <div className="aei-empty-note">No questions selected yet.</div>
          ) : (
            <div className="aei-single-slide" key={current?.q_id}>
              <div className="aei-slide-meta-row">
                <span className="aei-slide-index">Question {clampedIndex + 1} of {total}</span>
                <span className="aei-slide-qid">{current?.q_id}</span>
              </div>
              <div className="aei-slide-image-frame">
                <QuestionPreviewBlock q={current} />
              </div>
              <button
                type="button"
                className="aei-btn aei-btn-ghost aei-regenerate-btn"
                onClick={() => onRegenerateSingle(clampedIndex)}
              >
                🎲 Regenerate this question
              </button>
            </div>
          )}
        </div>

        <div className="aei-overlay-nav">
          <button type="button" className="aei-btn aei-btn-ghost" onClick={goPrev} disabled={clampedIndex === 0}>
            ← Prev
          </button>
          <button type="button" className="aei-btn aei-btn-ghost" onClick={goNext} disabled={clampedIndex >= total - 1}>
            Next →
          </button>
          <button type="button" className="aei-btn aei-btn-warning" onClick={onRegenerateAll}>
            🎲 Regenerate All
          </button>
          <button type="button" className="aei-btn aei-btn-primary" onClick={onClose}>
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
}
