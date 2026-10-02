"use client";

import { useEffect, useState, useCallback } from "react";

export default function AppInstallsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/app-installs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load install stats.");
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>App Installs</h1>
      <p style={styles.subtitle}>
        Real device installs registered by the app itself — updates on an
        existing install never add to this count, only a genuinely new
        device does.
      </p>

      {loading && <p>Loading…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {stats && (
        <div style={styles.grid}>
          <StatCard label="Total installs" value={stats.total_installs} highlight />
          <StatCard label="Active in last 7 days" value={stats.active_last_7_days} />
          <StatCard label="New in last 30 days" value={stats.new_last_30_days} />
        </div>
      )}

      <button style={styles.refreshBtn} onClick={load} disabled={loading}>
        Refresh
      </button>
    </div>
  );
}

function StatCard({ label, value, highlight }) {
  return (
    <div style={{ ...styles.card, ...(highlight ? styles.cardHighlight : {}) }}>
      <div style={styles.cardValue}>{value ?? "—"}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  );
}

const styles = {
  page: { padding: "32px 24px", maxWidth: 800, margin: "0 auto", fontFamily: "inherit" },
  title: { fontSize: 28, marginBottom: 6 },
  subtitle: { color: "#666", marginBottom: 24, lineHeight: 1.5 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 },
  card: { border: "1px solid #e2e2e2", borderRadius: 12, padding: "20px 16px", textAlign: "center", background: "#fafafa" },
  cardHighlight: { background: "#0a1e42", color: "#fff", borderColor: "#0a1e42" },
  cardValue: { fontSize: 34, fontWeight: 700 },
  cardLabel: { marginTop: 6, fontSize: 13, opacity: 0.8 },
  error: { color: "#c0392b" },
  refreshBtn: { padding: "10px 18px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer" },
};
