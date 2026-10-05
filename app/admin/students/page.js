// app/admin/students/page.js  (new file)
//
// Students -- the old "Users" admin tab moved into the new admin shell.
// Same behaviour as app/admin/users/page.jsx:
//   * list from GET /api/admin/users (profiles + enrollments + purchases)
//   * LIVE: Supabase realtime on `profiles` UPDATEs patches Online / Exam Active /
//     any other changed field in place (table AND the open student window)
//   * search (debounced), "Load more" paging, student window with
//     Edit Profile (PATCH), Add enrollment (POST), purchase history
// Only the look changed: flat, professional, no animations.
// A real folder, so it wins over the generic placeholder at app/admin/[panel].
"use client";

import { useCallback, useEffect, useMemo, useState, memo } from "react";
import { createClient } from "@supabase/supabase-js";
import s from "./students.module.css";

const PAGE_SIZE = 25;

// Browser client, public anon key only -- used ONLY to listen to realtime changes.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* ---------------- helpers ---------------- */
function avatarUrl(student) {
  if (student.avatar_url) return student.avatar_url;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(student.full_name || "Student")}&background=172a85&color=ffffff&size=128`;
}

function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatAmount(amount) {
  if (amount === null || amount === undefined || amount === "") return "-";
  const num = Number(amount);
  if (Number.isNaN(num)) return amount;
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusClass = (status) => (status || "pending").toLowerCase();

function targetExamList(exams) {
  if (!exams) return [];
  if (Array.isArray(exams)) return exams;
  try {
    const parsed = JSON.parse(exams);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// lookup key helper: casing / stray spaces from the DB must never cause a miss
const normalizeKey = (v) => (v ?? "").toString().trim().toLowerCase();

const enrollmentTitle = (e) => e.course_name || e.course_id || e.product_id || "-";

function Status({ on, onText, offText }) {
  return (
    <span className={`${s.badge} ${on ? s.badgeOn : ""}`}>
      <span className={s.dot} />
      {on ? onText : offText}
    </span>
  );
}

/* ---------------- one table row (memoised) ---------------- */
const StudentRow = memo(function StudentRow({ student, onOpen }) {
  return (
    <tr
      className={`${s.row} ${student.is_exam_active ? s.rowExam : student.is_online ? s.rowOnline : ""}`}
      tabIndex={0}
      onClick={() => onOpen(student)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(student); }}
    >
      <td>
        <div className={s.person}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUrl(student)} alt="" className={`${s.avatar} ${student.is_exam_active ? s.avatarOn : ""}`} width={40} height={40} loading="lazy" decoding="async" />
          <div style={{ minWidth: 0 }}>
            <span className={s.pName} title={student.full_name || ""}>{student.full_name || "-"}</span>
          </div>
        </div>
      </td>
      <td>{student.username || "-"}</td>
      <td>{student.email || "-"}</td>
      <td className={student.current_class ? "" : s.muted}>{student.current_class || "-"}</td>
      <td className={student.mobile_number ? "" : s.muted}>{student.mobile_number || "-"}</td>
      <td><Status on={student.is_online} onText="Online" offText="Offline" /></td>
      <td><Status on={student.is_exam_active} onText="Active" offText="Inactive" /></td>
    </tr>
  );
});

export default function StudentsPage() {
  /* ---------------- state ---------------- */
  const [students, setStudents] = useState([]);
  const [enrollmentMap, setEnrollmentMap] = useState({});
  const [purchaseMap, setPurchaseMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [purchases, setPurchases] = useState([]);

  const [allCourses, setAllCourses] = useState([]);
  const [showAddEnroll, setShowAddEnroll] = useState(false);
  const [addEnrollBusy, setAddEnrollBusy] = useState(false);
  const [addEnrollError, setAddEnrollError] = useState("");

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveProfileError, setSaveProfileError] = useState("");

  /* ---------------- load ---------------- */
  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Failed to load students.");
      setStudents(json.profiles || []);
      setEnrollmentMap(json.enrollmentMap || {});
      setPurchaseMap(json.purchaseMap || {});
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCourses = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/student-courses", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load courses.");
      setAllCourses(json.courses || []);
    } catch (err) {
      console.error("Course list fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadCourses();
  }, [loadDashboard, loadCourses]);

  /* ---------------- LIVE sync ----------------
     Any UPDATE on `profiles` (is_online, is_exam_active, edits made elsewhere...)
     patches just that student in place -- no refetch, no reload. */
  useEffect(() => {
    const channel = supabase
      .channel("admin-students-profiles")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const next = payload.new;
        if (!next?.id) return;
        setStudents((prev) => prev.map((st) => (st.id === next.id ? { ...st, ...next } : st)));
        setSelectedStudent((prev) => (prev && prev.id === next.id ? { ...prev, ...next } : prev));
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ---------------- debounced search ---------------- */
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setVisibleCount(PAGE_SIZE);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /* ---------------- open / close window ---------------- */
  const openStudent = useCallback((student) => {
    setSelectedStudent(student);
    setEnrollments(enrollmentMap[student.email] || []);

    // user_purchases.student_id is the student's email; match case/space-insensitively
    const idKey = normalizeKey(student.id);
    const emailKey = normalizeKey(student.email);
    setPurchases(
      purchaseMap[student.id] || purchaseMap[student.email] || purchaseMap[idKey] || purchaseMap[emailKey] || []
    );

    setShowAddEnroll(false);
    setAddEnrollError("");
    setIsEditingProfile(false);
    setEditForm(null);
    setSaveProfileError("");
  }, [enrollmentMap, purchaseMap]);

  const closeModal = useCallback(() => {
    setSelectedStudent(null);
    setEnrollments([]);
    setPurchases([]);
    setShowAddEnroll(false);
    setAddEnrollError("");
    setIsEditingProfile(false);
    setEditForm(null);
    setSaveProfileError("");
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    const onKey = (e) => { if (e.key === "Escape") closeModal(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedStudent, closeModal]);

  /* ---------------- add enrollment ---------------- */
  const handleAddEnrollment = useCallback(async (course) => {
    if (!selectedStudent || addEnrollBusy) return;
    setAddEnrollBusy(true);
    setAddEnrollError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentEmail: selectedStudent.email, courseId: course.id }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Failed to add enrollment.");

      const newEnrollment = json.enrollment || {
        id: `${selectedStudent.email}-${course.id}`,
        course_id: course.id,
        course_name: course.name,
        created_at: new Date().toISOString(),
      };

      setEnrollments((prev) => [newEnrollment, ...prev]);
      setEnrollmentMap((prev) => ({
        ...prev,
        [selectedStudent.email]: [newEnrollment, ...(prev[selectedStudent.email] || [])],
      }));
      setShowAddEnroll(false);
    } catch (err) {
      console.error("Add enrollment failed:", err);
      setAddEnrollError(err.message);
    } finally {
      setAddEnrollBusy(false);
    }
  }, [selectedStudent, addEnrollBusy]);

  const unenrolledCourses = useMemo(() => {
    const enrolled = new Set(enrollments.map((e) => e.course_id || e.product_id));
    return allCourses.filter((c) => !enrolled.has(c.id));
  }, [allCourses, enrollments]);

  /* ---------------- edit profile ---------------- */
  const startEditProfile = useCallback(() => {
    if (!selectedStudent) return;
    setEditForm({
      full_name: selectedStudent.full_name || "",
      username: selectedStudent.username || "",
      email: selectedStudent.email || "",
      mobile_number: selectedStudent.mobile_number || "",
      current_class: selectedStudent.current_class || "",
      target_exams: targetExamList(selectedStudent.target_exams).join(", "),
    });
    setSaveProfileError("");
    setIsEditingProfile(true);
  }, [selectedStudent]);

  const cancelEditProfile = useCallback(() => {
    setIsEditingProfile(false);
    setEditForm(null);
    setSaveProfileError("");
  }, []);

  const handleEditFieldChange = useCallback((field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const saveProfileEdits = useCallback(async () => {
    if (!selectedStudent || !editForm || savingProfile) return;
    setSavingProfile(true);
    setSaveProfileError("");
    try {
      const payload = {
        id: selectedStudent.id,
        full_name: editForm.full_name.trim(),
        username: editForm.username.trim(),
        email: editForm.email.trim(),
        mobile_number: editForm.mobile_number.trim() || null,
        current_class: editForm.current_class.trim() || null,
        target_exams: editForm.target_exams.split(",").map((x) => x.trim()).filter(Boolean),
      };
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Failed to update profile.");

      const updated = json.profile;
      setStudents((prev) => prev.map((st) => (st.id === updated.id ? { ...st, ...updated } : st)));
      setSelectedStudent((prev) => (prev ? { ...prev, ...updated } : prev));
      setIsEditingProfile(false);
      setEditForm(null);
    } catch (err) {
      console.error("Profile update failed:", err);
      setSaveProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }, [selectedStudent, editForm, savingProfile]);

  /* ---------------- search / paging / stats ---------------- */
  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;
    const keyword = search.toLowerCase();
    return students.filter(
      (st) =>
        st.full_name?.toLowerCase().includes(keyword) ||
        st.username?.toLowerCase().includes(keyword) ||
        st.email?.toLowerCase().includes(keyword) ||
        st.mobile_number?.toString().includes(keyword) ||
        st.current_class?.toLowerCase().includes(keyword)
    );
  }, [students, search]);

  const visibleStudents = useMemo(() => filteredStudents.slice(0, visibleCount), [filteredStudents, visibleCount]);
  const activeCount = useMemo(() => filteredStudents.filter((x) => x.is_exam_active).length, [filteredStudents]);
  const onlineCount = useMemo(() => filteredStudents.filter((x) => x.is_online).length, [filteredStudents]);

  const targetExams = selectedStudent ? targetExamList(selectedStudent.target_exams) : [];

  /* ---------------- render ---------------- */
  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>Students</h1>
          <p className={s.subtitle}>Manage profiles, enrollments and exam access.</p>
        </div>
        <span className={`${s.live} ${live ? s.liveOk : ""}`} title={live ? "Updates appear instantly" : "Connecting to live updates"}>
          <span className={s.dot} /> {live ? "Live" : "Connecting\u2026"}
        </span>
      </div>

      <div className={s.toolbar}>
        <input
          type="text"
          className={s.search}
          placeholder="Search by name, email, mobile or class"
          aria-label="Search students"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        {!loading && !error && (
          <div className={s.stats}>
            <span className={s.stat}><b>{filteredStudents.length}</b> Students</span>
            <span className={s.stat}><span className={`${s.dot} ${s.dotOn}`} /> <b>{onlineCount}</b> Online</span>
            <span className={s.stat}><span className={`${s.dot} ${s.dotOn}`} /> <b>{activeCount}</b> Active exam</span>
          </div>
        )}
      </div>

      {loading && <div className={s.loading}>Loading students&hellip;</div>}

      {error && (
        <p className={s.err}>
          {error}
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={loadDashboard}>Retry</button>
        </p>
      )}

      {!loading && !error && (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Username</th>
                <th>Email</th>
                <th>Class</th>
                <th>Mobile</th>
                <th>Website</th>
                <th>Exam</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 && (
                <tr><td colSpan={7} className={s.empty}>No students found.</td></tr>
              )}
              {visibleStudents.map((student) => (
                <StudentRow key={student.id} student={student} onOpen={openStudent} />
              ))}
            </tbody>
          </table>

          {visibleCount < filteredStudents.length && (
            <div className={s.more}>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Load more ({filteredStudents.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ============ student window ============ */}
      {selectedStudent && (
        <div className={s.overlay} onClick={closeModal}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-label="Student details" onClick={(e) => e.stopPropagation()}>
            <div className={s.mHead}>
              <h2 className={s.mTitle}>Student details</h2>
              <button type="button" className={s.close} onClick={closeModal} aria-label="Close">&times;</button>
            </div>

            <div className={s.mTop}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarUrl(selectedStudent)} alt="" className={s.big} width={96} height={96} decoding="async" />

              <div className={s.mMain}>
                {isEditingProfile ? (
                  <input type="text" className={`${s.input} ${s.nameInput}`} value={editForm.full_name} placeholder="Full name" onChange={(e) => handleEditFieldChange("full_name", e.target.value)} />
                ) : (
                  <h3 className={s.mName}>{selectedStudent.full_name}</h3>
                )}

                <div className={s.mStatus}>
                  <Status on={selectedStudent.is_online} onText="Online now" offText="Offline" />
                  <Status on={selectedStudent.is_exam_active} onText="Exam active" offText="Exam inactive" />
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={isEditingProfile ? cancelEditProfile : startEditProfile} disabled={savingProfile}>
                    {isEditingProfile ? "Cancel" : "Edit profile"}
                  </button>
                </div>

                <div className={s.grid}>
                  {[
                    ["Username", "username", "text"],
                    ["Email", "email", "email"],
                    ["Mobile", "mobile_number", "text"],
                    ["Current class", "current_class", "text"],
                  ].map(([label, field, type]) => (
                    <div key={field}>
                      <div className={s.label}>{label}</div>
                      {isEditingProfile ? (
                        <input type={type} className={s.input} value={editForm[field]} onChange={(e) => handleEditFieldChange(field, e.target.value)} />
                      ) : (
                        <div className={s.value}>{selectedStudent[field] || "-"}</div>
                      )}
                    </div>
                  ))}

                  <div>
                    <div className={s.label}>Last updated</div>
                    <div className={s.value}>{formatDate(selectedStudent.updated_at)}</div>
                  </div>

                  <div className={s.full}>
                    <div className={s.label}>Target exams (comma separated)</div>
                    {isEditingProfile ? (
                      <input type="text" className={s.input} value={editForm.target_exams} placeholder="e.g. MHT-CET, JEE Main" onChange={(e) => handleEditFieldChange("target_exams", e.target.value)} />
                    ) : (
                      <div className={s.value}>{targetExams.join(", ") || "-"}</div>
                    )}
                  </div>
                </div>

                {isEditingProfile && (
                  <div className={s.actions}>
                    <button type="button" className={s.btn} onClick={saveProfileEdits} disabled={savingProfile}>
                      {savingProfile ? "Saving\u2026" : "Save changes"}
                    </button>
                    {saveProfileError && <span className={s.inlineErr}>{saveProfileError}</span>}
                  </div>
                )}
              </div>
            </div>

            <div className={s.body}>
              <div className={s.section}>
                <h4 className={s.sHead}>Target exams <span className={s.count}>{targetExams.length}</span></h4>
                {targetExams.length === 0 ? (
                  <p className={s.note}>No target exams.</p>
                ) : (
                  <ul className={s.chips}>{targetExams.map((exam) => <li key={exam} className={s.chip}>{exam}</li>)}</ul>
                )}
              </div>

              <div className={s.section}>
                <h4 className={s.sHead}>
                  Enrolled courses <span className={s.count}>{enrollments.length}</span>
                  <button type="button" className={s.plus} aria-label="Add enrollment" title="Add enrollment" onClick={() => { setAddEnrollError(""); setShowAddEnroll((v) => !v); }}>+</button>
                </h4>

                {showAddEnroll && (
                  <div className={s.picker}>
                    {unenrolledCourses.length === 0 ? (
                      <p className={s.note}>{allCourses.length === 0 ? "No courses found." : "Already enrolled in every available course."}</p>
                    ) : (
                      <ul className={s.pickList}>
                        {unenrolledCourses.map((course) => (
                          <li key={course.id}>
                            <span title={course.id}>{course.name || course.id}</span>
                            <button type="button" className={`${s.btn} ${s.btnSm}`} disabled={addEnrollBusy} onClick={() => handleAddEnrollment(course)}>
                              {addEnrollBusy ? "Adding\u2026" : "Add"}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {addEnrollError && <span className={s.inlineErr}>{addEnrollError}</span>}
                  </div>
                )}

                {enrollments.length === 0 && <p className={s.note}>No enrollments found.</p>}
                {enrollments.map((item) => (
                  <div key={item.id} className={s.enroll}>
                    <strong>{enrollmentTitle(item)}</strong>
                    <small>{formatDate(item.created_at)}</small>
                  </div>
                ))}
              </div>

              <div className={s.section}>
                <h4 className={s.sHead}>Purchase history <span className={s.count}>{purchases.length}</span></h4>
                {purchases.length === 0 ? (
                  <p className={s.note}>No purchases yet.</p>
                ) : (
                  <div className={s.txWrap}>
                    <table className={s.tx}>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Amount</th>
                          <th>Payment method</th>
                          <th>Status</th>
                          <th>Transaction ID</th>
                          <th>Receipt</th>
                          <th>Unlocked at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchases.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <strong>{p.item_type || "-"}</strong>
                              {p.item_id ? <><br /><span className={s.txId}>{p.item_id}</span></> : null}
                            </td>
                            <td><span className={s.cur}>{p.currency || "INR"}</span><span className={s.amt}>{formatAmount(p.amount_paid)}</span></td>
                            <td>{p.payment_method || "-"}</td>
                            <td>
                              <span className={`${s.status} ${s[statusClass(p.transaction_status)] || ""}`}>
                                <span className={s.dot} />{p.transaction_status || "Pending"}
                              </span>
                            </td>
                            <td className={s.txId}>{p.razorpay_payment_id || p.razorpay_order_id || "-"}</td>
                            <td>
                              {p.receipt_slip_url ? (
                                <a className={s.link} href={p.receipt_slip_url} target="_blank" rel="noopener noreferrer">View</a>
                              ) : "-"}
                            </td>
                            <td>{formatDate(p.unlocked_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
