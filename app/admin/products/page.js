"use client";

// 📂 SAVE THIS FILE AT: app/admin/products/page.js
//
// Full content-management screen. Structure mirrors the real hierarchy the
// dashboard reads: sidebar_main_sections (Courses / Sections) ->
// sidebar_subsections -> sidebar_chapters -> products. Every product now
// attaches via chapter_id only. Course-owned subsections/chapters never
// appear in a standalone list -- they only exist inside that course's own
// drill-down screen, same for Sections.

import { useEffect, useMemo, useState, useCallback } from "react";
import "../users/adminuser.css";
import "../reports/adminreports.css";
import ImageUploader from "../../../components/admin/ImageUploader";

// Converts a stored ISO/UTC timestamp into the "yyyy-MM-ddThh:mm" shape
// <input type="datetime-local"> needs, in the browser's local time.
// Converts it back to a full ISO string on submit.
function toLocalInputValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(localValue) {
  if (!localValue) return null;
  const d = new Date(localValue);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const TABS = [
  { key: "courses", label: "Courses", icon: "school" },
  { key: "sections", label: "Sections", icon: "view_sidebar" },
  { key: "types", label: "Product Types", icon: "tune" },
];

function Toast({ toasts }) {
  return (
    <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === "error" ? "#fee2e2" : "#dcfce7",
          color: t.type === "error" ? "#991b1b" : "#166534",
          border: `1px solid ${t.type === "error" ? "#fca5a5" : "#86efac"}`,
          padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: "0 8px 20px rgba(0,0,0,0.08)", minWidth: 240,
        }}>{t.message}</div>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: width, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 30px 60px rgba(0,0,0,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h3>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 20, color: "#64748b" }}>✕</button>
        </div>
        <div style={{ padding: 22 }}>{children}</div>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 14, marginTop: 4, boxSizing: "border-box" };
