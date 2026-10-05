// app/admin/exams/create/DetailsView.js  (new file)
//
// The details screen: every step is always visible and simply changes with the
// choices above it. Right-hand column = number of questions.
"use client";

import { useState } from "react";
import Link from "next/link";
import s from "../exams.module.css";
import { EXAMS, STREAMS, MODES, SUBJECT_ORDER, chapterKey, fmt, sum } from "./examConfig";

/* ---------- small pieces ---------- */
function ExamLogo({ exam }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={s.logoFallback}>{exam.short}</div>;
  return (
    <div className={s.logoBox}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={exam.logo} alt={`${exam.label} logo`} className={s.logoImg} onError={() => setFailed(true)} />
    </div>
  );
}

function Card({ step, title, hint, children }) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.step}>{step}</span>
        <h2 className={s.cardTitle}>{title}</h2>
        {hint && <span className={s.cardHint}>{hint}</span>}
      </div>
      <div className={s.cardBody}>{children}</div>
    </section>
  );
}

function ChapterRow({ index, ch }) {
  return (
    <li className={s.chRow}>
      <span className={s.chNum}>{index + 1}</span>
      <span className={s.chName}>{ch.name}</span>
      {ch.std && <span className={s.chStd}>{ch.std}</span>}
      <span className={s.chCount}>{fmt(ch.count)} Qs</span>
    </li>
  );
}

function NumberBox({ value, max, onChange, label }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      className={s.numInput}
      placeholder="0"
      aria-label={label}
      value={value > 0 ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  );
}

/* ---------- right column: number of questions ---------- */
function QuestionCounts({ f, a }) {
  const { exam, stream, mode, subjects, picked, bySubject, loading, error, visibleFor, totalQuestions, skipped, subjectTotals, DEFAULT_SUBJECT_TOTAL } = f;

  let body;
  if (!exam || !stream) {
    body = <div className={s.note}>Choose an exam type and a stream to set the number of questions.</div>;
  } else if (loading || error) {
    body = <div className={s.note}>{loading ? "Loading chapters\u2026" : "Chapters could not be loaded."}</div>;
  } else if ((stream === "PCM" || stream === "PCB") && mode !== "manual") {
    // PCM / PCB, automatic: a total per subject (50 by default)
    body = (
      <>
        <p className={s.asideHint}>Questions per subject. They are picked at random from all its chapters.</p>
        {STREAMS[stream].subjects.map((subj) => {
          const max = sum((bySubject[subj] || []).map((c) => c.count));
          const val = subjectTotals[subj] ?? DEFAULT_SUBJECT_TOTAL;
          return (
            <div key={subj} className={s.cntRow}>
              <div className={s.cntName}>{subj}<span className={s.cntSub}>{fmt(max)} available</span></div>
              <NumberBox value={Math.min(val, max)} max={max} label={`${subj} questions`} onChange={(v) => a.setSubjectTotal(subj, max, v)} />
            </div>
          );
        })}
      </>
    );
  } else {
    // manual PCM / PCB, or subject wise: a number for every chapter
    const groups = (stream === "SUBJECT" ? subjects : STREAMS[stream].subjects)
      .map((subj) => ({
        subj,
        list: stream === "SUBJECT" ? visibleFor(subj).filter((c) => picked[subj]?.[c.name]) : bySubject[subj] || [],
      }))
      .filter((g) => g.list.length > 0);

    body = groups.length === 0 ? (
      <div className={s.note}>Tick chapters on the left to enter how many questions you want from each.</div>
    ) : (
      <>
        <p className={s.asideHint}>Enter how many questions you want from each chapter.</p>
        {groups.map(({ subj, list }) => {
          const total = sum(list.map((c) => f.perChapter[chapterKey(subj, c.name)] || 0));
          return (
            <div key={subj} className={s.cntGroup}>
              <div className={s.cntGroupHead}><span>{subj}</span><strong>{total}</strong></div>
              {list.map((c) => (
                <div key={c.name} className={s.cntRow}>
                  <div className={s.cntName} title={c.name}>{c.name}<span className={s.cntSub}>{fmt(c.count)} available</span></div>
                  <NumberBox value={f.perChapter[chapterKey(subj, c.name)] || 0} max={c.count} label={`${c.name} questions`} onChange={(v) => a.setChapterCount(subj, c, v)} />
                </div>
              ))}
            </div>
          );
        })}
        {skipped > 0 && <p className={s.warn}>{skipped} selected chapter{skipped === 1 ? " has" : "s have"} no count and will be skipped.</p>}
      </>
    );
  }

  return (
    <aside className={s.aside}>
      <div className={s.cardHead}>
        <h2 className={s.cardTitle}>Number of questions</h2>
      </div>
      <div className={s.asideBody}>{body}</div>
      <div className={s.asideFoot}>
        <span>Total questions</span>
        <strong>{fmt(totalQuestions)}</strong>
      </div>
    </aside>
  );
}

