import { useCallback, useEffect, useRef, useState } from "react";
import { devApi } from "../../lib/devApi.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const SEV_CONFIG = {
  critical: { label: "Critical", bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" },
  high:     { label: "High",     bg: "#fff7ed", color: "#ea580c", border: "#fdba74" },
  medium:   { label: "Medium",   bg: "#fefce8", color: "#ca8a04", border: "#fde047" },
  low:      { label: "Low",      bg: "#f9fafb", color: "#6b7280", border: "#d1d5db" },
};

const STATUS_CONFIG = {
  open:      { label: "Open",      bg: "#fef2f2", color: "#dc2626" },
  in_review: { label: "In Review", bg: "#fef3c7", color: "#d97706" },
  resolved:  { label: "Resolved",  bg: "#d1fae5", color: "#059669" },
  wont_fix:  { label: "Won't Fix", bg: "#f3f4f6", color: "#6b7280" },
};

const TYPE_CONFIG = {
  admin:    { label: "Admin",    bg: "#ede9fe", color: "#6d28d9" },
  customer: { label: "Customer", bg: "#dbeafe", color: "#1d4ed8" },
  driver:   { label: "Driver",   bg: "#d1fae5", color: "#065f46" },
};

function relativeTime(iso) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ─── Pill badge ───────────────────────────────────────────────────────────────
function Pill({ bg, color, border, children, bold }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "2px 8px", borderRadius: 999, fontSize: 11,
      fontWeight: bold ? 800 : 600,
      background: bg, color,
      border: border ? `1px solid ${border}` : "none",
    }}>
      {children}
    </span>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: "12px 14px" }}>
          <div style={{ height: 12, borderRadius: 4, background: "#f3f4f6", width: `${50 + (i * 13) % 40}%`, animation: "pulse 1.5s infinite" }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ images, startIndex, onClose }) {
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    function handler(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, images.length - 1));
      if (e.key === "ArrowLeft")  setIdx((i) => Math.max(i - 1, 0));
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [images.length, onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.9)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {/* Prevent close when clicking image */}
      <div onClick={(e) => e.stopPropagation()} style={{ position: "relative", maxWidth: "min(90vw, 900px)", maxHeight: "90vh" }}>
        <img src={images[idx]} alt={`screenshot ${idx + 1}`} style={{ maxWidth: "100%", maxHeight: "85vh", borderRadius: 8, objectFit: "contain" }} />

        {/* Controls */}
        <div style={{ position: "absolute", bottom: -40, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16, alignItems: "center" }}>
          <button onClick={() => setIdx((i) => Math.max(i - 1, 0))} disabled={idx === 0}
            style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 6, padding: "6px 14px", cursor: idx === 0 ? "not-allowed" : "pointer", opacity: idx === 0 ? 0.4 : 1 }}>←</button>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>{idx + 1} / {images.length}</span>
          <button onClick={() => setIdx((i) => Math.min(i + 1, images.length - 1))} disabled={idx === images.length - 1}
            style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 6, padding: "6px 14px", cursor: idx === images.length - 1 ? "not-allowed" : "pointer", opacity: idx === images.length - 1 ? 0.4 : 1 }}>→</button>
        </div>

        {/* Close */}
        <button onClick={onClose} style={{ position: "absolute", top: -36, right: 0, background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 14 }}>✕ Close</button>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function DetailPanel({ bugId, onClose, onSaved }) {
  const [bug,      setBug]      = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [note,     setNote]     = useState("");
  const [status,   setStatus]   = useState("open");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [devEx,    setDevEx]    = useState(false); // device info expanded
  const [lightbox, setLightbox] = useState(null);  // { images, index }

  useEffect(() => {
    setLoading(true); setBug(null); setSaved(false);
    devApi(`/api/dev/bugs/${bugId}`)
      .then((r) => {
        setBug(r.data);
        setNote(r.data.super_admin_note ?? "");
        setStatus(r.data.status ?? "open");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [bugId]);

  // Close on Escape (when no lightbox is open)
  useEffect(() => {
    if (lightbox) return;
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose, lightbox]);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await devApi(`/api/dev/bugs/${bugId}`, {
        method: "PUT",
        body: JSON.stringify({ status, super_admin_note: note }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved();
    } catch { /* silent */ } finally {
      setSaving(false);
    }
  }

  const sCell  = { padding: "11px 0", borderBottom: "1px solid #f3f4f6", fontSize: 13 };
  const sLabel = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9ca3af", marginBottom: 4 };

  const images = bug?.image_urls ?? [];

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.25)", zIndex: 100 }} />

      {/* Sliding panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 101,
        width: "min(560px, 100vw)", background: "#fff",
        boxShadow: "-4px 0 24px rgba(0,0,0,.15)",
        display: "flex", flexDirection: "column", overflow: "hidden",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}>
        {/* Panel header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>Bug Detail</span>
          <button onClick={onClose} style={{ border: "none", background: "#f3f4f6", borderRadius: 7, padding: "5px 10px", cursor: "pointer", fontSize: 14, color: "#6b7280" }}>✕</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[200, 80, 140, 60].map((w, i) => (
                <div key={i} style={{ height: 14, width: `${w}px`, maxWidth: "100%", background: "#f3f4f6", borderRadius: 4, animation: "pulse 1.5s infinite" }} />
              ))}
            </div>
          )}

          {!loading && bug && (
            <>
              {/* Title + badges */}
              <h2 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: "0 0 10px" }}>{bug.title}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
                {SEV_CONFIG[bug.severity] && (
                  <Pill {...SEV_CONFIG[bug.severity]} bold>{SEV_CONFIG[bug.severity].label}</Pill>
                )}
                <Pill bg="#f3f4f6" color="#374151">{bug.category}</Pill>
                {STATUS_CONFIG[bug.status] && (
                  <Pill {...STATUS_CONFIG[bug.status]}>{STATUS_CONFIG[bug.status].label}</Pill>
                )}
              </div>

              {/* Meta */}
              <div style={{ background: "#f9fafb", borderRadius: 8, padding: "12px 14px", marginBottom: 16, fontSize: 12, color: "#6b7280", display: "flex", flexDirection: "column", gap: 5 }}>
                <div><strong style={{ color: "#374151" }}>Reported by:</strong>{" "}
                  {bug.reporter_name}
                  {" "}{TYPE_CONFIG[bug.reported_by_type] && <Pill {...TYPE_CONFIG[bug.reported_by_type]}>{TYPE_CONFIG[bug.reported_by_type].label}</Pill>}
                </div>
                <div><strong style={{ color: "#374151" }}>Business:</strong>{" "}{bug.business_name ?? "N/A"}</div>
                <div><strong style={{ color: "#374151" }}>Reported at:</strong>{" "}{new Date(bug.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
              </div>

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <div style={sLabel}>Description</div>
                <div style={{ fontSize: 13, color: "#374151", background: "#f9fafb", borderRadius: 8, padding: "12px 14px", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                  {bug.description}
                </div>
              </div>

              {/* Screenshots */}
              {images.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={sLabel}>Screenshots ({images.length})</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {images.map((url, i) => (
                      <img
                        key={i} src={url} alt={`screenshot ${i + 1}`}
                        onClick={() => setLightbox({ images, index: i })}
                        style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "zoom-in", transition: "opacity .15s" }}
                        onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Device info (collapsible) */}
              {bug.device_info && (
                <div style={{ marginBottom: 16 }}>
                  <button
                    type="button" onClick={() => setDevEx((v) => !v)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", ...sLabel, display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span>Device Info</span>
                    <span style={{ fontSize: 10, color: "#6b7280", fontWeight: 400 }}>{devEx ? "▲ collapse" : "▼ expand"}</span>
                  </button>
                  {devEx && (
                    <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#6b7280", lineHeight: 1.8, fontFamily: "monospace", marginTop: 4 }}>
                      {bug.device_info.browser && <div><strong>Browser:</strong> {bug.device_info.browser}</div>}
                      {bug.device_info.screen  && <div><strong>Screen:</strong> {bug.device_info.screen}</div>}
                      {bug.page_url            && <div style={{ wordBreak: "break-all" }}><strong>URL:</strong> {bug.page_url}</div>}
                      {bug.device_info.timeStamp && <div><strong>Captured at:</strong> {bug.device_info.timeStamp}</div>}
                    </div>
                  )}
                </div>
              )}

              <hr style={{ border: "none", borderTop: "1px solid #f3f4f6", margin: "8px 0 16px" }} />

              {/* Super Admin Response */}
              <div style={{ marginBottom: 12 }}>
                <div style={sLabel}>Internal Note (not visible to reporter)</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Resolution steps, root cause, internal comments…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, fontFamily: "inherit", resize: "vertical", outline: "none", color: "#374151" }}
                  onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                  onBlur={(e)  => e.target.style.borderColor = "#e5e7eb"}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={sLabel}>Update Status</div>
                <select
                  value={status} onChange={(e) => setStatus(e.target.value)}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, fontFamily: "inherit", background: "#fff", cursor: "pointer", outline: "none", color: "#374151" }}
                >
                  <option value="open">Open</option>
                  <option value="in_review">In Review</option>
                  <option value="resolved">Resolved</option>
                  <option value="wont_fix">Won't Fix</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={handleSave} disabled={saving}
                  style={{
                    padding: "9px 24px", borderRadius: 8, border: "none",
                    background: saving ? "#a5b4fc" : "#6366f1",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  {saving
                    ? <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid #fff", borderTopColor: "transparent", borderRadius: 999, animation: "spin .7s linear infinite" }} /> Saving…</>
                    : "Save"}
                </button>
                {saved && <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>✓ Saved</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUG REPORTS PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function DevBugReports() {
  const [bugs,      setBugs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Filters
  const [statusTab, setStatusTab] = useState("all");
  const [typeTab,   setTypeTab]   = useState("all");
  const [sevTab,    setSevTab]    = useState("all");
  const [search,    setSearch]    = useState("");

  // Detail panel
  const [selectedId, setSelectedId] = useState(null);

  const fetchBugs = useCallback(() => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (statusTab !== "all") params.set("status", statusTab);
    if (typeTab   !== "all") params.set("type",   typeTab);
    if (sevTab    !== "all") params.set("severity", sevTab);
    devApi(`/api/dev/bugs?${params.toString()}`)
      .then((r) => setBugs(r.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [statusTab, typeTab, sevTab]);

  useEffect(() => { fetchBugs(); }, [fetchBugs]);

  // Summary counts (from current full unfiltered list for cards — re-fetch without filters)
  const [summary, setSummary] = useState({ open: 0, in_review: 0, resolved: 0, critical_open: 0 });
  useEffect(() => {
    devApi("/api/dev/bugs").then((r) => {
      const all = r.data ?? [];
      setSummary({
        open:          all.filter((b) => b.status === "open").length,
        in_review:     all.filter((b) => b.status === "in_review").length,
        resolved:      all.filter((b) => b.status === "resolved").length,
        critical_open: all.filter((b) => b.severity === "critical" && b.status === "open").length,
      });
    }).catch(() => {});
  }, [bugs]); // re-run after each save

  // Client-side search filter
  const displayed = search.trim()
    ? bugs.filter((b) =>
        b.title.toLowerCase().includes(search.toLowerCase()) ||
        (b.description ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : bugs;

  // Table styles
  const th = { padding: "10px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "left", whiteSpace: "nowrap" };
  const td = (isCritical) => ({
    padding: "11px 14px", fontSize: 12, color: "#374151",
    borderBottom: "1px solid #f3f4f6", verticalAlign: "middle",
    ...(isCritical ? { background: "#fff8f8" } : {}),
  });

  function FilterTab({ value, current, onChange, children }) {
    const active = value === current;
    return (
      <button
        onClick={() => onChange(value)}
        style={{
          padding: "5px 12px", borderRadius: 6, border: "1px solid",
          borderColor: active ? "#6366f1" : "#e5e7eb",
          background:  active ? "#ede9fe"  : "#fff",
          color:       active ? "#6d28d9"  : "#374151",
          fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        {children}
      </button>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Bug Reports</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Reported issues from admins, customers, and drivers</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Open",          value: summary.open,          color: summary.open > 0 ? "#dc2626" : "#6b7280" },
          { label: "In Review",     value: summary.in_review,     color: "#d97706" },
          { label: "Resolved",      value: summary.resolved,      color: "#059669" },
          { label: "Critical Open", value: summary.critical_open, color: "#dc2626", bold: true },
        ].map((card) => (
          <div key={card.label} style={{ padding: "14px 18px", borderRadius: 10, background: "#fff", border: "1px solid #e5e7eb", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 4 }}>{card.label}</div>
            <div style={{ fontSize: 26, fontWeight: card.bold ? 900 : 800, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14, alignItems: "center" }}>
        {/* Status */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["all", "open", "in_review", "resolved", "wont_fix"].map((v) => (
            <FilterTab key={v} value={v} current={statusTab} onChange={setStatusTab}>
              {v === "all" ? "All Status" : v === "in_review" ? "In Review" : v === "wont_fix" ? "Won't Fix" : v.charAt(0).toUpperCase() + v.slice(1)}
            </FilterTab>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

        {/* Type */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["all", "admin", "customer", "driver"].map((v) => (
            <FilterTab key={v} value={v} current={typeTab} onChange={setTypeTab}>
              {v === "all" ? "All Types" : v.charAt(0).toUpperCase() + v.slice(1)}
            </FilterTab>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: "#e5e7eb" }} />

        {/* Severity */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {["all", "critical", "high", "medium", "low"].map((v) => (
            <FilterTab key={v} value={v} current={sevTab} onChange={setSevTab}>
              {v === "all" ? "All Severity" : v.charAt(0).toUpperCase() + v.slice(1)}
            </FilterTab>
          ))}
        </div>

        {/* Search */}
        <input
          type="text" placeholder="Search title / description…" value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 12, width: 220, outline: "none", fontFamily: "inherit" }}
        />
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Table */}
      <div style={{ borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Severity", "Title", "Reporter", "Business", "Category", "Status", "Reported", ""].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
              : displayed.length === 0
                ? <tr><td colSpan={8} style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>No bug reports found 🎉</td></tr>
                : displayed.map((bug) => {
                    const isCritical = bug.severity === "critical";
                    const sev = SEV_CONFIG[bug.severity];
                    const st  = STATUS_CONFIG[bug.status];
                    const typ = TYPE_CONFIG[bug.reported_by_type];
                    return (
                      <tr
                        key={bug.id}
                        style={{ borderLeft: isCritical ? "3px solid #dc2626" : "3px solid transparent", cursor: "pointer" }}
                        onMouseEnter={(e) => e.currentTarget.style.background = isCritical ? "#fff5f5" : "#f9fafb"}
                        onMouseLeave={(e) => e.currentTarget.style.background = isCritical ? "#fff8f8" : ""}
                        onClick={() => setSelectedId(bug.id)}
                      >
                        <td style={td(isCritical)}>
                          {sev && <Pill {...sev} bold={isCritical}>{sev.label}</Pill>}
                        </td>
                        <td style={{ ...td(isCritical), maxWidth: 220 }}>
                          <div style={{ fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bug.title}</div>
                        </td>
                        <td style={td(isCritical)}>
                          <div style={{ fontSize: 12, color: "#374151" }}>{bug.reporter_name}</div>
                          {typ && <Pill {...typ}>{typ.label}</Pill>}
                        </td>
                        <td style={{ ...td(isCritical), color: "#6b7280" }}>{bug.business_name ?? "N/A"}</td>
                        <td style={td(isCritical)}>
                          <Pill bg="#f3f4f6" color="#374151">{bug.category}</Pill>
                        </td>
                        <td style={td(isCritical)}>
                          {st && <Pill {...st}>{st.label}</Pill>}
                        </td>
                        <td style={{ ...td(isCritical), color: "#6b7280", whiteSpace: "nowrap" }}>{relativeTime(bug.created_at)}</td>
                        <td style={td(isCritical)}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedId(bug.id); }}
                            style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#374151", whiteSpace: "nowrap" }}
                          >
                            Review →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
        {displayed.length} bug{displayed.length !== 1 ? "s" : ""} shown
        {search && ` matching "${search}"`}
      </p>

      {/* Detail panel */}
      {selectedId && (
        <DetailPanel
          bugId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => { fetchBugs(); setSelectedId(null); }}
        />
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
