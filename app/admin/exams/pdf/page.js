// app/admin/exams/pdf/page.js  (new file)
//
// The "Create PDF" window. Opened from the PDF icon in the Exams table
// (/exams/pdf?id=<exam id>&name=<exam name>) as a small popup. It has no sidebar
// (see isPopupPath in app/admin/layout.js).
//
// The admin fills in the sheet details (and picks a logo) and presses ONE of two buttons:
//   Generate Teacher Copy  (questions + Ans. + Sol. under each question)
//   Generate Student Copy  (questions only -- no answer key, no solutions)
// Pressing a button opens a SECOND, full-screen window (/exams/pdf?job=...) that builds the PDF and
// offers Preview / Print / Download (and a button to make the other copy). The settings are handed
// over through localStorage (see openResult below).
//
// LOGO: a preset (public/images/other_images), an uploaded picture, or none. The browser shrinks it
// (<= 700 px PNG) and sends it as a data URL; the server prints it top-left and uses it as a faded,
// blurred watermark.
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAdminHref } from "@/components/admin/useAdminHref";
import s from "../exams.module.css";
import p from "./pdf.module.css";

const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const LOGOS = [
  { id: "bihani", label: "Bihani Chemistry Classes", src: "/images/other_images/bihaniclasses-logo.png" },
  { id: "bcc", label: "BCC emblem", src: "/images/other_images/bcclogo.png" },
  { id: "bcct", label: "BCC (transparent)", src: "/images/other_images/bcc-bgr.png" },
];
const LOGO_MAX_PX = 700;

// image URL / object URL  ->  PNG data URL no bigger than LOGO_MAX_PX (keeps the request small)
function toLogoDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) { reject(new Error("empty")); return; }
      const k = Math.min(1, LOGO_MAX_PX / Math.max(w0, h0));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w0 * k));
      c.height = Math.max(1, Math.round(h0 * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL("image/png")); } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("load"));
    img.src = src;
  });
}

