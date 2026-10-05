// app/admin/exams/create/SelectView.js  (new file)
//
// The question list that replaces the details screen (same page, same URL).
//   automatic -> random questions for every chapter, picked on the server.
//                Regenerate per chapter or for everything.
//   manual    -> open a chapter to browse its questions (30 at a time, "Load
//                more") and tick exactly as many as you asked for.
// Only the questions on screen are ever downloaded -- never a whole chapter.
"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import s from "../exams.module.css";
import QuestionTable from "./QuestionTable";
import { fmt } from "./examConfig";
import { SubjectBar, toneOf } from "./ui";

const PAGE = 30;

const API = "/api/admin/exam-questions";

async function post(body) {
  const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to load questions.");
  return data;
}

export default function SelectView({ examId, examName, mode, plan, store, setStore, onBack, onSaved }) {
  const isAuto = mode === "auto";
  const storeRef = useRef(store);
  storeRef.current = store;

  const [open, setOpen] = useState(() => {
    if (isAuto) return Object.fromEntries(plan.map((p) => [p.key, true]));
    return plan[0] ? { [plan[0].key]: true } : {};
  });

  /* ================= automatic ================= */
  const fetchRandom = useCallback(
    async (items, withExclude = false) => {
      setStore((prev) => {
        const auto = { ...prev.auto };
        items.forEach((it) => { auto[it.key] = { status: "loading", count: it.count, questions: prev.auto[it.key]?.questions || [] }; });
        return { ...prev, auto };
      });
      try {
        const data = await post({
          action: "random",
          exam: examId,
          items: items.map((it) => ({
            key: it.key,
            subject: it.subject,
            chapter: it.name,
            chapter_id: it.chapterId || undefined,
            count: it.count,
            exclude: withExclude ? (storeRef.current.auto[it.key]?.questions || []).map((q) => q.q_id) : undefined,
          })),
        });
        const byKey = Object.fromEntries((data.results || []).map((r) => [r.key, r]));
        setStore((prev) => {
          const auto = { ...prev.auto };
          items.forEach((it) => {
            const r = byKey[it.key];
            auto[it.key] = r && !r.error
              ? { status: "ready", count: it.count, questions: r.questions || [] }
              : { status: "error", count: it.count, questions: prev.auto[it.key]?.questions || [], error: r?.error || "No response." };
          });
          return { ...prev, auto };
        });
      } catch (e) {
        setStore((prev) => {
          const auto = { ...prev.auto };
          items.forEach((it) => { auto[it.key] = { status: "error", count: it.count, questions: prev.auto[it.key]?.questions || [], error: e.message }; });
          return { ...prev, auto };
        });
      }
    },
    [examId, setStore]
  );

  // pick random questions for every chapter that has none yet (or whose count changed)
  useEffect(() => {
    if (!isAuto) return;
    const need = plan.filter((it) => {
      const cur = store.auto[it.key];
      return !cur || cur.count !== it.count;
    });
    if (need.length) fetchRandom(need);
  }, [isAuto, plan, store.auto, fetchRandom]);

  // Per-question regenerate: ask the server for ONE new question and swap it in place.
  const [busyIds, setBusyIds] = useState({}); // { q_id: true }
  const [regenErr, setRegenErr] = useState({}); // { chapterKey: "message" }

  const regenerateOne = useCallback(
    async (it, q) => {
      const oldId = q.q_id;
      setRegenErr((p) => ({ ...p, [it.key]: "" }));
      setBusyIds((p) => ({ ...p, [oldId]: true }));
      try {
        const current = (storeRef.current.auto[it.key]?.questions || []).map((x) => x.q_id);
        const data = await post({
          action: "replace",
          exam: examId,
          subject: it.subject,
          chapter: it.name,
          chapter_id: it.chapterId || undefined,
          exclude: current,
        });
        if (!data.question) throw new Error("No question returned.");
        setStore((prev) => {
          const cur = prev.auto[it.key];
          if (!cur) return prev;
          const list = cur.questions.map((x) => (x.q_id === oldId ? data.question : x));
          return { ...prev, auto: { ...prev.auto, [it.key]: { ...cur, questions: list } } };
        });
      } catch (e) {
        setRegenErr((p) => ({ ...p, [it.key]: e.message || "Could not regenerate the question." }));
      } finally {
        setBusyIds((p) => {
          const { [oldId]: _done, ...rest } = p;
          return rest;
        });
      }
    },
    [examId, setStore]
  );

  /* ================= manual ================= */
  const loadManual = useCallback(
    async (it) => {
      const cur = storeRef.current.manual[it.key];
      if (cur?.status === "loading") return;
      const offset = cur?.questions?.length || 0;
      setStore((prev) => ({ ...prev, manual: { ...prev.manual, [it.key]: { ...(prev.manual[it.key] || { questions: [], total: null }), status: "loading" } } }));
      try {
        const data = await post({ action: "page", exam: examId, subject: it.subject, chapter: it.name, chapter_id: it.chapterId || undefined, offset, limit: PAGE });
        setStore((prev) => {
          const old = prev.manual[it.key]?.questions || [];
          const seen = new Set(old.map((q) => q.q_id));
          const merged = old.concat((data.questions || []).filter((q) => !seen.has(q.q_id)));
          return { ...prev, manual: { ...prev.manual, [it.key]: { status: "ready", total: data.total, questions: merged } } };
        });
      } catch (e) {
        setStore((prev) => ({ ...prev, manual: { ...prev.manual, [it.key]: { ...(prev.manual[it.key] || { questions: [], total: null }), status: "error", error: e.message } } }));
      }
    },
    [examId, setStore]
  );

  // open the first chapter straight away
  useEffect(() => {
    if (!isAuto && plan[0] && !storeRef.current.manual[plan[0].key]) loadManual(plan[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSection = (it) => {
    const willOpen = !open[it.key];
    setOpen((p) => ({ ...p, [it.key]: willOpen }));
    if (willOpen && !isAuto && !store.manual[it.key]) loadManual(it);
  };

  const chosenOf = (it) => (store.chosen[it.key] || []).slice(0, it.count);

  const toggleQuestion = (it, id) => {
    setStore((prev) => {
      const cur = (prev.chosen[it.key] || []).slice(0, it.count);
      let next;
      if (cur.includes(id)) next = cur.filter((x) => x !== id);
      else if (cur.length < it.count) next = [...cur, id];
      else next = cur;
      return { ...prev, chosen: { ...prev.chosen, [it.key]: next } };
    });
  };

  const clearChapter = (it) => setStore((prev) => ({ ...prev, chosen: { ...prev.chosen, [it.key]: [] } }));

  /* ================= save the exam ================= */
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Only the fields the stored manifests need (keeps the request small).
  const slim = (q) => ({
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
  });

  const saveExam = async () => {
    setSaving(true);
    setSaveErr("");
    try {
      const groups = plan.map((it) => {
        let list;
        if (isAuto) list = (store.auto[it.key]?.questions || []).slice(0, it.count);
        else {
          const byId = new Map((store.manual[it.key]?.questions || []).map((q) => [q.q_id, q]));
          list = chosenOf(it).map((id) => byId.get(id)).filter(Boolean);
        }
        return { subject: it.subject, chapter: it.name, chapter_id: it.chapterId || undefined, questions: list.map(slim) };
      });
      const res = await fetch("/api/admin/exam-papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: examName, exam: examId, groups }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save the exam.");
      onSaved?.(data);
    } catch (e) {
      setSaveErr(e.message || "Failed to save the exam.");
      setSaving(false);
    }
  };

  /* ================= progress ================= */
  const needTotal = plan.reduce((t, it) => t + it.count, 0);
  const haveTotal = isAuto
    ? plan.reduce((t, it) => t + Math.min(it.count, store.auto[it.key]?.questions?.length || 0), 0)
    : plan.reduce((t, it) => t + chosenOf(it).length, 0);
  const anyLoading = isAuto && plan.some((it) => store.auto[it.key]?.status === "loading");
  const complete = needTotal > 0 && haveTotal === needTotal;
  const canSave = complete && !anyLoading && !saving;

  const expandAll = (v) => {
    setOpen(Object.fromEntries(plan.map((it) => [it.key, v])));
    if (v && !isAuto) plan.forEach((it) => { if (!storeRef.current.manual[it.key]) loadManual(it); });
  };

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>{isAuto ? "Review Questions" : "Select Questions"}</h1>
          <p className={s.subtitle}>
            {examName ? `${examName} \u00b7 ` : ""}{isAuto ? "Automatic selection" : "Manual selection"} &middot; {fmt(needTotal)} questions from {plan.length} chapter{plan.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className={s.headBtns}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onBack}>&larr; Back to details</button>
          {isAuto && (
            <button type="button" className={s.btn} disabled={anyLoading} onClick={() => fetchRandom(plan, true)}>
              {anyLoading ? "Working\u2026" : "Regenerate all"}
            </button>
          )}
        </div>
      </div>

      <div className={s.progressBar}>
        <div className={s.progressText}>
          <strong>{haveTotal}</strong> of <strong>{needTotal}</strong> questions {isAuto ? "ready" : "selected"}
          {complete && <span className={s.doneTag}>{isAuto ? "All questions ready" : "Selection complete"}</span>}
        </div>
        <div className={s.progressTools}>
          <button type="button" className={s.linkBtn} onClick={() => expandAll(true)}>Expand all chapters</button>
          <span className={s.sep} />
          <button type="button" className={s.linkBtn} onClick={() => expandAll(false)}>Collapse all</button>
        </div>
      </div>

      <div className={s.sections}>
        {plan.map((it, idx) => {
          const tone = toneOf(it.subject);
          const firstOfSubject = idx === 0 || plan[idx - 1].subject !== it.subject;
          const group = plan.filter((p) => p.subject === it.subject);
          const groupNeed = group.reduce((n, p) => n + p.count, 0);
          const groupHave = group.reduce(
            (n, p) => n + (isAuto ? Math.min(p.count, store.auto[p.key]?.questions?.length || 0) : chosenOf(p).length),
            0
          );
          const isOpen = !!open[it.key];
          const auto = store.auto[it.key];
          const man = store.manual[it.key];
          const chosen = chosenOf(it);
          const done = isAuto ? (auto?.questions?.length || 0) >= Math.min(it.count, it.available) && auto?.status === "ready" : chosen.length === it.count;

          return (
            <Fragment key={it.key}>
            {firstOfSubject && <SubjectBar subject={it.subject} chapters={group.length} have={groupHave} need={groupNeed} first={idx === 0} />}
            <section className={s.acc} style={{ borderLeft: `4px solid ${tone.dark}` }}>
              <div className={s.secHead} style={{ background: tone.tint }}>
                <button type="button" className={s.secToggle} aria-expanded={isOpen} onClick={() => toggleSection(it)}>
                  <span className={s.chev}>{isOpen ? "\u25BE" : "\u25B8"}</span>
                  <span className={s.accName}>{it.name}</span>
                  <span className={s.chStd}>{it.subject}</span>
                  {it.std && <span className={s.chStd}>{it.std}</span>}
                </button>
                <span className={`${s.badge} ${done ? s.badgeDone : ""}`}>
                  {isAuto ? `${auto?.questions?.length || 0} / ${it.count}` : `${chosen.length} / ${it.count} selected`}
                </span>
                {isAuto && (
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={auto?.status === "loading"} onClick={() => fetchRandom([it], true)}>
                    Regenerate
                  </button>
                )}
                {!isAuto && chosen.length > 0 && (
                  <button type="button" className={s.linkBtn} onClick={() => clearChapter(it)}>Clear</button>
                )}
              </div>

              {isOpen && (
                <div className={s.accBody}>
                  {isAuto ? (
                    !auto || (auto.status === "loading" && !auto.questions.length) ? (
                      <div className={s.note}>Picking random questions&hellip;</div>
                    ) : auto.status === "error" && !auto.questions.length ? (
                      <p className={`${s.err} ${s.errPad}`}>
                        {auto.error}
                        <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => fetchRandom([it])}>Retry</button>
                      </p>
                    ) : (
                      <>
                        {auto.questions.length < it.count && <p className={s.warn}>Only {auto.questions.length} question{auto.questions.length === 1 ? "" : "s"} could be picked for this chapter.</p>}
                        {regenErr[it.key] && <p className={`${s.err} ${s.errPad}`}>{regenErr[it.key]}</p>}
                        <QuestionTable
                          questions={auto.questions}
                          selectable={false}
                          busyIds={busyIds}
                          onRegenerate={(q) => regenerateOne(it, q)}
                        />
                      </>
                    )
                  ) : !man || (man.status === "loading" && !man.questions.length) ? (
                    <div className={s.note}>Loading questions&hellip;</div>
                  ) : man.status === "error" && !man.questions.length ? (
                    <p className={`${s.err} ${s.errPad}`}>
                      {man.error}
                      <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => loadManual(it)}>Retry</button>
                    </p>
                  ) : (
                    <>
                      {chosen.length >= it.count && <p className={s.warn}>You have selected all {it.count} questions for this chapter. Untick one to pick a different question.</p>}
                      <QuestionTable questions={man.questions} selectable chosen={chosen} canPickMore={chosen.length < it.count} onToggle={(id) => toggleQuestion(it, id)} />
                      <div className={s.moreBar}>
                        <span>Showing {man.questions.length} of {fmt(man.total)}</span>
                        {man.questions.length < (man.total || 0) && (
                          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} disabled={man.status === "loading"} onClick={() => loadManual(it)}>
                            {man.status === "loading" ? "Loading\u2026" : "Load more"}
                          </button>
                        )}
                        {man.status === "error" && <span className={s.errInline}>{man.error}</span>}
                      </div>
                    </>
                  )}
                </div>
              )}
            </section>
            </Fragment>
          );
        })}
      </div>

      {saveErr && <p className={`${s.err} ${s.summaryGap}`}>{saveErr}</p>}
      <div className={`${s.summary} ${s.summaryGap}`}>
        <div className={s.sumText}>
          <span><strong>{haveTotal}</strong> / <strong>{needTotal}</strong> questions {isAuto ? "ready" : "selected"}</span>
        </div>
        <div className={s.sumActions}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onBack}>Back to details</button>
          <button type="button" className={s.btn} disabled={!canSave} onClick={saveExam} title={complete ? "" : "Pick every question first"}>
            {saving ? "Saving\u2026" : "Save exam"}
          </button>
        </div>
      </div>
    </>
  );
}
