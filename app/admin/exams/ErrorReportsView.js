// app/admin/exams/ErrorReportsView.js  (new file)
//
// Error reports of ONE exam (opened from the "Error reports" column on Admin -> Exams).
// Same job as the old Question Error Reports page, but scoped to the exam:
//   * reports are grouped per question (several students often report the same one)
//   * Inspect opens the question (options, correct answer, solution) + every report on it
//   * Resolve one report / resolve all reports of the question / reopen
//   * Mark the question as bonus (awards the mark to everyone, on every product running this exam)
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./exams.module.css";
import r from "./errorReports.module.css";
import { sanitizeHtml, useDomPurify } from "./create/sanitize";

const LETTERS = ["A", "B", "C", "D"];
const resolvedOf = (x) => String(x?.status || "").toLowerCase() === "resolved";
const when = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

async function call(url, method, body) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function ErrorReportsView({ examId, title, onBack, onChanged }) {
  useDomPurify();
  const [state, setState] = useState({ status: "loading", error: "" });
  const [data, setData] = useState({ exam: null, reports: [], bonus: [] });
  const [tab, setTab] = useState("pending"); // pending | resolved | all
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading", error: "" });
    fetch(`/api/admin/exam-reports?exam=${encodeURIComponent(examId)}`, { cache: "no-store" })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Failed to load the reports.");
        if (!alive) return;
        setData({ exam: d.exam, reports: d.reports || [], bonus: d.bonus || [] });
        setState({ status: "ready", error: "" });
      })
      .catch((e) => alive && setState({ status: "error", error: e.message || "Failed to load the reports." }));
    return () => { alive = false; };
  }, [examId, reloadKey]);

  const bonusSet = useMemo(() => new Set(data.bonus), [data.bonus]);

  // one row per reported question
  const groups = useMemo(() => {
    const map = new Map();
    data.reports.forEach((rep) => {
      const key = `${rep.question_number}|${rep.q_id}`;
      if (!map.has(key)) map.set(key, { key, num: rep.question_number, qId: rep.q_id, section: rep.section_name, reports: [] });
      map.get(key).reports.push(rep);
    });
    return [...map.values()]
      .map((g) => ({
        ...g,
        pending: g.reports.filter((x) => !resolvedOf(x)).length,
        latest: g.reports.reduce((m, x) => (new Date(x.created_at) > new Date(m) ? x.created_at : m), g.reports[0].created_at),
      }))
      .sort((a, b) => (b.pending > 0) - (a.pending > 0) || a.num - b.num);
  }, [data.reports]);

  const totals = useMemo(() => {
    const pending = data.reports.filter((x) => !resolvedOf(x)).length;
    return { total: data.reports.length, pending, resolved: data.reports.length - pending, questions: groups.length };
  }, [data.reports, groups]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (tab === "pending" && g.pending === 0) return false;
      if (tab === "resolved" && g.pending > 0) return false;
      if (!q) return true;
      return (
        String(g.num).includes(q) ||
        String(g.qId || "").toLowerCase().includes(q) ||
        g.reports.some((x) => String(x.student_id || "").toLowerCase().includes(q) || String(x.description || "").toLowerCase().includes(q))
      );
    });
  }, [groups, tab, query]);

  // keep the exams-list counts fresh after any change
  const patchStatus = useCallback(async (ids, status) => {
    await call("/api/admin/exam-reports", "PATCH", { ids, status });
    setData((p) => ({ ...p, reports: p.reports.map((x) => (ids.includes(x.id) ? { ...x, status } : x)) }));
    onChanged && onChanged();
  }, [onChanged]);

  const setBonus = useCallback(async (num, on, reason) => {
    if (on) await call("/api/admin/exam-reports", "POST", { action: "bonus", exam: examId, test_q_num: num, reason });
    else await call("/api/admin/exam-reports", "DELETE", { exam: examId, test_q_num: num });
    setData((p) => ({ ...p, bonus: on ? [...new Set([...p.bonus, num])] : p.bonus.filter((n) => n !== num) }));
  }, [examId]);

  const open = openKey ? groups.find((g) => g.key === openKey) : null;
  const closeInspect = useCallback(() => setOpenKey(null), []);

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Error Reports</h1>
          <p className={s.subtitle}>{data.exam?.name || title}{data.exam?.type ? ` \u00b7 ${data.exam.type}` : ""}</p>
        </div>
        <div className={s.headBtns}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setReloadKey((k) => k + 1)}>Refresh</button>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onBack}>&larr; Back to exams</button>
        </div>
      </div>

      {state.status === "loading" && <div className={s.empty}>Loading reports&hellip;</div>}
      {state.status === "error" && (
        <p className={s.err}>
          {state.error}
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
        </p>
      )}

      {state.status === "ready" && (
        <>
          <div className={r.pills}>
            <span className={r.pill}><b>{totals.total}</b> reports</span>
            <span className={`${r.pill} ${totals.pending ? r.pillBad : ""}`}><b>{totals.pending}</b> pending</span>
            <span className={`${r.pill} ${r.pillOk}`}><b>{totals.resolved}</b> resolved</span>
            <span className={r.pill}><b>{totals.questions}</b> questions reported</span>
            <span className={r.pill}><b>{data.bonus.length}</b> bonus</span>
          </div>

          <div className={r.searchRow}>
            <div className={r.tabs}>
              {[["pending", "Pending"], ["resolved", "Resolved"], ["all", "All"]].map(([k, l]) => (
                <button key={k} type="button" className={`${r.tab} ${tab === k ? r.tabOn : ""}`} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <input className={r.search} placeholder="Search question no., student or note\u2026" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {shown.length === 0 ? (
            <div className={s.empty}>{groups.length === 0 ? "No error reports for this exam." : "Nothing in this view."}</div>
          ) : (
            <div className={`${s.card} ${s.tableWrap}`}>
              <table className={s.qTable}>
                <thead>
                  <tr>
                    <th className={s.thNo}>Q.</th>
                    <th>Latest note</th>
                    <th className={s.thExam}>Section</th>
                    <th className={s.thQs}>Reports</th>
                    <th className={s.thDate}>Last reported</th>
                    <th className={s.thExam}>Status</th>
                    <th className={s.thRegen}>Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((g) => (
                    <tr key={g.key} className={`${s.examRow} ${r.row}`} onClick={() => setOpenKey(g.key)}>
                      <td className={s.tdNo}>{g.num}</td>
                      <td>
                        <div className={r.trunc} title={g.reports[0].description}>{g.reports[0].description}</div>
                        <div className={r.mono}>{g.qId}</div>
                      </td>
                      <td><span className={s.chStd}>{g.section || "-"}</span></td>
                      <td className={s.tdNum}>{g.reports.length}</td>
                      <td className={s.tdDate}>{when(g.latest)}</td>
                      <td>
                        {g.pending > 0 ? <span className={`${r.badge} ${r.badgeBad}`}>{g.pending} pending</span> : <span className={`${r.badge} ${r.badgeOk}`}>Resolved</span>}
                        {bonusSet.has(g.num) && <> <span className={`${r.badge} ${r.badgeBonus}`}>Bonus</span></>}
                      </td>
                      <td className={s.tdRegen} onClick={(e) => e.stopPropagation()}>
                        <button type="button" className={r.inspectBtn} onClick={() => setOpenKey(g.key)}>Inspect</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {open && (
        <Inspect
          key={open.key}
          examId={examId}
          group={open}
          isBonus={bonusSet.has(open.num)}
          onClose={closeInspect}
          onStatus={patchStatus}
          onBonus={setBonus}
        />
      )}
    </>
  );
}

/* ---------------------------------------------------------------- inspect window */

function Inspect({ examId, group, isBonus, onClose, onStatus, onBonus }) {
  const [q, setQ] = useState({ status: "loading", data: null, error: "" });
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    let alive = true;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    fetch(`/api/admin/exam-reports?exam=${encodeURIComponent(examId)}&q_id=${encodeURIComponent(group.qId)}`, { cache: "no-store" })
      .then(async (res) => {
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Could not load the question.");
        if (alive) setQ({ status: "ready", data: d, error: "" });
      })
      .catch((e) => alive && setQ({ status: "error", data: null, error: e.message }));
    return () => { alive = false; document.removeEventListener("keydown", onKey); };
  }, [examId, group.qId, onClose]);

  const run = async (name, fn, okMsg) => {
    setBusy(name); setErr(""); setInfo("");
    try { await fn(); if (okMsg) setInfo(okMsg); } catch (e) { setErr(e.message || "Something went wrong."); } finally { setBusy(""); }
  };

  const pendingIds = group.reports.filter((x) => !resolvedOf(x)).map((x) => x.id);
  const d = q.data;
  const right = String(d?.answer_key ?? "").trim().toUpperCase();

  return (
    <div className={r.overlay} onClick={onClose}>
      <div className={r.modal} role="dialog" aria-label="Inspect reported question" onClick={(e) => e.stopPropagation()}>
        <div className={r.mHead}>
          <div>
            <h3 className={r.mTitle}>Question {group.num}{group.section ? ` \u00b7 ${group.section}` : ""}</h3>
            <p className={r.mSub}>{group.reports.length} report{group.reports.length === 1 ? "" : "s"} &middot; <span className={r.mono}>{group.qId}</span>{isBonus && <> &middot; <span className={`${r.badge} ${r.badgeBonus}`}>Bonus</span></>}</p>
          </div>
          <button type="button" className={r.mX} onClick={onClose} aria-label="Close">&#10005;</button>
        </div>

        <div className={r.mBody}>
          {err && <p className={r.msg}>{err}</p>}
          {info && <p className={r.ok}>{info}</p>}

          <h4 className={r.h3}>Question</h4>
          <div className={r.qBox}>
            {q.status === "loading" && <span className={r.note}>Loading question&hellip;</span>}
            {q.status === "error" && <span className={r.note}>{q.error}</span>}
            {d && (
              <>
                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.question_html) }} />
                {LETTERS.map((L) => (
                  <div key={L} className={`${r.opt} ${right === L ? r.optRight : ""}`}>
                    <span className={r.optLetter}>{L}</span>
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.options?.[L]) }} />
                  </div>
                ))}
                {right && <div className={r.ans}>Correct answer: {right}</div>}
                <div className={r.sol}>
                  <div className={r.solLabel}>Solution</div>
                  {d.solution_html ? <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(d.solution_html) }} /> : <span className={r.note}>No solution available.</span>}
                </div>
              </>
            )}
          </div>

          <h4 className={r.h3}>Student reports</h4>
          {group.reports.map((x) => (
            <div key={x.id} className={`${r.repCard} ${resolvedOf(x) ? r.repDone : ""}`}>
              <div className={r.repTop}>
                <span><strong>{x.student_id}</strong> &middot; {when(x.created_at)}</span>
                <span className={`${r.badge} ${resolvedOf(x) ? r.badgeOk : r.badgeBad}`}>{resolvedOf(x) ? "Resolved" : "Pending"}</span>
              </div>
              <p className={r.repText}>{x.description}</p>
              <button
                type="button"
                className={`${r.btn} ${r.btnGhost} ${r.btnSm}`}
                disabled={!!busy}
                onClick={() => run(`one-${x.id}`, () => onStatus([x.id], resolvedOf(x) ? "Pending Review" : "Resolved"))}
              >
                {resolvedOf(x) ? "Reopen" : "Resolve"}
              </button>
            </div>
          ))}
        </div>

        <div className={r.mFoot}>
          <div className={r.footGroup}>
            {isBonus ? (
              <button type="button" className={`${r.btn} ${r.btnGhost}`} disabled={!!busy} onClick={() => run("bonus", () => onBonus(group.num, false), "Bonus removed.")}>
                {busy === "bonus" ? "Removing\u2026" : "Remove bonus"}
              </button>
            ) : (
              <button
                type="button"
                className={`${r.btn} ${r.btnBonus}`}
                disabled={!!busy}
                onClick={() => {
                  if (!window.confirm(`Mark question ${group.num} as a bonus? Every student gets the mark for it.`)) return;
                  run("bonus", () => onBonus(group.num, true, group.reports[0]?.description), "Marked as bonus for all students.");
                }}
              >
                {busy === "bonus" ? "Marking\u2026" : "\uD83C\uDF81 Mark as bonus"}
              </button>
            )}
          </div>
          <div className={r.footGroup}>
            <button type="button" className={`${r.btn} ${r.btnGhost}`} onClick={onClose}>Close</button>
            <button
              type="button"
              className={r.btn}
              disabled={!!busy || pendingIds.length === 0}
              onClick={() => run("all", () => onStatus(pendingIds, "Resolved"), "All reports on this question resolved.")}
            >
              {busy === "all" ? "Resolving\u2026" : pendingIds.length ? `Resolve all (${pendingIds.length})` : "All resolved"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
