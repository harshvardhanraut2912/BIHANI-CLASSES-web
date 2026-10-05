// app/admin/courses/page.js  (new file)
//
// Courses. A real folder, so it wins over the generic placeholder at app/admin/[panel].
// Behaviour is identical to the Courses tab of the old Content Manager (app/admin/products):
//   Course list -> Course detail (details, notes) -> Subsections -> Chapters -> Products.
// Only the look changed. Same API routes: /api/admin/courses, subsections, chapters,
// products, product-types, exam-v2-options, target-segments.
"use client";

import { useCallback, useEffect, useState } from "react";
import s from "./courses.module.css";
import ImageUploader from "@/components/admin/ImageUploader";

const api = (url, method, body) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const slugify = (v) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ISO/UTC <-> "yyyy-MM-ddThh:mm" for the date/time inputs (browser local time).
function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInputValue(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ---------------------------------------------------------------- small UI */

function Chevron({ open }) {
  return (
    <svg className={s.chev} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ transform: open ? "rotate(90deg)" : "none" }}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
    </svg>
  );
}

function Toasts({ toasts }) {
  return (
    <div className={s.toasts} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`${s.toast} ${t.type === "error" ? s.toastErr : s.toastOk}`}>{t.message}</div>
      ))}
    </div>
  );
}