const labelStyle = { display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginTop: 14 };
const btnPrimary = { background: "#1e3a8a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnGhost = { background: "#f1f5f9", color: "#334155", border: "1px solid #e2e8f0", padding: "8px 14px", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer" };
const btnDanger = { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5", padding: "6px 10px", borderRadius: 8, fontWeight: 700, fontSize: 11, cursor: "pointer" };

// Reliable chevron — plain inline SVG instead of an icon-font glyph so it
// always renders correctly with no external font dependency.
function Chevron({ open, size = 16, color = "#94a3b8" }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
    >
      <path d="M9 6l6 6-6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const TAB_ICON_PATHS = {
  school: "M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4.09C5 19.5 8.13 21 12 21s7-1.5 7-3.73v-4.09L12 17l-7-3.82z",
  view_sidebar: "M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm1 2v10h5V7H5zm7 0v10h7V7h-7z",
  tune: "M3 17v2h6v-2H3zm0-12v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
};

function TabIcon({ name, size = 16 }) {
  const d = TAB_ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

// ---------------------------------------------------------------------
// PRODUCT FORM MODAL — always scoped to one chapter (chapterId is fixed)
// ---------------------------------------------------------------------
function ProductFormModal({ chapterId, product, productTypes, examV2Options, onClose, onSaved, pushToast }) {
  const isEdit = !!product;
  const [form, setForm] = useState(() => ({
    title: product?.title || "",
    instructor: product?.instructor || "CETWALLE",
    product_type: product?.product_type || (productTypes[0]?.id || "document"),
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return pushToast("Title is required.", "error");
    if (!form.thumbnail_url) return pushToast("Please upload a thumbnail image.", "error");
    if (form.product_type === "exam" && !form.linked_exam_v2_id) return pushToast("Choose which exam question set this test uses.", "error");
    if (form.product_type !== "exam" && !form.document_path.trim()) return pushToast("Document path / swap file is required.", "error");
    if (form.product_type === "exam" && form.is_scheduled && (!form.scheduled_start_at || !form.scheduled_end_at)) return pushToast("Set both a start and an end date/time for the scheduled window.", "error");

    setIsSubmitting(true);
    const prefixHandle = form.title.toLowerCase().trim().replace(/[^a-z0-9]/g, "_");
    const compiledSections = [];
    if (form.product_type === "exam") {
      if (activeSections.physics) compiledSections.push({ id: "phy_sec", ...sectionConfigs.physics, imagePrefix: `${prefixHandle}_phy_q` });
      if (activeSections.chemistry) compiledSections.push({ id: "chem_sec", ...sectionConfigs.chemistry, imagePrefix: `${prefixHandle}_chem_q` });
      if (activeSections.mathematics) compiledSections.push({ id: "math_sec", ...sectionConfigs.mathematics, imagePrefix: `${prefixHandle}_math_q` });
    }

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
      sections: JSON.stringify(compiledSections),
      is_scheduled: form.product_type === "exam" ? form.is_scheduled : false,
      scheduled_start_at: form.product_type === "exam" && form.is_scheduled ? fromLocalInputValue(form.scheduled_start_at) : null,
      scheduled_end_at: form.product_type === "exam" && form.is_scheduled ? fromLocalInputValue(form.scheduled_end_at) : null,
      result_declared_at: form.product_type === "exam" && form.is_scheduled ? fromLocalInputValue(form.result_declared_at) : null,
    };

    try {
      const res = await fetch("/api/admin/products", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      pushToast(isEdit ? "Product updated." : "Product added.", "success");
      onSaved(data);
    } catch (err) {
      pushToast(err.message, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title={isEdit ? "Edit Product" : "Add Product"} onClose={onClose} width={640}>
      <form onSubmit={handleSubmit}>
        <label style={labelStyle}>Title</label>
        <input required style={inputStyle} value={form.title} onChange={(e) => set({ title: e.target.value })} />

        <label style={labelStyle}>Instructor</label>
        <input style={inputStyle} value={form.instructor} onChange={(e) => set({ instructor: e.target.value })} />

        <label style={labelStyle}>Product Type</label>
        <select style={inputStyle} value={form.product_type} onChange={(e) => set({ product_type: e.target.value })}>
          {productTypes.map(t => <option key={t.id} value={t.id}>{t.id}</option>)}
        </select>
        {productTypes.length === 0 && <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>No product types defined yet — add one in the "Product Types" tab first.</div>}

        <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
            <input type="checkbox" checked={form.is_paid} onChange={(e) => set({ is_paid: e.target.checked })} /> Paid
          </label>
          {form.is_paid && <input type="number" style={{ ...inputStyle, marginTop: 0, width: 120 }} placeholder="Price" value={form.price} onChange={(e) => set({ price: e.target.value })} />}
        </div>

        <div style={{ marginTop: 14 }}>
          <ImageUploader bucket="thumbnails" label="Thumbnail" value={form.thumbnail_url} onUploaded={(url) => set({ thumbnail_url: url })} />
        </div>

        {form.product_type === "exam" ? (
          <>
            <label style={labelStyle}>Linked Exam Question Set</label>
            <select style={inputStyle} value={form.linked_exam_v2_id} onChange={(e) => set({ linked_exam_v2_id: e.target.value })}>
              <option value="">— choose —</option>
              {examV2Options.map(o => <option key={o.id} value={o.id}>{o.label} ({o.questionCount} q)</option>)}
            </select>

            <label style={labelStyle}>Duration (mins)</label>
            <input type="number" style={inputStyle} value={form.duration_mins} onChange={(e) => set({ duration_mins: e.target.value })} />

            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6, marginTop: 14 }}>
              <input type="checkbox" checked={form.is_scheduled} onChange={(e) => set({ is_scheduled: e.target.checked })} /> Is this exam scheduled?
            </label>

            {form.is_scheduled && (
              <div style={{ marginTop: 8, padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #eef2f7" }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Start date</label>
                    <input type="date" style={inputStyle} value={form.scheduled_start_at.split("T")[0] || ""}
                      onChange={(e) => set({ scheduled_start_at: `${e.target.value}T${form.scheduled_start_at.split("T")[1] || "00:00"}` })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Start time</label>
                    <input type="time" style={inputStyle} value={form.scheduled_start_at.split("T")[1] || ""}
                      onChange={(e) => set({ scheduled_start_at: `${form.scheduled_start_at.split("T")[0] || ""}T${e.target.value}` })} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>End date</label>
                    <input type="date" style={inputStyle} value={form.scheduled_end_at.split("T")[0] || ""}
                      onChange={(e) => set({ scheduled_end_at: `${e.target.value}T${form.scheduled_end_at.split("T")[1] || "00:00"}` })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>End time</label>
                    <input type="time" style={inputStyle} value={form.scheduled_end_at.split("T")[1] || ""}
                      onChange={(e) => set({ scheduled_end_at: `${form.scheduled_end_at.split("T")[0] || ""}T${e.target.value}` })} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Result declared — date <span style={{ fontWeight: 400, color: "#94a3b8" }}>(optional, can set later)</span></label>
                    <input type="date" style={inputStyle} value={form.result_declared_at.split("T")[0] || ""}
                      onChange={(e) => set({ result_declared_at: `${e.target.value}T${form.result_declared_at.split("T")[1] || "00:00"}` })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Result declared — time</label>
                    <input type="time" style={inputStyle} value={form.result_declared_at.split("T")[1] || ""}
                      onChange={(e) => set({ result_declared_at: `${form.result_declared_at.split("T")[0] || ""}T${e.target.value}` })} />
                  </div>
                </div>
              </div>
            )}

            <label style={labelStyle}>Sections</label>
            {["physics", "chemistry", "mathematics"].map(key => (
              <div key={key} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, background: "#f8fafc", padding: 8, borderRadius: 8 }}>
                <input type="checkbox" checked={activeSections[key]} onChange={(e) => setActiveSections(prev => ({ ...prev, [key]: e.target.checked }))} />
                <span style={{ width: 90, fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}>{key}</span>
                <input type="number" title="Questions" style={{ ...inputStyle, marginTop: 0 }} value={sectionConfigs[key].totalQuestions} onChange={(e) => setSectionConfigs(prev => ({ ...prev, [key]: { ...prev[key], totalQuestions: Number(e.target.value) } }))} />
                <input type="number" title="Positive marks" style={{ ...inputStyle, marginTop: 0 }} value={sectionConfigs[key].positiveMarks} onChange={(e) => setSectionConfigs(prev => ({ ...prev, [key]: { ...prev[key], positiveMarks: Number(e.target.value) } }))} />
                <input type="number" title="Negative marks" style={{ ...inputStyle, marginTop: 0 }} value={sectionConfigs[key].negativeMarks} onChange={(e) => setSectionConfigs(prev => ({ ...prev, [key]: { ...prev[key], negativeMarks: Number(e.target.value) } }))} />
              </div>
            ))}
          </>
        ) : (
          <>
            <label style={labelStyle}>{form.product_type === "calculator" ? "Swap file path" : "Document path"}</label>
            <input style={{ ...inputStyle, fontFamily: "monospace" }} placeholder={form.product_type === "calculator" ? "swapfiles/tool.html" : "Documents/file.pdf"} value={form.document_path} onChange={(e) => set({ document_path: e.target.value })} />

            <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={form.allow_download} onChange={(e) => set({ allow_download: e.target.checked })} /> Allow download
            </label>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button type="button" style={btnGhost} onClick={onClose}>Cancel</button>
          <button type="submit" style={btnPrimary} disabled={isSubmitting}>{isSubmitting ? "Saving…" : isEdit ? "Save Changes" : "Add Product"}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// CHAPTER ROW — shows its products, "+ Add Product"
// ---------------------------------------------------------------------
function ChapterRow({ chapter, productTypes, examV2Options, pushToast, refreshParent }) {
  const [products, setProducts] = useState(chapter.products || []);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const loadProducts = useCallback(async () => {
    const res = await fetch(`/api/admin/products?chapter_id=${chapter.id}`);
    if (res.ok) setProducts(await res.json());
  }, [chapter.id]);

  useEffect(() => { if (expanded) loadProducts(); }, [expanded, loadProducts]);

  const deleteProduct = async (id) => {
    if (!confirm("Delete this product?")) return;
    const res = await fetch("/api/admin/products", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) { pushToast("Product deleted.", "success"); loadProducts(); }
    else pushToast("Delete failed.", "error");
  };

  const deleteChapter = async () => {
    if (!confirm(`Delete chapter "${chapter.name}"? It must have no products.`)) return;
    const res = await fetch("/api/admin/chapters", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: chapter.id }) });
    const data = await res.json();
    if (res.ok) { pushToast("Chapter deleted.", "success"); refreshParent(); }
    else pushToast(data.error || "Delete failed.", "error");
  };

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginTop: 8, overflow: "hidden" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#fff", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chevron open={expanded} size={16} color="#94a3b8" />
          <strong style={{ fontSize: 13.5 }}>{chapter.name}</strong>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>({products.length} products)</span>
        </div>
        <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          <button style={btnGhost} onClick={() => { setEditingProduct(null); setShowForm(true); setExpanded(true); }}>+ Add Product</button>
          <button style={btnDanger} onClick={deleteChapter}>Delete</button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "8px 14px 14px", background: "#f8fafc" }}>
          {products.length === 0 && <div style={{ fontSize: 12, color: "#94a3b8", padding: "6px 0" }}>No products yet.</div>}
          {products.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#fff", borderRadius: 8, marginTop: 6, border: "1px solid #eef2f7" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <img src={p.thumbnail_url} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", background: "#f1f5f9" }} onError={(e) => e.target.style.visibility = "hidden"} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{p.title}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.product_type} · {p.is_paid ? `₹${p.price}` : "Free"}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button style={btnGhost} onClick={() => { setEditingProduct(p); setShowForm(true); }}>Edit</button>
                <button style={btnDanger} onClick={() => deleteProduct(p.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <ProductFormModal
          chapterId={chapter.id}
          product={editingProduct}
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

// ---------------------------------------------------------------------
// SUBSECTION ROW — shows its chapters, "+ Add Chapter"
// ---------------------------------------------------------------------
function SubsectionRow({ subsection, productTypes, examV2Options, pushToast, refreshParent }) {
  const [chapters, setChapters] = useState(subsection.chapters || []);
  const [newChapterName, setNewChapterName] = useState("");
  const [expanded, setExpanded] = useState(false);

  const loadChapters = useCallback(async () => {
    const res = await fetch(`/api/admin/chapters?subsection_id=${subsection.id}`);
    if (res.ok) {
      const rows = await res.json();
      setChapters(rows.map(r => ({ ...r, products: [] })));
    }
  }, [subsection.id]);

  useEffect(() => { if (expanded) loadChapters(); }, [expanded, loadChapters]);

  const addChapter = async () => {
    if (!newChapterName.trim()) return;
    const res = await fetch("/api/admin/chapters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subsection_id: subsection.id, name: newChapterName }) });
    const data = await res.json();
    if (res.ok) { pushToast("Chapter added.", "success"); setNewChapterName(""); loadChapters(); }
    else pushToast(data.error || "Failed to add chapter.", "error");
  };

  const deleteSubsection = async () => {
    if (!confirm(`Delete subsection "${subsection.name}"? It must have no chapters.`)) return;
    const res = await fetch("/api/admin/subsections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: subsection.id }) });
    const data = await res.json();
    if (res.ok) { pushToast("Subsection deleted.", "success"); refreshParent(); }
    else pushToast(data.error || "Delete failed.", "error");
  };

  return (
    <div style={{ border: "1px solid #dbe3ee", borderRadius: 12, marginTop: 10, background: "#fbfdff" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chevron open={expanded} size={18} color="#3b82f6" />
          <strong style={{ fontSize: 14.5 }}>{subsection.name}</strong>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>({chapters.length} chapters)</span>
        </div>
        <button style={btnDanger} onClick={(e) => { e.stopPropagation(); deleteSubsection(); }}>Delete Subsection</button>
      </div>
      {expanded && (
        <div style={{ padding: "0 16px 16px" }}>
          {chapters.map(ch => (
            <ChapterRow key={ch.id} chapter={ch} productTypes={productTypes} examV2Options={examV2Options} pushToast={pushToast} refreshParent={loadChapters} />
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input style={{ ...inputStyle, marginTop: 0 }} placeholder="New chapter name" value={newChapterName} onChange={(e) => setNewChapterName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addChapter()} />
            <button style={btnPrimary} onClick={addChapter}>+ Add Chapter</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// MAIN SECTION DETAIL — used for both a Course and a plain Section
// ---------------------------------------------------------------------
function SectionDetail({ sectionId, isCourse, onBack, pushToast, productTypes, examV2Options, segments }) {
  const [section, setSection] = useState(null);
  const [newSubName, setNewSubName] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [thumb, setThumb] = useState("");
  const [icon, setIcon] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [price, setPrice] = useState(0);
  const [segmentId, setSegmentId] = useState("");

  const apiBase = isCourse ? "/api/admin/courses" : "/api/admin/sections";

  const load = useCallback(async () => {
    if (isCourse) {
      const res = await fetch(`/api/admin/courses?id=${sectionId}`);
      if (res.ok) {
        const data = await res.json();
        setSection(data);
        setNotesDraft(data.notes || "");
        setThumb(data.thumbnail_url || "");
        setIcon(data.icon_url || "");
        setFormName(data.name || "");
        setFormSlug(data.slug || "");
        setIsPaid(!!data.is_paid);
        setPrice(data.price || 0);
        setSegmentId(data.segment_id || "");
      }
    } else {
      const [secRes, subRes] = await Promise.all([
        fetch("/api/admin/sections"),
        fetch(`/api/admin/subsections?parent_id=${sectionId}`),
      ]);
      const sections = secRes.ok ? await secRes.json() : [];
      const found = sections.find(s => s.id === sectionId);
      const subs = subRes.ok ? await subRes.json() : [];
      const merged = { ...found, subsections: subs.map(s => ({ ...s, chapters: [] })) };
      setSection(merged);
      setNotesDraft(found?.notes || "");
      setIcon(found?.icon_url || "");
      setFormName(found?.name || "");
    }
  }, [sectionId, isCourse]);

  useEffect(() => { load(); }, [load]);

  const saveNotes = async () => {
    setSavingNotes(true);
    const res = await fetch(apiBase, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: sectionId, notes: notesDraft }) });
    setSavingNotes(false);
    if (res.ok) pushToast("Notes saved.", "success"); else pushToast("Failed to save notes.", "error");
  };

  const saveMeta = async () => {
    setSavingMeta(true);
    const payload = isCourse
      ? { id: sectionId, name: formName, slug: formSlug, thumbnail_url: thumb, icon_url: icon, is_paid: isPaid, price, badge_label: section?.badge_label, segment_id: segmentId || null }
      : { id: sectionId, name: formName, icon_url: icon };
    const res = await fetch(apiBase, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSavingMeta(false);
    if (res.ok) { pushToast("Saved.", "success"); load(); } else pushToast("Save failed.", "error");
  };

  const addSubsection = async () => {
    if (!newSubName.trim()) return;
    const res = await fetch("/api/admin/subsections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ main_section_id: sectionId, name: newSubName }) });
    const data = await res.json();
    if (res.ok) { pushToast("Subsection added.", "success"); setNewSubName(""); load(); }
    else pushToast(data.error || "Failed to add subsection.", "error");
  };

  if (!section) return <div style={{ padding: 30, color: "#94a3b8" }}>Loading…</div>;

  return (
    <div>
      <button style={btnGhost} onClick={onBack}>← Back to {isCourse ? "Courses" : "Sections"}</button>

      <div style={{ display: "grid", gridTemplateColumns: isCourse ? "1fr 1fr" : "1fr", gap: 20, marginTop: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>{isCourse ? "Course" : "Section"} Details</h3>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={formName} onChange={(e) => setFormName(e.target.value)} />

          {isCourse && (
            <>
              <label style={labelStyle}>Slug (URL path)</label>
              <input style={inputStyle} value={formSlug} onChange={(e) => setFormSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""))} placeholder="course-slug" />

              <label style={labelStyle}>Where should this appear?</label>
              <select style={inputStyle} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                <option value="">Batches (top row, default)</option>
                {segments.map(seg => (
                  <option key={seg.id} value={seg.id}>{seg.name} (also list under this target segment)</option>
                ))}
              </select>
            </>
          )}

          {isCourse && (
            <>
              <div style={{ marginTop: 14 }}>
                <ImageUploader bucket="thumbnails" label="Thumbnail (shop card)" value={thumb} onUploaded={setThumb} />
              </div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} /> Paid course
                </label>
                {isPaid && <input type="number" style={{ ...inputStyle, marginTop: 0, width: 120 }} value={price} onChange={(e) => setPrice(e.target.value)} />}
              </div>
            </>
          )}

          <div style={{ marginTop: 14 }}>
            <ImageUploader bucket="icons" label="Sidebar Icon" value={icon} onUploaded={setIcon} />
          </div>

          <button style={{ ...btnPrimary, marginTop: 16 }} onClick={saveMeta} disabled={savingMeta}>{savingMeta ? "Saving…" : "Save Details"}</button>
        </div>

        {isCourse && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Notes (shown on dashboard)</h3>
            <textarea style={{ ...inputStyle, minHeight: 140, fontFamily: "inherit" }} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
            <button style={{ ...btnPrimary, marginTop: 12 }} onClick={saveNotes} disabled={savingNotes}>{savingNotes ? "Saving…" : "Save Notes"}</button>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Subsections</h3>
        <p style={{ fontSize: 12.5, color: "#94a3b8", margin: "0 0 8px" }}>Each subsection needs at least one chapter before products can be added.</p>
        {(section.subsections || []).map(sub => (
          <SubsectionRow key={sub.id} subsection={sub} productTypes={productTypes} examV2Options={examV2Options} pushToast={pushToast} refreshParent={load} />
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input style={{ ...inputStyle, marginTop: 0 }} placeholder="New subsection name" value={newSubName} onChange={(e) => setNewSubName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addSubsection()} />
          <button style={btnPrimary} onClick={addSubsection}>+ Add Subsection</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// COURSES / SECTIONS LIST TABS
// ---------------------------------------------------------------------
function EntityListTab({ isCourse, pushToast, productTypes, examV2Options, segments }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newIsPaid, setNewIsPaid] = useState(false);
  const [newPrice, setNewPrice] = useState(0);
  const [newSegmentId, setNewSegmentId] = useState("");
  const [creating, setCreating] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const apiBase = isCourse ? "/api/admin/courses" : "/api/admin/sections";

  const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const handleNameChange = (val) => {
    setNewName(val);
    if (isCourse && !slugTouched) setNewSlug(slugify(val));
  };

  const load = useCallback(async () => {
    const res = await fetch(apiBase);
    if (res.ok) setItems(await res.json());
  }, [apiBase]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const payload = isCourse
      ? { name: newName, slug: newSlug.trim() || slugify(newName), is_paid: newIsPaid, price: newIsPaid ? newPrice : 0, segment_id: newSegmentId || null }
      : { name: newName };
    const res = await fetch(apiBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    setCreating(false);
    if (res.ok) { pushToast(`${isCourse ? "Course" : "Section"} created.`, "success"); setNewName(""); setNewSlug(""); setSlugTouched(false); setNewIsPaid(false); setNewPrice(0); setNewSegmentId(""); setShowCreate(false); load(); }
    else pushToast(data.error || "Create failed.", "error");
  };

  const remove = async (id) => {
    if (!confirm(`Delete this ${isCourse ? "course" : "section"}? It must have no subsections.`)) return;
    const res = await fetch(apiBase, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const data = await res.json();
    if (res.ok) { pushToast("Deleted.", "success"); load(); }
    else pushToast(data.error || "Delete failed.", "error");
  };

  if (selectedId) {
    return <SectionDetail sectionId={selectedId} isCourse={isCourse} onBack={() => { setSelectedId(null); load(); }} pushToast={pushToast} productTypes={productTypes} examV2Options={examV2Options} segments={segments} />;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>{isCourse ? "Courses" : "Sections"}</h2>
        <button style={btnPrimary} onClick={() => setShowCreate(true)}>+ Add New {isCourse ? "Course" : "Section"}</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {items.map(item => (
          <div key={item.id} onClick={() => setSelectedId(item.id)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, cursor: "pointer", position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {item.thumbnail_url && <img src={item.thumbnail_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} />}
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{item.is_paid ? `₹${item.price}` : "Free"}</div>
              </div>
            </div>
            <button style={{ ...btnDanger, position: "absolute", top: 10, right: 10 }} onClick={(e) => { e.stopPropagation(); remove(item.id); }}>Delete</button>
          </div>
        ))}
        {items.length === 0 && <div style={{ color: "#94a3b8", fontSize: 13 }}>None yet — add your first one.</div>}
      </div>

      {showCreate && (
        <Modal title={`New ${isCourse ? "Course" : "Section"}`} onClose={() => setShowCreate(false)} width={420}>
          <label style={labelStyle}>Name</label>
          <input style={inputStyle} value={newName} onChange={(e) => handleNameChange(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && create()} />

          {isCourse && (
            <>
              <label style={labelStyle}>Slug (URL path)</label>
              <input
                style={inputStyle}
                value={newSlug}
                onChange={(e) => { setSlugTouched(true); setNewSlug(slugify(e.target.value)); }}
                placeholder="auto-generated-from-name"
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Goes into the <code>slug</code> column — used for the course's URL. Auto-fills from the name, editable.</div>

              <label style={labelStyle}>Where should this appear?</label>
              <select style={inputStyle} value={newSegmentId} onChange={(e) => setNewSegmentId(e.target.value)}>
                <option value="">Batches (top row, default)</option>
                {segments.map(seg => (
                  <option key={seg.id} value={seg.id}>{seg.name} (also list under this target segment)</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Courses always show in the top "Batches" row. Pick a target segment (e.g. 11th, 12th) to also list this course inside that segment's row alongside its products.</div>

              <div style={{ marginTop: 16 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                  <input type="checkbox" checked={newIsPaid} onChange={(e) => setNewIsPaid(e.target.checked)} /> Paid course
                </label>
                {newIsPaid && (
                  <>
                    <label style={labelStyle}>Price (₹)</label>
                    <input type="number" style={{ ...inputStyle, width: 140 }} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="e.g. 999" />
                  </>
                )}
              </div>
            </>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
            <button style={btnGhost} onClick={() => setShowCreate(false)}>Cancel</button>
            <button style={btnPrimary} onClick={create} disabled={creating}>{creating ? "Creating…" : "Create"}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// PRODUCT TYPES TAB
// ---------------------------------------------------------------------
function ProductTypesTab({ pushToast, onChange }) {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({ id: "", handling_strategy: "REDIRECT", button_label: "Open" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/product-types");
    if (res.ok) { const data = await res.json(); setTypes(data); onChange?.(data); }
  }, [onChange]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.id.trim()) return pushToast("Type key is required (e.g. exam, document).", "error");
    const res = await fetch("/api/admin/product-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (res.ok) { pushToast("Type added.", "success"); setForm({ id: "", handling_strategy: "REDIRECT", button_label: "Open" }); load(); }
    else pushToast(data.error || "Failed.", "error");
  };

  const remove = async (id) => {
    if (!confirm(`Delete product type "${id}"? Any existing products of this type will show "Pending Update".`)) return;
    const res = await fetch("/api/admin/product-types", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) { pushToast("Deleted.", "success"); load(); } else pushToast("Delete failed.", "error");
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>Product Types</h2>
      <p style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 0 }}>Defines what each product's dashboard button does. Every product's "Type" must match one of these.</p>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginTop: 14 }}>
        {types.map(t => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
            <div>
              <strong style={{ fontSize: 13 }}>{t.id}</strong>
              <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 10 }}>{t.handling_strategy} · "{t.button_label}"</span>
            </div>
            <button style={btnDanger} onClick={() => remove(t.id)}>Delete</button>
          </div>
        ))}
        {types.length === 0 && <div style={{ fontSize: 12.5, color: "#94a3b8" }}>None yet.</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <input style={{ ...inputStyle, marginTop: 0, width: 140 }} placeholder="type key (exam)" value={form.id} onChange={(e) => setForm(prev => ({ ...prev, id: e.target.value }))} />
          <select style={{ ...inputStyle, marginTop: 0, width: 160 }} value={form.handling_strategy} onChange={(e) => setForm(prev => ({ ...prev, handling_strategy: e.target.value }))}>
            <option value="REDIRECT">REDIRECT</option>
            <option value="INLINE_SWAP">INLINE_SWAP</option>
          </select>
          <input style={{ ...inputStyle, marginTop: 0, width: 140 }} placeholder="button label" value={form.button_label} onChange={(e) => setForm(prev => ({ ...prev, button_label: e.target.value }))} />
          <button style={btnPrimary} onClick={add}>+ Add Type</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// PAGE ROOT
// ---------------------------------------------------------------------
export default function AdminProductsPage() {
  const [activeTab, setActiveTab] = useState("courses");
  const [toasts, setToasts] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [examV2Options, setExamV2Options] = useState([]);
  const [segments, setSegments] = useState([]);

  const pushToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    fetch("/api/admin/exam-v2-options").then(r => r.ok ? r.json() : []).then(setExamV2Options).catch(() => {});
    fetch("/api/admin/product-types").then(r => r.ok ? r.json() : []).then(setProductTypes).catch(() => {});
    fetch("/api/admin/target-segments").then(r => r.ok ? r.json() : []).then(setSegments).catch(() => {});
  }, []);

  return (
    <div className="body" style={{ minHeight: "100vh", padding: "30px 24px 80px", fontFamily: "'Inter', sans-serif" }}>
      <Toast toasts={toasts} />
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>Content Manager</h1>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 0 }}>Courses, Sections, Subsections, Chapters &amp; Products — all in one place.</p>

        <div style={{ display: "flex", gap: 8, marginTop: 20, marginBottom: 24, borderBottom: "1px solid #e2e8f0" }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: "10px 16px", border: "none", background: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13.5,
                color: activeTab === tab.key ? "#1e3a8a" : "#94a3b8",
                borderBottom: activeTab === tab.key ? "2px solid #1e3a8a" : "2px solid transparent",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <TabIcon name={tab.icon} size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "courses" && <EntityListTab isCourse pushToast={pushToast} productTypes={productTypes} examV2Options={examV2Options} segments={segments} />}
        {activeTab === "sections" && <EntityListTab isCourse={false} pushToast={pushToast} productTypes={productTypes} examV2Options={examV2Options} segments={segments} />}
        {activeTab === "types" && <ProductTypesTab pushToast={pushToast} onChange={setProductTypes} />}
      </div>
    </div>
  );
}