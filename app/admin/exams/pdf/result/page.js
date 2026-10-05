// app/admin/exams/pdf/result/page.js  (new file)
//
// The full-screen RESULT window. Opened by the "Create PDF" window (/exams/pdf) when the admin
// presses Generate Teacher Copy / Generate Student Copy. It:
//   1. reads the sheet settings the form left in localStorage (?job=<key>) and builds the PDF,
//   2. offers Preview / Print / Download,
//        Preview  -> the PDF fills this window in the browser's own PDF viewer (Chrome's opener);
//                    a browser with no built-in viewer opens it in the PC's default PDF app/tab,
//        Print    -> the print dialog,
//        Download -> saves the file (normal browser download) and then closes this window,
//   3. offers the OTHER copy (Student when this is the Teacher copy, and the other way round),
//      built with the same settings.
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import s from "../../exams.module.css";
import p from "../pdf.module.css";

const COPY_LABEL = { teacher: "Teacher", student: "Student" };
const otherOf = (c) => (c === "teacher" ? "student" : "teacher");

function saveBlob(blob, name) {
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
        saveBlob(blob, name);
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

  const printResult = () => {
    if (!result) return;
    try {
      if (!inlinePdf()) throw new Error("no viewer");
      const w = frameRef.current?.contentWindow;
      if (!w) throw new Error("no frame");
      w.focus();
      w.print();
    } catch {
      window.open(result.url, "_blank");
    }
  };

  const downloadResult = () => {
    if (!result) return;
    saveBlob(result.blob, result.name);
    // the browser has taken over the download: close this window
    setTimeout(() => { try { window.close(); } catch { /* ignore */ } }, 1500);
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

export default function ExamPdfResultPage() {
  return (
    <Suspense fallback={<div className={p.resWrap}><div className={s.empty}>Loading&hellip;</div></div>}>
      <ResultWindow />
    </Suspense>
  );
}
