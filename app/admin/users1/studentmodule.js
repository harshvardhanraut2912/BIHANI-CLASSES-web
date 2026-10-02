"use client";

import { useEffect, useState, useCallback } from "react";
import styles from "./students.module.css";
import Avatar from "./Avatar";
import { fmtDate, statusPillClass } from "./helpers";
import { supabase } from "./supabaseClient";

function StatusPill({ status }) {
  if (!status) return <>—</>;
  return (
    <span className={`${styles["status-pill"]} ${statusPillClass(styles, status)}`}>{status}</span>
  );
}

function DataTable({ rows, headers, rowMapper }) {
  if (!rows || !rows.length) {
    return <div className={styles["no-data-row"]}>No records found for this student.</div>;
  }
  return (
    <table className={styles["data-table"]}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={row.id ?? i}>
            {rowMapper(row).map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StudentModal({ student, onClose }) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [detail, setDetail] = useState(null);
  const [show, setShow] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    // Student activity tables key off "student_id" as text — in this schema that has
    // historically been either the profile's uuid or the student's email/username
    // depending on which part of the app wrote the row. We match against both to be safe.
    const candidateIds = [student.id, student.username].filter(Boolean);
    const orFilter = candidateIds.map((id) => `student_id.eq.${id}`).join(",");

    const [enrollments, purchases, attempts, results, errors] = await Promise.all([
      supabase.from("user_enrollments").select("*").or(orFilter),
      supabase.from("user_purchases").select("*").or(orFilter),
      supabase.from("attempt_sessions").select("*").or(orFilter),
      supabase.from("exam_results").select("id, test_id, submitted_at").or(orFilter),
      supabase.from("error_reports").select("*").or(orFilter),
    ]);

    const firstError =
      enrollments.error || purchases.error || attempts.error || results.error || errors.error;
    if (firstError) {
      setErrorMsg(firstError.message);
      setLoading(false);
      return;
    }

    // Resolve product titles for enrollments, if any
    let productTitles = {};
    if (enrollments.data?.length) {
      const productIds = [...new Set(enrollments.data.map((e) => e.product_id))];
      const { data: products } = await supabase
        .from("products")
        .select("id, title")
        .in("id", productIds);
      (products || []).forEach((p) => (productTitles[p.id] = p.title));
    }

    setDetail({ enrollments, purchases, attempts, results, errors, productTitles });
    setLoading(false);
  }, [student.id, student.username]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    loadDetail();
    // trigger the enter transition on the next tick
    const t = setTimeout(() => setShow(true), 10);

    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDetail, onClose]);

  return (
    <div
      className={`${styles["modal-backdrop"]} ${show ? styles.show : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles["student-modal"]}>
        <div className={styles["modal-header"]}>
          <Avatar
            profile={student}
            imgClassName={styles["modal-avatar"]}
            fallbackClassName={styles["modal-avatar-fallback"]}
          />
          <div className={styles["modal-header-info"]}>
            <h2>{student.full_name || "Unnamed Student"}</h2>
            <p>
              @{student.username || "no-username"} · ID: {student.id}
            </p>
          </div>
          <button className={styles["modal-close"]} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles["modal-body"]}>
          {loading && <div className={styles["loading-state"]}>Loading full profile...</div>}

          {!loading && errorMsg && (
            <div className={styles["empty-state"]}>Couldn't load student details: {errorMsg}</div>
          )}

          {!loading && !errorMsg && detail && (
            <>
              <div className={styles["modal-section"]}>
                <div className={styles["modal-section-title"]}>Profile Details</div>
                <div className={styles["info-grid"]}>
                  <InfoBox label="Full Name" value={student.full_name} />
                  <InfoBox label="Username" value={student.username} />
                  <InfoBox label="Email" value={student.email} />
                  <InfoBox label="Mobile Number" value={student.mobile_number} />
                  <InfoBox label="Current Class" value={student.current_class} />
                  <InfoBox
                    label="Target Exams"
                    value={(student.target_exams || []).join(", ")}
                  />
                  <InfoBox
                    label="Exam Currently Active"
                    value={student.is_exam_active ? "Yes — session in progress" : "No"}
                  />
                  <InfoBox label="Current Session ID" value={student.current_session_id} />
                  <InfoBox label="Profile Last Updated" value={fmtDate(student.updated_at)} />
                </div>
              </div>

              <div className={styles["modal-section"]}>
                <div className={styles["modal-section-title"]}>
                  Enrollments ({detail.enrollments.data?.length || 0})
                </div>
                <DataTable
                  rows={detail.enrollments.data}
                  headers={["Product", "Enrolled On"]}
                  rowMapper={(row) => [
                    detail.productTitles[row.product_id] || row.product_id,
                    fmtDate(row.created_at),
                  ]}
                />
              </div>

              <div className={styles["modal-section"]}>
                <div className={styles["modal-section-title"]}>
                  Purchases ({detail.purchases.data?.length || 0})
                </div>
                <DataTable
                  rows={detail.purchases.data}
                  headers={["Item", "Amount", "Method", "Status", "Date"]}
                  rowMapper={(row) => [
                    row.item_id || "—",
                    row.amount_paid != null ? `₹${row.amount_paid}` : "—",
                    row.payment_method || "—",
                    <StatusPill key="s" status={row.transaction_status} />,
                    fmtDate(row.unlocked_at),
                  ]}
                />
              </div>

              <div className={styles["modal-section"]}>
                <div className={styles["modal-section-title"]}>
                  Exam Attempt Sessions ({detail.attempts.data?.length || 0})
                </div>
                <DataTable
                  rows={detail.attempts.data}
                  headers={["Test ID", "Status", "Started"]}
                  rowMapper={(row) => [
                    row.test_id || "—",
                    <StatusPill key="s" status={row.status} />,
                    fmtDate(row.created_at),
                  ]}
                />
              </div>

              <div className={styles["modal-section"]}>
                <div className={styles["modal-section-title"]}>
                  Submitted Results ({detail.results.data?.length || 0})
                </div>
                <DataTable
                  rows={detail.results.data}
                  headers={["Test ID", "Submitted At"]}
                  rowMapper={(row) => [row.test_id || "—", fmtDate(row.submitted_at)]}
                />
              </div>

              <div className={styles["modal-section"]}>
                <div className={styles["modal-section-title"]}>
                  Error Reports Raised ({detail.errors.data?.length || 0})
                </div>
                <DataTable
                  rows={detail.errors.data}
                  headers={["Test ID", "Question #", "Section", "Description", "Status"]}
                  rowMapper={(row) => [
                    row.test_id || "—",
                    row.question_number ?? "—",
                    row.section_name || "—",
                    row.description || "—",
                    <StatusPill key="s" status={row.status} />,
                  ]}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className={styles["info-box"]}>
      <div className={styles["info-label"]}>{label}</div>
      <div className={styles["info-value"]}>{value || "—"}</div>
    </div>
  );
}