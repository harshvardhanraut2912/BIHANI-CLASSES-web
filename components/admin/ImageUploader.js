"use client";

import { useRef, useState, useCallback } from "react";

// Drag-and-drop OR click-to-choose image uploader. Uploads straight to the
// given Supabase Storage bucket ("thumbnails" or "icons") via
// /api/admin/upload-image and reports the resulting public URL back to the
// parent form through onUploaded(url). Replaces every old "paste a GitHub
// path" text field.
export default function ImageUploader({ bucket, value, onUploaded, label }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const doUpload = useCallback(async (file) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    setIsUploading(true);
    try {
      const base64Data = await fileToBase64(file);
      const res = await fetch("/api/admin/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket,
          fileName: file.name,
          base64Data,
          contentType: file.type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      onUploaded(data.publicUrl);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }, [bucket, onUploaded]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) doUpload(file);
  };

  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-muted, #64748b)' }}>{label}</label>}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragging ? '#3b82f6' : '#cbd5e1'}`,
          borderRadius: '14px',
          padding: value ? '10px' : '22px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? 'rgba(59,130,246,0.06)' : '#f8fafc',
          transition: 'all 0.2s ease',
          position: 'relative',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }}
        />
        {value ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img src={value} alt="preview" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px', background: '#fff', border: '1px solid #e2e8f0' }} />
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Image set</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Click or drop to replace</div>
            </div>
          </div>
        ) : isUploading ? (
          <div style={{ fontSize: '13px', color: '#64748b' }}>Uploading…</div>
        ) : (
          <div style={{ fontSize: '13px', color: '#64748b' }}>
            <span className="material-icons" style={{ fontSize: '22px', display: 'block', marginBottom: '4px', color: '#94a3b8' }}>cloud_upload</span>
            Drag &amp; drop an image, or click to choose
          </div>
        )}
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px' }}>{error}</div>}
    </div>
  );
}
