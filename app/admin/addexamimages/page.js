"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import "./addexamimages.css";

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
function subjectRank(subject) {
  const idx = SUBJECT_ORDER.indexOf(subject);
  return idx === -1 ? SUBJECT_ORDER.length : idx;
}

// Decides whether a chapter is excluded for the current Stream/Class picks —
// PCM zeroes out Biology, PCB zeroes out Mathematics, and picking a single
// class zeroes out chapters belonging to the other class.
// Round-robins across a subject's per-chapter question lists so that,
// wherever more than one chapter has questions left, two chapters never end
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

function isChapterExcluded(ch, streamType, classFilter) {
  if (streamType === "PCM" && ch.subject === "Biology") return true;
  if (streamType === "PCB" && ch.subject === "Mathematics") return true;
  if (classFilter === "12th" && ch.std === "11th") return true;
  if (classFilter === "11th" && ch.std === "12th") return true;
  return false;
}

// Pulls the trailing number out of a name like "MOCK_TEST_08" or "mock_test_08" -> 8
function extractTrailingNumber(str) {
  const match = (str || "").match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : null;
}

export default function AddExamImagesPage() {
  // ==========================================
  // 🟢 TOP-LEVEL VIEW ROUTING
  // ==========================================
  const [view, setView] = useState("list"); // 'list' | 'setup'

  // ==========================================
  // 🟢 LIST VIEW: existing exam_question_data rows
  // ==========================================
  const [existingMocks, setExistingMocks] = useState([]);
  const [loadingMocks, setLoadingMocks] = useState(false);

  const fetchExistingMocks = useCallback(async () => {
    setLoadingMocks(true);
    try {
      const { data, error } = await supabase
        .from("exam_question_data")
        .select("id, exam, mock_test_name, github_folder_name, questions_manifest, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setExistingMocks(data || []);
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
  // 🟢 SETUP VIEW: Phase 1 — exam/name/folder
  // ==========================================
  const [exam, setExam] = useState("MHT-CET");
  const [streamType, setStreamType] = useState("PCM"); // 'PCM' | 'PCB'
  const [classFilter, setClassFilter] = useState("both"); // '11th' | '12th' | 'both'
  const [mockTestName, setMockTestName] = useState("");
  const [githubFolderName, setGithubFolderName] = useState("");
  const [imageNamePrefix, setImageNamePrefix] = useState(""); // e.g. "test6"
  const [setupStage, setSetupStage] = useState("naming"); // 'naming' | 'assembler'

  // Track the last values we auto-suggested so we don't clobber a manual edit
  const lastAutoFolder = useRef("");
  const lastAutoPrefix = useRef("");

  // Autosuggest GitHub folder name + image naming prefix from the mock test name
  useEffect(() => {
    const trimmed = mockTestName.trim();
    if (!trimmed) return;

    const suggestedFolder = trimmed.toLowerCase().replace(/\s+/g, "_");
    const num = extractTrailingNumber(trimmed);
    const suggestedPrefix = num !== null ? `test${num}` : "";

    // Compare against the *currently committed* state (closed over from the
    // last render) before touching the refs — mutating the refs first was
    // causing the functional setState updaters below to compare against the
    // already-updated ref, so the auto-suggestion would freeze after the
    // very first keystroke.
    if (githubFolderName === "" || githubFolderName === lastAutoFolder.current) {
      setGithubFolderName(suggestedFolder);
    }
    lastAutoFolder.current = suggestedFolder;

    if (imageNamePrefix === "" || imageNamePrefix === lastAutoPrefix.current) {
      setImageNamePrefix(suggestedPrefix);
    }
    lastAutoPrefix.current = suggestedPrefix;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockTestName]);

  const resetSetupState = () => {
    setExam("MHT-CET");
    setStreamType("PCM");
    setClassFilter("both");
    setMockTestName("");
    setGithubFolderName("");
    setImageNamePrefix("");
    lastAutoFolder.current = "";
    lastAutoPrefix.current = "";
    setSetupStage("naming");
    setChapters([]);
    setPool({});
    setChapterConfig({});
    setWeightMode("fixed");
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

  // pool[chapterName] = array of merged question objects (Theory + Numerical)
  const [pool, setPool] = useState({});
  const [loadingPool, setLoadingPool] = useState(false);

  // chapterConfig[chapterName] = { targetCount, mode: 'random'|'manual', selectedIds: [], previewIds: [] }
  const [chapterConfig, setChapterConfig] = useState({});

  const fetchChaptersAndPool = useCallback(async () => {
    setLoadingChapters(true);
    setLoadingPool(true);
    try {
      const [chaptersRes, bundlesRes] = await Promise.all([
        supabase
          .from("syllabus_chapters")
          .select("id, exam, subject, std, chapter_name, default_weight")
          .eq("exam", exam)
          .order("subject", { ascending: true })
          .order("std", { ascending: true })
          .order("chapter_name", { ascending: true }),
        supabase
          .from("question_bundles")
          .select("chapter, subject, question_type, questions")
          .eq("exam", exam),
      ]);

      if (chaptersRes.error) throw chaptersRes.error;
      if (bundlesRes.error) throw bundlesRes.error;

      setChapters(chaptersRes.data || []);

      const poolMap = {};
      (bundlesRes.data || []).forEach((row) => {
        const list = Array.isArray(row.questions) ? row.questions : [];
        if (!poolMap[row.chapter]) poolMap[row.chapter] = [];
        list.forEach((q) => {
          poolMap[row.chapter].push({
            ...q,
            subject: row.subject,
            chapter: row.chapter,
            question_type: row.question_type,
          });
        });
      });
      setPool(poolMap);

      // seed chapterConfig
      const seededConfig = {};
      (chaptersRes.data || []).forEach((ch) => {
        seededConfig[ch.chapter_name] = {
          targetCount: 0,
          mode: "random",
          selectedIds: [],
          previewIds: [],
        };
      });
      setChapterConfig(seededConfig);
    } catch (err) {
      console.error("Failed to load chapters/pool:", err);
      alert(`Could not load syllabus/question data: ${err.message}`);
    } finally {
      setLoadingChapters(false);
      setLoadingPool(false);
    }
  }, [exam]);

  const proceedToAssembler = () => {
    if (!mockTestName.trim() || !githubFolderName.trim() || !imageNamePrefix.trim()) {
      alert("Please enter a mock test name, a GitHub target folder name, and an image naming prefix.");
      return;
    }
    setSetupStage("assembler");
    fetchChaptersAndPool();
  };

  // Apply fixed default_weight to all chapters (used when toggling to Fixed)
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
  // 🟢 UPLOAD PIPELINE: GitHub Tree Push + Supabase Ledger
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
            chapter: ch.chapter_name,
            q_id: q.q_id,
            answer_key: q.answer_key,
            question_img_url: q.question_img_url,
            solution_img_url: q.solution_img_url || null,
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

    // The "testN" prefix must always match the number in the folder name — if the
    // user's imageNamePrefix has drifted from it, silently correct it before pushing.
    const folderNum = extractTrailingNumber(githubFolderName);
    let effectivePrefix = imageNamePrefix.trim();
    if (folderNum !== null) {
      const expectedPrefix = `test${folderNum}`;
      if (effectivePrefix !== expectedPrefix) {
        console.warn(
          `Image naming prefix "${effectivePrefix}" didn't match folder number ${folderNum}; auto-corrected to "${expectedPrefix}".`
        );
        effectivePrefix = expectedPrefix;
      }
    }

    // Assign per-subject running index (k), overall test_q_num, sub_id, abbrev,
    // and the GitHub blob filenames / raw URLs the server route needs to push images.
    const bySubjectCounter = {};
    let testQNum = 0;
    return items.map((it) => {
      testQNum += 1;
      const meta = getSubjectMeta(it.subject);
      bySubjectCounter[meta.abbrev] = (bySubjectCounter[meta.abbrev] || 0) + 1;

      const qGitName = `${effectivePrefix}_${meta.abbrev}_q${testQNum}.png`;
      const sGitName = `${effectivePrefix}_${meta.abbrev}_s${testQNum}.png`;

      return {
        ...it,
        test_q_num: testQNum,
        sub_id: meta.subId,
        abbrev: meta.abbrev,
        k: bySubjectCounter[meta.abbrev],
        test_q_git_name: qGitName,
        solution_git_name: sGitName,
        github_que_raw_url: `https://raw.githubusercontent.com/harshvardhanraut2912/mht-cet-images/main/tests/${githubFolderName}/${qGitName}`,
        github_sol_raw_url: it.solution_img_url
          ? `https://raw.githubusercontent.com/harshvardhanraut2912/mht-cet-images/main/solutions/${githubFolderName}/${sGitName}`
          : null,
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
    setUploadStageLabel("Aggregating assets from Supabase...");
    try {
      setTimeout(() => setUploadStageLabel("Generating GitHub tree blobs..."), 600);
      setTimeout(() => setUploadStageLabel("Pushing dual-path commit to GitHub..."), 1800);

      // Server route pushes the GitHub blob/tree/commit AND inserts the
      // exam_question_data row itself using the service-role key — the client
      // never touches that table directly, so RLS/grant errors can't happen here.
      const res = await fetch("/api/deploy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam,
          mockName: mockTestName,
          folderName: githubFolderName,
          manifest,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "GitHub deployment failed");

      setUploadSuccessInfo({
        mockTestName,
        githubFolderName,
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
            <span className="aei-title-sub">Mock test assembler &amp; GitHub sync ledger</span>
          </div>
        </div>

        <div className="aei-canvas">
          <div className="aei-grid-cards">
            <button type="button" className="aei-create-card" onClick={startNewMock}>
              <span className="aei-create-plus">+</span>
              <span className="aei-create-label">Create Exam Image Folder</span>
              <span className="aei-create-hint">Assemble a new mock test and deploy it to GitHub</span>
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
                  <div className="aei-mock-folder">📁 {mock.github_folder_name}</div>
                  <div className="aei-mock-footer">
                    <span className="aei-badge aei-badge-success">
                      {Array.isArray(mock.questions_manifest) ? mock.questions_manifest.length : 0} questions
                    </span>
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
            </select>
            <span className="aei-field-hint">
              {streamType === "PCM"
                ? "Biology chapters will be excluded (auto-set to 0)."
                : "Mathematics chapters will be excluded (auto-set to 0)."}
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

            <label className="aei-field-label">GitHub Target Folder Name</label>
            <input
              type="text"
              className="aei-input aei-input-mono"
              placeholder="e.g. mock_test_01"
              value={githubFolderName}
              onChange={(e) => setGithubFolderName(e.target.value.trim().replace(/\s+/g, "_"))}
            />
            <span className="aei-field-hint">
              Files will be pushed to <code>tests/{githubFolderName || "…"}</code> and{" "}
              <code>solutions/{githubFolderName || "…"}</code>
            </span>

            <label className="aei-field-label">Image Naming Prefix</label>
            <input
              type="text"
              className="aei-input aei-input-mono"
              placeholder="e.g. test6"
              value={imageNamePrefix}
              onChange={(e) => setImageNamePrefix(e.target.value.trim().replace(/\s+/g, "_"))}
            />
            <span className="aei-field-hint">
              Image files will be named like <code>{imageNamePrefix || "test6"}_phy_q2.png</code> and{" "}
              <code>{imageNamePrefix || "test6"}_phy_s2.png</code>. The number here must match the number in the
              folder name above — it's auto-corrected before upload if they drift apart.
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
          <span className="aei-title-sub">{exam} · 📁 {githubFolderName}</span>
        </div>
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
              onClick={() => setWeightMode("manual")}
            >
              Manual
            </button>
          </div>
        </div>
      </div>

      <div className="aei-info-banner">
        💡 Enter (or load) the number of questions per chapter, choose Random or Manual per row, then preview/select
        before uploading. The upload button unlocks once every target count is fully matched.
      </div>

      <div className="aei-canvas aei-canvas-table">
        {loadingChapters || loadingPool ? (
          <div className="aei-empty-note">Loading syllabus chapters and question inventory...</div>
        ) : chapters.length === 0 ? (
          <div className="aei-empty-note">No syllabus chapters found for {exam}.</div>
        ) : chapters.filter((ch) => !isChapterExcluded(ch, streamType, classFilter)).length === 0 ? (
          <div className="aei-empty-note">
            No chapters match the selected Stream/Class combination.
          </div>
        ) : (
          <div className="aei-table-wrapper">
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
                {chapters
                  .filter((ch) => !isChapterExcluded(ch, streamType, classFilter))
                  .map((ch) => {
                  const cfg = chapterConfig[ch.chapter_name] || { targetCount: 0, mode: "random", selectedIds: [], previewIds: [] };
                  const chapterPool = pool[ch.chapter_name] || [];
                  const available = chapterPool.length;
                  const selectedCount = cfg.mode === "manual" ? cfg.selectedIds.length : cfg.previewIds.length;
                  const overAvailable = cfg.targetCount > available;
                  const satisfied = cfg.targetCount > 0 && selectedCount === cfg.targetCount;

                  return (
                    <tr key={ch.id} className={overAvailable ? "aei-row-warning" : ""}>
                      <td className="aei-col-chapter">
                        <div className="aei-chapter-name-cell">
                          <span className="aei-chapter-std">{ch.std}</span>
                          <span>{ch.chapter_name}</span>
                          <span className="aei-badge aei-badge-muted">{ch.subject}</span>
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
                            disabled={!cfg.targetCount}
                          >
                            👁 Preview
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="aei-btn aei-btn-ghost"
                            onClick={() => openManualGrid(ch.chapter_name)}
                            disabled={available === 0}
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
            <div className="aei-success-title">Images uploaded to GitHub and listed in Supabase successfully</div>
            <div className="aei-success-detail">
              {uploadSuccessInfo.count} questions deployed to <code>{uploadSuccessInfo.githubFolderName}</code>
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
            <div className="aei-overlay-subtitle">Question images only · Selected {selectedCount}/{target}</div>
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
                <img
                  src={current?.question_img_url}
                  alt="Question"
                  className="aei-slide-image"
                  style={{ width: `${zoom}%`, maxWidth: "none" }}
                />
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
                <img src={current?.question_img_url} alt="Question" className="aei-slide-image" />
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