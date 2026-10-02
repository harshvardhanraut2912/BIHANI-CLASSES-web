"use client";

import styles from "./students.module.css";
import Avatar from "./Avatar";
import { fmtDate } from "./helpers";

export default function StudentCard({ student, onClick }) {
  const targetExams = student.target_exams || [];

  return (
    <button type="button" className={styles["student-card"]} onClick={onClick}>
      <div className={styles["student-card-head"]}>
        <Avatar
          profile={student}
          imgClassName={styles["student-avatar"]}
          fallbackClassName={styles["student-avatar-fallback"]}
        />
        <div>
          <div className={styles["student-name"]}>{student.full_name || "Unnamed Student"}</div>
          <div className={styles["student-username"]}>@{student.username || "no-username"}</div>
        </div>
      </div>

      <div className={styles["student-meta-row"]}>
        {student.current_class && (
          <span className={`${styles["meta-chip"]} ${styles.gold}`}>{student.current_class}</span>
        )}
        <span
          className={`${styles["meta-chip"]} ${
            student.is_exam_active ? styles.active : styles.inactive
          }`}
        >
          {student.is_exam_active ? "Exam Live" : "Idle"}
        </span>
        {targetExams.slice(0, 1).map((t) => (
          <span key={t} className={styles["meta-chip"]}>
            {t}
          </span>
        ))}
      </div>

      <div className={styles["student-contact"]}>
        <div>
          📱 <strong>{student.mobile_number || "Not provided"}</strong>
        </div>
        {student.email && (
          <div>
            ✉️ <strong>{student.email}</strong>
          </div>
        )}
        <div>🕓 Updated {fmtDate(student.updated_at)}</div>
      </div>
    </button>
  );
}