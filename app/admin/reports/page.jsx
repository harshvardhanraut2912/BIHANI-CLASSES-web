"use client";

import { useEffect, useMemo, useState, memo, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import "./adminreports.css";

const PAGE_SIZE = 25;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function formatDate(date) {
  if (!date) return "-";
  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const ReportRow = memo(function ReportRow({ report, onOpen, onResolve }) {
  const isResolved = report.status?.toLowerCase() === "resolved";

  return (
    <tr className="studentRow" onClick={() => onOpen(report)}>
      <td>
        <div className="nameCellRow">
          <div className="nameCell">
            <strong title={report.student_id}>{report.student_id}</strong>
            <span className="txId" title={report.test_id}>{report.test_id}</span>
            {report.q_id && (
              <span className="txId" title={report.q_id} style={{ opacity: 0.7 }}>
                Q: {report.q_id}
              </span>
            )}
          </div>
        </div>
      </td>
      <td><span className="sectionBadge">{report.section_name || "-"}</span></td>
      <td><strong>Q. No {report.question_number}</strong></td>
      <td><div className="messageTruncate" title={report.description}>{report.description}</div></td>
      <td>{formatDate(report.created_at)}</td>
      <td>
        <span className={isResolved ? "active" : "inactive"}>
          <span className="dot" /> {report.status || "Pending Review"}
        </span>
      </td>
      <td onClick={(e) => e.stopPropagation()}>
        {!isResolved ? (
          <button type="button" className="actionPickBtn" onClick={() => onResolve(report.id)}>
            Resolve
          </button>
        ) : (
          <span className="checkmarkText">✓ Fixed</span>
        )}
      </td>
    </tr>
  );
});

export default function AdminReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectedReport, setSelectedReport] = useState(null);
  const [questionPreview, setQuestionPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ==========================================
  // 🟢 DELETE / VOID state
  // ==========================================
  const [regenError, setRegenError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidDone, setVoidDone] = useState(false);
  const [copiedQid, setCopiedQid] = useState(false);

  useEffect(() => {
    loadReportsDashboard();
  }, []);

  async function loadReportsDashboard() {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/admin/reports");
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Failed to load error reports.");
      setReports(json.reports || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Intercept open action to fetch the live question_html/options from
  // exam_question_data_v2 — no GitHub PAT, no image proxy anymore.
  const handleOpenReport = useCallback(async (report) => {
    setSelectedReport(report);
    setQuestionPreview(null);
    setRegenError("");
    setDeleteDone(false);
    setVoidDone(false);
    setCopiedQid(false);

    if (report.q_id && report.test_id) {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/admin/reports", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test_id: report.test_id, q_id: report.q_id })
        });
        const data = await res.json();
        if (res.ok) {
          setQuestionPreview(data);
        }
      } catch (err) {
        console.error("Failed to load question preview:", err);
      } finally {
        setPreviewLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("realtime-error-reports")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "error_reports" }, (payload) => {
        setReports((prev) => prev.map((item) => (item.id === payload.new.id ? { ...item, ...payload.new } : item)));
        setSelectedReport((prev) => prev && prev.id === payload.new.id ? { ...prev, ...payload.new } : prev);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleResolveReport = useCallback(async (id) => {
    try {
      const response = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "Resolved" }),
      });
      if (!response.ok) throw new Error("Failed to resolve report.");
      setReports((prev) => prev.map((item) => (item.id === id ? { ...item, status: "Resolved" } : item)));
      setSelectedReport((prev) => (prev && prev.id === id ? { ...prev, status: "Resolved" } : prev));
    } catch (err) {
      console.error(err);
    }
  }, []);

  // ==========================================
  // 🟢 DELETE / VOID handlers
  // ==========================================
  const handleDeleteFromPool = useCallback(async () => {
    if (!selectedReport) return;
    if (!window.confirm("Permanently delete this question (and its solution image) from the database and storage? This cannot be undone.")) {
      return;
    }
    setDeleteBusy(true);
    setRegenError("");
    try {
      const res = await fetch("/api/admin/reports/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          test_id: selectedReport.test_id,
          test_q_num: selectedReport.question_number,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete question.");
      if (data.warning) setRegenError(data.warning);
      setDeleteDone(true);
    } catch (err) {
      setRegenError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  }, [selectedReport]);

  const handleVoidQuestion = useCallback(async () => {
    if (!selectedReport) return;
    setVoidBusy(true);
    setRegenError("");
    try {
      const res = await fetch("/api/admin/reports/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "void",
          test_id: selectedReport.test_id,
          test_q_num: selectedReport.question_number,
          reason: selectedReport.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark question as bonus.");
      setVoidDone(true);
    } catch (err) {
      setRegenError(err.message);
    } finally {
      setVoidBusy(false);
    }
  }, [selectedReport]);

  const handleCopyQid = useCallback(async (qid) => {
    if (!qid) return;
    try {
      await navigator.clipboard.writeText(qid);
      setCopiedQid(true);
      setTimeout(() => setCopiedQid(false), 1500);
    } catch (err) {
      console.error("Failed to copy question id:", err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setVisibleCount(PAGE_SIZE); }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const filteredReports = useMemo(() => {
    if (!search.trim()) return reports;
    const keyword = search.toLowerCase();
    return reports.filter(item =>
      item.student_id?.toLowerCase().includes(keyword) ||
      item.test_id?.toLowerCase().includes(keyword) ||
      item.description?.toLowerCase().includes(keyword)
    );
  }, [reports, search]);

  return (
    <>
      <div className={`admin-page ${selectedReport ? "blur-page" : ""}`}>
        {/* Header Elements */}
        <div className="header">
          <div className="header-titles">
            <div className="header-icon report-icon-bg">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z" fill="white" />
              </svg>
            </div>
            <div>
              <h1>Question Error Reports</h1>
              <p>Audit private repository exam questions securely</p>
            </div>
          </div>
          <div className="header-right">
            <div className="searchBox-wrap">
              <input
                type="text"
                className="searchBox"
                placeholder="Search report notes..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Data Tables */}
        {!loading && !error && (
          <div className="tableWrapper">
            <table>
              <thead>
                <tr>
                  <th>Student & Test ID</th>
                  <th>Section</th>
                  <th>Question No.</th>
                  <th>Description</th>
                  <th>Reported At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.slice(0, visibleCount).map((report) => (
                  <ReportRow key={report.id} report={report} onOpen={handleOpenReport} onResolve={handleResolveReport} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECURE LIGHTBOX MODAL */}
      {selectedReport && (
        <div className="modalOverlay" onClick={() => setSelectedReport(null)}>
          <div className="studentModal" onClick={(e) => e.stopPropagation()}>
            <button className="closeBtn" onClick={() => setSelectedReport(null)}>×</button>

            <div className="modalTop reportTopGrad">
              <h2>Report ticket details</h2>
              <p>{selectedReport.student_id} — Question {selectedReport.question_number}</p>
              {selectedReport.q_id && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '6px',
                  }}
                >
                  <span style={{ fontSize: '13px', opacity: 0.85 }}>
                    Question ID: <code style={{ fontFamily: 'monospace' }}>{selectedReport.q_id}</code>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyQid(selectedReport.q_id)}
                    title="Copy question ID"
                    style={{
                      background: 'rgba(255,255,255,0.15)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '6px',
                      padding: '2px 8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    {copiedQid ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              )}
            </div>

            <div className="modalBody reportLayoutGrid">
              <div className="section">
                <h3>Student Feedback Description</h3>
                <div className="messageBox"><p>{selectedReport.description}</p></div>
              </div>

              <div className="section">
                <h3>Reported Question Reference</h3>
                <div className="questionImageContainer">
                  {previewLoading && <p className="empty-note">Loading question content...</p>}

                  {!previewLoading && questionPreview && (
                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div dangerouslySetInnerHTML={{ __html: questionPreview.question_html }} />
                      {questionPreview.options && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                          {['A', 'B', 'C', 'D'].map(letter => (
                            <div key={letter} style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
                              <b>{letter}.</b>
                              <div dangerouslySetInnerHTML={{ __html: questionPreview.options[letter] || '' }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {!previewLoading && !questionPreview && !selectedReport.q_id && (
                    <p className="empty-note">No question reference was passed with this issue ticket.</p>
                  )}

                  {!previewLoading && !questionPreview && selectedReport.q_id && (
                    <p className="empty-note text-danger">Could not load this question's content.</p>
                  )}
                </div>

                {/* ======================================================
                    🟢 DELETE / VOID controls
                    ====================================================== */}
                <div className="regenActionsRow">
                  <button
                    type="button"
                    className={voidDone ? "checkmarkText" : "actionPickBtn"}
                    onClick={handleVoidQuestion}
                    disabled={voidBusy || voidDone}
                  >
                    {voidDone ? "✓ Marked as bonus" : voidBusy ? "Marking..." : "🎁 Mark as bonus (award to all)"}
                  </button>
                  <button
                    type="button"
                    className={deleteDone ? "checkmarkText" : "actionPickBtn"}
                    onClick={handleDeleteFromPool}
                    disabled={deleteBusy || deleteDone}
                  >
                    {deleteDone ? "✓ Deleted from database" : deleteBusy ? "Deleting..." : "🗑️ Delete this question from database"}
                  </button>
                </div>

                {regenError && <p className="empty-note text-danger">{regenError}</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}