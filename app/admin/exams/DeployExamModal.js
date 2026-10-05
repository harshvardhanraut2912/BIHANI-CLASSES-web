// app/admin/exams/DeployExamModal.js  (new file)
//
// The "Online exam" popup on Admin -> Exams.
//   * exam already has a product  -> shows the linked product(s) (+ "Deploy another").
//   * exam has no product yet     -> step-by-step wizard that creates a product the same
//                                    way the Courses page does (POST /api/admin/products,
//                                    product_type "exam", linked_exam_v2_id = this exam):
//        1 Details   -> title, instructor, free / paid, thumbnail
//        2 Listing   -> Course > Subsection > Chapter it is listed under (chapter can be created here)
//        3 Schedule  -> run anytime, or a start / end window + result time, and duration
//        4 Marking   -> + / - marks per subject (pre-filled from the exam's subjects)
//        5 Review    -> check everything, then Deploy
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./deploy.module.css";
import ImageUploader from "@/components/admin/ImageUploader";

const STEPS = ["Details", "Listing", "Schedule", "Marking", "Review"];

const api = (url, method, body) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}

/* ---------------------------------------------------------------- helpers */

const pad = (n) => String(n).padStart(2, "0");
const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toIso = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const niceDate = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Maths = 2 marks per question, every other subject = 1 mark. No negative marking by default.
function defaultMarks(subject) {
  return { pos: /math/i.test(subject) ? 2 : 1, neg: 0 };
}

function defaultDuration(examType, total) {
  const t = String(examType || "").toUpperCase();
  if (t.includes("JEE") || t.includes("NEET")) return 180;
  if (!total) return 90;
  return Math.max(15, Math.round((total * 1.2) / 5) * 5);
}

function sectionId(name) {
  const n = String(name).toLowerCase();
  if (n.startsWith("phy")) return "phy_sec";
  if (n.startsWith("chem")) return "chem_sec";
  if (n.startsWith("math")) return "math_sec";
  if (n.startsWith("bio")) return "bio_sec";
  return `${n.replace(/[^a-z0-9]+/g, "_")}_sec`;
}

function Field({ label, help, children }) {
  return (
    <div className={s.field}>
      {label && <label className={s.label}>{label}</label>}
      {children}
      {help && <div className={s.help}>{help}</div>}
    </div>
  );
}