/* ---------- main ---------- */
export default function DetailsView({ f, a, onContinue }) {
  const { href, exam, examId, stream, mode, open, subjects, classOf, picked, chapters, bySubject, loading, error, visibleFor, problem, denied, accessMsg, streamBlockedBy } = f;
  const noData = !exam || !stream;

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Create Exam</h1>
          <p className={s.subtitle}>Fill in the exam details and choose what the exam will cover.</p>
        </div>
        <Link href={href("/exams")} className={`${s.btn} ${s.btnGhost}`}>&larr; Back to Exams</Link>
      </div>

      <div className={s.layout}>
        <div className={s.form}>
          {/* 1. exam name */}
          <Card step="1" title="Exam name">
            <label htmlFor="examName" className={s.label}>Name shown to students</label>
            <input id="examName" className={s.input} type="text" placeholder="e.g. MHT-CET Full Syllabus Mock Test 1" value={f.examName} onChange={(e) => a.setExamName(e.target.value)} maxLength={120} />
          </Card>

          {/* 2. exam type */}
          <Card step="2" title="Exam type" hint="Choose one">
            <div className={s.examGrid} role="radiogroup" aria-label="Exam type">
              {EXAMS.map((e) => (
                <button key={e.id} type="button" role="radio" aria-checked={examId === e.id} className={`${s.examTile} ${examId === e.id ? s.examTileOn : ""}`} onClick={() => a.chooseExam(e.id)}>
                  <span className={s.examTick}>&#10003;</span>
                  <ExamLogo exam={e} />
                  <span className={s.examName}>{e.label}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* 3. stream */}
          <Card step="3" title="Stream" hint={exam ? "What should the exam cover?" : "Choose an exam type first"}>
            <div className={s.optionRow} role="radiogroup" aria-label="Stream">
              {(exam ? exam.streams : ["PCM", "PCB", "SUBJECT"]).map((id) => (
                <button key={id} type="button" role="radio" aria-checked={stream === id} disabled={!exam} className={`${s.option} ${stream === id ? s.optionOn : ""} ${streamBlockedBy(id).length ? s.optionLocked : ""}`} onClick={() => a.chooseStream(id)}>
                  <span className={s.optionName}>{STREAMS[id].name}{streamBlockedBy(id).length > 0 && <span className={s.lockTag}>No access</span>}</span>
                  <span className={s.optionSub}>{STREAMS[id].sub}</span>
                </button>
              ))}
            </div>
            {accessMsg?.where === "stream" && <p className={s.noAccess} role="alert">{accessMsg.text}</p>}
          </Card>

          {/* 4. chapters */}
          <Card step="4" title={stream === "SUBJECT" ? "Subjects & chapters" : "Syllabus"} hint={stream === "SUBJECT" ? "Pick subjects, then open one to tick chapters" : stream ? "All chapters are included. Open a subject to view them" : ""}>
            {noData ? (
              <div className={s.note}>{!exam ? "Choose an exam type to see its syllabus." : "Choose a stream to continue."}</div>
            ) : loading ? (
              <div className={s.note}>Loading chapters&hellip;</div>
            ) : error ? (
              <p className={s.err}>
                {error}
                <button type="button" className={`${s.btn} ${s.btnGhost}`} style={{ height: 32 }} onClick={a.retry}>Retry</button>
              </p>
            ) : chapters.length === 0 ? (
              <div className={s.note}>No chapters found for {exam.label}.</div>
            ) : stream !== "SUBJECT" ? (
              /* PCM / PCB: collapsed subject dropdowns */
              STREAMS[stream].subjects.map((subj) => {
                const list = bySubject[subj] || [];
                const isOpen = !!open[subj];
                return (
                  <div key={subj} className={s.acc}>
                    <button type="button" className={s.accHead} aria-expanded={isOpen} onClick={() => a.toggleOpen(subj)}>
                      <span className={s.chev}>{isOpen ? "\u25BE" : "\u25B8"}</span>
                      <span className={s.accName}>{subj}</span>
                      <span className={s.accMeta}>{list.length} chapters &middot; {fmt(sum(list.map((c) => c.count)))} questions</span>
                    </button>
                    {isOpen && (
                      <div className={s.accBody}>
                        {list.length === 0 ? <div className={s.note}>No {subj} chapters found.</div> : (
                          <ul className={`${s.chList} ${s.scroll}`}>{list.map((c, i) => <ChapterRow key={c.name} index={i} ch={c} />)}</ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              /* Subject wise */
              <>
                <label className={s.label}>Subjects (choose one or more)</label>
                <div className={s.subjectRow} style={{ marginBottom: 20 }}>
                  {exam.subjects.map((subj) => {
                    const on = subjects.includes(subj);
                    const locked = denied.includes(subj);
                    return (
                      <button key={subj} type="button" aria-pressed={on} className={`${s.subjTile} ${on ? s.subjTileOn : ""} ${locked ? s.subjTileLocked : ""}`} onClick={() => a.toggleSubject(subj)}>
                        <span className={`${s.box} ${on ? s.boxOn : ""}`}>{on ? "\u2713" : ""}</span>
                        <span className={s.subjName}>{subj}{locked && <span className={s.lockTag}>No access</span>}</span>
                      </button>
                    );
                  })}
                </div>
                {accessMsg?.where === "subject" && <p className={s.noAccess} role="alert" style={{ marginTop: -8, marginBottom: 16 }}>{accessMsg.text}</p>}

                {subjects.length === 0 ? (
                  <div className={s.note}>Select at least one subject.</div>
                ) : (
                  SUBJECT_ORDER.filter((x) => subjects.includes(x)).map((subj) => {
                    const list = visibleFor(subj);
                    const cls = classOf[subj] || "both";
                    const chosen = list.filter((c) => picked[subj]?.[c.name]).length;
                    const isOpen = !!open[subj];
                    return (
                      <div key={subj} className={`${s.panel} ${s.acc}`}>
                        <div className={s.panelHead}>
                          <button type="button" className={s.panelToggle} aria-expanded={isOpen} onClick={() => a.toggleOpen(subj)}>
                            <span className={s.chev}>{isOpen ? "\u25BE" : "\u25B8"}</span>
                            <span className={s.panelTitle}>{subj}</span>
                          </button>
                          <div className={s.seg} role="group" aria-label={`${subj} class`}>
                            {[["11th", "11th"], ["12th", "12th"], ["both", "11th + 12th"]].map(([val, label]) => (
                              <button key={val} type="button" aria-pressed={cls === val} className={`${s.segBtn} ${cls === val ? s.segOn : ""}`} onClick={() => a.setClass(subj, val)}>{label}</button>
                            ))}
                          </div>
                          <span className={s.panelMeta}>{chosen} of {list.length} chapters selected</span>
                        </div>
                        {isOpen && (
                          <>
                            <div className={s.panelTools}>
                              <button type="button" className={s.linkBtn} onClick={() => a.selectAll(subj)}>Select all</button>
                              <span className={s.sep} />
                              <button type="button" className={s.linkBtn} onClick={() => a.clearAll(subj)}>Clear</button>
                            </div>
                            {list.length === 0 ? <div className={s.note}>No chapters for this selection.</div> : (
                              <ul className={`${s.chList} ${s.scroll}`}>
                                {list.map((c, i) => {
                                  const on = !!picked[subj]?.[c.name];
                                  return (
                                    <li key={c.name} className={`${s.chRow} ${s.pick} ${on ? s.pickOn : ""}`} role="checkbox" aria-checked={on} tabIndex={0}
                                      onClick={() => a.toggleChapter(subj, c.name)}
                                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); a.toggleChapter(subj, c.name); } }}>
                                      <span className={`${s.box} ${on ? s.boxOn : ""}`}>{on ? "\u2713" : ""}</span>
                                      <span className={s.chNum}>{i + 1}</span>
                                      <span className={s.chName}>{c.name}</span>
                                      {c.std && <span className={s.chStd}>{c.std}</span>}
                                      <span className={s.chCount}>{fmt(c.count)} Qs</span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </Card>

          {/* 5. how questions are chosen */}
          <Card step="5" title="Question selection" hint="How should the questions be chosen?">
            <div className={s.modeRow} role="radiogroup" aria-label="Question selection">
              {Object.entries(MODES).map(([id, m]) => (
                <button key={id} type="button" role="radio" aria-checked={mode === id} className={`${s.option} ${mode === id ? s.optionOn : ""}`} onClick={() => a.setMode(id)}>
                  <span className={s.optionName}>{m.name}</span>
                  <span className={s.optionSub}>{m.sub}</span>
                </button>
              ))}
            </div>
          </Card>

          {/* continue bar */}
          <div className={s.summary}>
            <div className={s.sumText}>
              {problem ? <span>{problem}</span> : (
                <>
                  <span><strong>{f.plan.length}</strong> chapter{f.plan.length === 1 ? "" : "s"}</span>
                  <span><strong>{fmt(f.totalQuestions)}</strong> questions in this exam</span>
                  <span>{mode === "auto" ? "Automatic selection" : "Manual selection"}</span>
                </>
              )}
            </div>
            <div className={s.sumActions}>
              <Link href={href("/exams")} className={`${s.btn} ${s.btnGhost}`}>Cancel</Link>
              <button type="button" className={s.btn} disabled={!!problem} onClick={onContinue}>Continue</button>
            </div>
          </div>
        </div>

        <QuestionCounts f={f} a={a} />
      </div>
    </>
  );
}
