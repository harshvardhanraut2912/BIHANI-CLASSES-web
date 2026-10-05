// app/admin/exams/PreviewView.js  (new file)
//
// Preview of a saved exam. Looks exactly like the Select Questions screen:
// one flat, sequentially numbered (1, 2, 3...) question table, no chapter grouping. Every question has a
// regenerate icon that swaps ONLY that question (one small request, same server
// action the create screen uses). Replaced questions are marked NEW; nothing is
// written until "Save changes", which sends only the replaced questions.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./exams.module.css";
import QuestionTable from "./create/QuestionTable";
import { fmt } from "./create/examConfig";

async function request(url, method, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function PreviewView({ examId, title, onBack }) {
  const [state, setState] = useState({ status: "loading", error: "" });
  const [meta, setMeta] = useState(null); // { exam, name, chapters }
  const [base, setBase] = useState([]); // saved questions (manifest order)
  const [questions, setQuestions] = useState([]); // current (with replacements), same order
  const [busyIds, setBusyIds] = useState({});
  const [regenErr, setRegenErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState({ type: "", text: "" });
  const discarded = useRef({}); // chapter_id -> Set of q_ids already tried (never offered again)
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", error: "" });
    fetch(`/api/admin/exam-papers?id=${encodeURIComponent(examId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load the exam.");
        if (!alive) return;
        const list = Array.isArray(data.questions) ? data.questions : [];
        setMeta({ exam: data.exam, name: data.name, chapters: data.chapters || {} });
        setBase(list);
        setQuestions(list);
        discarded.current = {};
        setState({ status: "ready", error: "" });
      })
      .catch((e) => { if (alive) setState({ status: "error", error: e.message || "Failed to load the exam." }); });
    return () => { alive = false; };
  }, [examId, reloadKey]);

  const changedIds = useMemo(() => {
    const out = {};
    questions.forEach((q, i) => { if (q.q_id !== base[i]?.q_id) out[q.q_id] = true; });
    return out;
  }, [questions, base]);
  const changedCount = Object.keys(changedIds).length;

  const regenerate = useCallback(
    async (q) => {
      const oldId = q.q_id;
      const info = meta?.chapters?.[q.chapter_id] || {};
      const sec = {
        chapterId: q.chapter_id || "",
        subject: q.q_section || info.subject || "Other",
        name: info.name || q.chapter_id || "Chapter",
      };
      setSaveMsg({ type: "", text: "" });
      setRegenErr("");
      setBusyIds((p) => ({ ...p, [oldId]: true }));
      try {
        const tried = (discarded.current[sec.chapterId] = discarded.current[sec.chapterId] || new Set());
        const exclude = [...new Set([...questions.filter((x) => x.chapter_id === sec.chapterId).map((x) => x.q_id), ...tried])];
        const data = await request("/api/admin/exam-questions", "POST", {
          action: "replace",
          exam: meta.exam,
          subject: sec.subject,
          chapter: sec.name,
          chapter_id: sec.chapterId || undefined,
          exclude,
        });
        if (!data.question) throw new Error("No question returned.");
        tried.add(oldId);
        setQuestions((prev) =>
          prev.map((x) =>
            x.q_id === oldId
              ? { ...data.question, q_num: x.q_num, test_q_num: x.test_q_num, sub_id: x.sub_id, q_section: x.q_section }
              : x
          )
        );
      } catch (e) {
        setRegenErr(e.message || "Could not regenerate the question.");
      } finally {
        setBusyIds((p) => { const { [oldId]: _d, ...rest } = p; return rest; });
      }
    },
    [questions, meta]
  );

  const discard = () => {
    if (!changedCount) return;
    setQuestions(base);
    discarded.current = {};
    setRegenErr("");
    setSaveMsg({ type: "", text: "" });
  };

  const save = async () => {
    setSaving(true);
    setSaveMsg({ type: "", text: "" });
    try {
      // only the replaced questions are sent (old id -> new question)
      const replacements = [];
      questions.forEach((q, i) => {
        if (q.q_id === base[i].q_id) return;
        replacements.push({
          old_q_id: base[i].q_id,
          question: {
            q_id: q.q_id,
            chapter_id: q.chapter_id,
            question_type: q.question_type,
            ques_type: q.ques_type,
            section: q.section,
            source_id: q.source_id,
            exam_history: q.exam_history,
            options: q.options,
            answer_key: q.answer_key ?? q.correct_option ?? q.correct_answer ?? q.answer,
            question_html: q.question_html,
            solution_html: q.solution_html,
          },
        });
      });
      await request("/api/admin/exam-papers", "PATCH", { id: examId, replacements });
      setBase(questions);
      discarded.current = {};
      setSaveMsg({ type: "ok", text: `Saved. ${replacements.length} question${replacements.length === 1 ? "" : "s"} replaced in the exam.` });
    } catch (e) {
      setSaveMsg({ type: "err", text: e.message || "Failed to save changes." });
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (changedCount && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    onBack();
  };

  const busy = Object.keys(busyIds).length > 0;

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Preview Exam</h1>
          <p className={s.subtitle}>
            {meta?.name || title}
            {meta?.exam ? ` \u00b7 ${meta.exam}` : ""}
            {state.status === "ready" ? ` \u00b7 ${fmt(questions.length)} questions` : ""}
          </p>
        </div>
        <div className={s.headBtns}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={back}>&larr; Back to exams</button>
          {changedCount > 0 && (
            <>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={saving || busy} onClick={discard}>Discard changes</button>
              <button type="button" className={s.btn} disabled={saving || busy} onClick={save}>
                {saving ? "Saving\u2026" : `Save changes (${changedCount})`}
              </button>
            </>
          )}
        </div>
      </div>

      {saveMsg.text && <p className={saveMsg.type === "ok" ? s.okMsg : s.err}>{saveMsg.text}</p>}

      {state.status === "loading" && <div className={s.empty}>Loading exam&hellip;</div>}
      {state.status === "error" && (
        <p className={s.err}>
          {state.error}
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </p>
      )}

      {state.status === "ready" && (
        <>
          <div className={s.progressBar}>
            <div className={s.progressText}>
              <strong>{fmt(questions.length)}</strong> questions in this exam
              {changedCount > 0 && <span className={s.changedTag}>{changedCount} replaced &middot; not saved yet</span>}
            </div>
          </div>

          {regenErr && <p className={`${s.err} ${s.errPad}`}>{regenErr}</p>}
          <QuestionTable
            questions={questions}
            selectable={false}
            sequential
            busyIds={busyIds}
            changedIds={changedIds}
            onRegenerate={regenerate}
          />
        </>
      )}
    </>
  );
}
