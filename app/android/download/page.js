"use client";

import { useEffect, useState } from "react";

export default function DownloadPage() {
  const apkUrl = "/api/download-apk";
  const version = "1.5-gamma";

  const [downloading, setDownloading] = useState(false);
  const [started, setStarted] = useState(false);
  const [theme, setTheme] = useState("light");

  // --- THEME: mirrors the same data-theme / localStorage('theme') scheme
  // used on the main site so this page always matches whatever the user
  // last picked there.
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);

    const onStorage = (e) => {
      if (e.key === "theme" && e.newValue) {
        setTheme(e.newValue);
        document.documentElement.setAttribute("data-theme", e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const handleDownload = () => {
    setDownloading(true);
    setStarted(true);

    const link = document.createElement("a");
    link.href = apkUrl;
    link.setAttribute("download", "");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloading(false);
    }, 2500);
  };

  // Browsers block pages from navigating to chrome://downloads/ via JS
  // (a security restriction, not something we can code around), so instead
  // of a dead button we just tell people where to look.

  return (
    <>
      <style>{`
        :root {
          --dp-bg: #f8f9fa;
          --dp-surface: #ffffff;
          --dp-border: #e8eaed;
          --dp-text: #202124;
          --dp-text-muted: #5f6368;
          --dp-text-soft: #80868b;
          --dp-green: #0a7d4c;
          --dp-green-hover: #086c41;
          --dp-green-faint: #f1f8f4;
          --dp-green-border: #d7eee1;
          --dp-green-border-strong: #b7dcca;
          --dp-yellow: #fbbc04;
          --dp-topbar-bg: rgba(255, 255, 255, 0.96);
        }

        [data-theme="dark"] {
          --dp-bg: #0a1a28;          --dp-surface: #10233a;
          --dp-border: rgba(255, 255, 255, 0.1);
          --dp-text: #f2f7fc;
          --dp-text-muted: #b7c6d6;
          --dp-text-soft: #8ea0b3;
          --dp-green: #17a860;
          --dp-green-hover: #1ec172;
          --dp-green-faint: rgba(23, 168, 96, 0.12);
          --dp-green-border: rgba(23, 168, 96, 0.3);
          --dp-green-border-strong: rgba(23, 168, 96, 0.45);
          --dp-yellow: #fbbf24;
          --dp-topbar-bg: rgba(10, 26, 40, 0.85);
        }

        * {
          box-sizing: border-box;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          background: var(--dp-bg);
        }

        body {
          font-family:
            Inter,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            Helvetica,
            Arial,
            sans-serif;
          color: var(--dp-text);
        }

        button {
          font-family: inherit;
        }

        .download-page {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 50% -10%,
              rgba(10, 125, 76, 0.09),
              transparent 38%
            ),
            var(--dp-bg);
          transition: background-color 0.3s ease, color 0.3s ease;
        }

        /* HEADER */

        .topbar {
          width: 100%;
          height: 72px;
          background: var(--dp-topbar-bg);
          border-bottom: 1px solid var(--dp-border);
          display: flex;
          align-items: center;
          position: sticky;
          top: 0;
          z-index: 50;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          transition: background-color 0.3s ease, border-color 0.3s ease;
        }

        .topbar-inner {
          width: min(1120px, calc(100% - 40px));
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--dp-text);
          font-size: 19px;
          font-weight: 650;
          letter-spacing: -0.25px;
          text-decoration: none;
          cursor: pointer;
        }

        .back-home-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--dp-text-muted);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          margin-bottom: 18px;
        }

        .back-home-link:hover {
          color: var(--dp-green);
        }

        .brand img {
          width: 39px;
          height: 39px;
          object-fit: contain;
          border-radius: 10px;
        }

        .official {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--dp-text-muted);
          font-size: 13px;
        }

        .official-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #34a853;
        }

        /* MAIN */

        .container {
          width: min(1000px, calc(100% - 32px));
          margin: 0 auto;
          padding: 55px 0 70px;
        }

        .hero-card {
          background: var(--dp-surface);
          border: 1px solid var(--dp-border);
          border-radius: 25px;
          padding: 42px;
          box-shadow:
            0 1px 2px rgba(60, 64, 67, 0.08),
            0 6px 24px rgba(60, 64, 67, 0.07);
          transition: background-color 0.3s ease, border-color 0.3s ease;
        }

        /* APP HEADER */

        .app-header {
          display: flex;
          align-items: flex-start;
          gap: 28px;
        }

        .app-icon-wrapper {
          width: 128px;
          height: 128px;
          min-width: 128px;
          border-radius: 29px;
          background: var(--dp-surface);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow:
            0 2px 6px rgba(60, 64, 67, 0.17),
            0 8px 25px rgba(60, 64, 67, 0.09);
        }

        .app-icon {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .app-info {
          flex: 1;
          min-width: 0;
        }

        .app-title {
          margin: 3px 0 8px;
          font-size: clamp(30px, 4vw, 43px);
          line-height: 1.1;
          font-weight: 650;
          letter-spacing: -1.2px;
          color: var(--dp-text);
        }

        .developer {
          margin: 0;
          color: var(--dp-text-muted);
          font-size: 16px;
        }

        .developer strong {
          color: var(--dp-text);
          font-weight: 600;
        }

        .rating-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 21px;
          flex-wrap: wrap;
        }

        .rating-item {
          color: var(--dp-text-muted);
          font-size: 14px;
        }

        .rating-item strong {
          color: var(--dp-text);
          font-weight: 600;
        }

        .separator {
          width: 1px;
          height: 19px;
          background: var(--dp-border);
        }

        .stars {
          color: var(--dp-yellow);
          letter-spacing: 1px;
          font-size: 14px;
        }

        /* DOWNLOAD */

        .download-section {
          margin-top: 42px;
          padding-top: 34px;
          border-top: 1px solid var(--dp-border);
        }

        .download-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 30px;
        }

        .download-description {
          flex: 1;
        }

        .download-description h2 {
          margin: 0 0 7px;
          font-size: 21px;
          line-height: 1.3;
          font-weight: 600;
          color: var(--dp-text);
        }

        .download-description p {
          margin: 0;
          color: var(--dp-text-muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .download-button {
          min-width: 190px;
          height: 52px;
          border: none;
          border-radius: 26px;
          padding: 0 28px;
          background: var(--dp-green);
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow:
            0 2px 4px rgba(0, 0, 0, 0.13),
            0 4px 10px rgba(0, 0, 0, 0.06);
          transition:
            transform 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease;
        }

        .download-button:hover {
          background: var(--dp-green-hover);
          transform: translateY(-1px);
          box-shadow:
            0 3px 7px rgba(0, 0, 0, 0.15),
            0 7px 15px rgba(0, 0, 0, 0.08);
        }

        .download-button:active {
          transform: translateY(1px) scale(0.99);
        }

        .download-button:disabled {
          cursor: default;
          background: var(--dp-green);
        }

        /* SPINNER */

        .spinner {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.35);
          border-top-color: #ffffff;
          animation: spin 0.75s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* STATUS */

        .status-card {
          margin-top: 22px;
          padding: 18px 20px;
          border: 1px solid var(--dp-green-border);
          border-radius: 17px;
          background: var(--dp-green-faint);
          animation: statusIn 0.3s ease;
        }

        @keyframes statusIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .status-top {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .check-circle {
          width: 31px;
          height: 31px;
          min-width: 31px;
          border-radius: 50%;
          background: var(--dp-green);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
        }

        .status-text {
          flex: 1;
        }

        .status-title {
          margin: 0;
          color: var(--dp-text);
          font-size: 14px;
          font-weight: 650;
        }

        .status-subtitle {
          margin: 3px 0 0;
          color: var(--dp-text-muted);
          font-size: 13px;
          line-height: 1.5;
        }

        .downloads-button {
          margin-top: 15px;
          height: 42px;
          padding: 0 19px;
          border: 1px solid var(--dp-green-border-strong);
          border-radius: 21px;
          background: var(--dp-surface);
          color: var(--dp-green);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }

        /* INFO GRID */

        .info-grid {
          margin-top: 34px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border-top: 1px solid var(--dp-border);
        }

        .info-item {
          padding: 20px;
          border-right: 1px solid var(--dp-border);
        }

        .info-item:last-child {
          border-right: none;
        }

        .info-label {
          font-size: 12px;
          color: var(--dp-text-soft);
          margin-bottom: 4px;
        }

        .info-value {
          font-size: 15px;
          font-weight: 650;
          color: var(--dp-text);
        }

        /* INSTALL CARD */

        .install-card {
          background: var(--dp-surface);
          border: 1px solid var(--dp-border);
          border-radius: 25px;
          padding: 34px;
          margin-top: 24px;
          transition: background-color 0.3s ease, border-color 0.3s ease;
        }

        .install-card h2 {
          margin: 0 0 10px;
          font-size: 19px;
          color: var(--dp-text);
        }

        .install-description {
          margin: 0 0 22px;
          color: var(--dp-text-muted);
          font-size: 14px;
          line-height: 1.6;
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .step {
          border: 1px solid var(--dp-border);
          border-radius: 16px;
          padding: 18px;
        }

        .step-number {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: var(--dp-green-faint);
          color: var(--dp-green);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 10px;
        }

        .step h3 {
          margin: 0 0 6px;
          color: var(--dp-text);
          font-size: 14px;
          font-weight: 650;
        }

        .step p {
          margin: 0;
          color: var(--dp-text-muted);
          font-size: 13px;
          line-height: 1.55;
        }

        /* FOOTER */

        .footer {
          padding: 28px 0 0;
          text-align: center;
          color: var(--dp-text-soft);
          font-size: 12px;
        }

        /* TABLET */

        @media (max-width: 760px) {
          .container {
            padding-top: 30px;
          }

          .hero-card {
            padding: 30px;
          }

          .steps {
            grid-template-columns: 1fr;
          }
        }

        /* MOBILE */

        /* --- MOBILE 80% SHRINK (matches the main site: navbar scales
           down together with the rest of the page, no counter-zoom) --- */
        @media (max-width: 900px) {
          html {
            zoom: 0.8;
            -webkit-text-size-adjust: 80%;
          }
        }
        @supports not (zoom: 1) {
          @media (max-width: 900px) {
            html {
              transform: scale(0.8);
              transform-origin: top left;
              width: 125%;
            }
          }
        }

        @media (max-width: 600px) {
          .topbar {
            height: 64px;
          }

          .topbar-inner {
            width: calc(100% - 28px);
          }

          .brand {
            font-size: 16px;
          }

          .brand img {
            width: 34px;
            height: 34px;
          }

          .official {
            font-size: 11px;
          }

          .container {
            width: calc(100% - 20px);
            padding: 20px 0 45px;
          }

          .hero-card {
            padding: 22px 17px;
            border-radius: 20px;
          }

          .app-header {
            gap: 17px;
          }

          .app-icon-wrapper {
            width: 84px;
            height: 84px;
            min-width: 84px;
            border-radius: 20px;
          }

          .app-title {
            margin: 0 0 6px;
            font-size: 25px;
            letter-spacing: -0.6px;
          }

          .developer {
            font-size: 13px;
          }

          .rating-row {
            margin-top: 12px;
            gap: 9px;
          }

          .rating-item {
            font-size: 12px;
          }

          .stars {
            font-size: 11px;
          }

          .separator {
            height: 15px;
          }

          .download-section {
            margin-top: 27px;
            padding-top: 25px;
          }

          .download-row {
            display: block;
          }

          .download-description h2 {
            font-size: 18px;
          }

          .download-description p {
            font-size: 13px;
          }

          .download-button {
            width: 100%;
            margin-top: 18px;
          }

          .status-card {
            padding: 17px;
          }

          .status-subtitle {
            font-size: 12px;
          }

          .downloads-button {
            width: 100%;
          }

          .info-grid {
            grid-template-columns: 1fr 1fr;
            margin-top: 25px;
          }

          .info-item {
            padding: 16px;
            border-right: none;
            border-bottom: 1px solid var(--dp-border);
          }

          .info-item:nth-child(odd) {
            border-right: 1px solid var(--dp-border);
          }

          .info-item:last-child {
            border-bottom: none;
          }

          .info-value {
            font-size: 14px;
          }

          .install-card {
            padding: 22px 18px;
            border-radius: 18px;
          }

          .steps {
            gap: 10px;
          }

          .step {
            display: grid;
            grid-template-columns: 30px 1fr;
            column-gap: 12px;
            padding: 14px;
          }

          .step-number {
            grid-row: span 2;
            margin: 0;
          }
        }

        @media (max-width: 390px) {
          .official {
            display: none;
          }

          .app-header {
            align-items: center;
          }

          .app-icon-wrapper {
            width: 72px;
            height: 72px;
            min-width: 72px;
          }

          .app-title {
            font-size: 22px;
          }

          .rating-row {
            display: none;
          }
        }
      `}</style>

      <main className="download-page">
        <header className="topbar">
          <div className="topbar-inner">
            <a href="/" className="brand">
              <img
                src="/images/other_images/ynclasses-logo.png"
                alt="YN CLASSES"
              />
              <span>YN CLASSES</span>
            </a>

            <div className="official">
              <span className="official-dot" />
              Official app download
            </div>
          </div>
        </header>

        <div className="container">
          <a href="/" className="back-home-link">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to home
          </a>

          <section className="hero-card">
            <div className="app-header">
              <div className="app-icon-wrapper">
                <img
                  className="app-icon"
                  src="/images/other_images/ynclasses-logo.png"
                  alt="YN CLASSES Student App"
                />
              </div>

              <div className="app-info">
                <h1 className="app-title">YN CLASSES</h1>

                <p className="developer">
                  <strong>YN CLASSES</strong> • Student App
                </p>

                <div className="rating-row">
                  <div className="rating-item">
                    <strong>Education</strong>
                  </div>

                  <span className="separator" />

                  <div className="rating-item">
                    <strong>Android</strong>
                  </div>

                  <span className="separator" />

                  <div className="rating-item">
                    <span className="stars">★★★★★</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="download-section">
              <div className="download-row">
                <div className="download-description">
                  <h2>Download the YN CLASSES app</h2>

                  <p>
                    Get the latest version of the official YN CLASSES Student
                    App for Android.
                  </p>
                </div>

                <button
                  type="button"
                  className="download-button"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading ? (
                    <>
                      <span className="spinner" />
                      Starting download…
                    </>
                  ) : started ? (
                    "Download again"
                  ) : (
                    "Download APK"
                  )}
                </button>
              </div>

              {started && (
                <div className="status-card">
                  <div className="status-top">
                    <div className="check-circle">✓</div>

                    <div className="status-text">
                      <p className="status-title">
                        Download started in Chrome
                      </p>

                      <p className="status-subtitle">
                        Chrome is handling the download. Pull down your
                        notification shade, or check your Files/Downloads
                        app, for the exact progress.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="info-grid">
              <div className="info-item">
                <div className="info-label">Version</div>
                <div className="info-value">{version}</div>
              </div>

              <div className="info-item">
                <div className="info-label">Platform</div>
                <div className="info-value">Android</div>
              </div>

              <div className="info-item">
                <div className="info-label">Format</div>
                <div className="info-value">APK</div>
              </div>
            </div>
          </section>

          <section className="install-card">
            <h2>How to install</h2>

            <p className="install-description">
              Download the APK and install it on your Android device. If
              Android asks for permission, allow your browser to install
              apps.
            </p>

            <div className="steps">
              <div className="step">
                <div className="step-number">1</div>

                <div>
                  <h3>Download</h3>

                  <p>
                    Tap <strong>Download APK</strong> and let Chrome download
                    the file.
                  </p>
                </div>
              </div>

              <div className="step">
                <div className="step-number">2</div>

                <div>
                  <h3>Open the APK</h3>

                  <p>
                    Open the downloaded APK from Chrome Downloads or your
                    Downloads folder.
                  </p>
                </div>
              </div>

              <div className="step">
                <div className="step-number">3</div>

                <div>
                  <h3>Install</h3>

                  <p>
                    Follow Android's installation screen to install YN
                    CLASSES.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <footer className="footer">
            YN CLASSES Student App • Version {version}
          </footer>
        </div>
      </main>
    </>
  );
}
