// app/admin/exams/page.js  (new file)
//
// Exams panel. "Create Exam" (top-right) swaps the right-hand screen to the
// create-exam form (/exams/create) -- the sidebar stays in place.
"use client";

import Link from "next/link";
import s from "./exams.module.css";
import { useAdminHref } from "@/components/admin/useAdminHref";

export default function ExamsPage() {
  const href = useAdminHref();
  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Exams</h1>
          <p className={s.subtitle}>Create and manage exams for your students.</p>
        </div>
        <Link href={href("/exams/create")} className={s.btn}>+ Create Exam</Link>
      </div>
      <div className={s.empty}>Your exams will be listed here.</div>
    </>
  );
}
