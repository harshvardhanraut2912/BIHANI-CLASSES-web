// 📂 SAVE THIS FILE AT: app/admin/leaderboard/page.js
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import styles from "./leaderboard.module.css";

const PALETTE = [
  { a: "#6366f1", b: "#8b5cf6" },
  { a: "#0ea5e9", b: "#22d3ee" },
  { a: "#f97316", b: "#fb923c" },
  { a: "#10b981", b: "#34d399" },
  { a: "#ec4899", b: "#f472b6" },
  { a: "#eab308", b: "#facc15" },
  { a: "#ef4444", b: "#f87171" },
  { a: "#14b8a6", b: "#2dd4bf" },
];
const colorFor = (i) => PALETTE[i % PALETTE.length];

function Crumbs({ items, onJump }) {
  return (
    <div className={styles.crumbs}>
      {items.map((it, i) => (
        <span key={i} className={styles.crumbWrap}>
          <button
            className={i === items.length - 1 ? styles.crumbActive : styles.crumb}
            onClick={() => i < items.length - 1 && onJump(i)}
          >
            {it}
          </button>
          {i < items.length - 1 && <span className={styles.crumbSep}>›</span>}
        </span>
      ))}
    </div>
  );
}

function CourseGrid({ tree, onPick }) {
  return (
    <div className={styles.grid}>
      {tree.map((section, i) => {
        const c = colorFor(i);
        return (
          <button
            key={section.id}
            className={styles.courseCard}
            style={{ "--accentA": c.a, "--accentB": c.b }}
            onClick={() => onPick(section)}
          >
            <div className={styles.courseCardTop}>
              {section.thumbnail_url ? (
                <img src={section.thumbnail_url} alt="" className={styles.courseThumb} />
              ) : (
                <div className={styles.courseIconFallback}>{section.name?.[0]?.toUpperCase() || "?"}</div>
              )}
              <span className={styles.courseBadge}>{section.is_course ? "Course" : "Section"}</span>
            </div>
            <div className={styles.courseName}>{section.name}</div>
            <div className={styles.courseMeta}>{section.examCount} exam{section.examCount === 1 ? "" : "s"} total</div>
          </button>
        );
      })}
      {tree.length === 0 && (
        <div className={styles.emptyState}>No exams found yet. Add an exam product under a chapter first.</div>
      )}
    </div>
  );
}

