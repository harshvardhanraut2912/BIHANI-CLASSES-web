// SAVE THIS FILE AT: app/admin/transactions-secret/client-admin/page.jsx  (new file)
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../transactions.css";

function formatINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const emptyForm = { id: null, transaction_date: todayISO(), amount: "", note: "" };

export default function ClientAdminTransactionsPage() {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function loadRows() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/transactions-secret/client-admin");
      if (res.status === 401) {
        setAuthorized(false);
        return;
      }
      const data = await res.json();
      if (!data.ok) {
        setError(data.message || "Failed to load.");
        return;
      }
      setRows(data.rows);
      setTotal(data.total);
      setAuthorized(true);
    } catch (e) {
      setError("Network error loading transactions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadRows();
      setChecking(false);
    })();
  }, []);

  function openAddForm() {
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(row) {
    setForm({
      id: row.id,
      transaction_date: row.transaction_date,
      amount: String(row.amount),
      note: row.note || "",
    });
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    const amountNum = Number(form.amount);
    if (!form.amount || isNaN(amountNum) || amountNum < 0) {
      setFormError("Enter a valid, non-negative amount.");
      return;
    }
    if (!form.transaction_date) {
      setFormError("Pick a date.");
      return;
    }

    setSaving(true);
    try {
      const isEdit = Boolean(form.id);
      const res = await fetch("/api/transactions-secret/client-admin", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          transaction_date: form.transaction_date,
          amount: amountNum,
          note: form.note,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setFormError(data.message || "Save failed.");
        return;
      }
      setShowForm(false);
      setForm(emptyForm);
      await loadRows();
    } catch (e) {
      setFormError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
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
        <div className="tx-gate-card">
          <h1>Locked</h1>
          <p className="tx-muted">
            This page shares its session with the main transactions page.
          </p>
          <Link href="/admin/transactions-secret" className="tx-btn tx-btn-primary" style={{ textAlign: "center" }}>
            Go unlock it
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tx-page">
      <div className="tx-header">
        <div>
          <Link href="/admin/transactions-secret" className="tx-back-link">
            ‹ Back to transactions
          </Link>
          <h1>Client ↔ Admin transactions</h1>
        </div>
        <button className="tx-btn tx-btn-primary" onClick={openAddForm}>
          + Add transaction
        </button>
      </div>

      <div className="tx-boxes tx-boxes-single">
        <div className="tx-box">
          <span className="tx-box-label">Total client has paid you</span>
          <span className="tx-box-value">{loading ? "…" : formatINR(total)}</span>
        </div>
      </div>

      {error && <p className="tx-error">{error}</p>}

      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Note</th>
              <th className="tx-num">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="tx-table-empty">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="tx-table-empty">No entries yet. Add the first one.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.transaction_date)}</td>
                  <td>{r.note || "—"}</td>
                  <td className="tx-num">{formatINR(r.amount)}</td>
                  <td>
                    <button className="tx-link-btn" onClick={() => openEditForm(r)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="tx-modal-backdrop" onClick={() => setShowForm(false)}>
          <form
            className="tx-modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
          >
            <h2>{form.id ? "Edit transaction" : "Add transaction"}</h2>

            <label className="tx-field">
              <span>Date</span>
              <input
                type="date"
                min="2026-01-01"
                max="2027-12-31"
                value={form.transaction_date}
                onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))}
                required
              />
            </label>

            <label className="tx-field">
              <span>Amount (₹)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </label>

            <label className="tx-field">
              <span>Note (optional)</span>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="e.g. UPI transfer, cash, etc."
              />
            </label>

            {formError && <p className="tx-error">{formError}</p>}

            <div className="tx-modal-actions">
              <button
                type="button"
                className="tx-btn tx-btn-ghost"
                onClick={() => setShowForm(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="tx-btn tx-btn-primary" disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save changes" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}