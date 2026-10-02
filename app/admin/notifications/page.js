// SAVE THIS FILE AT: app/admin/notifications/page.js  (overwrite existing file)
//
// Plain client component, no external UI kit assumed — styled with inline
// styles so it drops in regardless of what your other admin pages use.
// Add a link to "/admin/notifications" in your admin nav/sidebar wherever
// the other admin/* links live.

"use client";

import { useEffect, useState } from "react";

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState("all");
  const [courseId, setCourseId] = useState("");
  const [userEmailsRaw, setUserEmailsRaw] = useState("");
  const [courses, setCourses] = useState([]);
  const [history, setHistory] = useState([]);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  // "Schedule for later" — off by default, same immediate-send behaviour
  // as before. When on, scheduledDate/scheduledTime feed a single
  // scheduledAt ISO string sent to the API instead of sending right away.
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");

  // Picked file stays local (just a preview) until the notification is
  // actually sent — it's only uploaded to storage inside handleSend.
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  function handlePickImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveImage() {
    setImageFile(null);
    setImagePreviewUrl(null);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Uploads to Supabase Storage via the shared admin upload route — only
  // called from inside handleSend, never right after picking the file.
  async function uploadPickedImage() {
    if (!imageFile) return null;
    const base64Data = await fileToBase64(imageFile);
    const res = await fetch("/api/admin/upload-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket: "notification-images",
        fileName: imageFile.name,
        contentType: imageFile.type,
        base64Data,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Image upload failed.");
    return json.publicUrl;
  }

  async function loadCourses() {
    const res = await fetch("/api/admin/notifications?courses=1");
    const json = await res.json();
    if (res.ok) setCourses(json.courses || []);
  }

  async function loadHistory() {
    const res = await fetch("/api/admin/notifications");
    const json = await res.json();
    if (res.ok) setHistory(json.history || []);
  }

  useEffect(() => {
    loadCourses();
    loadHistory();
  }, []);

  async function handleDelete(id) {
    if (!confirm("Delete this notification? This also removes it from students' in-app list.")) return;
    try {
      const res = await fetch(`/api/admin/notifications?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: json.error || "Failed to delete." });
        return;
      }
      setHistory((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function handleResend(id) {
    setMessage(null);
    setResendingId(id);
    try {
      const res = await fetch("/api/admin/notifications/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: json.error || "Failed to resend." });
        return;
      }
      setMessage({
        type: "success",
        text: `Resent to ${json.recipientCount} student(s) — ${json.pushSentCount} push notification(s) delivered.`,
      });
      loadHistory();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setResendingId(null);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    setMessage(null);

    if (!title.trim() || !body.trim()) {
      setMessage({ type: "error", text: "Title and message body are required." });
      return;
    }
    if (targetType === "course" && !courseId) {
      setMessage({ type: "error", text: "Pick a course." });
      return;
    }
    if (targetType === "users" && !userEmailsRaw.trim()) {
      setMessage({ type: "error", text: "Enter at least one email." });
      return;
    }
    let scheduledAtIso = null;
    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        setMessage({ type: "error", text: "Pick both a date and a time to schedule for." });
        return;
      }
      const combined = new Date(`${scheduledDate}T${scheduledTime}`);
      if (Number.isNaN(combined.getTime())) {
        setMessage({ type: "error", text: "That date/time isn't valid." });
        return;
      }
      if (combined.getTime() <= Date.now()) {
        setMessage({ type: "error", text: "Scheduled time must be in the future." });
        return;
      }
      scheduledAtIso = combined.toISOString();
    }

    setSending(true);
    try {
      const payload = { title: title.trim(), body: body.trim(), targetType };
      if (targetType === "course") payload.courseId = courseId;
      if (targetType === "users") {
        payload.userEmails = userEmailsRaw
          .split(/[,\n]/)
          .map((e) => e.trim())
          .filter(Boolean);
      }
      if (isScheduled) {
        payload.isScheduled = true;
        payload.scheduledAt = scheduledAtIso;
      }

      // Upload the picked image now, right before sending — not when it
      // was first picked — so nothing lands in storage for a draft the
      // admin never actually sends.
      if (imageFile) {
        payload.imageUrl = await uploadPickedImage();
      }

      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: json.error || "Failed to send." });
      } else {
        setMessage({
          type: "success",
          text: json.scheduled
            ? `Scheduled for ${new Date(json.scheduledAt).toLocaleString("en-IN")}.`
            : `Sent to ${json.recipientCount} student(s) — ${json.pushSentCount} push notification(s) delivered to registered devices.`,
        });
        setTitle("");
        setBody("");
        setUserEmailsRaw("");
        handleRemoveImage();
        setIsScheduled(false);
        setScheduledDate("");
        setScheduledTime("");
        loadHistory();
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Send Notification</h1>
      <p style={{ color: "#64748b", marginBottom: 20 }}>
        Sends both an in-app notification (bell icon) and a push notification to registered devices.
      </p>

      <form onSubmit={handleSend} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. New test added!"
            style={inputStyle}
            maxLength={100}
          />
        </div>

        <div>
          <label style={labelStyle}>Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. A new mock test for Physics - Kinematics is now live."
            style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
            maxLength={500}
          />
        </div>

        <div>
          <label style={labelStyle}>Send to</label>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            {[
              { value: "all", label: "All students" },
              { value: "course", label: "Students in a course" },
              { value: "users", label: "Specific emails" },
            ].map((opt) => (
              <label key={opt.value} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input
                  type="radio"
                  name="targetType"
                  value={opt.value}
                  checked={targetType === opt.value}
                  onChange={(e) => setTargetType(e.target.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label style={labelStyle}>Image (optional)</label>
          {imagePreviewUrl ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={imagePreviewUrl}
                alt="Preview"
                style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #cbd5e1" }}
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                style={{ border: "1px solid #cbd5e1", background: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 13, cursor: "pointer" }}
              >
                Remove
              </button>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={handlePickImage} style={{ fontSize: 13 }} />
          )}
        </div>

        {targetType === "course" && (
          <div>
            <label style={labelStyle}>Course</label>
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)} style={inputStyle}>
              <option value="">Select a course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {targetType === "users" && (
          <div>
            <label style={labelStyle}>Emails (comma or newline separated)</label>
            <textarea
              value={userEmailsRaw}
              onChange={(e) => setUserEmailsRaw(e.target.value)}
              placeholder="student1@example.com, student2@example.com"
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
            />
          </div>
        )}

        <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={isScheduled} onChange={(e) => setIsScheduled(e.target.checked)} />
          Schedule for later
        </label>

        {isScheduled && (
          <div style={{ padding: 10, background: "#f8fafc", borderRadius: 8, border: "1px solid #eef2f7", display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Date</label>
              <input
                type="date"
                style={inputStyle}
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time</label>
              <input
                type="time"
                style={inputStyle}
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>
        )}

        {message && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              fontSize: 14,
              background: message.type === "error" ? "#fee2e2" : "#dcfce7",
              color: message.type === "error" ? "#991b1b" : "#166534",
            }}
          >
            {message.text}
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            border: "none",
            background: sending ? "#93c5fd" : "#0a1e42",
            color: "#fff",
            fontWeight: 600,
            cursor: sending ? "not-allowed" : "pointer",
          }}
        >
          {sending ? (isScheduled ? "Scheduling…" : "Sending…") : isScheduled ? "Schedule Notification" : "Send Notification"}
        </button>
      </form>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginTop: 36, marginBottom: 10 }}>Recent notifications</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {history.length === 0 && <p style={{ color: "#94a3b8", fontSize: 14 }}>Nothing sent yet.</p>}
        {history.map((n) => {
          const pending = n.is_scheduled && !n.sent_at;
          return (
            <div key={n.id} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, display: "flex", gap: 12 }}>
              {n.image_url && (
                <img
                  src={n.image_url}
                  alt=""
                  style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>{n.title}</strong>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      {new Date(n.created_at).toLocaleString("en-IN")}
                    </span>
                    {!pending && (
                      <button
                        onClick={() => handleResend(n.id)}
                        disabled={resendingId === n.id}
                        title="Resend this notification"
                        style={{
                          border: "1px solid #cbd5e1",
                          background: "#fff",
                          color: "#0a1e42",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: resendingId === n.id ? "not-allowed" : "pointer",
                          borderRadius: 6,
                          padding: "4px 8px",
                        }}
                      >
                        {resendingId === n.id ? "Resending…" : "Resend"}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(n.id)}
                      title={pending ? "Cancel this scheduled notification" : "Delete notification"}
                      style={{
                        border: "none",
                        background: "transparent",
                        color: "#ef4444",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      {pending ? "Cancel" : "Delete"}
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "#475569", margin: "4px 0" }}>{n.body}</p>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  {n.target_type === "all" && "All students"}
                  {n.target_type === "course" && `Course ${n.target_course_id}`}
                  {n.target_type === "users" && "Specific users"} · {n.recipientCount} recipient(s)
                  {pending && (
                    <>
                      {" "}
                      ·{" "}
                      <span style={{ color: "#b45309", fontWeight: 600 }}>
                        Scheduled for {new Date(n.scheduled_at).toLocaleString("en-IN")}
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const labelStyle = { fontSize: 13, fontWeight: 600, color: "#334155", display: "block", marginBottom: 4 };
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  fontSize: 14,
  boxSizing: "border-box",
};
