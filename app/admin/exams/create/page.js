// app/admin/exams/create/page.js  (replace the existing file)
//
// Create Exam. Two screens that swap INSIDE this page (the URL never changes):
//   "details" -> name, exam type, stream, chapters, selection mode + question counts
//   "select"  -> the question list (automatic picks or manual selection)
// All state lives here, so going back and forth keeps everything.
//
// DATA RULE: details never fetch question data -- only chapter names + counts
// (/api/admin/exam-summary). Question content only comes from
// /api/admin/exam-questions, a few random / paged questions at a time.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminHref } from "@/components/admin/useAdminHref";
import { EXAMS, STREAMS, DEFAULT_SUBJECT_TOTAL, SUBJECT_ORDER, buildPlan, chapterKey, slimChapters } from "./examConfig";
import DetailsView from "./DetailsView";
import SelectView from "./SelectView";

const NO_CHAPTERS = [];
const EMPTY_STORE = { sig: "", auto: {}, manual: {}, chosen: {} };

export default function CreateExamPage() {
  const href = useAdminHref();
  const [view, setView] = useState("details");

  /* ---- details state ---- */
  const [examName, setExamName] = useState("");
  const [examId, setExamId] = useState("");
  const [stream, setStream] = useState("");
  const [mode, setMode] = useState(""); // "auto" | "manual"
  const [open, setOpen] = useState({}); // subject dropdowns: { Physics: true }
  const [subjects, setSubjects] = useState([]);
  const [classOf, setClassOf] = useState({}); // { Mathematics: "11th" | "12th" | "both" }
  const [picked, setPicked] = useState({}); // { Mathematics: { "1. Trig": true } }
  const [perChapter, setPerChapter] = useState({}); // { key: number }
  const [subjectTotals, setSubjectTotals] = useState({}); // PCM/PCB automatic: { Physics: 50 }

  /* ---- chapter list (names + counts only) ---- */
  const [reloadKey, setReloadKey] = useState(0);
  const [fetched, setFetched] = useState({ key: "", chapters: [], error: "" });
  const fetchKey = examId ? `${examId}|${reloadKey}` : "";
  const loading = !!fetchKey && fetched.key !== fetchKey;
  const chapters = fetched.key === fetchKey ? fetched.chapters : NO_CHAPTERS;
  const error = fetched.key === fetchKey ? fetched.error : "";

  /* ---- question-selection state (kept while you go back to the details) ---- */
  const [store, setStore] = useState(EMPTY_STORE);

  const exam = EXAMS.find((e) => e.id === examId) || null;

  useEffect(() => {
    if (!fetchKey) return;
    let alive = true;
    fetch(`/api/admin/exam-summary?exam=${encodeURIComponent(examId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load chapters.");
        if (alive) setFetched({ key: fetchKey, chapters: slimChapters(data.chapters), error: "" });
      })
      .catch((e) => { if (alive) setFetched({ key: fetchKey, chapters: [], error: e.message || "Failed to load chapters." }); });
    return () => { alive = false; };
  }, [fetchKey, examId]);

  const bySubject = useMemo(() => {
    const map = {};
    chapters.forEach((c) => { (map[c.subject] = map[c.subject] || []).push(c); });
    return map;
  }, [chapters]);

  const visibleFor = useCallback(
    (subj) => {
      const cls = classOf[subj] || "both";
      return (bySubject[subj] || []).filter((c) => cls === "both" || !c.std || c.std === cls);
    },
    [bySubject, classOf]
  );

  /* ---- actions ---- */
  const a = {
    setExamName,
    setMode,
    retry: () => setReloadKey((k) => k + 1),

    chooseExam(id) {
      if (id === examId) return;
      setExamId(id);
      setStream("");
      setOpen({});
      setSubjects([]);
      setClassOf({});
      setPicked({});
      setPerChapter({});
    },
    chooseStream(id) {
      if (id === stream) return;
      setStream(id);
      setOpen({});
      setSubjects([]);
      setClassOf({});
      setPicked({});
      setPerChapter({});
    },
    toggleOpen: (subj) => setOpen((p) => ({ ...p, [subj]: !p[subj] })),

    toggleSubject(subj) {
      setSubjects((prev) => {
        const next = prev.includes(subj) ? prev.filter((x) => x !== subj) : [...prev, subj];
        return next.sort((x, y) => SUBJECT_ORDER.indexOf(x) - SUBJECT_ORDER.indexOf(y));
      });
      setPicked((prev) => {
        if (!prev[subj]) return prev;
        const { [subj]: _drop, ...rest } = prev;
        return rest;
      });
    },
    setClass(subj, cls) {
      setClassOf((prev) => ({ ...prev, [subj]: cls }));
      setPicked((prev) => {
        const cur = prev[subj];
        if (!cur) return prev;
        const keep = {};
        (bySubject[subj] || []).forEach((c) => {
          if (cur[c.name] && (cls === "both" || !c.std || c.std === cls)) keep[c.name] = true;
        });
        return { ...prev, [subj]: keep };
      });
    },
    toggleChapter(subj, name) {
      setPicked((prev) => {
        const cur = { ...(prev[subj] || {}) };
        if (cur[name]) delete cur[name]; else cur[name] = true;
        return { ...prev, [subj]: cur };
      });
    },
    selectAll(subj) {
      const all = {};
      visibleFor(subj).forEach((c) => { all[c.name] = true; });
      setPicked((prev) => ({ ...prev, [subj]: all }));
    },
    clearAll: (subj) => setPicked((prev) => ({ ...prev, [subj]: {} })),

    setChapterCount(subj, c, v) {
      const n = Math.max(0, Math.min(c.count, parseInt(v, 10) || 0));
      setPerChapter((prev) => ({ ...prev, [chapterKey(subj, c.name)]: n }));
    },
    setSubjectTotal(subj, max, v) {
      const n = Math.max(0, Math.min(max, parseInt(v, 10) || 0));
      setSubjectTotals((prev) => ({ ...prev, [subj]: n }));
    },
  };

  /* ---- the plan: how many questions from which chapter ---- */
  const plan = useMemo(
    () => buildPlan({ stream, mode, bySubject, subjects, picked, perChapter, subjectTotals }),
    [stream, mode, bySubject, subjects, picked, perChapter, subjectTotals]
  );
  const totalQuestions = plan.reduce((t, i) => t + i.count, 0);

  // chapters ticked in subject-wise mode that still have 0 questions (they get skipped)
  const skipped = useMemo(() => {
    if (stream !== "SUBJECT") return 0;
    let n = 0;
    subjects.forEach((subj) => {
      (bySubject[subj] || []).forEach((c) => {
        if (picked[subj]?.[c.name] && !(perChapter[chapterKey(subj, c.name)] > 0)) n += 1;
      });
    });
    return n;
  }, [stream, subjects, bySubject, picked, perChapter]);

  let problem = "";
  if (!examName.trim()) problem = "Enter the exam name.";
  else if (!examId) problem = "Choose an exam type.";
  else if (!stream) problem = "Choose a stream.";
  else if (loading) problem = "Loading chapters\u2026";
  else if (error) problem = "Chapters could not be loaded.";
  else if (stream === "SUBJECT" && subjects.length === 0) problem = "Choose at least one subject.";
  else if (!mode) problem = "Choose automatic or manual question selection.";
  else if (totalQuestions === 0) problem = "Enter the number of questions.";

  function goSelect() {
    if (problem) return;
    const sig = `${examId}|${mode}`;
    setStore((prev) => (prev.sig === sig ? prev : { ...EMPTY_STORE, sig }));
    setView("select");
    window.scrollTo({ top: 0 });
  }

  function goDetails() {
    setView("details");
    window.scrollTo({ top: 0 });
  }

  if (view === "select") {
    return (
      <SelectView
        examId={examId}
        examName={examName.trim()}
        mode={mode}
        plan={plan}
        store={store}
        setStore={setStore}
        onBack={goDetails}
      />
    );
  }

  const f = {
    href, examName, exam, examId, stream, mode, open, subjects, classOf, picked, perChapter, subjectTotals,
    chapters, bySubject, loading, error, plan, totalQuestions, skipped, problem, visibleFor,
    DEFAULT_SUBJECT_TOTAL, STREAMS,
  };
  return <DetailsView f={f} a={a} onContinue={goSelect} />;
}
