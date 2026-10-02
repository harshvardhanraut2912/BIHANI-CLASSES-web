"use client";

import { useEffect, useMemo, useState, memo, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import "./adminuser.css";

const PAGE_SIZE = 25;

// Browser-side client, safe to expose — uses the public anon key only,
// just for listening to realtime changes (no writes happen from here).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/* ===========================
   HELPERS (module scope so they
   aren't re-created every render)
=========================== */

function avatarUrl(student) {
  if (student.avatar_url) return student.avatar_url;

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    student.full_name || "Student"
  )}&background=2563eb&color=ffffff&size=128`;
}

function formatDate(date) {
  if (!date) return "-";

  return new Date(date).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAmount(amount) {
  if (amount === null || amount === undefined || amount === "") return "-";
  const num = Number(amount);
  if (Number.isNaN(num)) return amount;
  return num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusClass(status) {
  return (status || "pending").toLowerCase();
}

function renderTargetExams(exams) {
  if (!exams) return [];

  if (Array.isArray(exams)) return exams;

  try {
    return JSON.parse(exams);
  } catch {
    return [];
  }
}

// normalizes an email/id used as a lookup key so casing or stray
// whitespace coming from the DB never causes a silent lookup miss
function normalizeKey(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

/* ===========================
   MEMOIZED ROW
   (keeps React from re-rendering
   every row when unrelated state,
   like the modal, changes)
=========================== */

const StudentRow = memo(function StudentRow({ student, onOpen }) {
  return (
    <tr className="studentRow" onClick={() => onOpen(student)}>
      <td>
        <div className="nameCellRow">
          <div className={`avatarWrap ${student.is_exam_active ? "active" : "inactive"}`}>
            <img
              src={avatarUrl(student)}
              alt={student.full_name}
              className="avatar"
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
            />
          </div>

          <div className="nameCell">
            <strong title={student.full_name}>{student.full_name}</strong>
            <span title={student.current_session_id || ""}>
              {student.current_session_id ? `Session ${student.current_session_id}` : "No active session"}
            </span>
          </div>
        </div>
      </td>

      <td>{student.username}</td>

      <td>{student.email}</td>

      <td className={!student.current_class ? "muted" : ""}>
        {student.current_class || "-"}
      </td>

      <td className={!student.mobile_number ? "muted" : ""}>
        {student.mobile_number || "-"}
      </td>

      <td>
        {student.is_online ? (
          <span className="online">
            <span className="dot" /> Online
          </span>
        ) : (
          <span className="offline">
            <span className="dot" /> Offline
          </span>
        )}
      </td>

      <td>
        {student.is_exam_active ? (
          <span className="active">
            <span className="dot" /> Active
          </span>
        ) : (
          <span className="inactive">
            <span className="dot" /> Inactive
          </span>
        )}
      </td>
    </tr>
  );
});

export default function AdminUsersPage() {
  /* ===========================
     STATE
  =========================== */

  const [students, setStudents] = useState([]);
  const [enrollmentMap, setEnrollmentMap] = useState({});
  const [purchaseMap, setPurchaseMap] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [selectedStudent, setSelectedStudent] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [purchases, setPurchases] = useState([]);

  // --- Add-enrollment picker (the "+" next to Enrolled Products) ---
  const [allProducts, setAllProducts] = useState([]);
  const [showAddEnroll, setShowAddEnroll] = useState(false);
  const [addEnrollBusy, setAddEnrollBusy] = useState(false);
  const [addEnrollError, setAddEnrollError] = useState("");

  // --- Inline profile editing (Username / Email / Mobile / etc.) ---
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveProfileError, setSaveProfileError] = useState("");

  /* ===========================
     LOAD DATA
  =========================== */

  useEffect(() => {
    loadDashboard();
    loadProducts();
  }, []);

  // Public read of the products catalog (id, title) — same table/columns
  // shop.html already reads client-side, so this reuses an existing RLS
  // policy rather than needing a new admin API round-trip.
  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("id, title")
        .order("title", { ascending: true });

      if (error) throw error;
      setAllProducts(data || []);
    } catch (err) {
      console.error("Product list fetch failed:", err);
    }
  }

  /* ===========================
     REALTIME PRESENCE
     Whenever a row in "profiles" changes (e.g. is_online or
     is_exam_active flips), patch just that student in place —
     no refetch, no full page reload.
  =========================== */

  useEffect(() => {
    const channel = supabase
      .channel("profiles-status-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setStudents((prev) =>
            prev.map((student) =>
              student.id === payload.new.id
                ? { ...student, ...payload.new }
                : student
            )
          );

          // keep the open modal in sync too, if it's the same student
          setSelectedStudent((prev) =>
            prev && prev.id === payload.new.id
              ? { ...prev, ...payload.new }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/admin/users");

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to load dashboard.");
      }

      setStudents(json.profiles || []);
      setEnrollmentMap(json.enrollmentMap || {});
      setPurchaseMap(json.purchaseMap || {});
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ===========================
     DEBOUNCED SEARCH
     (typing updates the input instantly,
     but the expensive filter only runs
     ~200ms after the user pauses)
  =========================== */

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setVisibleCount(PAGE_SIZE); // reset pagination on every new search
    }, 200);

    return () => clearTimeout(timer);
  }, [searchInput]);

  /* ===========================
     OPEN STUDENT MODAL
  =========================== */

  const openStudent = useCallback((student) => {
    setSelectedStudent(student);

    const studentEnrollments =
      enrollmentMap[student.email] || [];

    setEnrollments(studentEnrollments);

    // user_purchases.student_id is stored as the student's email — matched
    // case/whitespace-insensitively so DB formatting quirks can't cause misses.
    const key = normalizeKey(student.id);
    const emailKey = normalizeKey(student.email);

    const studentPurchases =
      purchaseMap[student.id] ||
      purchaseMap[student.email] ||
      purchaseMap[key] ||
      purchaseMap[emailKey] ||
      [];

    setPurchases(studentPurchases);

    setShowAddEnroll(false);
    setAddEnrollError("");

    setIsEditingProfile(false);
    setEditForm(null);
    setSaveProfileError("");
  }, [enrollmentMap, purchaseMap]);

  /* ===========================
     ADD ENROLLMENT (admin action)
     Calls a server route using the service-role key so this works
     regardless of the target student's own RLS policies — same
     pattern as /api/exam/start and /api/exam/submit.
  =========================== */

  const handleAddEnrollment = useCallback(async (product) => {
    if (!selectedStudent || addEnrollBusy) return;

    setAddEnrollBusy(true);
    setAddEnrollError("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentEmail: selectedStudent.email,
          productId: product.id,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to add enrollment.");
      }

      const newEnrollment = json.enrollment || {
        id: `${selectedStudent.email}-${product.id}`,
        product_id: product.id,
        created_at: new Date().toISOString(),
      };

      // Patch the open modal instantly
      setEnrollments((prev) => [newEnrollment, ...prev]);

      // Keep the underlying map in sync so re-opening this student
      // (or scanning other rows) reflects it without a full reload
      setEnrollmentMap((prev) => ({
        ...prev,
        [selectedStudent.email]: [
          newEnrollment,
          ...(prev[selectedStudent.email] || []),
        ],
      }));

      setShowAddEnroll(false);
    } catch (err) {
      console.error("Add enrollment failed:", err);
      setAddEnrollError(err.message);
    } finally {
      setAddEnrollBusy(false);
    }
  }, [selectedStudent, addEnrollBusy]);

  const unenrolledProducts = useMemo(() => {
    const enrolledIds = new Set(enrollments.map((e) => e.product_id));
    return allProducts.filter((p) => !enrolledIds.has(p.id));
  }, [allProducts, enrollments]);

  /* ===========================
     INLINE PROFILE EDITING
     Lets an admin correct/update a student's own profile fields
     (username, email, mobile, class, session, target exams) directly
     from the modal. Saves via the service-role admin route so it
     works regardless of that student's own RLS policies.
  =========================== */

  const startEditProfile = useCallback(() => {
    if (!selectedStudent) return;

    setEditForm({
      full_name: selectedStudent.full_name || "",
      username: selectedStudent.username || "",
      email: selectedStudent.email || "",
      mobile_number: selectedStudent.mobile_number || "",
      current_class: selectedStudent.current_class || "",
      current_session_id: selectedStudent.current_session_id || "",
      target_exams: renderTargetExams(selectedStudent.target_exams).join(", "),
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
        current_session_id: editForm.current_session_id.trim() || null,
        target_exams: editForm.target_exams
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };

      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Failed to update profile.");
      }

      const updated = json.profile;

      // Patch this student everywhere it appears: the open modal,
      // and the underlying table list — no full reload needed.
      setStudents((prev) =>
        prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
      );
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

  /* ===========================
     CLOSE MODAL
  =========================== */

  function closeModal() {
    setSelectedStudent(null);
    setEnrollments([]);
    setPurchases([]);
    setShowAddEnroll(false);
    setAddEnrollError("");
    setIsEditingProfile(false);
    setEditForm(null);
    setSaveProfileError("");
  }

  /* ===========================
     SEARCH / PAGINATION
  =========================== */

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students;

    const keyword = search.toLowerCase();

    return students.filter((student) => {
      return (
        student.full_name?.toLowerCase().includes(keyword) ||
        student.username?.toLowerCase().includes(keyword) ||
        student.email?.toLowerCase().includes(keyword) ||
        student.mobile_number?.toString().includes(keyword) ||
        student.current_class?.toLowerCase().includes(keyword)
      );
    });
  }, [students, search]);

  const visibleStudents = useMemo(
    () => filteredStudents.slice(0, visibleCount),
    [filteredStudents, visibleCount]
  );

  /* ===========================
     DISPLAY-ONLY STATS
     (derived purely for the UI, no impact on data/logic)
  =========================== */

  const activeCount = useMemo(
    () => filteredStudents.filter((s) => s.is_exam_active).length,
    [filteredStudents]
  );

  const onlineCount = useMemo(
    () => filteredStudents.filter((s) => s.is_online).length,
    [filteredStudents]
  );

  /* ===========================
     JSX STARTS HERE
  =========================== */

  return (
<>
  <div className={`admin-page ${selectedStudent ? "blur-page" : ""}`}>

    <div className="header">
      <div className="header-titles">
        <div className="header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M16 14c2.67 0 8 1.34 8 4v2H8v-2c0-2.66 5.33-4 8-4Zm-8-3a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm8 0a4 4 0 1 0-.2-8 5.98 5.98 0 0 1 0 8H16Z" fill="white"/>
          </svg>
        </div>
        <div>
          <h1>Students</h1>
          <p>Manage profiles, enrollments and exam access</p>
        </div>
      </div>

      <div className="header-right">
        <div className="searchBox-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            className="searchBox"
            placeholder="Search by name or email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        {!loading && !error && (
          <div className="statRow">
            <span className="statPill total">
              <span className="dot" /> <b>{filteredStudents.length}</b> Students
            </span>
            <span className="statPill online">
              <span className="dot" /> <b>{onlineCount}</b> Online
            </span>
            <span className="statPill active">
              <span className="dot" /> <b>{activeCount}</b> Active Exam
            </span>
          </div>
        )}
      </div>
    </div>

    {loading && (
      <div className="message">
        <div className="spinner" />
        Loading students...
      </div>
    )}

    {error && (
      <div className="error">
        {error}
      </div>
    )}

    {!loading && !error && (
      <div className="tableWrapper">

        <table>

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
              <tr>
                <td colSpan={7} className="emptyRow">
                  <div className="empty-icon">
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6"/>
                      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                  </div>
                  No students found.
                </td>
              </tr>
            )}

            {visibleStudents.map((student) => (
              <StudentRow key={student.id} student={student} onOpen={openStudent} />
            ))}

          </tbody>

        </table>

        {visibleCount < filteredStudents.length && (
          <div className="loadMoreWrap">
            <button
              className="loadMoreBtn"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Load more ({filteredStudents.length - visibleCount} remaining)
            </button>
          </div>
        )}

      </div>
    )}

  </div>

  {selectedStudent && (

    <div className="modalOverlay" onClick={closeModal}>

      <div className="studentModal" onClick={(e) => e.stopPropagation()}>

        <button
          className="closeBtn"
          onClick={closeModal}
          aria-label="Close"
        >
          ×
        </button>

        <div className="modalTop">

          <img
            src={avatarUrl(selectedStudent)}
            alt={selectedStudent.full_name}
            className="bigAvatar"
            width={108}
            height={108}
            decoding="async"
          />

          <div>

            {isEditingProfile ? (
              <input
                type="text"
                className="editInput editNameInput"
                value={editForm.full_name}
                onChange={(e) => handleEditFieldChange("full_name", e.target.value)}
                placeholder="Full name"
              />
            ) : (
              <h2>{selectedStudent.full_name}</h2>
            )}

            <div className="modalStatus">
              {selectedStudent.is_online ? (
                <span className="online">
                  <span className="dot" /> Online Now
                </span>
              ) : (
                <span className="offline">
                  <span className="dot" /> Offline
                </span>
              )}
              {selectedStudent.is_exam_active ? (
                <span className="active">
                  <span className="dot" /> Exam Active
                </span>
              ) : (
                <span className="inactive">
                  <span className="dot" /> Exam Inactive
                </span>
              )}

              <button
                type="button"
                className="editProfileBtn"
                onClick={isEditingProfile ? cancelEditProfile : startEditProfile}
                disabled={savingProfile}
              >
                {isEditingProfile ? "Cancel" : "Edit Profile"}
              </button>
            </div>

            <div className="modalInfoGrid">

              <div>
                <div className="infoLabel">Username</div>
                {isEditingProfile ? (
                  <input
                    type="text"
                    className="editInput"
                    value={editForm.username}
                    onChange={(e) => handleEditFieldChange("username", e.target.value)}
                  />
                ) : (
                  <div className="infoValue">{selectedStudent.username}</div>
                )}
              </div>

              <div>
                <div className="infoLabel">Email</div>
                {isEditingProfile ? (
                  <input
                    type="email"
                    className="editInput"
                    value={editForm.email}
                    onChange={(e) => handleEditFieldChange("email", e.target.value)}
                  />
                ) : (
                  <div className="infoValue">{selectedStudent.email}</div>
                )}
              </div>

              <div>
                <div className="infoLabel">Mobile</div>
                {isEditingProfile ? (
                  <input
                    type="text"
                    className="editInput"
                    value={editForm.mobile_number}
                    onChange={(e) => handleEditFieldChange("mobile_number", e.target.value)}
                  />
                ) : (
                  <div className="infoValue">{selectedStudent.mobile_number || "-"}</div>
                )}
              </div>

              <div>
                <div className="infoLabel">Current Class</div>
                {isEditingProfile ? (
                  <input
                    type="text"
                    className="editInput"
                    value={editForm.current_class}
                    onChange={(e) => handleEditFieldChange("current_class", e.target.value)}
                  />
                ) : (
                  <div className="infoValue">{selectedStudent.current_class || "-"}</div>
                )}
              </div>

              <div>
                <div className="infoLabel">Current Session</div>
                {isEditingProfile ? (
                  <input
                    type="text"
                    className="editInput"
                    value={editForm.current_session_id}
                    onChange={(e) => handleEditFieldChange("current_session_id", e.target.value)}
                  />
                ) : (
                  <div className="infoValue">{selectedStudent.current_session_id || "-"}</div>
                )}
              </div>

              <div>
                <div className="infoLabel">Last Updated</div>
                <div className="infoValue">{formatDate(selectedStudent.updated_at)}</div>
              </div>

              <div className="infoFullWidth">
                <div className="infoLabel">Target Exams (comma separated)</div>
                {isEditingProfile ? (
                  <input
                    type="text"
                    className="editInput"
                    value={editForm.target_exams}
                    onChange={(e) => handleEditFieldChange("target_exams", e.target.value)}
                    placeholder="e.g. MHT-CET, JEE Main"
                  />
                ) : (
                  <div className="infoValue">
                    {renderTargetExams(selectedStudent.target_exams).join(", ") || "-"}
                  </div>
                )}
              </div>

            </div>

            {isEditingProfile && (
              <div className="editActions">
                <button
                  type="button"
                  className="saveProfileBtn"
                  onClick={saveProfileEdits}
                  disabled={savingProfile}
                >
                  {savingProfile ? "Saving..." : "Save Changes"}
                </button>
                {saveProfileError && (
                  <span className="addEnrollError">{saveProfileError}</span>
                )}
              </div>
            )}

          </div>

        </div>

        <div className="modalBody">

          <div className="section">

            <h3>
              Target Exams
              <span className="count">{renderTargetExams(selectedStudent.target_exams).length}</span>
            </h3>

            {renderTargetExams(selectedStudent.target_exams).length === 0 ? (
              <p className="empty-note">No target exams.</p>
            ) : (
              <ul>
                {renderTargetExams(selectedStudent.target_exams).map((exam) => (
                  <li key={exam}>
                    {exam}
                  </li>
                ))}
              </ul>
            )}

          </div>

          <div className="section">

            <h3>
              Enrolled Products
              <span className="count">{enrollments.length}</span>
              <button
                type="button"
                className="addEnrollBtn"
                onClick={() => {
                  setAddEnrollError("");
                  setShowAddEnroll((v) => !v);
                }}
                aria-label="Add enrollment"
                title="Add enrollment"
              >
                +
              </button>
            </h3>

            {showAddEnroll && (
              <div className="addEnrollPanel">
                {unenrolledProducts.length === 0 ? (
                  <p className="empty-note">
                    {allProducts.length === 0
                      ? "No products found."
                      : "Already enrolled in every available product."}
                  </p>
                ) : (
                  <ul className="addEnrollList">
                    {unenrolledProducts.map((product) => (
                      <li key={product.id}>
                        <span title={product.id}>{product.title || product.id}</span>
                        <button
                          type="button"
                          className="addEnrollPick"
                          disabled={addEnrollBusy}
                          onClick={() => handleAddEnrollment(product)}
                        >
                          {addEnrollBusy ? "Adding..." : "Add"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {addEnrollError && (
                  <p className="addEnrollError">{addEnrollError}</p>
                )}
              </div>
            )}

            {enrollments.length === 0 && (
              <p className="empty-note">No enrollments found.</p>
            )}

            {enrollments.map((item) => (

              <div
                key={item.id}
                className="enrollment"
              >

                <strong>
                  {item.product_id}
                </strong>

                <small>
                  {formatDate(item.created_at)}
                </small>

              </div>

            ))}

          </div>

          <div className="section purchaseSection">

            <h3>
              Purchase History
              <span className="count">{purchases.length}</span>
            </h3>

            {purchases.length === 0 ? (
              <p className="empty-note">No purchases yet.</p>
            ) : (
              <table className="purchaseTable">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                    <th>Status</th>
                    <th>Transaction ID</th>
                    <th>Receipt</th>
                    <th>Unlocked At</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>
                        <strong>{purchase.item_type || "-"}</strong>
                        {purchase.item_id ? (
                          <>
                            <br />
                            <span className="txId">{purchase.item_id}</span>
                          </>
                        ) : null}
                      </td>

                      <td>
                        <span className="purchaseCurrency">
                          {purchase.currency || "INR"}
                        </span>
                        <span className="purchaseAmount">
                          {formatAmount(purchase.amount_paid)}
                        </span>
                      </td>

                      <td>{purchase.payment_method || "-"}</td>

                      <td>
                        <span className={`txStatus ${statusClass(purchase.transaction_status)}`}>
                          <span className="dot" />
                          {purchase.transaction_status || "Pending"}
                        </span>
                      </td>

                      <td className="txId">
                        {purchase.razorpay_payment_id || purchase.razorpay_order_id || "-"}
                      </td>

                      <td>
                        {purchase.receipt_slip_url ? (
                          <a
                            className="receiptLink"
                            href={purchase.receipt_slip_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            View
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>

                      <td>{formatDate(purchase.unlocked_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>

        </div>

      </div>

    </div>

  )}

</>
);
}