function Modal({ title, onClose, width = 560, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className={s.modalHead}>
          <h3 className={s.modalTitle}>{title}</h3>
          <button type="button" className={s.modalX} onClick={onClose} aria-label="Close">&#10005;</button>
        </div>
        <div className={s.modalBody}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, help }) {
  return (
    <div className={s.field}>
      {label && <label className={s.label}>{label}</label>}
      {children}
      {help && <div className={s.help}>{help}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- product form */

function ProductFormModal({ chapterId, product, productTypes, examV2Options, onClose, onSaved, pushToast }) {
  const isEdit = !!product;
  const [form, setForm] = useState(() => ({
    title: product?.title || "",
    instructor: product?.instructor || "CETWALLE",
    product_type: product?.product_type || productTypes[0]?.id || "document",
    is_paid: product?.is_paid || false,
    price: product?.price || 0,
    thumbnail_url: product?.thumbnail_url || "",
    document_path: product?.document_path || "",
    allow_download: product?.allow_download ?? true,
    duration_mins: product?.duration_mins || 90,
    linked_exam_v2_id: product?.linked_exam_v2_id || "",
    is_scheduled: product?.is_scheduled || false,
    scheduled_start_at: toLocalInputValue(product?.scheduled_start_at),
    scheduled_end_at: toLocalInputValue(product?.scheduled_end_at),
    result_declared_at: toLocalInputValue(product?.result_declared_at),
  }));
  const [activeSections, setActiveSections] = useState({ physics: true, chemistry: true, mathematics: true });
  const [sectionConfigs, setSectionConfigs] = useState({
    physics: { name: "Physics", totalQuestions: 50, positiveMarks: 1, negativeMarks: 0, paperAllocation: 1 },
    chemistry: { name: "Chemistry", totalQuestions: 50, positiveMarks: 1, negativeMarks: 0, paperAllocation: 1 },
    mathematics: { name: "Mathematics", totalQuestions: 50, positiveMarks: 2, negativeMarks: 0, paperAllocation: 2 },
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setCfg = (key, field, value) =>
    setSectionConfigs((prev) => ({ ...prev, [key]: { ...prev[key], [field]: Number(value) } }));
  const isExam = form.product_type === "exam";

  // date + time pair editing one "yyyy-MM-ddThh:mm" value
  const dt = (key) => {
    const [d = "", t = ""] = (form[key] || "").split("T");
    return {
      d, t,
      setD: (v) => set({ [key]: `${v}T${t || "00:00"}` }),
      setT: (v) => set({ [key]: `${d}T${v}` }),
    };
  };
  const start = dt("scheduled_start_at");
  const end = dt("scheduled_end_at");
  const result = dt("result_declared_at");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return pushToast("Title is required.", "error");
    if (!form.thumbnail_url) return pushToast("Please upload a thumbnail image.", "error");
    if (isExam && !form.linked_exam_v2_id) return pushToast("Choose which exam question set this test uses.", "error");
    if (!isExam && !form.document_path.trim()) return pushToast("Document path / swap file is required.", "error");
    if (isExam && form.is_scheduled && (!form.scheduled_start_at || !form.scheduled_end_at))
      return pushToast("Set both a start and an end date/time for the scheduled window.", "error");

    setSubmitting(true);
    const prefix = form.title.toLowerCase().trim().replace(/[^a-z0-9]/g, "_");
    const compiled = [];
    if (isExam) {
      if (activeSections.physics) compiled.push({ id: "phy_sec", ...sectionConfigs.physics, imagePrefix: `${prefix}_phy_q` });
      if (activeSections.chemistry) compiled.push({ id: "chem_sec", ...sectionConfigs.chemistry, imagePrefix: `${prefix}_chem_q` });
      if (activeSections.mathematics) compiled.push({ id: "math_sec", ...sectionConfigs.mathematics, imagePrefix: `${prefix}_math_q` });
    }
    const sched = isExam && form.is_scheduled;
    const payload = {
      ...(isEdit ? { id: product.id } : {}),
      chapter_id: chapterId,
      title: form.title,
      instructor: form.instructor,
      product_type: form.product_type,
      is_paid: form.is_paid,
      price: form.price,
      thumbnail_url: form.thumbnail_url,
      document_path: form.document_path,
      allow_download: form.allow_download,
      duration_mins: form.duration_mins,
      linked_exam_v2_id: form.linked_exam_v2_id,
      extension: form.document_path.includes(".") ? `.${form.document_path.split(".").pop()}` : ".pdf",
      sections: JSON.stringify(compiled),
      is_scheduled: sched ? form.is_scheduled : false,
      scheduled_start_at: sched ? fromLocalInputValue(form.scheduled_start_at) : null,
      scheduled_end_at: sched ? fromLocalInputValue(form.scheduled_end_at) : null,
      result_declared_at: sched ? fromLocalInputValue(form.result_declared_at) : null,
    };

    try {
      const res = await api("/api/admin/products", isEdit ? "PUT" : "POST", payload);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      pushToast(isEdit ? "Product updated." : "Product added.", "success");
      onSaved(data);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit Product" : "Add Product"} onClose={onClose} width={660}>
      <form onSubmit={handleSubmit}>
        <Field label="Title">
          <input required className={s.input} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Instructor">
          <input className={s.input} value={form.instructor} onChange={(e) => set({ instructor: e.target.value })} />
        </Field>
        <Field label="Product Type">
          <select className={s.input} value={form.product_type} onChange={(e) => set({ product_type: e.target.value })}>
            {productTypes.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
          </select>
          {productTypes.length === 0 && (
            <div className={s.help} style={{ color: "#b42318" }}>
              No product types defined yet. Add one in the old Content Manager &rarr; &ldquo;Product Types&rdquo; tab first.
            </div>
          )}
        </Field>

        <div className={`${s.field} ${s.inline}`}>
          <label className={s.check}>
            <input type="checkbox" checked={form.is_paid} onChange={(e) => set({ is_paid: e.target.checked })} /> Paid
          </label>
          {form.is_paid && (
            <input type="number" className={`${s.input} ${s.priceInput}`} placeholder="Price" value={form.price} onChange={(e) => set({ price: e.target.value })} />
          )}
        </div>

        <div className={s.field}>
          <ImageUploader bucket="thumbnails" label="Thumbnail" value={form.thumbnail_url} onUploaded={(url) => set({ thumbnail_url: url })} />
        </div>

        {isExam ? (
          <>
            <Field label="Linked Exam Question Set">
              <select className={s.input} value={form.linked_exam_v2_id} onChange={(e) => set({ linked_exam_v2_id: e.target.value })}>
                <option value="">&mdash; choose &mdash;</option>
                {examV2Options.map((o) => <option key={o.id} value={o.id}>{o.label} ({o.questionCount} q)</option>)}
              </select>
            </Field>
            <Field label="Duration (mins)">
              <input type="number" className={s.input} value={form.duration_mins} onChange={(e) => set({ duration_mins: e.target.value })} />
            </Field>

            <div className={s.field}>
              <label className={s.check}>
                <input type="checkbox" checked={form.is_scheduled} onChange={(e) => set({ is_scheduled: e.target.checked })} /> Is this exam scheduled?
              </label>
            </div>

            {form.is_scheduled && (
              <div className={s.subBox}>
                <div className={s.grid2}>
                  <Field label="Start date"><input type="date" className={s.input} value={start.d} onChange={(e) => start.setD(e.target.value)} /></Field>
                  <Field label="Start time"><input type="time" className={s.input} value={start.t} onChange={(e) => start.setT(e.target.value)} /></Field>
                  <Field label="End date"><input type="date" className={s.input} value={end.d} onChange={(e) => end.setD(e.target.value)} /></Field>
                  <Field label="End time"><input type="time" className={s.input} value={end.t} onChange={(e) => end.setT(e.target.value)} /></Field>
                  <Field label="Result declared - date"><input type="date" className={s.input} value={result.d} onChange={(e) => result.setD(e.target.value)} /></Field>
                  <Field label="Result declared - time"><input type="time" className={s.input} value={result.t} onChange={(e) => result.setT(e.target.value)} /></Field>
                </div>
                <div className={s.help}>Result date is optional and can be set later.</div>
              </div>
            )}

            <div className={s.field}>
              <p className={s.secLabel}>Sections</p>
              <div className={s.secColHead}>
                <span style={{ width: 16 }} /><span>Subject</span><span>Questions</span><span>Marks +</span><span>Marks &minus;</span>
              </div>
              {["physics", "chemistry", "mathematics"].map((key) => (
                <div key={key} className={s.secRow}>
                  <input type="checkbox" checked={activeSections[key]} onChange={(e) => setActiveSections((p) => ({ ...p, [key]: e.target.checked }))} />
                  <span className={s.secName}>{key}</span>
                  <input type="number" title="Questions" className={s.input} value={sectionConfigs[key].totalQuestions} onChange={(e) => setCfg(key, "totalQuestions", e.target.value)} />
                  <input type="number" title="Positive marks" className={s.input} value={sectionConfigs[key].positiveMarks} onChange={(e) => setCfg(key, "positiveMarks", e.target.value)} />
                  <input type="number" title="Negative marks" className={s.input} value={sectionConfigs[key].negativeMarks} onChange={(e) => setCfg(key, "negativeMarks", e.target.value)} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <Field label={form.product_type === "calculator" ? "Swap file path" : "Document path"}>
              <input
                className={`${s.input} ${s.mono}`}
                placeholder={form.product_type === "calculator" ? "swapfiles/tool.html" : "Documents/file.pdf"}
                value={form.document_path}
                onChange={(e) => set({ document_path: e.target.value })}
              />
            </Field>
            <div className={s.field}>
              <label className={s.check}>
                <input type="checkbox" checked={form.allow_download} onChange={(e) => set({ allow_download: e.target.checked })} /> Allow download
              </label>
            </div>
          </>
        )}

        <div className={s.modalFoot}>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onClose}>Cancel</button>
          <button type="submit" className={s.btn} disabled={submitting}>{submitting ? "Saving..." : isEdit ? "Save Changes" : "Add Product"}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- chapter / subsection */

function ChapterRow({ chapter, productTypes, examV2Options, pushToast, refreshParent }) {
  const [products, setProducts] = useState(chapter.products || []);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const loadProducts = useCallback(async () => {
    const res = await fetch(`/api/admin/products?chapter_id=${chapter.id}`);
    if (res.ok) setProducts(await res.json());
  }, [chapter.id]);

  useEffect(() => { if (expanded) loadProducts(); }, [expanded, loadProducts]);

  const deleteProduct = async (id) => {
    if (!confirm("Delete this product?")) return;
    const res = await api("/api/admin/products", "DELETE", { id });
    if (res.ok) { pushToast("Product deleted.", "success"); loadProducts(); }
    else pushToast("Delete failed.", "error");
  };

  const deleteChapter = async () => {
    if (!confirm(`Delete chapter "${chapter.name}"? It must have no products.`)) return;
    const res = await api("/api/admin/chapters", "DELETE", { id: chapter.id });
    const data = await res.json();
    if (res.ok) { pushToast("Chapter deleted.", "success"); refreshParent(); }
    else pushToast(data.error || "Delete failed.", "error");
  };

  return (
    <div className={s.chapter}>
      <div className={s.chHead} onClick={() => setExpanded(!expanded)}>
        <div className={s.accLeft}>
          <Chevron open={expanded} />
          <span className={s.chName}>{chapter.name}</span>
          <span className={s.accMeta}>({products.length} {products.length === 1 ? "product" : "products"})</span>
        </div>
        <div className={s.accActions} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setEditing(null); setShowForm(true); setExpanded(true); }}>+ Add Product</button>
          <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={deleteChapter}>Delete</button>
        </div>
      </div>

      {expanded && (
        <div className={s.chBody}>
          {products.length === 0 && <div className={s.emptyInline} style={{ padding: "6px 0" }}>No products yet.</div>}
          {products.map((p) => (
            <div key={p.id} className={s.prod}>
              <div className={s.prodLeft}>
                <img src={p.thumbnail_url} alt="" className={s.prodThumb} onError={(e) => { e.target.style.visibility = "hidden"; }} />
                <div style={{ minWidth: 0 }}>
                  <div className={s.prodTitle}>{p.title}</div>
                  <div className={s.prodMeta}>{p.product_type} &middot; {p.is_paid ? `\u20B9${p.price}` : "Free"}</div>
                </div>
              </div>
              <div className={s.prodActions}>
                <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setEditing(p); setShowForm(true); }}>Edit</button>
                <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={() => deleteProduct(p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ProductFormModal
          chapterId={chapter.id}
          product={editing}
          productTypes={productTypes}
          examV2Options={examV2Options}
          pushToast={pushToast}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadProducts(); }}
        />
      )}
    </div>
  );
}

function SubsectionRow({ subsection, productTypes, examV2Options, pushToast, refreshParent }) {
  const [chapters, setChapters] = useState(subsection.chapters || []);
  const [newChapter, setNewChapter] = useState("");
  const [expanded, setExpanded] = useState(false);

  const loadChapters = useCallback(async () => {
    const res = await fetch(`/api/admin/chapters?subsection_id=${subsection.id}`);
    if (res.ok) {
      const rows = await res.json();
      setChapters(rows.map((r) => ({ ...r, products: [] })));
    }
  }, [subsection.id]);

  useEffect(() => { if (expanded) loadChapters(); }, [expanded, loadChapters]);

  const addChapter = async () => {
    if (!newChapter.trim()) return;
    const res = await api("/api/admin/chapters", "POST", { subsection_id: subsection.id, name: newChapter });
    const data = await res.json();
    if (res.ok) { pushToast("Chapter added.", "success"); setNewChapter(""); loadChapters(); }
    else pushToast(data.error || "Failed to add chapter.", "error");
  };

  const deleteSubsection = async () => {
    if (!confirm(`Delete subsection "${subsection.name}"? It must have no chapters.`)) return;
    const res = await api("/api/admin/subsections", "DELETE", { id: subsection.id });
    const data = await res.json();
    if (res.ok) { pushToast("Subsection deleted.", "success"); refreshParent(); }
    else pushToast(data.error || "Delete failed.", "error");
  };

  return (
    <div className={s.acc}>
      <div className={s.accHead} onClick={() => setExpanded(!expanded)}>
        <div className={s.accLeft}>
          <Chevron open={expanded} />
          <span className={s.accName}>{subsection.name}</span>
          <span className={s.accMeta}>({chapters.length} {chapters.length === 1 ? "chapter" : "chapters"})</span>
        </div>
        <div className={s.accActions} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={deleteSubsection}>Delete Subsection</button>
        </div>
      </div>
      {expanded && (
        <div className={s.accBody}>
          {chapters.map((ch) => (
            <ChapterRow key={ch.id} chapter={ch} productTypes={productTypes} examV2Options={examV2Options} pushToast={pushToast} refreshParent={loadChapters} />
          ))}
          <div className={s.addRow}>
            <input className={s.input} placeholder="New chapter name" value={newChapter} onChange={(e) => setNewChapter(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChapter()} />
            <button type="button" className={s.btn} onClick={addChapter}>+ Add Chapter</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- course detail */

function CourseDetail({ courseId, onBack, pushToast, productTypes, examV2Options, segments }) {
  const [course, setCourse] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [newSub, setNewSub] = useState("");
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [thumb, setThumb] = useState("");
  const [icon, setIcon] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState(0);
  const [segmentId, setSegmentId] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/courses?id=${courseId}`);
    if (!res.ok) { setLoadErr("Failed to load this course."); return; }
    const d = await res.json();
    setLoadErr("");
    setCourse(d);
    setNotes(d.notes || "");
    setThumb(d.thumbnail_url || "");
    setIcon(d.icon_url || "");
    setName(d.name || "");
    setSlug(d.slug || "");
    setIsPaid(!!d.is_paid);
    setPrice(d.price || 0);
    setSegmentId(d.segment_id || "");
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const saveNotes = async () => {
    setSavingNotes(true);
    const res = await api("/api/admin/courses", "PUT", { id: courseId, notes });
    setSavingNotes(false);
    pushToast(res.ok ? "Notes saved." : "Failed to save notes.", res.ok ? "success" : "error");
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    const res = await api("/api/admin/courses", "PUT", {
      id: courseId, name, slug, thumbnail_url: thumb, icon_url: icon,
      is_paid: isPaid, price, badge_label: course?.badge_label, segment_id: segmentId || null,
    });
    setSavingMeta(false);
    if (res.ok) { pushToast("Saved.", "success"); load(); } else pushToast("Save failed.", "error");
  };

  const addSubsection = async () => {
    if (!newSub.trim()) return;
    const res = await api("/api/admin/subsections", "POST", { main_section_id: courseId, name: newSub });
    const data = await res.json();
    if (res.ok) { pushToast("Subsection added.", "success"); setNewSub(""); load(); }
    else pushToast(data.error || "Failed to add subsection.", "error");
  };

  return (
    <>
      <div className={s.head}>
        <div>
          <h1 className={s.title}>{course?.name || "Course"}</h1>
          <p className={s.subtitle}>Edit course details, notes and its content structure.</p>
        </div>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={onBack}>&larr; Back to Courses</button>
      </div>

      {loadErr && <p className={s.err}>{loadErr}<button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={load}>Retry</button></p>}
      {!course && !loadErr && <div className={s.empty}>Loading course&hellip;</div>}

      {course && (
        <>
          <div className={s.twoCol}>
            <div className={s.card}>
              <div className={s.cardHead}><h3 className={s.cardTitle}>Course Details</h3></div>
              <div className={s.cardBody}>
                <Field label="Name"><input className={s.input} value={name} onChange={(e) => setName(e.target.value)} /></Field>
                <Field label="Slug (URL path)">
                  <input className={`${s.input} ${s.mono}`} value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="course-slug" />
                </Field>
                <Field label="Where should this appear?">
                  <select className={s.input} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                    <option value="">Batches (top row, default)</option>
                    {segments.map((seg) => <option key={seg.id} value={seg.id}>{seg.name} (also list under this target segment)</option>)}
                  </select>
                </Field>
                <div className={s.field}>
                  <ImageUploader bucket="thumbnails" label="Thumbnail (shop card)" value={thumb} onUploaded={setThumb} />
                </div>
                <div className={`${s.field} ${s.inline}`}>
                  <label className={s.check}><input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /> Paid course</label>
                  {isPaid && <input type="number" className={`${s.input} ${s.priceInput}`} value={price} onChange={(e) => setPrice(e.target.value)} />}
                </div>
                <div className={s.field}>
                  <ImageUploader bucket="icons" label="Sidebar Icon" value={icon} onUploaded={setIcon} />
                </div>
                <div className={s.field}>
                  <button type="button" className={s.btn} onClick={saveMeta} disabled={savingMeta}>{savingMeta ? "Saving..." : "Save Details"}</button>
                </div>
              </div>
            </div>

            <div className={s.card}>
              <div className={s.cardHead}>
                <h3 className={s.cardTitle}>Notes</h3>
                <span className={s.cardHint}>Shown on the student dashboard</span>
              </div>
              <div className={s.cardBody}>
                <textarea className={`${s.input} ${s.textarea}`} value={notes} onChange={(e) => setNotes(e.target.value)} />
                <div className={s.field}>
                  <button type="button" className={s.btn} onClick={saveNotes} disabled={savingNotes}>{savingNotes ? "Saving..." : "Save Notes"}</button>
                </div>
              </div>
            </div>
          </div>

          <h2 className={s.sectionHead}>Subsections</h2>
          <p className={s.sectionHint}>Each subsection needs at least one chapter before products can be added.</p>
          {(course.subsections || []).map((sub) => (
            <SubsectionRow key={sub.id} subsection={sub} productTypes={productTypes} examV2Options={examV2Options} pushToast={pushToast} refreshParent={load} />
          ))}
          {(course.subsections || []).length === 0 && <div className={s.empty}>No subsections yet. Add the first one below.</div>}
          <div className={s.addRow}>
            <input className={s.input} placeholder="New subsection name" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSubsection()} />
            <button type="button" className={s.btn} onClick={addSubsection}>+ Add Subsection</button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- page root */

export default function AdminCoursesPage() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [selectedId, setSelectedId] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [examV2Options, setExamV2Options] = useState([]);
  const [segments, setSegments] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newIsPaid, setNewIsPaid] = useState(false);
  const [newPrice, setNewPrice] = useState(0);
  const [newSegmentId, setNewSegmentId] = useState("");
  const [creating, setCreating] = useState(false);

  const pushToast = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/courses", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setItems(await res.json());
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch("/api/admin/exam-v2-options").then((r) => (r.ok ? r.json() : [])).then(setExamV2Options).catch(() => {});
    fetch("/api/admin/product-types").then((r) => (r.ok ? r.json() : [])).then(setProductTypes).catch(() => {});
    fetch("/api/admin/target-segments").then((r) => (r.ok ? r.json() : [])).then(setSegments).catch(() => {});
  }, []);

  const resetCreate = () => {
    setNewName(""); setNewSlug(""); setSlugTouched(false);
    setNewIsPaid(false); setNewPrice(0); setNewSegmentId("");
  };

  const onNameChange = (v) => {
    setNewName(v);
    if (!slugTouched) setNewSlug(slugify(v));
  };

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const res = await api("/api/admin/courses", "POST", {
      name: newName,
      slug: newSlug.trim() || slugify(newName),
      is_paid: newIsPaid,
      price: newIsPaid ? newPrice : 0,
      segment_id: newSegmentId || null,
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      pushToast("Course created.", "success");
      resetCreate();
      setShowCreate(false);
      load();
    } else {
      pushToast(data.error || "Create failed.", "error");
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this course? It must have no subsections.")) return;
    const res = await api("/api/admin/courses", "DELETE", { id });
    const data = await res.json();
    if (res.ok) { pushToast("Deleted.", "success"); load(); }
    else pushToast(data.error || "Delete failed.", "error");
  };

  if (selectedId) {
    return (
      <>
        <Toasts toasts={toasts} />
        <CourseDetail
          courseId={selectedId}
          onBack={() => { setSelectedId(null); load(); window.scrollTo({ top: 0 }); }}
          pushToast={pushToast}
          productTypes={productTypes}
          examV2Options={examV2Options}
          segments={segments}
        />
      </>
    );
  }

  return (
    <>
      <Toasts toasts={toasts} />

      <div className={s.head}>
        <div>
          <h1 className={s.title}>Courses</h1>
          <p className={s.subtitle}>Create and manage courses, their subsections, chapters and products.</p>
        </div>
        <button type="button" className={s.btn} onClick={() => setShowCreate(true)}>+ Create Course</button>
      </div>

      {status === "loading" && <div className={s.empty}>Loading courses&hellip;</div>}
      {status === "error" && (
        <p className={s.err}>
          Failed to load courses.
          <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={() => { setStatus("loading"); load(); }}>Retry</button>
        </p>
      )}
      {status === "ready" && items.length === 0 && <div className={s.empty}>No courses yet. Click &ldquo;Create Course&rdquo; to add your first one.</div>}

      {status === "ready" && items.length > 0 && (
        <div className={`${s.card} ${s.tableWrap}`}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.thNo}>#</th>
                <th>Course</th>
                <th>Price</th>
                <th className={s.thActions}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={s.row} onClick={() => setSelectedId(item.id)}>
                  <td className={s.tdNo}>{i + 1}</td>
                  <td>
                    <div className={s.cell}>
                      {item.thumbnail_url
                        ? <img src={item.thumbnail_url} alt="" className={s.thumb} />
                        : <span className={s.thumbEmpty}>{(item.name || "?").charAt(0).toUpperCase()}</span>}
                      <div style={{ minWidth: 0 }}>
                        <div className={s.cName}>{item.name}</div>
                        {item.slug && <div className={s.cSlug}>/{item.slug}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    {item.is_paid
                      ? <span className={`${s.tag} ${s.tagPaid}`}>{`\u20B9${item.price}`}</span>
                      : <span className={s.tag}>Free</span>}
                  </td>
                  <td className={s.tdActions}>
                    <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSm}`} onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }}>Manage</button>
                    <button type="button" className={`${s.btn} ${s.btnDanger} ${s.btnSm}`} onClick={(e) => { e.stopPropagation(); remove(item.id); }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <Modal title="Create Course" onClose={() => { setShowCreate(false); resetCreate(); }} width={460}>
          <Field label="Name">
            <input className={s.input} value={newName} onChange={(e) => onNameChange(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && create()} />
          </Field>
          <Field label="Slug (URL path)" help={<>Goes into the <code>slug</code> column and is used for the course&apos;s URL. Auto-fills from the name, editable.</>}>
            <input
              className={`${s.input} ${s.mono}`}
              value={newSlug}
              onChange={(e) => { setSlugTouched(true); setNewSlug(slugify(e.target.value)); }}
              placeholder="auto-generated-from-name"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </Field>
          <Field label="Where should this appear?" help="Courses always show in the top Batches row. Pick a target segment (e.g. 11th, 12th) to also list this course inside that segment's row alongside its products.">
            <select className={s.input} value={newSegmentId} onChange={(e) => setNewSegmentId(e.target.value)}>
              <option value="">Batches (top row, default)</option>
              {segments.map((seg) => <option key={seg.id} value={seg.id}>{seg.name} (also list under this target segment)</option>)}
            </select>
          </Field>
          <div className={s.field}>
            <label className={s.check}><input type="checkbox" checked={newIsPaid} onChange={(e) => setNewIsPaid(e.target.checked)} /> Paid course</label>
          </div>
          {newIsPaid && (
            <Field label="Price (₹)">
              <input type="number" className={`${s.input} ${s.priceInput}`} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="e.g. 999" />
            </Field>
          )}
          <div className={s.modalFoot}>
            <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setShowCreate(false); resetCreate(); }}>Cancel</button>
            <button type="button" className={s.btn} onClick={create} disabled={creating}>{creating ? "Creating..." : "Create"}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
