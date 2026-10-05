// lib/subjectAccess.js  (new file, server only)
//
// Per-admin subject switches (table admin_subject_access, managed from
// Settings -> Developers). Missing row = allowed. Used by the exam APIs to
// refuse a subject an admin has no access to.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdminFromRequest } from "@/lib/devAuth";

export const ALL_SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology"];
export const NO_ACCESS_MESSAGE = "You don't have access to this.";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// "physics " / "PHYSICS" -> "Physics"; unknown names are returned trimmed as-is.
export function canonicalSubject(name) {
  const t = String(name || "").trim().toLowerCase();
  return ALL_SUBJECTS.find((s) => s.toLowerCase() === t) || String(name || "").trim();
}

const tableMissing = (e) =>
  e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));

// Subjects this admin may NOT use. Throws on unexpected DB errors (callers fail closed).
export async function getDeniedSubjects(email) {
  const clean = String(email || "").toLowerCase().trim();
  if (!clean) return [];
  const { data, error } = await supabaseAdmin
    .from("admin_subject_access")
    .select("subject")
    .eq("admin_email", clean)
    .eq("allowed", false);
  if (error) {
    if (tableMissing(error)) {
      console.warn("admin_subject_access table not found - run sql/003_dev_panel_subject_access.sql. Allowing all subjects.");
      return [];
    }
    throw error;
  }
  return (data || []).map((r) => canonicalSubject(r.subject));
}

// Returns a NextResponse to send back (403/503) when ANY of `subjects` is blocked
// for the signed-in admin, or null when everything is allowed.
export async function denyIfSubjectBlocked(request, subjects) {
  const wanted = [...new Set((Array.isArray(subjects) ? subjects : [subjects]).map(canonicalSubject).filter(Boolean))];
  if (!wanted.length) return null;
  const admin = await getAdminFromRequest(request);
  if (!admin) return NextResponse.json({ error: "Forbidden: Admin authentication required." }, { status: 403 });
  try {
    const denied = await getDeniedSubjects(admin.email);
    const hit = wanted.filter((s) => denied.includes(s));
    if (hit.length) {
      return NextResponse.json({ error: NO_ACCESS_MESSAGE, code: "SUBJECT_NO_ACCESS", subjects: hit }, { status: 403 });
    }
    return null;
  } catch (e) {
    console.error("subject access check failed:", e);
    return NextResponse.json({ error: "Could not verify your access. Please try again." }, { status: 503 });
  }
}
