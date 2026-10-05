// app/admin/exams/page.js  (replace the existing file)
//
// Exams home. A table of saved exams (metadata only -- no questions are downloaded
// for the list). The eye button swaps this screen for the exam preview (same page,
// the URL never changes).
//
// PDF column: the PDF icon opens a small window (/exams/pdf) where the admin sets the
// date / title / marks / subject / columns and generates a Teacher or Student copy.
//
// Online exam column: an exam that already has a product shows a blue "Already created"
// button (opens the linked product details); otherwise "Deploy exam online" opens a
// step-by-step popup that creates the product (see DeployExamModal.js).
//
// Leaderboard column (next to Online exam): for an exam that is online, "Check leaderboard" swaps
// this screen for that exam's leaderboard (LeaderboardView.js; same data as the old Leaderboard page).
//
// Error reports column: number of student error reports on the exam (red while some are
// pending). "Inspect" swaps this screen for the exam's report page (ErrorReportsView.js)
// where reports can be resolved and a question can be marked as a bonus.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import s from "./exams.module.css";
import d from "./deploy.module.css";
import er from "./errorReports.module.css";
import { useAdminHref } from "@/components/admin/useAdminHref";
import PreviewView from "./PreviewView";
import DeployExamModal from "./DeployExamModal";
import ErrorReportsView from "./ErrorReportsView";
import LeaderboardView from "./LeaderboardView";
import lb from "./leaderboard.module.css";
import { EyeIcon } from "./create/ui";
import { fmt } from "./create/examConfig";

const fmtDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