function ChapterExplorer({ section, onPickExam }) {
  const [openSub, setOpenSub] = useState(section.subsections[0]?.id || null);
  const [openChapter, setOpenChapter] = useState(null);

  return (
    <div className={styles.explorer}>
      {section.subsections.map((sub, i) => {
        const c = colorFor(i);
        const isOpen = openSub === sub.id;
        return (
          <div key={sub.id} className={styles.subCard} style={{ "--accentA": c.a, "--accentB": c.b }}>
            <button
              className={styles.subHeader}
              onClick={() => { setOpenSub(isOpen ? null : sub.id); setOpenChapter(null); }}
            >
              <span className={styles.subHeaderLeft}>
                <span className={styles.subDot} />
                {sub.name}
              </span>
              <span className={styles.subMeta}>
                {sub.chapters.length} chapter{sub.chapters.length === 1 ? "" : "s"}
                <svg className={`${styles.chev} ${isOpen ? styles.chevOpen : ""}`} width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>

            {isOpen && (
              <div className={styles.chapterList}>
                {sub.chapters.map((ch) => {
                  const chOpen = openChapter === ch.id;
                  return (
                    <div key={ch.id} className={styles.chapterCard}>
                      <button
                        className={styles.chapterHeader}
                        onClick={() => setOpenChapter(chOpen ? null : ch.id)}
                      >
                        <span>{ch.name}</span>
                        <span className={styles.subMeta}>
                          {ch.exams.length} exam{ch.exams.length === 1 ? "" : "s"}
                          <svg className={`${styles.chev} ${chOpen ? styles.chevOpen : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none">
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </span>
                      </button>
                      {chOpen && (
                        <div className={styles.examList}>
                          {ch.exams.map((exam) => (
                            <button key={exam.id} className={styles.examItem} onClick={() => onPickExam(exam)}>
                              <span className={styles.examIcon}>📝</span>
                              <span className={styles.examName}>{exam.title}</span>
                              {exam.is_scheduled && (
                                <span className={styles.examTag}>
                                  {exam.result_declared_at ? "Result declared" : "Live"}
                                </span>
                              )}
                              <span className={styles.examArrow}>→</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardView({ productId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("best");
  const [attemptNum, setAttemptNum] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const res = await fetch(`/api/admin/leaderboard?productId=${encodeURIComponent(productId)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load leaderboard.");
        if (cancelled) return;
        setData(json);
        setMode(json.isScheduled ? "live" : "best");
        setAttemptNum(1);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const maxAttempts = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.leaderboard.map(s => s.attempts.length));
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    let out;
    if (mode === "live") {
      out = (data.liveLeaderboard || []).map(s => ({ fullName: s.fullName, email: s.email, percentage: s.percentage, attemptNumber: 1 }));
    } else if (mode === "best") {
      out = data.leaderboard.map(s => {
        const bestAttempt = s.attempts.reduce((a, b) => (b.percentage > a.percentage ? b : a), s.attempts[0]);
        return { fullName: s.fullName, email: s.email, percentage: s.bestPercentage, attemptNumber: bestAttempt.attemptNumber };
      });
    } else {
      out = data.leaderboard
        .filter(s => s.attempts.some(a => a.attemptNumber === attemptNum))
        .map(s => {
          const a = s.attempts.find(a => a.attemptNumber === attemptNum);
          return { fullName: s.fullName, email: s.email, percentage: a.percentage, attemptNumber: attemptNum };
        });
    }
    return out.sort((a, b) => b.percentage - a.percentage);
  }, [data, mode, attemptNum]);

  if (loading) return <div className={styles.loadingState}>Loading leaderboard…</div>;
  if (error) return <div className={styles.errorState}>{error}</div>;
  if (!data) return null;

  const medal = (idx) => (idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null);

  return (
    <div className={styles.resultCard}>
      <div className={styles.resultHeader}>
        <div className={styles.resultTitle}>{data.productTitle}</div>
        <div className={styles.resultSub}>
          {data.totalStudents} student{data.totalStudents === 1 ? "" : "s"} have attempted this test
          {data.isScheduled && !data.resultDeclared && (
            <span className={styles.liveBadge}>Live — result not yet declared to students</span>
          )}
        </div>
      </div>

      <div className={styles.filterRow}>
        {data.isScheduled && (
          <button className={`${styles.filterBtn} ${mode === "live" ? styles.filterBtnActive : ""}`} onClick={() => setMode("live")}>
            Live Results
          </button>
        )}
        <button className={`${styles.filterBtn} ${mode === "best" ? styles.filterBtnActive : ""}`} onClick={() => setMode("best")}>
          Best Score
        </button>
        <button className={`${styles.filterBtn} ${mode === "attempt" ? styles.filterBtnActive : ""}`} onClick={() => setMode("attempt")}>
          By Attempt No.
        </button>
      </div>

      {mode === "live" && (
        <div className={styles.liveNotice}>These scores are of only students who attempted this exam live in the scheduled time.</div>
      )}

      {mode === "attempt" && (
        <div className={styles.attemptPicker}>
          <select value={attemptNum} onChange={(e) => setAttemptNum(parseInt(e.target.value))}>
            {Array.from({ length: maxAttempts }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Attempt {n}</option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.list}>
        {rows.length === 0 ? (
          <div className={styles.empty}>
            {mode === "live" ? "No one attempted this exam live during the scheduled window." : "No attempts found for this filter."}
          </div>
        ) : (
          rows.map((row, idx) => (
            <div key={row.email + idx} className={`${styles.row} ${idx < 3 ? styles["rowTop" + (idx + 1)] : ""}`}>
              <div className={styles.rankNum}>{medal(idx) || idx + 1}</div>
              <div className={styles.name}>
                {row.fullName}
                <span className={styles.email}>{row.email}</span>
              </div>
              <div className={styles.pctWrap}>
                <div className={styles.pctBarTrack}>
                  <div className={styles.pctBarFill} style={{ width: `${Math.max(0, Math.min(100, row.percentage))}%` }} />
                </div>
                <span className={styles.pct}>{row.percentage.toFixed(1)}%</span>
                {mode !== "live" && <span className={styles.attemptTag}>Attempt {row.attemptNumber}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminLeaderboardPage() {
  const [tree, setTree] = useState([]);
  const [loadingTree, setLoadingTree] = useState(true);
  const [error, setError] = useState("");

  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/leaderboard-tree");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load exams.");
        setTree(json.tree || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoadingTree(false);
      }
    })();
  }, []);

  const crumbItems = ["All Courses"];
  if (selectedSection) crumbItems.push(selectedSection.name);
  if (selectedExam) crumbItems.push(selectedExam.title);

  const jumpTo = useCallback((i) => {
    if (i === 0) { setSelectedSection(null); setSelectedExam(null); }
    else if (i === 1) { setSelectedExam(null); }
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>🏆 Leaderboard</h1>
          <p className={styles.subtitle}>Browse by course → chapter → exam to see how students ranked.</p>
        </div>
        <a href="/admin" className={styles.backLink}>&#8592; Back to Admin</a>
      </div>

      <Crumbs items={crumbItems} onJump={jumpTo} />

      {loadingTree && <div className={styles.loadingState}>Loading courses…</div>}
      {error && <div className={styles.errorState}>{error}</div>}

      {!loadingTree && !error && !selectedSection && (
        <CourseGrid tree={tree} onPick={setSelectedSection} />
      )}

      {!loadingTree && !error && selectedSection && !selectedExam && (
        <ChapterExplorer section={selectedSection} onPickExam={setSelectedExam} />
      )}

      {selectedExam && <LeaderboardView productId={selectedExam.id} />}
    </div>
  );
}