function Shell({ title, sub, onClose, children, footer, steps }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={s.overlay}>
      <div className={s.modal} role="dialog" aria-label={title}>
        <div className={s.mHead}>
          <div>
            <h3 className={s.mTitle}>{title}</h3>
            {sub && <p className={s.mSub}>{sub}</p>}
          </div>
          <button type="button" className={s.mX} onClick={onClose} aria-label="Close">&#10005;</button>
        </div>
        {steps}
        <div className={s.mBody}>{children}</div>
        {footer && <div className={s.mFoot}>{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- already linked */

function LinkedView({ exam, linked, onClose, onNew }) {
  return (
    <Shell
      title="Online exam"
      sub={exam.mock_test_name || exam.id}
      onClose={onClose}
      footer={
        <>
          <button type="button" style={ghost} onClick={onNew}>+ Deploy another version</button>
          <button type="button" style={primary} onClick={onClose}>Close</button>
        </>
      }
    >
      <p className={s.note}>This exam is already live as {linked.length === 1 ? "a product" : `${linked.length} products`}. Edit or delete it from Courses &rarr; the chapter it is listed in.</p>
      {linked.map((p) => (
        <div key={p.id} className={s.prodCard}>
          <div className={s.prodTitle}>{p.title}</div>
          <div className={s.prodMeta}>
            <span className={s.tag}>{p.is_paid ? `\u20B9${p.price}` : "Free"}</span>
            <span className={s.tag}>{p.is_scheduled ? "Scheduled" : "Anytime"}</span>
            {p.is_scheduled && <span>{niceDate(p.scheduled_start_at)} &rarr; {niceDate(p.scheduled_end_at)}</span>}
          </div>
          <div className={s.prodMeta}>Listed under: {p.path || "(chapter not found)"}</div>
          <div className={s.prodMeta}>Product id: <span className={s.mono}>{p.id}</span></div>
        </div>
      ))}
    </Shell>
  );
}

const primary = { height: 40, padding: "0 20px", border: "1px solid #172a85", borderRadius: 2, background: "#172a85", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const ghost = { height: 40, padding: "0 20px", border: "1px solid #172a85", borderRadius: 2, background: "#fff", color: "#172a85", fontSize: 14, fontWeight: 700, cursor: "pointer" };

/* ---------------------------------------------------------------- wizard */

function Wizard({ exam, onClose, onDeployed }) {
  const [step, setStep] = useState(0);
  const [info, setInfo] = useState(null); // { total, subjects, exam }
  const [loadErr, setLoadErr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // created product

  // step 1
  const [title, setTitle] = useState(exam.mock_test_name || exam.id);
  const [instructor, setInstructor] = useState("CETWALLE");
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState(0);
  const [thumb, setThumb] = useState("");

  // step 2
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [tree, setTree] = useState(null); // course with subsections[].chapters[]
  const [treeBusy, setTreeBusy] = useState(false);
  const [subId, setSubId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [newChapter, setNewChapter] = useState("");
  const [addingChapter, setAddingChapter] = useState(false);

  // step 3
  const [mode, setMode] = useState("anytime"); // anytime | scheduled
  const [duration, setDuration] = useState(90);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [resultAt, setResultAt] = useState("");

  // step 4
  const [marks, setMarks] = useState({}); // { subject: { pos, neg } }
  const [counts, setCounts] = useState({}); // { subject: question count } (auto-filled from the exam, editable)

  /* load exam subjects + courses once */
  useEffect(() => {
    let alive = true;
    getJson(`/api/admin/exam-deploy?exam=${encodeURIComponent(exam.id)}`)
      .then((d) => {
        if (!alive) return;
        setInfo(d);
        setDuration(defaultDuration(d.exam, d.total));
        setMarks(Object.fromEntries(d.subjects.map((x) => [x.name, defaultMarks(x.name)])));
        setCounts(Object.fromEntries(d.subjects.map((x) => [x.name, x.count])));
      })
      .catch((e) => alive && setLoadErr(e.message || "Could not load the exam."));
    getJson("/api/admin/courses")
      .then((d) => alive && setCourses(Array.isArray(d) ? d : []))
      .catch(() => alive && setLoadErr((p) => p || "Could not load courses."));
    return () => { alive = false; };
  }, [exam.id]);

  const loadTree = useCallback(async (id) => {
    setTreeBusy(true);
    try {
      setTree(await getJson(`/api/admin/courses?id=${encodeURIComponent(id)}`));
    } catch (e) {
      setErr(e.message || "Could not load this course.");
      setTree(null);
    } finally {
      setTreeBusy(false);
    }
  }, []);

  const pickCourse = (id) => {
    setCourseId(id); setSubId(""); setChapterId(""); setTree(null); setErr("");
    if (id) loadTree(id);
  };
  const pickSub = (id) => { setSubId(id); setChapterId(""); setErr(""); };

  const subsections = tree?.subsections || [];
  const sub = subsections.find((x) => x.id === subId);
  const chapters = sub?.chapters || [];
  const course = courses.find((c) => c.id === courseId);
  const chapter = chapters.find((c) => c.id === chapterId);

  const addChapter = async () => {
    if (!newChapter.trim() || !subId) return;
    setAddingChapter(true);
    setErr("");
    try {
      const res = await api("/api/admin/chapters", "POST", { subsection_id: subId, name: newChapter.trim() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not add the chapter.");
      setNewChapter("");
      await loadTree(courseId);
      const created = Array.isArray(data) ? data[0] : data;
      if (created?.id) setChapterId(created.id);
    } catch (e) {
      setErr(e.message);
    } finally {
      setAddingChapter(false);
    }
  };

  /* schedule presets */
  const applyWindow = (start) => {
    const d = Number(duration) || 90;
    const end = new Date(start.getTime() + (d + 60) * 60000); // exam length + 1h window
    setStartAt(toInput(start));
    setEndAt(toInput(end));
    setResultAt(toInput(new Date(end.getTime() + 30 * 60000)));
  };
  const presetIn1h = () => { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); applyWindow(d); };
  const presetTomorrow = (h) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, 0, 0, 0); applyWindow(d); };
  const presetSunday = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
    d.setHours(10, 0, 0, 0);
    applyWindow(d);
  };

  const subjects = info?.subjects || [];
  const countOf = (x) => (counts[x.name] === undefined || counts[x.name] === "" ? x.count : Number(counts[x.name]) || 0);
  const maxMarks = useMemo(
    () => subjects.reduce((t, x) => t + (counts[x.name] === undefined || counts[x.name] === "" ? x.count : Number(counts[x.name]) || 0) * (Number(marks[x.name]?.pos) || 0), 0),
    [subjects, marks, counts]
  );

  /* validation per step */
  const check = (n) => {
    if (n === 0) {
      if (!title.trim()) return "Enter a title for the product.";
      if (isPaid && !(Number(price) > 0)) return "Enter the price for a paid exam.";
    }
    if (n === 1) {
      if (!courseId) return "Choose the course this exam will be listed in.";
      if (!subId) return "Choose a subsection.";
      if (!chapterId) return "Choose a chapter (or create a new one).";
    }
    if (n === 2) {
      if (!(Number(duration) > 0)) return "Enter the exam duration in minutes.";
      if (mode === "scheduled") {
        if (!startAt || !endAt) return "Set both a start and an end date/time.";
        const a = new Date(startAt).getTime(), b = new Date(endAt).getTime();
        if (b <= a) return "The end time must be after the start time.";
        if (resultAt && new Date(resultAt).getTime() < b) return "The result time cannot be before the end time.";
        if ((b - a) / 60000 < Number(duration)) return "The window between start and end is shorter than the exam duration.";
      }
    }
    return "";
  };

  const next = () => {
    const m = check(step);
    if (m) return setErr(m);
    setErr("");
    setStep((x) => x + 1);
  };
  const back = () => { setErr(""); setStep((x) => Math.max(0, x - 1)); };

  const deploy = async () => {
    for (let i = 0; i < 3; i++) { const m = check(i); if (m) { setStep(i); return setErr(m); } }
    setBusy(true);
    setErr("");
    const prefix = title.toLowerCase().trim().replace(/[^a-z0-9]/g, "_");
    const sections = subjects.map((x) => ({
      id: sectionId(x.name),
      name: x.name,
      totalQuestions: countOf(x),
      positiveMarks: Number(marks[x.name]?.pos) || 0,
      negativeMarks: Number(marks[x.name]?.neg) || 0,
      paperAllocation: Number(marks[x.name]?.pos) || 0,
      imagePrefix: `${prefix}_${sectionId(x.name).replace("_sec", "")}_q`,
    }));
    const sched = mode === "scheduled";
    try {
      const res = await api("/api/admin/products", "POST", {
        chapter_id: chapterId,
        title: title.trim(),
        instructor: instructor.trim() || "CETWALLE",
        product_type: "exam",
        is_paid: isPaid,
        price: isPaid ? Number(price) : 0,
        thumbnail_url: thumb || null,
        document_path: "",
        allow_download: false,
        duration_mins: Number(duration),
        linked_exam_v2_id: exam.id,
        extension: ".pdf",
        sections: JSON.stringify(sections),
        is_scheduled: sched,
        scheduled_start_at: sched ? toIso(startAt) : null,
        scheduled_end_at: sched ? toIso(endAt) : null,
        result_declared_at: sched ? toIso(resultAt) : null,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not deploy the exam.");
      setDone(data);
      onDeployed(data);
    } catch (e) {
      setErr(e.message || "Could not deploy the exam.");
    } finally {
      setBusy(false);
    }
  };

  /* ---- finished ---- */
  if (done) {
    return (
      <Shell title="Exam deployed" sub={exam.mock_test_name || exam.id} onClose={onClose} footer={<span />}>
        <div className={s.okBox}>
          <div className={s.okTick}>&#10003;</div>
          <h4 className={s.okTitle}>{done.title || title} is now online</h4>
          <p className={s.mSub}>Listed under {[course?.name, sub?.name, chapter?.name].filter(Boolean).join(" \u203A ")}.<br />Students with access can see it in that chapter.</p>
          <div style={{ marginTop: 18 }}><button type="button" style={primary} onClick={onClose}>Done</button></div>
        </div>
      </Shell>
    );
  }

  const stepper = (
    <div className={s.steps}>
      {STEPS.map((n, i) => (
        <div key={n} className={`${s.step} ${i === step ? s.stepOn : ""} ${i < step ? s.stepDone : ""}`}>
          <div className={s.stepBar} />
          <div className={s.stepName}>{i + 1}. {n}</div>
        </div>
      ))}
    </div>
  );

  const footer = (
    <>
      <button type="button" style={ghost} onClick={step === 0 ? onClose : back} disabled={busy}>{step === 0 ? "Cancel" : "\u2190 Back"}</button>
      <div className={s.footRight}>
        {step < STEPS.length - 1
          ? <button type="button" style={primary} onClick={next} disabled={!info && !loadErr}>Next &rarr;</button>
          : <button type="button" style={{ ...primary, opacity: busy ? 0.6 : 1 }} onClick={deploy} disabled={busy}>{busy ? "Deploying\u2026" : "Deploy exam online"}</button>}
      </div>
    </>
  );

  return (
    <Shell title="Deploy exam online" sub={`${exam.mock_test_name || exam.id}${info ? ` \u00b7 ${info.total} questions` : ""}`} onClose={onClose} steps={stepper} footer={footer}>
      {loadErr && <p className={s.msg}>{loadErr}</p>}
      {err && <p className={s.msg}>{err}</p>}

      {step === 0 && (
        <>
          <p className={s.note}>This creates a student-facing product linked to this exam&apos;s questions &mdash; the same as adding an exam product in Courses.</p>
          <Field label="Title (what students see)">
            <input className={s.input} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
          <Field label="Instructor">
            <input className={s.input} value={instructor} onChange={(e) => setInstructor(e.target.value)} />
          </Field>
          <div className={s.field}>
            <label className={s.check}><input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /> Paid exam</label>
            {isPaid && (
              <div style={{ marginTop: 8, maxWidth: 200 }}>
                <input type="number" min="0" className={s.input} placeholder="Price (\u20B9)" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
            )}
          </div>
          <div className={s.field}>
            <ImageUploader bucket="thumbnails" label="Thumbnail" value={thumb} onUploaded={setThumb} />
            {!thumb && <div className={s.help}>Optional, but students see a plain card without one.</div>}
          </div>
        </>
      )}

      {step === 1 && (
        <div className={s.pickRow}>
          <Field label="Course">
            <select className={s.input} value={courseId} onChange={(e) => pickCourse(e.target.value)}>
              <option value="">&mdash; choose a course &mdash;</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Subsection" help={courseId && !treeBusy && subsections.length === 0 ? "This course has no subsections yet. Add one in Courses first." : undefined}>
            <select className={s.input} value={subId} onChange={(e) => pickSub(e.target.value)} disabled={!courseId || treeBusy}>
              <option value="">{treeBusy ? "Loading\u2026" : "\u2014 choose a subsection \u2014"}</option>
              {subsections.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Chapter">
            <select className={s.input} value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={!subId}>
              <option value="">&mdash; choose a chapter &mdash;</option>
              {chapters.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {subId && (
              <div className={s.newChapter}>
                <input className={s.input} placeholder="…or create a new chapter here" value={newChapter} onChange={(e) => setNewChapter(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChapter()} />
                <button type="button" style={{ ...ghost, flex: "none" }} onClick={addChapter} disabled={addingChapter || !newChapter.trim()}>{addingChapter ? "Adding\u2026" : "+ Add"}</button>
              </div>
            )}
          </Field>
        </div>
      )}

      {step === 2 && (
        <>
          <div className={s.choices}>
            <button type="button" className={`${s.choice} ${mode === "anytime" ? s.choiceOn : ""}`} onClick={() => setMode("anytime")}>
              <div className={s.choiceTitle}>Anytime</div>
              <div className={s.choiceSub}>Students can start it whenever they like.</div>
            </button>
            <button type="button" className={`${s.choice} ${mode === "scheduled" ? s.choiceOn : ""}`} onClick={() => setMode("scheduled")}>
              <div className={s.choiceTitle}>Scheduled</div>
              <div className={s.choiceSub}>Opens and closes at set times, with a result time.</div>
            </button>
          </div>

          <Field label="Duration (minutes)" help={info ? `Suggested for ${info.total} questions. Change if needed.` : undefined}>
            <input type="number" min="1" className={s.input} style={{ maxWidth: 200 }} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>

          {mode === "scheduled" && (
            <div className={s.subBox}>
              <div className={s.presets}>
                <button type="button" className={s.chip} onClick={presetIn1h}>In 1 hour</button>
                <button type="button" className={s.chip} onClick={() => presetTomorrow(10)}>Tomorrow 10 AM</button>
                <button type="button" className={s.chip} onClick={() => presetTomorrow(16)}>Tomorrow 4 PM</button>
                <button type="button" className={s.chip} onClick={presetSunday}>Next Sunday 10 AM</button>
              </div>
              <div className={s.grid2}>
                <Field label="Starts"><input type="datetime-local" className={s.input} value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
                <Field label="Ends (last time to start)"><input type="datetime-local" className={s.input} value={endAt} onChange={(e) => setEndAt(e.target.value)} /></Field>
                <Field label="Result declared at"><input type="datetime-local" className={s.input} value={resultAt} onChange={(e) => setResultAt(e.target.value)} /></Field>
              </div>
              <div className={s.help}>A preset fills start, end (duration + 1 hour) and result (30 min after end); adjust freely. Result time is optional.</div>
            </div>
          )}
        </>
      )}

      {step === 3 && (
        <>
          {subjects.length === 0 && <p className={s.warn}>This exam has no subject information, so marks default to +1 / 0.</p>}
          {subjects.length > 0 && (
            <>
              <div className={s.markHead}><span>Subject</span><span>Questions</span><span>Marks +</span><span>Marks &minus;</span></div>
              {subjects.map((x) => (
                <div key={x.name} className={s.markRow}>
                  <span className={s.markName}>{x.name}</span>
                  <input type="number" min="0" className={s.input} title={`Exam has ${x.count} ${x.name} questions`} value={counts[x.name] ?? x.count} onChange={(e) => setCounts((p) => ({ ...p, [x.name]: e.target.value }))} />
                  <input type="number" min="0" className={s.input} value={marks[x.name]?.pos ?? 1} onChange={(e) => setMarks((p) => ({ ...p, [x.name]: { ...p[x.name], pos: e.target.value } }))} />
                  <input type="number" min="0" className={s.input} value={marks[x.name]?.neg ?? 0} onChange={(e) => setMarks((p) => ({ ...p, [x.name]: { ...p[x.name], neg: e.target.value } }))} />
                </div>
              ))}
              <div className={s.markTotal}>Maximum marks: <strong>{maxMarks}</strong></div>
              <div className={s.help}>Question counts are filled from the exam (edit if needed). Maths is 2 marks per question, other subjects 1 mark. Enter negative marks as a positive number.</div>
            </>
          )}
        </>
      )}

      {step === 4 && (
        <>
          <p className={s.note}>Check the details, then deploy. You can edit the product later from Courses.</p>
          <div className={s.review}>
            <div className={s.rRow}><span className={s.rKey}>Exam</span><span className={s.rVal}>{exam.mock_test_name || exam.id} ({info?.total ?? "?"} questions)</span></div>
            <div className={s.rRow}><span className={s.rKey}>Title</span><span className={s.rVal}>{title}</span></div>
            <div className={s.rRow}><span className={s.rKey}>Instructor</span><span className={s.rVal}>{instructor || "CETWALLE"}</span></div>
            <div className={s.rRow}><span className={s.rKey}>Price</span><span className={s.rVal}>{isPaid ? `\u20B9${price}` : "Free"}</span></div>
            <div className={s.rRow}><span className={s.rKey}>Thumbnail</span><span className={s.rVal}>{thumb ? <img src={thumb} alt="" className={s.thumbPrev} /> : "None"}</span></div>
            <div className={s.rRow}><span className={s.rKey}>Listed under</span><span className={s.rVal}>{[course?.name, sub?.name, chapter?.name].filter(Boolean).join(" \u203A ")}</span></div>
            <div className={s.rRow}><span className={s.rKey}>Availability</span><span className={s.rVal}>{mode === "anytime" ? "Anytime" : `${niceDate(startAt)} \u2192 ${niceDate(endAt)}`}</span></div>
            {mode === "scheduled" && <div className={s.rRow}><span className={s.rKey}>Result</span><span className={s.rVal}>{resultAt ? niceDate(resultAt) : "Not set"}</span></div>}
            <div className={s.rRow}><span className={s.rKey}>Duration</span><span className={s.rVal}>{duration} min</span></div>
            <div className={s.rRow}><span className={s.rKey}>Marking</span><span className={s.rVal}>{subjects.map((x) => `${x.name}: ${countOf(x)} q \u00d7 +${marks[x.name]?.pos ?? 1} / \u2212${marks[x.name]?.neg ?? 0}`).join(" \u00b7 ") || "+1 / 0"} &nbsp;(max {maxMarks})</span></div>
          </div>
        </>
      )}
    </Shell>
  );
}

/* ---------------------------------------------------------------- entry */

export default function DeployExamModal({ exam, linked = [], onClose, onDeployed }) {
  // decided once on open, so the wizard's "done" screen survives the list refreshing after a deploy
  const [view, setView] = useState(linked.length > 0 ? "linked" : "wizard");
  if (view === "linked") {
    return <LinkedView exam={exam} linked={linked} onClose={onClose} onNew={() => setView("wizard")} />;
  }
  return <Wizard exam={exam} onClose={onClose} onDeployed={onDeployed} />;
}