export default function ExamsPage() {
  const href = useAdminHref();
  const [list, setList] = useState({ status: "loading", exams: [], error: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const [preview, setPreview] = useState(null); // { id, name }
  const [linked, setLinked] = useState({ status: "loading", map: {} }); // exam id -> products using it
  const [deploying, setDeploying] = useState(null); // exam row whose popup is open
  const [boardOf, setBoardOf] = useState(null); // { name, products } exam whose leaderboard is open
  const [reportsOf, setReportsOf] = useState(null); // { id, name } exam whose error reports are open
  const [reportCounts, setReportCounts] = useState({ status: "loading", map: {} }); // exam id -> { total, pending }

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/exam-papers", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load exams.");
        if (alive) setList({ status: "ready", exams: data.exams || [], error: "" });
      })
      .catch((e) => { if (alive) setList({ status: "error", exams: [], error: e.message || "Failed to load exams." }); });
    return () => { alive = false; };
  }, [reloadKey]);

  // Which exams already have a product. Re-run after a deploy.
  const loadLinked = useCallback(() => {
    fetch("/api/admin/exam-deploy", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "failed");
        setLinked({ status: "ready", map: data.linked || {} });
      })
      .catch(() => setLinked({ status: "error", map: {} }));
  }, []);
  useEffect(() => { loadLinked(); }, [loadLinked]);

  // Error report counts per exam. Re-run after resolving reports.
  const loadReportCounts = useCallback(() => {
    fetch("/api/admin/exam-reports", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "failed");
        setReportCounts({ status: "ready", map: data.counts || {} });
      })
      .catch(() => setReportCounts((p) => ({ status: "error", map: p.map })));
  }, []);
  useEffect(() => { loadReportCounts(); }, [loadReportCounts]);

  // Opens the "Create PDF" window (centred popup; falls back to a new tab if popups are blocked).
  const openPdfWindow = (e) => {
    const name = e.mock_test_name || e.mock_slug || e.id;
    const url = `${href("/exams/pdf")}?id=${encodeURIComponent(e.id)}&name=${encodeURIComponent(name)}`;
    const w = 700;
    const h = 780;
    const left = Math.max(0, Math.round((window.screenX || 0) + ((window.outerWidth || w) - w) / 2));
    const top = Math.max(0, Math.round((window.screenY || 0) + ((window.outerHeight || h) - h) / 2));
    const win = window.open(url, `exam-pdf-${e.id}`, `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
    if (!win) window.open(url, "_blank");
    else win.focus();
  };

  if (boardOf) {
    return <LeaderboardView title={boardOf.name} products={boardOf.products} onBack={() => { setBoardOf(null); window.scrollTo({ top: 0 }); }} />;
  }

  if (reportsOf) {
    return (
      <ErrorReportsView
        examId={reportsOf.id}
        title={reportsOf.name}
        onChanged={loadReportCounts}
        onBack={() => { setReportsOf(null); loadReportCounts(); window.scrollTo({ top: 0 }); }}
      />
    );
  }

  if (preview) {
    return <PreviewView examId={preview.id} title={preview.name} onBack={() => { setPreview(null); window.scrollTo({ top: 0 }); }} />;
  }

  const { status, exams, error } = list;
  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Exams</h1>
          <p className={s.subtitle}>Create and manage exams for your students.</p>
        </div>
        <Link href={href("/exams/create")} className={s.btn}>+ Create Exam</Link>
      </div>

      {status === "loading" && <div className={s.empty}>Loading exams&hellip;</div>}
      {status === "error" && (
        <p className={s.err}>
          {error}
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setList({ status: "loading", exams: [], error: "" }); setReloadKey((k) => k + 1); }}>Retry</button>
        </p>
      )}
      {status === "ready" && exams.length === 0 && <div className={s.empty}>No exams yet. Click &ldquo;Create Exam&rdquo; to make your first one.</div>}

      {status === "ready" && exams.length > 0 && (
        <div className={`${s.card} ${s.tableWrap}`}>
          <table className={s.qTable}>
            <thead>
              <tr>
                <th className={s.thNo}>#</th>
                <th>Exam name</th>
                <th className={s.thExam}>Type</th>
                <th className={s.thQs}>Questions</th>
                <th className={s.thDate}>Created</th>
                <th className={s.thRegen}>Preview</th>
                <th className={s.thRegen}>PDF</th>
                <th className={d.thOnline}>Online exam</th>
                <th className={lb.thBoard}>Leaderboard</th>
                <th className={er.thReports}>Error reports</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e, i) => (
                <tr key={e.id} className={s.examRow}>
                  <td className={s.tdNo}>{i + 1}</td>
                  <td>
                    <div className={s.examTitle}>{e.mock_test_name || e.mock_slug || e.id}</div>
                    <div className={s.examSlug}>{e.mock_slug || e.id}</div>
                  </td>
                  <td><span className={s.chStd}>{e.exam || "-"}</span></td>
                  <td className={s.tdNum}>{fmt(e.question_count)}</td>
                  <td className={s.tdDate}>{fmtDate(e.created_at)}</td>
                  <td className={s.tdRegen}>
                    <button
                      type="button"
                      className={s.eyeBtn}
                      title="Preview exam"
                      aria-label={`Preview ${e.mock_test_name || e.id}`}
                      onClick={() => { setPreview({ id: e.id, name: e.mock_test_name || e.id }); window.scrollTo({ top: 0 }); }}
                    >
                      <EyeIcon />
                    </button>
                  </td>
                  <td className={s.tdRegen}>
                    <button
                      type="button"
                      className={s.eyeBtn}
                      title="Create PDF (teacher / student copy)"
                      aria-label={`Create PDF for ${e.mock_test_name || e.id}`}
                      onClick={() => openPdfWindow(e)}
                    >
                      <PdfIcon />
                    </button>
                  </td>
                  <td className={d.tdOnline}>
                    {linked.status === "loading" && <span className={d.skeleton} aria-label="Checking" />}
                    {linked.status === "error" && (
                      <button type="button" className={d.deployBtn} onClick={() => { setLinked({ status: "loading", map: {} }); loadLinked(); }} title="Could not check linked products. Click to retry.">Retry check</button>
                    )}
                    {linked.status === "ready" && (linked.map[e.id]?.length ? (
                      <button type="button" className={d.doneBtn} onClick={() => setDeploying(e)} title="This exam is already linked to a product">
                        &#10003; Already created
                      </button>
                    ) : (
                      <button type="button" className={d.deployBtn} onClick={() => setDeploying(e)} title="Create a product so students can take this exam online">
                        Deploy exam online
                      </button>
                    ))}
                  </td>
                  <td className={lb.tdBoard}>
                    {linked.status === "loading" && <span className={d.skeleton} aria-label="Checking" />}
                    {linked.status === "error" && <span className={lb.na}>&mdash;</span>}
                    {linked.status === "ready" && (linked.map[e.id]?.length ? (
                      <button
                        type="button"
                        className={lb.boardBtn}
                        title="See how students ranked in this exam"
                        onClick={() => { setBoardOf({ name: e.mock_test_name || e.id, products: linked.map[e.id] }); window.scrollTo({ top: 0 }); }}
                      >
                        <span aria-hidden="true">{"\u{1F3C6}"}</span> Check leaderboard
                      </button>
                    ) : (
                      <span className={lb.na} title="Deploy this exam online first">Not online yet</span>
                    ))}
                  </td>
                  <td className={er.tdReports}>
                    {(() => {
                      if (reportCounts.status === "loading") return <span className={d.skeleton} style={{ width: 90 }} aria-label="Counting" />;
                      const c = reportCounts.map[e.id] || { total: 0, pending: 0 };
                      const tone = c.total === 0 ? "" : c.pending > 0 ? er.countBad : er.countOk;
                      return (
                        <>
                          <span className={er.cell}>
                            <span className={`${er.count} ${tone}`} title={`${c.total} report${c.total === 1 ? "" : "s"}, ${c.pending} pending`}>{c.total}</span>
                            <button
                              type="button"
                              className={er.inspectBtn}
                              disabled={c.total === 0}
                              title={c.total === 0 ? "No error reports on this exam" : "Inspect error reports"}
                              onClick={() => { setReportsOf({ id: e.id, name: e.mock_test_name || e.id }); window.scrollTo({ top: 0 }); }}
                            >
                              Inspect
                            </button>
                          </span>
                          {c.pending > 0 && <span className={er.pendingTxt}>{c.pending} pending</span>}
                        </>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deploying && (
        <DeployExamModal
          exam={deploying}
          linked={linked.map[deploying.id] || []}
          onClose={() => setDeploying(null)}
          onDeployed={loadLinked}
        />
      )}
    </>
  );
}
