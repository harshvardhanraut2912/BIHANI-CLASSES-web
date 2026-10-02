"use client";

import { useState, useEffect, useMemo, useCallback } from "react";

const EXAM = "MHT-CET"; // same param exam-summary already expects

export default function DatabaseOverviewPage() {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Same endpoint addexamimages-v2 already uses for its instant chapters
  // screen — question_count per chapter, via jsonb_array_length, not a
  // full question pull. We just aggregate it differently here.
  const loadCounts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/exam-summary?exam=${encodeURIComponent(EXAM)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load chapter summary.");
      setChapters(data.chapters || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const totalDatabase = useMemo(
    () => chapters.reduce((sum, ch) => sum + (Number(ch.question_count) || 0), 0),
    [chapters]
  );

  const perSubject = useMemo(() => {
    const map = {};
    chapters.forEach((ch) => {
      const subj = ch.subject || "Unknown";
      map[subj] = (map[subj] || 0) + (Number(ch.question_count) || 0);
    });
    return Object.entries(map)
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count);
  }, [chapters]);

  // Natural sort: "1. X", "2. Y", "10. Z", "11. W" in that numeric order,
  // not the string-sort order ("1","10","11","2"...) the table had before.
  function leadingChapterNumber(name) {
    const match = String(name || "").match(/^\s*(\d+)/);
    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
  }

  // Grouped strictly by subject first (so chapters never mix across
  // subjects), each subject's chapters then sorted by their real
  // chapter number, and standard (11th/12th) carried through per chapter.
  const groupedBySubject = useMemo(() => {
    const map = {};
    chapters.forEach((ch) => {
      const subj = ch.subject || "Unknown";
      if (!map[subj]) map[subj] = [];
      map[subj].push(ch);
    });
    return Object.entries(map)
      .map(([subject, list]) => ({
        subject,
        chapters: [...list].sort((a, b) => leadingChapterNumber(a.chapter_name) - leadingChapterNumber(b.chapter_name)),
      }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }, [chapters]);

  function chapterStandard(ch) {
    return ch.standard || ch.std || ch.class || "—";
  }

  // ===========================
  // SEARCH / DELETE
  // ===========================
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [foundQuestion, setFoundQuestion] = useState(null); // { question, bundle_id, chapter_id, question_type }
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteDone, setDeleteDone] = useState(false);

  const handleSearch = useCallback(async (e) => {
    e.preventDefault();
    const qId = searchInput.trim();
    if (!qId) return;

    setSearching(true);
    setSearchError("");
    setFoundQuestion(null);
    setDeleteDone(false);
    try {
      const res = await fetch(`/api/admin/search-question?q_id=${encodeURIComponent(qId)}`);
      const data = await res.json();
      if (!res.ok || !data.found) throw new Error(data.error || "Question not found.");
      setFoundQuestion(data);
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }, [searchInput]);

  const handleDelete = useCallback(async () => {
    if (!foundQuestion) return;
    if (!window.confirm(`Permanently delete question "${foundQuestion.question.q_id}"? This cannot be undone.`)) return;

    setDeleteBusy(true);
    setSearchError("");
    try {
      const res = await fetch("/api/admin/search-question", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_id: foundQuestion.bundle_id, q_id: foundQuestion.question.q_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete question.");
      setDeleteDone(true);
      loadCounts(); // refresh counts since one chapter just lost a question
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setDeleteBusy(false);
    }
  }, [foundQuestion, loadCounts]);

  return (
    <div style={{ minHeight: "100vh", background: "#0D0E10", color: "#ECEDEE", padding: "32px", fontFamily: "-apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, color: "#C9A24B", letterSpacing: "0.3px" }}>Database Overview</h1>
        <p style={{ color: "#9A9DA3", fontSize: 13, marginBottom: 28 }}>Question bank counts &amp; individual question lookup</p>

        {/* ============================= */}
        {/* SEARCH BOX */}
        {/* ============================= */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by q_id — e.g. QcEWzF_1_05ac"
            style={{
              flex: 1,
              background: "#1E2125",
              border: "1px solid #2A2D32",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#ECEDEE",
              fontSize: 14,
              fontFamily: "monospace",
            }}
          />
          <button
            type="submit"
            disabled={searching}
            style={{
              background: "#C9A24B",
              color: "#14150F",
              border: "none",
              borderRadius: 8,
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 700,
              cursor: searching ? "default" : "pointer",
              opacity: searching ? 0.6 : 1,
            }}
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {searchError && (
          <div style={{ background: "rgba(196, 69, 61, 0.1)", border: "1px solid #C4453D", color: "#E39A95", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13 }}>
            {searchError}
          </div>
        )}

        {foundQuestion && (
          <div style={{ background: "#17191C", border: "1px solid #2A2D32", borderRadius: 10, padding: 20, marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, color: "#9A9DA3", marginBottom: 2 }}>
                  {foundQuestion.chapter_id} · {foundQuestion.question_type === "T" ? "Theory" : foundQuestion.question_type === "P" ? "Practice" : foundQuestion.question_type} · Q{foundQuestion.question.q_num}
                </div>
                <div style={{ fontSize: 13, color: "#6B6E74", fontFamily: "monospace" }}>{foundQuestion.question.q_id}</div>
              </div>
              {!deleteDone ? (
                <button
                  onClick={handleDelete}
                  disabled={deleteBusy}
                  style={{
                    background: "rgba(196, 69, 61, 0.1)",
                    color: "#E39A95",
                    border: "1px solid #C4453D",
                    borderRadius: 6,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: deleteBusy ? "default" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  {deleteBusy ? "Deleting…" : "🗑️ Delete this question"}
                </button>
              ) : (
                <span style={{ color: "#C9A24B", fontSize: 13, fontWeight: 600 }}>✓ Deleted</span>
              )}
            </div>

            <div style={{ background: "#0D0E10", borderRadius: 8, padding: 16, fontSize: 15, lineHeight: 1.6, marginBottom: 14, border: "1px solid #202327" }}>
              <div dangerouslySetInnerHTML={{ __html: foundQuestion.question.question_html }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {["A", "B", "C", "D"].map((letter) => {
                const isCorrect = (foundQuestion.question.answer_key || "").toLowerCase() === letter.toLowerCase();
                return (
                  <div
                    key={letter}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 6,
                      background: isCorrect ? "rgba(63, 166, 110, 0.08)" : "#111",
                      border: `1px solid ${isCorrect ? "#C9A24B" : "#202327"}`,
                      fontSize: 14,
                    }}
                  >
                    <b style={{ color: isCorrect ? "#C9A24B" : "#9A9DA3" }}>{letter}</b>
                    <div dangerouslySetInnerHTML={{ __html: (foundQuestion.question.options || {})[letter] || "" }} />
                  </div>
                );
              })}
            </div>

            {foundQuestion.question.solution_html && (
              <div style={{ fontSize: 13 }}>
                <div style={{ color: "#9A9DA3", marginBottom: 6, fontWeight: 600 }}>Solution</div>
                <div style={{ background: "#0D0E10", border: "1px solid #202327", borderRadius: 8, padding: 14 }} dangerouslySetInnerHTML={{ __html: foundQuestion.question.solution_html }} />
              </div>
            )}
          </div>
        )}

        {/* ============================= */}
        {/* COUNTS */}
        {/* ============================= */}
        {loading ? (
          <p style={{ color: "#9A9DA3" }}>Loading counts…</p>
        ) : error ? (
          <div style={{ background: "rgba(196, 69, 61, 0.1)", border: "1px solid #C4453D", color: "#E39A95", borderRadius: 8, padding: 14 }}>{error}</div>
        ) : (
          <>
            <div
              style={{
                background: "#17191C",
                border: "1px solid #C9A24B",
                borderRadius: 12,
                padding: 24,
                marginBottom: 24,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "#9A9DA3" }}>Total questions in database</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#C9A24B" }}>{totalDatabase.toLocaleString()}</div>
              </div>
              <div style={{ fontSize: 13, color: "#9A9DA3" }}>{chapters.length} chapters</div>
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#C9A24B" }}>Per subject</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 32 }}>
              {perSubject.map((s) => (
                <div key={s.subject} style={{ background: "#17191C", border: "1px solid #2A2D32", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 13, color: "#9A9DA3", marginBottom: 4 }}>{s.subject}</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#C9A24B" }}>{s.count.toLocaleString()}</div>
                </div>
              ))}
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#C9A24B" }}>Per chapter</h2>

            {groupedBySubject.map((group) => (
              <div key={group.subject} style={{ marginBottom: 28 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#14150F",
                    background: "#C9A24B",
                    padding: "8px 16px",
                    borderRadius: "8px 8px 0 0",
                  }}
                >
                  {group.subject} <span style={{ fontWeight: 500, opacity: 0.75 }}>· {group.chapters.reduce((s, c) => s + (Number(c.question_count) || 0), 0)} questions</span>
                </div>
                <div style={{ background: "#17191C", border: "1px solid #2A2D32", borderTop: "none", borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#1E2125", textAlign: "left" }}>
                        <th style={{ padding: "10px 16px", color: "#9A9DA3", fontWeight: 600 }}>Chapter ID</th>
                        <th style={{ padding: "10px 16px", color: "#9A9DA3", fontWeight: 600 }}>Chapter</th>
                        <th style={{ padding: "10px 16px", color: "#9A9DA3", fontWeight: 600 }}>Standard</th>
                        <th style={{ padding: "10px 16px", color: "#9A9DA3", fontWeight: 600, textAlign: "right" }}>Questions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.chapters.map((ch) => (
                        <tr key={ch.id} style={{ borderTop: "1px solid #202327" }}>
                          <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "#6B6E74" }}>{ch.id}</td>
                          <td style={{ padding: "10px 16px" }}>{ch.chapter_name}</td>
                          <td style={{ padding: "10px 16px", color: "#9A9DA3" }}>{chapterStandard(ch)}</td>
                          <td style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, color: "#C9A24B" }}>{Number(ch.question_count) || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
