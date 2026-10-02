// SAVE THIS FILE AT: components/admin/TransactionHistoryTable.jsx  (new file)
"use client";

import { useEffect, useState } from "react";
import TransactionDateFilter from "./TransactionDateFilter";

function formatINR(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PAGE_SIZE = 25;

export default function TransactionHistoryTable() {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [totalRows, setTotalRows] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setPage(1);
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (from) params.set("from", from);
        if (to) params.set("to", to);

        const res = await fetch(`/api/transactions-secret/history?${params.toString()}`);
        const data = await res.json();
        if (cancelled) return;

        if (!data.ok) {
          setError(data.message || "Failed to load transactions.");
          return;
        }
        setRows(data.rows);
        setTotalRows(data.totalRows);
        setTotalPages(data.totalPages);
      } catch (e) {
        if (!cancelled) setError("Network error loading transactions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to, page]);

  function handleFilterChange(newFrom, newTo) {
    setFrom(newFrom);
    setTo(newTo);
  }

  return (
    <div className="tx-history">
      <div className="tx-history-toolbar">
        <h2>Transaction history</h2>
        <TransactionDateFilter from={from} to={to} onChange={handleFilterChange} />
      </div>

      {error && <p className="tx-error">{error}</p>}

      <div className="tx-table-wrap">
        <table className="tx-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Student</th>
              <th>Course</th>
              <th>Coupon</th>
              <th>Status</th>
              <th className="tx-num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="tx-table-empty">Loading…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="tx-table-empty">No transactions in this range.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.created_at)}</td>
                  <td>{r.student_email || "—"}</td>
                  <td>{r.course_name || r.course_id || "—"}</td>
                  <td>{r.coupon_code || "—"}</td>
                  <td>
                    <span className={`tx-status tx-status-${r.payment_status}`}>
                      {r.payment_status}
                    </span>
                  </td>
                  <td className="tx-num">{formatINR(r.final_price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="tx-pagination">
        <span className="tx-muted">
          {totalRows} transaction{totalRows === 1 ? "" : "s"} · page {page} of {totalPages}
        </span>
        <div className="tx-pagination-btns">
          <button
            type="button"
            className="tx-btn tx-btn-ghost"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ‹ Prev
          </button>
          <button
            type="button"
            className="tx-btn tx-btn-ghost"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}