function Segmented({ value, onChange, options, label }) {
  return (
    <div className={p.seg} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`${p.segBtn} ${value === o.value ? p.segOn : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PdfForm() {
  const params = useSearchParams();
  const href = useAdminHref();
  const examId = params.get("id") || "";
  const examName = params.get("name") || "";

  const [info, setInfo] = useState(() => (examId ? { status: "loading", error: "", data: null } : { status: "error", error: "No exam selected.", data: null }));
  const [useCurrent, setUseCurrent] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [title, setTitle] = useState(examName);
  const [marksInput, setMarksInput] = useState(null); // null = follow the question count
  const [subject, setSubject] = useState("");
  const [columns, setColumns] = useState(2);
  const [logoChoice, setLogoChoice] = useState("bihani"); // preset id | "upload" | "none"
  const [logoData, setLogoData] = useState(""); // PNG data URL sent to the server ("" = no logo)
  const [logoName, setLogoName] = useState("");
  const [logoErr, setLogoErr] = useState("");
  const fileRef = useRef(null);
  const [time, setTime] = useState("");
  const [testId, setTestId] = useState("");
  const [msg, setMsg] = useState({ type: "", text: "" });

  useEffect(() => {
    document.title = "Create PDF";
    if (!examId) return;
    let alive = true;
    fetch(`/api/admin/exam-pdf?id=${encodeURIComponent(examId)}`, { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load the exam.");
        if (!alive) return;
        setInfo({ status: "ready", error: "", data });
        setTitle((t) => t || data.name || "");
        // several subjects (PCM / PCB / Physics+Chemistry): default to the whole exam so the page header
        // shows the real subject line; a single-subject exam just uses that subject
        setSubject((data.subjects?.length || 0) > 1 ? "__all" : data.subjects?.[0]?.subject || "");
      })
      .catch((e) => { if (alive) setInfo({ status: "error", error: e.message || "Failed to load the exam.", data: null }); });
    return () => { alive = false; };
  }, [examId]);

  // preset logo -> data URL
  useEffect(() => {
    const preset = LOGOS.find((l) => l.id === logoChoice);
    if (!preset) return;
    let alive = true;
    setLogoErr("");
    toLogoDataUrl(preset.src)
      .then((d) => { if (alive) setLogoData(d); })
      .catch(() => { if (alive) { setLogoData(""); setLogoErr("Could not load this logo. Choose another one or upload your own."); } });
    return () => { alive = false; };
  }, [logoChoice]);

  const pickNone = () => { setLogoChoice("none"); setLogoData(""); setLogoErr(""); };
  const pickUpload = (file) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setLogoErr("Choose an image file (PNG, JPG, WebP or SVG)."); return; }
    const obj = URL.createObjectURL(file);
    toLogoDataUrl(obj)
      .then((d) => { setLogoChoice("upload"); setLogoData(d); setLogoName(file.name); setLogoErr(""); })
      .catch(() => setLogoErr("That picture could not be read. Try a PNG or JPG."))
      .finally(() => URL.revokeObjectURL(obj));
  };

  const subjects = useMemo(() => info.data?.subjects || [], [info.data]);
  const count = useMemo(() => {
    if (subject === "__all") return info.data?.total || 0;
    return subjects.find((x) => x.subject === subject)?.count || 0;
  }, [subject, subjects, info.data]);

  // marks follows the question count until the admin types their own value
  const marks = marksInput ?? (count ? String(count) : "");

  // Opens the full-screen result window. window.open runs straight from the click (so popup
  // blockers allow it); the window itself builds the PDF with these settings.
  const openResult = (copy) => {
    setMsg({ type: "", text: "" });
    if (!title.trim()) { setMsg({ type: "err", text: "Enter a title for the exam sheet." }); return; }
    if (!useCurrent && !date) { setMsg({ type: "err", text: "Pick the exam date or choose \u201cUse current date\u201d." }); return; }
    const key = `examPdfJob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { id: examId, title, marks, subject, columns, useCurrentDate: useCurrent, date: useCurrent ? "" : date, time, testId, logo: logoData };
    try {
      localStorage.setItem(key, JSON.stringify(job));
    } catch {
      setMsg({ type: "err", text: "Could not pass the settings to the new window (browser storage is full or blocked)." });
      return;
    }
    const w = window.screen?.availWidth || 1280;
    const h = window.screen?.availHeight || 800;
    const url = `${href("/exams/pdf")}?job=${encodeURIComponent(key)}&copy=${copy}`;
    const win = window.open(url, `exam-pdf-result-${examId}`, `popup=yes,width=${w},height=${h},left=0,top=0,resizable=yes,scrollbars=yes`);
    if (!win) {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
      setMsg({ type: "err", text: "The browser blocked the new window. Allow pop-ups for this site and try again." });
      return;
    }
    win.focus();
  };

  const disabled = info.status !== "ready";

  return (
    <div className={p.wrap}>
      <div className={p.head}>
        <span className={p.headIcon} aria-hidden="true">PDF</span>
        <div>
          <h1 className={s.title}>Create PDF</h1>
          <p className={s.subtitle}>
            {info.data?.name || examName || "Exam"}
            {info.data?.exam ? ` \u00b7 ${info.data.exam}` : ""}
            {info.status === "ready" ? ` \u00b7 ${info.data.total} questions` : ""}
          </p>
        </div>
      </div>

      {info.status === "loading" && <div className={s.empty}>Loading exam&hellip;</div>}
      {info.status === "error" && <p className={s.err}>{info.error}</p>}

      {info.status === "ready" && (
        <div className={`${s.card} ${p.card}`}>
          <div className={p.field}>
            <span className={s.label}>Exam date</span>
            <Segmented
              label="Exam date"
              value={useCurrent}
              onChange={setUseCurrent}
              options={[{ value: true, label: "Use current date" }, { value: false, label: "Pick a date" }]}
            />
            {!useCurrent && <input type="date" className={`${s.input} ${p.dateInput}`} value={date} onChange={(e) => setDate(e.target.value)} />}
          </div>

          <div className={p.field}>
            <label className={s.label} htmlFor="pdfTitle">Title of exam sheet</label>
            <input id="pdfTitle" className={s.input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. MHT-CET Mock Test 12" />
          </div>

          <div className={p.row}>
            <div className={p.field}>
              <label className={s.label} htmlFor="pdfSubject">Subject</label>
              <select id="pdfSubject" className={s.input} value={subject} onChange={(e) => setSubject(e.target.value)}>
                {subjects.map((x) => <option key={x.subject} value={x.subject}>{x.subject} ({x.count})</option>)}
                {subjects.length > 1 && <option value="__all">All subjects ({info.data.total})</option>}
              </select>
            </div>
            <div className={p.field}>
              <label className={s.label} htmlFor="pdfMarks">Marks</label>
              <input id="pdfMarks" className={s.input} value={marks} maxLength={20} inputMode="numeric" onChange={(e) => setMarksInput(e.target.value)} />
            </div>
          </div>

          <div className={p.field}>
            <span className={s.label}>Columns</span>
            <Segmented label="Columns" value={columns} onChange={setColumns} options={[{ value: 1, label: "1 column" }, { value: 2, label: "2 columns" }]} />
          </div>

          <div className={p.field}>
            <span className={s.label}>Logo</span>
            <div className={p.logoGrid} role="radiogroup" aria-label="Logo">
              {LOGOS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={logoChoice === l.id} className={`${p.logoTile} ${logoChoice === l.id ? p.logoOn : ""}`} onClick={() => setLogoChoice(l.id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={l.src} alt="" className={p.logoImg} />
                  <span className={p.logoLabel}>{l.label}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={logoChoice === "upload"} className={`${p.logoTile} ${logoChoice === "upload" ? p.logoOn : ""}`} onClick={() => fileRef.current?.click()}>
                {logoChoice === "upload" && logoData
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={logoData} alt="" className={p.logoImg} />
                  : <span className={p.logoPlus} aria-hidden="true">+</span>}
                <span className={p.logoLabel}>{logoChoice === "upload" && logoName ? logoName : "Upload your logo"}</span>
              </button>
              <button type="button" role="radio" aria-checked={logoChoice === "none"} className={`${p.logoTile} ${logoChoice === "none" ? p.logoOn : ""}`} onClick={pickNone}>
                <span className={p.logoPlus} aria-hidden="true">{"\u2205"}</span>
                <span className={p.logoLabel}>No logo</span>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickUpload(e.target.files?.[0]); e.target.value = ""; }} />
            {logoErr && <p className={`${s.err} ${p.logoErr}`}>{logoErr}</p>}
            <p className={p.hint}>{logoChoice === "none" ? "Without a logo the sheet keeps the diagonal text watermark." : "The logo prints in the top-left corner and as a faint, softly blurred watermark behind every page."}</p>
          </div>

          <details className={p.more}>
            <summary>Optional header details</summary>
            <div className={p.row}>
              <div className={p.field}>
                <label className={s.label} htmlFor="pdfTime">Time</label>
                <input id="pdfTime" className={s.input} value={time} maxLength={20} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 00:18:00" />
              </div>
              <div className={p.field}>
                <label className={s.label} htmlFor="pdfTestId">Test ID</label>
                <input id="pdfTestId" className={s.input} value={testId} maxLength={20} onChange={(e) => setTestId(e.target.value)} placeholder="e.g. 23" />
              </div>
            </div>
          </details>

          {msg.text && (
            <p className={msg.type === "ok" ? s.okMsg : s.err}>{msg.text}</p>
          )}

          <div className={p.actions}>
            <button type="button" className={`${s.btn} ${p.btnTeacher}`} disabled={disabled} onClick={() => openResult("teacher")}>
              Generate Teacher Copy
            </button>
            <button type="button" className={`${s.btn} ${p.btnStudent}`} disabled={disabled} onClick={() => openResult("student")}>
              Generate Student Copy
            </button>
          </div>
          <p className={p.note}>Teacher copy shows the answer and solution under every question. Student copy has the questions only, with no answer key and no solutions. The sheet opens in a new full-screen window where you can preview, print or download it.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// RESULT WINDOW -- the second, full-screen window. It is this same page opened with ?job=<key>
// (the form leaves the sheet settings in localStorage under that key), so no extra route is needed.
//   1. builds the PDF from those settings,
//   2. offers Preview / Print / Download,
//        Preview  -> the PDF fills this window in the browser's own PDF viewer (Chrome's opener);
//                    a browser with no built-in viewer opens it in the PC's default PDF app/tab,
//        Print    -> the print dialog,
//        Download -> saves the file (normal browser download) and then closes this window,
//   3. offers the OTHER copy (Student when this is the Teacher copy, and the other way round),
//      built with the same settings.
// ---------------------------------------------------------------------------------------------
const COPY_LABEL = { teacher: "Teacher", student: "Student" };
const otherOf = (c) => (c === "teacher" ? "student" : "teacher");

function saveBlobFile(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function ResultWindow() {
  const params = useSearchParams();
  const jobKey = params.get("job") || "";
  const firstCopy = params.get("copy") === "student" ? "student" : "teacher";

  const jobRef = useRef(null);
  const startedRef = useRef(false);
  const urlRef = useRef("");
  const frameRef = useRef(null);
  const [phase, setPhase] = useState("loading"); // loading | ready | error
  const [copy, setCopy] = useState(firstCopy); // the copy being built / shown
  const [result, setResult] = useState(null); // { blob, url, name, plain }
  const [showPreview, setShowPreview] = useState(false);
  const [err, setErr] = useState({ text: "", offerDocx: false });
  const [note, setNote] = useState("");

  const generate = async (which, format = "pdf") => {
    const job = jobRef.current;
    if (!job) return;
    setCopy(which);
    setErr({ text: "", offerDocx: false });
    setNote("");
    if (format === "pdf") {
      setPhase("loading");
      setShowPreview(false);
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = ""; }
      setResult(null);
    }
    try {
      const res = await fetch("/api/admin/exam-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...job, copy: which, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const e = new Error(data.error || "Could not generate the sheet.");
        e.code = data.code;
        throw e;
      }
      const blob = await res.blob();
      const name = res.headers.get("X-Filename") || `exam-${which}-copy.${format}`;
      if (format === "docx") {
        saveBlobFile(blob, name);
        setNote(`Word file downloaded (${name}).`);
        setPhase("error");
        return;
      }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setResult({ blob, url, name, plain: Number(res.headers.get("X-Math-Fallbacks")) || 0 });
      setPhase("ready");
    } catch (e) {
      const converterProblem = e.code === "CONVERTER_MISSING" || e.code === "CONVERTER_FAILED";
      setErr({ text: e.message || "Could not generate the sheet.", offerDocx: converterProblem });
      setPhase("error");
    }
  };

  // read the settings once and build the first copy
  useEffect(() => {
    document.title = "Exam PDF";
    if (startedRef.current) return;
    startedRef.current = true;
    let raw = null;
    try {
      raw = sessionStorage.getItem(jobKey); // survives a refresh of this window
      if (!raw) {
        raw = localStorage.getItem(jobKey);
        if (raw) { sessionStorage.setItem(jobKey, raw); localStorage.removeItem(jobKey); }
      }
    } catch { /* storage blocked */ }
    try { jobRef.current = raw ? JSON.parse(raw) : null; } catch { jobRef.current = null; }
    if (!jobRef.current) {
      setErr({ text: "The sheet settings are no longer available. Close this window and press Generate again.", offerDocx: false });
      setPhase("error");
      return;
    }
    generate(firstCopy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const inlinePdf = () => typeof navigator === "undefined" || navigator.pdfViewerEnabled !== false;

  const fillScreen = () => {
    try {
      window.moveTo(0, 0);
      window.resizeTo(window.screen.availWidth, window.screen.availHeight);
    } catch { /* browsers may refuse: harmless */ }
  };

  const openPreview = () => {
    if (!result) return;
    if (!inlinePdf()) {
      // no built-in PDF viewer: let the PC's default PDF opener take it
      window.open(result.url, "_blank");
      return;
    }
    fillScreen();
    setShowPreview(true);
  };

  // Opens the PDF in a normal browser tab (next to the main website). A popup window cannot hold
  // tabs, so Chrome puts the new tab into the regular browser window. Returns false if blocked.
  const openInTab = () => {
    try {
      const tab = window.open(result.url, "_blank");
      return !!tab;
    } catch { return false; }
  };

  const closeSoon = (ms) => setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, ms);

  const printResult = () => {
    if (!result) return;
    // open the tab first (it needs this click), then print from this window
    const opened = openInTab();
    if (!inlinePdf()) return; // no built-in viewer: the tab is the PC's PDF opener, print from there
    try {
      const w = frameRef.current?.contentWindow;
      if (!w) throw new Error("no frame");
      window.focus();
      w.focus();
      const t0 = Date.now();
      w.print();
      // Chrome holds this call until the print dialog is closed: only then is it safe to close the window
      if (opened && Date.now() - t0 > 700) closeSoon(800);
    } catch {
      /* the tab with the PDF is already open: print from there */
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const opened = openInTab(); // before the download, while the click is still fresh
    saveBlobFile(result.blob, result.name);
    // keep this window alive long enough for the new tab to load the PDF, then close it
    if (opened) closeSoon(2500);
    else setNote("Downloaded. The browser blocked the extra tab: allow pop-ups to open the PDF in a tab as well.");
  };

  const closeWindow = () => { try { window.close(); } catch { /* ignore */ } };

  const other = otherOf(copy);
  const label = COPY_LABEL[copy];

  return (
    <div className={p.resWrap}>
      <div className={p.resBar}>
        <span className={p.headIcon} aria-hidden="true">PDF</span>
        <div className={p.resBarTitle}>
          <strong>{phase === "ready" ? `${label} copy` : phase === "loading" ? `Building ${label.toLowerCase()} copy\u2026` : "Exam PDF"}</strong>
          {result && <span>{result.name}</span>}
        </div>
        {phase === "ready" && showPreview && (
          <div className={p.resBarBtns}>
            <button type="button" className={`${p.barBtn} ${p.barPrint}`} onClick={printResult}>Print</button>
            <button type="button" className={`${p.barBtn} ${p.barDownload}`} onClick={downloadResult}>Download</button>
            <button type="button" className={`${p.barBtn} ${other === "student" ? p.barStudent : p.barTeacher}`} onClick={() => generate(other)}>Generate {COPY_LABEL[other]} Copy</button>
            <button type="button" className={`${p.barBtn} ${p.barGhost}`} onClick={() => setShowPreview(false)}>{"\u2190"} Back</button>
          </div>
        )}
      </div>

      {phase === "loading" && (
        <div className={p.resCenter}>
          <div className={`${s.card} ${p.card} ${p.resultCard} ${p.resBox}`}>
            <div className={p.spinner} aria-hidden="true" />
            <h2 className={p.resultTitle}>Generating {label.toLowerCase()} copy&hellip;</h2>
            <p className={p.resultName}>This can take a few seconds. Please keep this window open.</p>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className={p.resCenter}>
          <div className={`${s.card} ${p.card} ${p.resBox}`}>
            {err.text && <p className={s.err}>{err.text}</p>}
            {note && <p className={s.okMsg}>{note}</p>}
            <div className={p.actions}>
              {jobRef.current && err.offerDocx && (
                <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => generate(copy, "docx")}>Download Word file instead</button>
              )}
              {jobRef.current && err.text && (
                <button type="button" className={`${s.btn} ${p.btnTeacher}`} onClick={() => generate(copy)}>Try again</button>
              )}
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={closeWindow}>Close window</button>
            </div>
          </div>
        </div>
      )}

      {phase === "ready" && result && (
        <>
          {!showPreview && (
            <div className={p.resCenter}>
              <div className={`${s.card} ${p.card} ${p.resultCard} ${p.resBox}`}>
                <div className={p.resultTop}>
                  <span className={p.tick} aria-hidden="true">{"\u2713"}</span>
                  <div>
                    <h2 className={p.resultTitle}>{label} copy is ready</h2>
                    <p className={p.resultName}>{result.name}</p>
                  </div>
                </div>
                {note && <p className={s.okMsg}>{note}</p>}
                {result.plain > 0 && (
                  <p className={s.err}>{result.plain} equation{result.plain === 1 ? "" : "s"} could not be drawn and printed as plain text. Check the server log for &ldquo;equation renderer unavailable&rdquo;.</p>
                )}
                <div className={p.threeBtns}>
                  <button type="button" className={`${p.big} ${p.bigPreview}`} onClick={openPreview}>
                    <span className={p.bigIcon} aria-hidden="true">{"\u25a3"}</span>Preview
                  </button>
                  <button type="button" className={`${p.big} ${p.bigPrint}`} onClick={printResult}>
                    <span className={p.bigIcon} aria-hidden="true">{"\u2399"}</span>Print
                  </button>
                  <button type="button" className={`${p.big} ${p.bigDownload}`} onClick={downloadResult}>
                    <span className={p.bigIcon} aria-hidden="true">{"\u2193"}</span>Download
                  </button>
                </div>
                <button type="button" className={`${s.btn} ${other === "student" ? p.btnStudent : p.btnTeacher}`} onClick={() => generate(other)}>
                  Generate {COPY_LABEL[other]} Copy
                </button>
              </div>
            </div>
          )}
          {/* kept mounted (so Print works) but out of sight until Preview is pressed */}
          <iframe
            ref={frameRef}
            title="PDF preview"
            src={result.url}
            className={showPreview ? p.frameFull : p.frameHidden}
          />
        </>
      )}
    </div>
  );
}

function PageRouter() {
  const params = useSearchParams();
  return params.get("job") ? <ResultWindow /> : <PdfForm />;
}

export default function ExamPdfPage() {
  return (
    <Suspense fallback={<div className={p.wrap}><div className={s.empty}>Loading&hellip;</div></div>}>
      <PageRouter />
    </Suspense>
  );
}
