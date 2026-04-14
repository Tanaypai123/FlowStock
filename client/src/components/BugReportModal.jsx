import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  "UI Bug (something looks wrong)",
  "Order Issue",
  "Delivery Issue",
  "Inventory Issue",
  "Login Issue",
  "Other",
];

const SEVERITIES = [
  { value: "low",      label: "Low",      sub: "Minor inconvenience",   color: "#6b7280", bg: "#f3f4f6" },
  { value: "medium",   label: "Medium",   sub: "Affects my work",       color: "#d97706", bg: "#fef3c7" },
  { value: "high",     label: "High",     sub: "Can't complete task",   color: "#ea580c", bg: "#fff7ed" },
  { value: "critical", label: "Critical", sub: "System unusable",       color: "#dc2626", bg: "#fef2f2" },
];

// ─── Device info helper ───────────────────────────────────────────────────────
function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
  else if (ua.includes("Firefox"))  browser = "Firefox";
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("Edg"))      browser = "Edge";
  return {
    browser,
    userAgent:  ua,
    screen:     `${window.innerWidth}×${window.innerHeight}`,
    pageUrl:    window.location.href,
    timeStamp:  new Date().toISOString(),
  };
}

// ─── Auth helper: get token for either admin/customer (Supabase) or driver ────
async function getAuthToken(reporterType) {
  if (reporterType === "driver") {
    const t = localStorage.getItem("driverToken");
    if (!t) throw new Error("No driver session");
    return { token: t, isDriver: true };
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  return { token: session.access_token, isDriver: false };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BugReportModal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function BugReportModal({ isOpen, onClose, reporterType, reporterId, businessId }) {
  // Form state
  const [title,       setTitle]       = useState("");
  const [category,    setCategory]    = useState("");
  const [severity,    setSeverity]    = useState("medium");
  const [description, setDescription] = useState("");

  // Image uploads
  const [images,    setImages]    = useState([]); // [{ file, preview }]
  const [dragging,  setDragging]  = useState(false);
  const fileInputRef = useRef(null);

  // Device info expand
  const [deviceExpanded, setDeviceExpanded] = useState(false);
  const deviceInfo = getDeviceInfo();

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [errors,     setErrors]     = useState({});
  const [toast,      setToast]      = useState(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setTitle(""); setCategory(""); setSeverity("medium");
      setDescription(""); setImages([]); setErrors({});
      setToast(null); setSubmitting(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Image handling ──────────────────────────────────────────────────────────
  function addFiles(files) {
    const valid = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 3 - images.length);
    const newImages = valid.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      id: Math.random().toString(36).slice(2),
    }));
    setImages((prev) => [...prev, ...newImages].slice(0, 3));
  }

  function removeImage(id) {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.preview);
      return prev.filter((i) => i.id !== id);
    });
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    addFiles(e.dataTransfer.files);
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  function validate() {
    const e = {};
    if (!title.trim())                         e.title       = "Title is required";
    if (!category)                             e.category    = "Please select a category";
    if (!severity)                             e.severity    = "Please select severity";
    if (description.trim().length < 20)        e.description = "Description must be at least 20 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Upload one screenshot as base64 data URL (no multer needed) ──────────────
  async function uploadScreenshot(file, token) {
    // Read as base64 data URL via FileReader
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result); // "data:image/png;base64,..."
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

    const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/bugs/upload-screenshot`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ base64, fileName: file.name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Upload failed");
    return json.url;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { token } = await getAuthToken(reporterType);

      // 1. Upload images first
      const imageUrls = await Promise.all(
        images.map((img) => uploadScreenshot(img.file, token))
      );

      // 2. Submit bug report
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/bugs/report`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          title:              title.trim(),
          category,
          severity,
          description:        description.trim(),
          image_urls:         imageUrls,
          device_info:        deviceInfo,
          page_url:           deviceInfo.pageUrl,
          reported_by_type:   reporterType,
          reported_by_id:     reporterId,
          business_id:        businessId ?? null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed to submit");

      setToast("✅ Bug reported! We'll look into it.");
      setTimeout(() => { setToast(null); onClose(); }, 2000);
    } catch (err) {
      setErrors({ submit: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inputStyle = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1px solid #e5e7eb", fontSize: 13, outline: "none",
    fontFamily: "inherit", background: "#fff", color: "#111827",
    boxSizing: "border-box", transition: "border-color .15s",
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 5 };
  const errStyle   = { fontSize: 11, color: "#dc2626", marginTop: 4 };
  const fieldWrap  = { marginBottom: 16 };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 200, backdropFilter: "blur(3px)" }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        zIndex: 201, width: "min(560px, calc(100vw - 24px))",
        maxHeight: "calc(100vh - 32px)", overflowY: "auto",
        background: "#fff", borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>🐛 Report a Bug</h2>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#9ca3af" }}>Help us improve FlowStock</p>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "#f3f4f6", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 15, color: "#6b7280", lineHeight: 1 }}>✕</button>
        </div>

        {/* Success toast */}
        {toast && (
          <div style={{ margin: "12px 24px 0", padding: "12px 16px", borderRadius: 8, background: "#d1fae5", border: "1px solid #6ee7b7", color: "#065f46", fontSize: 13, fontWeight: 600 }}>
            {toast}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px" }}>

          {/* Title */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Title <span style={{ color: "#dc2626" }}>*</span></label>
            <input
              type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Short description of the issue"
              style={{ ...inputStyle, borderColor: errors.title ? "#dc2626" : "#e5e7eb" }}
              onFocus={(e) => e.target.style.borderColor = "#6366f1"}
              onBlur={(e)  => e.target.style.borderColor = errors.title ? "#dc2626" : "#e5e7eb"}
            />
            {errors.title && <p style={errStyle}>{errors.title}</p>}
          </div>

          {/* Category */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Category <span style={{ color: "#dc2626" }}>*</span></label>
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              style={{ ...inputStyle, borderColor: errors.category ? "#dc2626" : "#e5e7eb", cursor: "pointer" }}
            >
              <option value="">Select a category…</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errors.category && <p style={errStyle}>{errors.category}</p>}
          </div>

          {/* Severity */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Severity <span style={{ color: "#dc2626" }}>*</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {SEVERITIES.map((s) => (
                <label key={s.value} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 8, cursor: "pointer",
                  border: `1.5px solid ${severity === s.value ? s.color : "#e5e7eb"}`,
                  background: severity === s.value ? s.bg : "#fff",
                  transition: "all .15s",
                }}>
                  <input
                    type="radio" name="severity" value={s.value}
                    checked={severity === s.value} onChange={() => setSeverity(s.value)}
                    style={{ accentColor: s.color, width: 14, height: 14, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.label}</div>
                    <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{s.sub}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div style={fieldWrap}>
            <label style={labelStyle}>
              Description <span style={{ color: "#dc2626" }}>*</span>
              <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(min 20 chars)</span>
            </label>
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={"Describe what happened, what you expected, and what actually occurred"}
              rows={4}
              style={{ ...inputStyle, resize: "vertical", minHeight: 96, borderColor: errors.description ? "#dc2626" : "#e5e7eb" }}
              onFocus={(e) => e.target.style.borderColor = "#6366f1"}
              onBlur={(e)  => e.target.style.borderColor = errors.description ? "#dc2626" : "#e5e7eb"}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              {errors.description && <p style={{ ...errStyle, margin: 0 }}>{errors.description}</p>}
              <span style={{ fontSize: 11, color: description.length < 20 ? "#9ca3af" : "#059669", marginLeft: "auto" }}>
                {description.length} chars
              </span>
            </div>
          </div>

          {/* Screenshots */}
          <div style={fieldWrap}>
            <label style={labelStyle}>Screenshots <span style={{ color: "#9ca3af", fontWeight: 400 }}>(up to 3)</span></label>
            {/* Drop zone */}
            {images.length < 3 && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? "#6366f1" : "#d1d5db"}`,
                  borderRadius: 10, padding: "20px 16px", textAlign: "center",
                  cursor: "pointer", background: dragging ? "#ede9fe" : "#f9fafb",
                  transition: "all .15s", marginBottom: images.length > 0 ? 10 : 0,
                }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>📷</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Click to upload or drag & drop</div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>JPG, PNG, WEBP · up to 3 images</div>
                <input
                  ref={fileInputRef} type="file" accept="image/*" multiple
                  style={{ display: "none" }}
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>
            )}
            {/* Previews */}
            {images.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {images.map((img) => (
                  <div key={img.id} style={{ position: "relative" }}>
                    <img
                      src={img.preview} alt="screenshot"
                      style={{ width: 80, height: 80, borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb" }}
                    />
                    <button
                      type="button" onClick={() => removeImage(img.id)}
                      style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 999, border: "none", background: "#ef4444", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Device info */}
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setDeviceExpanded((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#059669", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", fontWeight: 600 }}
            >
              <span>✅ Device info auto-captured</span>
              <span style={{ fontSize: 10, color: "#9ca3af" }}>{deviceExpanded ? "▲ hide" : "▼ show"}</span>
            </button>
            {deviceExpanded && (
              <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "#f9fafb", border: "1px solid #e5e7eb", fontSize: 11, color: "#6b7280", lineHeight: 1.7 }}>
                <div><strong>Browser:</strong> {deviceInfo.browser}</div>
                <div><strong>Screen:</strong> {deviceInfo.screen}</div>
                <div style={{ wordBreak: "break-all" }}><strong>URL:</strong> {deviceInfo.pageUrl}</div>
              </div>
            )}
          </div>

          {/* Submit error */}
          {errors.submit && (
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13, marginBottom: 14 }}>
              ⚠️ {errors.submit}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button" onClick={onClose} disabled={submitting}
              style={{ padding: "9px 20px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151" }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={submitting}
              style={{
                padding: "9px 24px", borderRadius: 8, border: "none",
                background: submitting ? "#a5b4fc" : "#6366f1",
                fontSize: 13, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer",
                color: "#fff", transition: "background .2s",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              {submitting ? <><span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: 999, animation: "spin .7s linear infinite" }} />Submitting…</> : "Submit Bug Report"}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
