// app/admin/exams/leaderboard-pdf/page.js
//
// Leaderboard PDF result window.
// The leaderboard screen stores the visible rows in localStorage under ?draft=...,
// then opens this route. This page reads that draft in the browser and POSTs it to
// the authenticated admin PDF API. The API returns a real PDF generated with PDFKit.
//
// Kept as a separate popup page so it does not need the normal admin sidebar/shell.

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

const LOGO_SRC = "/images/other_images/bihaniclasses-logo.png";

function todayLabel() {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
}

function makeLogoDataUrl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || img.width;
      const h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) return reject(new Error("Logo has no dimensions."));
      const max = 700;
      const scale = Math.min(1, max / Math.max(w0, h0));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w0 * scale));
      canvas.height = Math.max(1, Math.round(h0 * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not prepare the logo."));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Could not load the logo."));
    img.src = src;
  });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function Result() {
  const params = useSearchParams();
  const draftKey = params.get("draft") || "";

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [blob, setBlob] = useState(null);
  const [filename, setFilename] = useState("leaderboard.pdf");
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";

    async function run() {
      if (!draftKey) {
        setStatus("error");
        setError("No leaderboard PDF draft was supplied.");
        return;
      }

      let draft;
      try {
        const raw = localStorage.getItem(draftKey);
        if (!raw) throw new Error("The leaderboard draft was not found. Please close this window and try Download PDF again.");
        draft = JSON.parse(raw);
      } catch (e) {
        if (!alive) return;
        setStatus("error");
        setError(e.message || "Could not read the leaderboard draft.");
        return;
      }

      if (!draft || !Array.isArray(draft.rows)) {
        setStatus("error");
        setError("The leaderboard draft is invalid or empty.");
        return;
      }

      // The logo is optional. If it cannot be loaded, the PDF is still generated.
      let logo = "";
      try {
        logo = await makeLogoDataUrl(LOGO_SRC);
      } catch {
        logo = "";
      }

      try {
        const res = await fetch("/api/admin/leaderboard-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            title: draft.title || "Leaderboard",
            viewLabel: draft.viewLabel || "Best score",
            showAttempt: draft.showAttempt === true,
            rows: draft.rows,
            logo,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `PDF generation failed (${res.status}).`);
        }

        const out = await res.blob();
        if (!alive) return;

        objectUrl = URL.createObjectURL(out);
        const serverFilename = res.headers.get("X-Filename");
        const finalName = serverFilename || "leaderboard.pdf";

        setBlob(out);
        setPdfUrl(objectUrl);
        setFilename(finalName);
        setMeta({
          title: draft.title || "Leaderboard",
          viewLabel: draft.viewLabel || "Best score",
          rows: draft.rows.length,
          generated: todayLabel(),
        });
        setStatus("ready");

        // This draft is only a hand-off between two admin windows. It no longer
        // needs to remain in localStorage once the server has built the PDF.
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      } catch (e) {
        if (!alive) return;
        setStatus("error");
        setError(e.message || "Could not generate the leaderboard PDF.");
      }
    }

    run();

    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [draftKey]);

  const download = () => {
    if (blob) saveBlob(blob, filename);
  };

  const print = () => {
    if (!pdfUrl) return;
    const win = window.open(pdfUrl, "_blank");
    if (win) win.focus();
  };

  if (status === "loading") {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.spinner} />
          <h1 style={styles.h1}>Generating leaderboard PDF…</h1>
          <p style={styles.muted}>Preparing the ranking, summary and student details.</p>
        </section>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main style={styles.page}>
        <section style={styles.card}>
          <div style={styles.errorIcon}>!</div>
          <h1 style={styles.h1}>Could not generate PDF</h1>
          <p style={styles.errorText}>{error}</p>
          <button type="button" style={styles.primary} onClick={() => window.close()}>
            Close window
          </button>
        </section>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.kicker}>BIHANI CLASSES · LEADERBOARD PDF</div>
          <h1 style={styles.h1}>{meta?.title || "Leaderboard"}</h1>
          <p style={styles.muted}>
            {meta?.viewLabel} · {meta?.rows} student{meta?.rows === 1 ? "" : "s"} · {meta?.generated}
          </p>
        </div>
        <div style={styles.actions}>
          <button type="button" style={styles.secondary} onClick={() => window.close()}>
            Close
          </button>
          <button type="button" style={styles.secondary} onClick={print}>
            Open PDF
          </button>
          <button type="button" style={styles.primary} onClick={download}>
            Download PDF
          </button>
        </div>
      </header>

      <section style={styles.viewer}>
        <iframe
          title="Leaderboard PDF preview"
          src={pdfUrl}
          style={styles.iframe}
        />
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    margin: 0,
    padding: "28px",
    boxSizing: "border-box",
    background: "#f3f6fb",
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#0c1438",
  },
  header: {
    maxWidth: "1200px",
    margin: "0 auto 18px",
    padding: "18px 20px",
    background: "#ffffff",
    border: "1px solid #dfe5f1",
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
    boxSizing: "border-box",
  },
  card: {
    width: "min(560px, 100%)",
    margin: "15vh auto 0",
    padding: "36px",
    boxSizing: "border-box",
    background: "#ffffff",
    border: "1px solid #dfe5f1",
    borderRadius: "14px",
    textAlign: "center",
    boxShadow: "0 12px 35px rgba(15,29,94,.08)",
  },
  kicker: {
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "1.2px",
    color: "#315fd2",
    marginBottom: "5px",
  },
  h1: {
    margin: "0",
    fontSize: "22px",
    lineHeight: 1.2,
    fontWeight: 800,
  },
  muted: {
    margin: "7px 0 0",
    color: "#68748e",
    fontSize: "13px",
  },
  actions: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  primary: {
    border: "1px solid #173b9c",
    borderRadius: "7px",
    background: "#173b9c",
    color: "#fff",
    padding: "10px 15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  secondary: {
    border: "1px solid #b9c4da",
    borderRadius: "7px",
    background: "#fff",
    color: "#173b9c",
    padding: "10px 15px",
    fontWeight: 700,
    cursor: "pointer",
  },
  viewer: {
    maxWidth: "1200px",
    height: "calc(100vh - 150px)",
    minHeight: "600px",
    margin: "0 auto",
    background: "#252525",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 14px 40px rgba(12,20,56,.18)",
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: 0,
    display: "block",
    background: "#fff",
  },
  spinner: {
    width: "34px",
    height: "34px",
    margin: "0 auto 20px",
    border: "4px solid #dce4f6",
    borderTopColor: "#315fd2",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  errorIcon: {
    width: "42px",
    height: "42px",
    lineHeight: "42px",
    margin: "0 auto 16px",
    borderRadius: "50%",
    background: "#fde8e8",
    color: "#b42318",
    fontWeight: 900,
    fontSize: "20px",
  },
  errorText: {
    margin: "12px 0 22px",
    color: "#68748e",
    fontSize: "14px",
    lineHeight: 1.5,
  },
};

export default function LeaderboardPdfPage() {
  return (
    <Suspense fallback={
      <main style={styles.page}>
        <section style={styles.card}>
          <h1 style={styles.h1}>Loading leaderboard PDF…</h1>
        </section>
      </main>
    }>
      <Result />
    </Suspense>
  );
}
