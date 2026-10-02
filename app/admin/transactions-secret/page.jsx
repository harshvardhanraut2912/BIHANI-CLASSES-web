// SAVE THIS FILE AT: app/admin/transactions-secret/page.jsx  (new file)
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TransactionHistoryTable from "@/components/admin/TransactionHistoryTable";
import "./transactions.css";

function formatINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export default function TransactionsSecretPage() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);

  async function loadSummary() {
    setLoadingSummary(true);
    setSummaryError("");
    try {
      const res = await fetch("/api/transactions-secret/summary");
      if (res.status === 401) {
        setAuthorized(false);
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        setSummaryError(data.message || "Failed to load totals.");
        return;
      }
      setSummary(data);
      setAuthorized(true);
    } catch (e) {
      setSummaryError("Network error loading totals.");
    } finally {
      setLoadingSummary(false);
    }
  }

  // On first mount, probe whether we already have a valid session cookie
  // (e.g. page refresh within the 12h window) by just trying the summary
  // fetch. No separate "am I logged in" endpoint needed.
  useEffect(() => {
    (async () => {
      await loadSummary();
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/transactions-secret/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!data.ok) {
        setLoginError(data.message || "Incorrect password.");
        return;
      }
      setPassword("");
      await loadSummary();
    } catch (e) {
      setLoginError("Network error. Try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/transactions-secret/logout", { method: "POST" });
    setAuthorized(false);
    setSummary(null);
  }

  if (checking) {
    return (
      <div className="tx-gate-wrap">
        <p className="tx-muted">Checking access…</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="tx-gate-wrap">
        <form className="tx-gate-card" onSubmit={handleLogin}>
          <h1>Transactions</h1>
          <p className="tx-muted">Enter the access code to continue.</p>
          <input
            type="password"
            autoFocus
            placeholder="Access code"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="tx-gate-input"
          />
          {loginError && <p className="tx-error">{loginError}</p>}
          <button type="submit" className="tx-btn tx-btn-primary" disabled={loggingIn}>
            {loggingIn ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="tx-page">
      <div className="tx-header">
        <h1>Transactions</h1>
        <button className="tx-btn tx-btn-ghost" onClick={handleLogout}>
          Lock page
        </button>
      </div>

      {summaryError && <p className="tx-error">{summaryError}</p>}

      <div className="tx-boxes">
        <div className="tx-box">
          <span className="tx-box-label">Total received to date</span>
          <span className="tx-box-value">
            {loadingSummary ? "…" : formatINR(summary?.totalReceived)}
          </span>
          <span className="tx-box-sub">All captured transactions, no filter</span>
        </div>

        <Link href="/admin/transactions-secret/client-admin" className="tx-box tx-box-link">
          <span className="tx-box-label">Client ↔ Admin transactions</span>
          <span className="tx-box-value tx-box-arrow">→</span>
          <span className="tx-box-sub">View, add &amp; edit</span>
        </Link>

        <div className="tx-box">
          <span className="tx-box-label">
            You need to earn ({summary?.clientSharePct ?? 30}% of total)
          </span>
          <span className="tx-box-value">
            {loadingSummary ? "…" : formatINR(summary?.owedToYou)}
          </span>
        </div>

        <div className="tx-box">
          <span className="tx-box-label">Client has paid you</span>
          <span className="tx-box-value">
            {loadingSummary ? "…" : formatINR(summary?.clientAdminTotal)}
          </span>
          <span className="tx-box-sub">Total of client-admin transactions</span>
        </div>
      </div>

      <TransactionHistoryTable />
    </div>
  );
}
