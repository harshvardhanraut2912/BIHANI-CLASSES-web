// SAVE THIS FILE AT: app/admin/maintenance/page.js  (new file, new folder)
//
// Dedicated admin page with a single toggle for site-wide maintenance
// mode. Reads/writes via /api/admin/maintenance, which is itself gated
// by proxy.js's admin cookie check. When ON, proxy.js serves
// public/maintenance.html for every url on the site except /admin/* and
// /api/admin/* (so this page always stays reachable to turn it back off).

"use client";

import { useState, useEffect } from "react";

export default function MaintenanceModePage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState({ updatedAt: null, updatedBy: null });

  const [appEnabled, setAppEnabled] = useState(false);
  const [appSaving, setAppSaving] = useState(false);
  const [appError, setAppError] = useState("");
  const [appMeta, setAppMeta] = useState({ updatedAt: null, updatedBy: null });

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    setLoading(true);
    setError("");
    setAppError("");
    try {
      const res = await fetch("/api/admin/maintenance");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load status.");
      setEnabled(!!data.enabled);
      setMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy });
      setAppEnabled(!!data.appEnabled);
      setAppMeta({ updatedAt: data.appUpdatedAt, updatedBy: data.appUpdatedBy });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const next = !enabled;
    const confirmMsg = next
      ? "Turn ON maintenance mode?\n\nEvery visitor on the entire website will immediately see the 'Under Maintenance' page, on every URL, until you turn this back off."
      : "Turn OFF maintenance mode?\n\nThe website will go back to normal for everyone.";
    if (!window.confirm(confirmMsg)) return;

    const password = window.prompt("Enter the maintenance password to confirm:");
    if (password === null) return; // user cancelled the prompt
    if (!password) {
      setError("Password is required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update.");
      setEnabled(next);
      setMeta({ updatedAt: new Date().toISOString(), updatedBy: meta.updatedBy });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAppToggle() {
    const next = !appEnabled;
    const confirmMsg = next
      ? "Turn ON app maintenance mode?\n\nEvery logged-in user in the mobile app will immediately see the 'App Under Construction' screen instead of any app content, until you turn this back off. Login itself keeps working normally."
      : "Turn OFF app maintenance mode?\n\nThe mobile app will go back to normal for everyone.";
    if (!window.confirm(confirmMsg)) return;

    const password = window.prompt("Enter the maintenance password to confirm:");
    if (password === null) return; // user cancelled the prompt
    if (!password) {
      setAppError("Password is required.");
      return;
    }

    setAppSaving(true);
    setAppError("");
    try {
      const res = await fetch("/api/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appEnabled: next, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update.");
      setAppEnabled(next);
      setAppMeta({ updatedAt: new Date().toISOString(), updatedBy: appMeta.updatedBy });
    } catch (e) {
      setAppError(e.message);
    } finally {
      setAppSaving(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.stack}>
        <div style={styles.card}>
          <div style={{ ...styles.statusDot, background: enabled ? "#ef4444" : "#22c55e" }} />
          <h1 style={styles.title}>Website Maintenance Mode</h1>
          <p style={styles.sub}>
            Instantly take the entire website offline for visitors and show an
            "Under Maintenance" page on every URL &mdash; even URLs not
            normally handled by the site. The admin panel itself always stays
            reachable so you can switch this back off.
          </p>

          {loading ? (
            <div style={styles.loadingText}>Checking current status&hellip;</div>
          ) : (
            <>
              <div style={styles.statusRow}>
                <span>Current status:</span>
                <strong style={{ color: enabled ? "#ef4444" : "#22c55e" }}>
                  {enabled ? "MAINTENANCE MODE IS ON" : "Site is LIVE"}
                </strong>
              </div>

              <button
                onClick={handleToggle}
                disabled={saving}
                style={{
                  ...styles.toggleBtn,
                  background: enabled
                    ? "linear-gradient(135deg,#22c55e,#16a34a)"
                    : "linear-gradient(135deg,#ef4444,#b91c1c)",
                }}
              >
                {saving
                  ? "Saving..."
                  : enabled
                  ? "Turn OFF Maintenance Mode"
                  : "Turn ON Maintenance Mode"}
              </button>

              {meta.updatedBy && (
                <p style={styles.metaText}>
                  Last changed by {meta.updatedBy}
                  {meta.updatedAt ? ` on ${new Date(meta.updatedAt).toLocaleString()}` : ""}
                </p>
              )}
            </>
          )}

          {error && <p style={styles.errorText}>{error}</p>}

          {enabled && (
            <a href="/maintenance.html" target="_blank" rel="noreferrer" style={styles.previewLink}>
              Preview what visitors currently see &rarr;
            </a>
          )}
        </div>

        <div style={styles.card}>
          <div style={{ ...styles.statusDot, background: appEnabled ? "#ef4444" : "#22c55e" }} />
          <h1 style={styles.title}>App Maintenance Mode</h1>
          <p style={styles.sub}>
            Independently take the mobile app offline. Logged-in users see an
            "App Under Construction" screen instead of any app content.
            Login keeps working normally either way, so users can still sign
            in once this is switched back off.
          </p>

          {loading ? (
            <div style={styles.loadingText}>Checking current status&hellip;</div>
          ) : (
            <>
              <div style={styles.statusRow}>
                <span>Current status:</span>
                <strong style={{ color: appEnabled ? "#ef4444" : "#22c55e" }}>
                  {appEnabled ? "APP MAINTENANCE IS ON" : "App is LIVE"}
                </strong>
              </div>

              <button
                onClick={handleAppToggle}
                disabled={appSaving}
                style={{
                  ...styles.toggleBtn,
                  background: appEnabled
                    ? "linear-gradient(135deg,#22c55e,#16a34a)"
                    : "linear-gradient(135deg,#ef4444,#b91c1c)",
                }}
              >
                {appSaving
                  ? "Saving..."
                  : appEnabled
                  ? "Turn OFF App Maintenance Mode"
                  : "Turn ON App Maintenance Mode"}
              </button>

              {appMeta.updatedBy && (
                <p style={styles.metaText}>
                  Last changed by {appMeta.updatedBy}
                  {appMeta.updatedAt ? ` on ${new Date(appMeta.updatedAt).toLocaleString()}` : ""}
                </p>
              )}
            </>
          )}

          {appError && <p style={styles.errorText}>{appError}</p>}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#0f172a",
    fontFamily: "'Inter', sans-serif",
    padding: 24,
  },
  stack: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    width: "100%",
    maxWidth: 480,
  },
  card: {
    position: "relative",
    background: "#fff",
    borderRadius: 20,
    width: "100%",
    padding: "40px 32px",
    boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
    textAlign: "center",
  },
  statusDot: {
    position: "absolute",
    top: 20,
    right: 20,
    width: 14,
    height: 14,
    borderRadius: "50%",
    boxShadow: "0 0 0 4px rgba(0,0,0,0.05)",
  },
  title: { fontSize: 24, fontWeight: 900, margin: "0 0 10px", color: "#0f172a" },
  sub: { fontSize: 14, color: "#64748b", lineHeight: 1.6, margin: "0 0 24px" },
  loadingText: { color: "#94a3b8", fontSize: 14, padding: "20px 0" },
  statusRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "12px 16px",
    fontSize: 14,
    color: "#334155",
    marginBottom: 20,
  },
  toggleBtn: {
    width: "100%",
    border: "none",
    color: "#fff",
    fontWeight: 700,
    fontSize: 15,
    padding: "14px 20px",
    borderRadius: 12,
    cursor: "pointer",
    transition: "transform .15s ease, filter .15s ease",
  },
  metaText: { fontSize: 12, color: "#94a3b8", marginTop: 14 },
  errorText: { color: "#ef4444", fontSize: 13, marginTop: 14 },
  previewLink: {
    display: "inline-block",
    marginTop: 18,
    fontSize: 13,
    color: "#3b82f6",
    textDecoration: "none",
    fontWeight: 600,
  },
};
