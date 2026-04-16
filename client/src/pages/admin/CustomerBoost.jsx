import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../lib/adminApi.js";
import { supabase } from "../../lib/supabase.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function normalizePhone(raw) { return String(raw ?? "").replace(/\s+/g, "").trim(); }

// ─── Badges ──────────────────────────────────────────────────────────────────
const SOURCE_META = {
  manual:  { label: "Manual",  bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  upload:  { label: "Upload",  bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
};
function SourceBadge({ source }) {
  const m = SOURCE_META[source] ?? SOURCE_META.manual;
  return <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: m.bg, color: m.color, border: `1px solid ${m.border}` }}>{m.label}</span>;
}

const STATUS_META = {
  pending: { label: "⏳ Pending", bg: "#f1f5f9", color: "#64748b",  border: "#cbd5e1" },
  sent:    { label: "✅ Sent",    bg: "#f0fdf4", color: "#16a34a",  border: "#bbf7d0" },
  invited: { label: "📨 Invited", bg: "#f0f9ff", color: "#0369a1",  border: "#bae6fd" },
  joined:  { label: "🎉 Joined",  bg: "#fdf4ff", color: "#7e22ce",  border: "#e9d5ff" },
};
function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.pending;
  return <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: "nowrap" }}>{m.label}</span>;
}

// ─── Style tokens ──────────────────────────────────────────────────────────────
const S = {
  page:    { padding: "28px 32px", minHeight: "100%", background: "#f8fafc" },
  card:    { background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", overflow: "hidden" },
  colH:    { padding: "10px 14px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
  cell:    { padding: "11px 14px", fontSize: 13, color: "#334155", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  input:   { width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 14, outline: "none", background: "#fff", color: "#0f172a", boxSizing: "border-box" },
  btn:     { padding: "9px 20px", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", transition: "all 0.15s" },
  btnPrim: { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", boxShadow: "0 2px 8px rgba(99,102,241,0.25)" },
  btnGreen:{ background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", boxShadow: "0 2px 8px rgba(22,163,74,0.25)" },
  btnDang: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" },
  btnGray: { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" },
  tab:     { padding: "8px 22px", borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "none", transition: "all 0.15s" },
  tabAct:  { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff" },
  tabInac: { background: "#f1f5f9", color: "#475569" },
  alert:   (t) => ({ borderRadius: 12, padding: "11px 16px", fontSize: 13, marginBottom: 16,
    background: t === "success" ? "#f0fdf4" : "#fef2f2",
    border: `1px solid ${t === "success" ? "#bbf7d0" : "#fecaca"}`,
    color: t === "success" ? "#166534" : "#dc2626" }),
};

// ─── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers  = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
  const nameIdx  = headers.findIndex((h) => h.includes("name") && !h.includes("business") && !h.includes("shop"));
  const phoneIdx = headers.findIndex((h) => h.includes("phone") || h.includes("mobile") || h.includes("contact"));
  const bizIdx   = headers.findIndex((h) => h.includes("business") || h.includes("shop") || h.includes("store") || h.includes("company"));
  if (nameIdx === -1 || phoneIdx === -1) return null;
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    return { name: (cols[nameIdx] ?? "").trim(), phone: normalizePhone(cols[phoneIdx] ?? ""), business_name: bizIdx !== -1 ? (cols[bizIdx] ?? "").trim() : "" };
  }).filter((r) => r.name && r.phone);
}

// ─── Excel via SheetJS CDN ─────────────────────────────────────────────────────
async function parseExcel(file) {
  if (!window.__XLSX__) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    window.__XLSX__ = window.XLSX;
  }
  const XLSX = window.__XLSX__;
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(buf, { type: "array" });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rows.length) return null;
  const keys     = Object.keys(rows[0]);
  const nameKey  = keys.find((k) => /^name$/i.test(k)) ?? keys.find((k) => /name/i.test(k) && !/business|shop/i.test(k));
  const phoneKey = keys.find((k) => /phone|mobile|contact/i.test(k));
  const bizKey   = keys.find((k) => /business|shop|store|company/i.test(k));
  if (!nameKey || !phoneKey) return null;
  return rows.map((r) => ({
    name: String(r[nameKey] ?? "").trim(), phone: normalizePhone(String(r[phoneKey] ?? "")),
    business_name: bizKey ? String(r[bizKey] ?? "").trim() : "",
  })).filter((r) => r.name && r.phone);
}

// ─── Image OCR via Tesseract.js CDN ───────────────────────────────────────────
async function ocrImage(file) {
  if (!window.__Tesseract__) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    window.__Tesseract__ = window.Tesseract;
  }
  const { data: { text } } = await window.__Tesseract__.recognize(file, "eng");
  return text;
}

// ─── Phone extractor from plain text ──────────────────────────────────────────
function extractFromText(text) {
  const contacts = [];
  const phoneRe  = /(?:(?:\+91|91|0)?[\s.-]?)?([6-9]\d{9})/g;
  const seen = new Set();
  let m;
  while ((m = phoneRe.exec(text)) !== null) {
    const phone = m[1];
    if (seen.has(phone)) continue;
    seen.add(phone);
    const before = text.slice(Math.max(0, m.index - 100), m.index).trim();
    const after  = text.slice(m.index + m[0].length, m.index + m[0].length + 100).trim();
    const ctx    = (before + " " + after).replace(/[|:,\t]+/g, " ").trim();
    const words  = ctx.split(/\s+/).filter((w) => w.length > 1 && /[a-zA-Z\u0900-\u097F]/.test(w));
    const name   = words.slice(0, 3).join(" ") || "Unknown";
    const bizMatch = ctx.match(/([A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Store|Shop|Mart|Traders?|Enterprises?|Co\.?|Ltd\.?|Pvt|Industries?|Agency))/);
    contacts.push({ name, phone: `+91${phone}`, business_name: bizMatch?.[1]?.trim() ?? "" });
  }
  return contacts;
}

// ─── Analytics Tab ────────────────────────────────────────────────────────

function BarRow({ label, icon, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{icon} {label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{value} <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 999, background: color, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{ ...S.card, padding: "20px 22px", flex: "1 1 150px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: accent + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{value}</p>
        <p style={{ margin: "4px 0 0", fontSize: 12, fontWeight: 600, color: "#64748b" }}>{label}</p>
        {sub && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>{sub}</p>}
      </div>
    </div>
  );
}

function AnalyticsTab() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    adminApi("/api/admin/customer-contacts/stats")
      .then((json) => { if (json.success) setStats(json.data); else setErr(json.error); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading analytics…</div>;
  if (err) return <div style={{ ...S.alert("error"), marginTop: 8 }}>Failed to load analytics: {err}</div>;
  if (!stats) return null;

  const {
    total_contacts, invites_sent, pending_invites, joined_via_invite,
    source_breakdown, join_source_breakdown, total_joined,
  } = stats;

  const jsd = join_source_breakdown ?? {};
  const jsTotal = total_joined || 1; // avoid div/0
  const sd  = source_breakdown ?? {};
  const sdTotal = total_contacts || 1;

  return (
    <div>
      {/* KPI cards */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <StatCard icon="👥" label="Total Contacts" value={total_contacts} accent="#6366f1" />
        <StatCard icon="✅" label="Invites Sent" value={invites_sent}
          sub={total_contacts ? `${Math.round((invites_sent / total_contacts) * 100)}% of contacts` : undefined} accent="#16a34a" />
        <StatCard icon="🎉" label="Joined via Invite" value={joined_via_invite} accent="#7c3aed" />
        <StatCard icon="⏳" label="Pending Invites" value={pending_invites} accent="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        {/* Contact source breakdown */}
        <div style={S.card}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#1e293b", fontSize: 15 }}>📋 Contact Source</p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>How contacts were added</p>
          </div>
          <div style={{ padding: "20px" }}>
            <BarRow label="Manually Added" icon="✍️" value={sd.manual ?? 0} total={sdTotal} color="#6366f1" />
            <BarRow label="Uploaded via File" icon="📂" value={sd.upload ?? 0} total={sdTotal} color="#0ea5e9" />
          </div>
        </div>

        {/* Platform join source breakdown */}
        <div style={S.card}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9" }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#1e293b", fontSize: 15 }}>🚪 How Customers Joined</p>
            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>Platform join source (actual app users)</p>
          </div>
          <div style={{ padding: "20px" }}>
            <BarRow label="Business Code" icon="🔵" value={jsd.join_code ?? 0} total={jsTotal} color="#3b82f6" />
            <BarRow label="Invite Link" icon="🟣" value={jsd.join_link ?? 0} total={jsTotal} color="#8b5cf6" />
            <BarRow label="Invite Upload" icon="🟢" value={jsd.invite_upload ?? 0} total={jsTotal} color="#16a34a" />
            <BarRow label="Manual Invite" icon="🟡" value={jsd.manual_invite ?? 0} total={jsTotal} color="#f59e0b" />
          </div>
          {total_joined === 0 && (
            <p style={{ margin: "0 20px 16px", fontSize: 12, color: "#94a3b8" }}>No customers have joined the platform yet.</p>
          )}
        </div>
      </div>

      {/* Invite funnel */}
      <div style={{ ...S.card, marginTop: 16, padding: "20px 24px" }}>
        <p style={{ margin: "0 0 16px", fontWeight: 700, color: "#1e293b", fontSize: 15 }}>📊 Invite Funnel</p>
        <div style={{ display: "flex", gap: 0, alignItems: "stretch", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
          {[
            { label: "Contacts Added",  value: total_contacts,    color: "#6366f1", bg: "#eef2ff" },
            { label: "Invites Sent",    value: invites_sent,      color: "#0ea5e9", bg: "#f0f9ff" },
            { label: "Invite Accepted", value: joined_via_invite, color: "#16a34a", bg: "#f0fdf4" },
          ].map((step, i, arr) => (
            <div key={step.label} style={{ flex: 1, background: step.bg, padding: "16px", textAlign: "center",
              borderRight: i < arr.length - 1 ? "1px solid #e2e8f0" : "none" }}>
              <p style={{ margin: 0, fontSize: 28, fontWeight: 800, color: step.color }}>{step.value}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{step.label}</p>
              {i > 0 && arr[i - 1].value > 0 && (
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>
                  {Math.round((step.value / arr[i - 1].value) * 100)}% conversion
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp invite helpers ───────────────────────────────────────────────────
function buildJoinUrl(businessCode) {
  return businessCode ? `https://flowstock.pages.dev/join/${businessCode}` : "https://flowstock.pages.dev/join";
}

function buildInviteMessage(template, bizName, businessCode) {
  const joinUrl = buildJoinUrl(businessCode);
  return template
    .replace(/\[Business Name\]/g, bizName || "Our Business")
    .replace(/\[business_code\]/g, businessCode || "")
    .replace(/\[join_url\]/g, joinUrl);
}

function whatsappLink(rawPhone, message) {
  // Remove non-digits then ensure 91 country code
  const digits = rawPhone.replace(/\D/g, "");
  const number = digits.startsWith("91") && digits.length === 12 ? digits : `91${digits.slice(-10)}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

const DEFAULT_TEMPLATE = `Hi 👋 [Business Name] is now on FlowStock!
Place orders easily 📦
👉 Join here: [join_url]
Fast delivery 🚚 | Easy ordering ✅
– Team [Business Name]`;

// ─── Send Invites Section ─────────────────────────────────────────────────────
function SendInvitesSection({ contacts, bizName, businessCode, onStatusUpdated }) {
  const [selected,  setSelected]  = useState(new Set());
  const [template,  setTemplate]  = useState(DEFAULT_TEMPLATE);
  const [updating,  setUpdating]  = useState(new Set()); // ids being patched
  const allIds = contacts.map((c) => c.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const selectedArr = contacts.filter((c) => selected.has(c.id));

  function toggleOne(id) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function markSent(id) {
    setUpdating((p) => new Set(p).add(id));
    try {
      await adminApi(`/api/admin/customer-contacts/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_status: "sent" }),
      });
      onStatusUpdated(id, "sent");
    } catch { /* non-blocking */ }
    finally { setUpdating((p) => { const s = new Set(p); s.delete(id); return s; }); }
  }

  function sendOne(contact) {
    const msg = buildInviteMessage(template, bizName, businessCode);
    window.open(whatsappLink(contact.phone, msg), "_blank", "noopener,noreferrer");
    markSent(contact.id);
  }

  function sendSelected() {
    const msg = buildInviteMessage(template, bizName, businessCode);
    selectedArr.forEach((c, i) => {
      setTimeout(() => {
        const phone = c.phone.replace(/\D/g, "");
        const url   = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
        markSent(c.id);
      }, i * 1500); // 1.5 s delay between each
    });
  }

  return (
    <div style={{ ...S.card, marginTop: 24 }}>
      {/* Header */}
      <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>📤 Send Invites via WhatsApp</p>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#94a3b8" }}>Select contacts, customise your message, then send.</p>
        </div>
        {selectedArr.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <button type="button" onClick={sendSelected}
              style={{ ...S.btn, ...S.btnGreen, fontSize: 13, padding: "8px 18px" }}>
              🟢 Send to {selectedArr.length} Selected
            </button>
            <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", textAlign: "right", maxWidth: 260 }}>
              WhatsApp will open for each contact one by one.{" "}
              Please allow popups in your browser.
            </p>
          </div>
        )}
      </div>

      {/* Message editor */}
      <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9" }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Invite Message <span style={{ color: "#94a3b8", fontWeight: 400, textTransform: "none" }}>(auto-fills [Business Name] and join link)</span>
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={6}
          style={{ ...S.input, resize: "vertical", fontSize: 13, lineHeight: 1.6, fontFamily: "inherit" }}
        />
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#94a3b8" }}>
          Preview: {buildInviteMessage(template, bizName || "[Business Name]", businessCode || "XXXXXX").slice(0, 120)}…
        </p>
      </div>

      {/* Table */}
      {contacts.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
          No contacts to invite yet. Add some above.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...S.colH, width: 42, textAlign: "center" }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ cursor: "pointer", width: 15, height: 15 }} title="Select all" />
                </th>
                <th style={S.colH}>Name</th>
                <th style={S.colH}>Phone</th>
                <th style={S.colH}>Business / Shop</th>
                <th style={S.colH}>Status</th>
                <th style={S.colH}>Send</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={(e) => e.currentTarget.style.background = selected.has(c.id) ? "#f5f3ff" : "#fff"}
                  style={{ background: selected.has(c.id) ? "#f5f3ff" : "#fff", transition: "background 0.1s" }}>
                  <td style={{ ...S.cell, textAlign: "center" }}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)}
                      style={{ cursor: "pointer", width: 15, height: 15 }} />
                  </td>
                  <td style={{ ...S.cell, fontWeight: 600, color: "#1e293b" }}>{c.name}</td>
                  <td style={{ ...S.cell, fontFamily: "monospace", fontSize: 12 }}>{c.phone}</td>
                  <td style={{ ...S.cell, color: "#475569" }}>{c.business_name || <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                  <td style={S.cell}><StatusBadge status={c.invite_status} /></td>
                  <td style={S.cell}>
                    <button type="button" onClick={() => sendOne(c)}
                      disabled={updating.has(c.id)}
                      style={{ ...S.btn, ...S.btnGreen, padding: "6px 14px", fontSize: 12,
                        opacity: updating.has(c.id) ? 0.6 : 1 }}>
                      🟢 WhatsApp
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab 1: Add Manually ──────────────────────────────────────────────────────
function ManualTab({ contacts, onAdded, onDeleted, onStatusUpdated, bizName, businessCode }) {
  const [cname,        setCname]        = useState("");
  const [phone,        setPhone]        = useState("");
  const [businessName, setBusinessName] = useState("");
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(null);
  const [msg,          setMsg]          = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    if (!cname.trim() || !phone.trim()) { setMsg({ type: "error", text: "Name and phone are required." }); return; }
    setSaving(true); setMsg(null);
    try {
      const json = await adminApi("/api/admin/customer-contacts/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cname.trim(), phone: normalizePhone(phone), business_name: businessName.trim() }),
      });
      if (!json.success) throw new Error(json.error ?? "Failed");
      setMsg({ type: "success", text: `✓ ${cname.trim()} added.` });
      setCname(""); setPhone(""); setBusinessName("");
      onAdded(json.data);
    } catch (err) { setMsg({ type: "error", text: err.message }); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    setDeleting(id);
    try {
      await adminApi(`/api/admin/customer-contacts/${id}`, { method: "DELETE" });
      onDeleted(id);
    } catch (err) { setMsg({ type: "error", text: `Delete failed: ${err.message}` }); }
    finally { setDeleting(null); }
  }

  return (
    <div>
      {/* Add form */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9" }}>
          <p style={{ fontWeight: 700, color: "#1e293b", fontSize: 15, margin: 0 }}>Add Contact</p>
        </div>
        <form onSubmit={handleAdd} style={{ padding: "20px 24px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 170px" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Full Name *</label>
            <input id="cb-name" style={S.input} placeholder="e.g. Ravi Kumar" value={cname}
              onChange={(e) => setCname(e.target.value)} disabled={saving} required />
          </div>
          <div style={{ flex: "1 1 170px" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Phone Number *</label>
            <input id="cb-phone" style={S.input} placeholder="+919876543210" value={phone}
              onChange={(e) => setPhone(e.target.value)} disabled={saving} required />
          </div>
          <div style={{ flex: "1 1 210px" }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6 }}>Business / Shop Name</label>
            <input id="cb-biz" style={S.input} placeholder="e.g. Ravi Kumar General Store" value={businessName}
              onChange={(e) => setBusinessName(e.target.value)} disabled={saving} />
          </div>
          <button id="cb-add-contact-btn" type="submit" disabled={saving}
            style={{ ...S.btn, ...S.btnPrim, opacity: saving ? 0.7 : 1, flexShrink: 0 }}>
            {saving ? "Adding…" : "＋ Add Contact"}
          </button>
        </form>
        {msg && <div style={{ ...S.alert(msg.type), margin: "0 24px 20px" }}>{msg.text}</div>}
      </div>

      {/* Contacts table */}
      <div style={S.card}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
          <p style={{ fontWeight: 700, color: "#1e293b", fontSize: 15, margin: 0 }}>
            Saved Contacts <span style={{ fontWeight: 400, color: "#94a3b8" }}>({contacts.length})</span>
          </p>
        </div>
        {contacts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px", color: "#94a3b8", fontSize: 14 }}>No contacts yet. Add one above.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Name", "Phone", "Business / Shop Name", "Source", "Status", "Added", ""].map((h) => (
                    <th key={h} style={S.colH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>
                    <td style={{ ...S.cell, fontWeight: 600, color: "#1e293b" }}>{c.name}</td>
                    <td style={{ ...S.cell, fontFamily: "monospace", fontSize: 12 }}>{c.phone}</td>
                    <td style={{ ...S.cell, color: "#475569" }}>{c.business_name || <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                    <td style={S.cell}><SourceBadge source={c.source} /></td>
                    <td style={S.cell}><StatusBadge status={c.invite_status} /></td>
                    <td style={{ ...S.cell, color: "#64748b" }}>{formatDate(c.created_at)}</td>
                    <td style={S.cell}>
                      <button type="button" disabled={deleting === c.id} onClick={() => handleDelete(c.id)}
                        style={{ ...S.btn, ...S.btnDang, padding: "5px 12px", fontSize: 12, opacity: deleting === c.id ? 0.5 : 1 }}>
                        {deleting === c.id ? "…" : "Delete"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Send Invites section — below the table */}
      <SendInvitesSection
        contacts={contacts}
        bizName={bizName}
        businessCode={businessCode}
        onStatusUpdated={onStatusUpdated}
      />
    </div>
  );
}

// ─── Tab 2: Upload ─────────────────────────────────────────────────────────────
function UploadTab({ onBulkSaved, bizName, businessCode, contacts, onStatusUpdated }) {
  const [preview,  setPreview]  = useState(null);
  const [parseErr, setParseErr] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [loadMsg,  setLoadMsg]  = useState("");
  const [msg,      setMsg]      = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saved,    setSaved]    = useState(false); // show send section after bulk save
  const fileRef = useRef(null);

  const FILE_TYPES_OCR_PDF = ["jpg", "jpeg", "png", "webp", "pdf"];

  async function processFile(file) {
    setParseErr(null); setMsg(null); setPreview(null); setLoading(false); setSaved(false);
    const ext = file.name.split(".").pop().toLowerCase();

    // ── CSV ──────────────────────────────────────────────────────────────────
    if (ext === "csv") {
      try {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows === null) { setParseErr("Could not find 'name' and 'phone' columns."); return; }
        if (!rows.length)  { setParseErr("No valid rows found."); return; }
        setPreview(rows);
      } catch (e) { setParseErr(`CSV error: ${e.message}`); }
      return;
    }

    // ── Excel ─────────────────────────────────────────────────────────────────
    if (["xlsx", "xls"].includes(ext)) {
      try {
        const rows = await parseExcel(file);
        if (!rows) { setParseErr("Could not find 'name' and 'phone' columns."); return; }
        if (!rows.length) { setParseErr("No valid rows found."); return; }
        setPreview(rows);
      } catch (e) { setParseErr(`Excel error: ${e.message}`); }
      return;
    }

    // ── Images & PDF → POST /api/admin/customer-contacts/ocr ─────────────────
    if (FILE_TYPES_OCR_PDF.includes(ext)) {
      setLoading(true); setLoadMsg("Extracting contacts…");
      try {
        const { data: sd } = await supabase.auth.getSession();
        const token = sd?.session?.access_token;
        if (!token) { setParseErr("You must be signed in."); return; }
        const API_BASE = import.meta.env.VITE_API_URL ?? "";
        const businessId = localStorage.getItem("selectedBusinessId") ?? "";
        const fd = new FormData(); fd.append("file", file);
        const res = await fetch(`${API_BASE}/api/admin/customer-contacts/ocr`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(businessId ? { "x-business-id": businessId } : {}),
            // NOTE: do NOT set Content-Type — browser sets multipart boundary automatically
          },
          body: fd,
        });
        const json = await res.json();
        if (!json.success) {
          setParseErr(json.error ?? "Could not extract contacts — please check file format");
          return;
        }
        if (json.needsOcr) {
          // Server delegated image OCR to browser (no server-side OCR lib)
          setLoadMsg("Running OCR… (this may take 10–30 seconds)");
          try {
            const text = await ocrImage(file);
            const rows = extractFromText(text);
            if (!rows.length) { setParseErr("Could not extract contacts — please check file format"); return; }
            setPreview(rows);
          } catch {
            setParseErr("Could not extract contacts — please check file format");
          }
        } else {
          if (!json.contacts?.length) { setParseErr("Could not extract contacts — please check file format"); return; }
          setPreview(json.contacts);
        }
      } catch {
        setParseErr("Could not extract contacts — please check file format");
      } finally { setLoading(false); setLoadMsg(""); }
      return;
    }

    setParseErr("Unsupported file type.");
  }

  function handleFileInput(e) { const f = e.target.files?.[0]; if (f) processFile(f); }
  function handleDrop(e) { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }
  function editRow(idx, field, val) { setPreview((p) => p.map((r, i) => i === idx ? { ...r, [field]: val } : r)); }
  function removeRow(idx) { setPreview((p) => p.filter((_, i) => i !== idx)); }

  async function handleSave() {
    if (!preview?.length) return;
    setSaving(true); setMsg(null);
    try {
      const json = await adminApi("/api/admin/customer-contacts/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: preview }),
      });
      if (!json.success) throw new Error(json.error ?? "Failed");
      setMsg({ type: "success", text: `✓ ${json.saved} saved (${json.total - json.saved} skipped as duplicates).` });
      onBulkSaved(); setPreview(null); setSaved(true);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) { setMsg({ type: "error", text: e.message }); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !loading && fileRef.current?.click()}
        style={{ border: `2px dashed ${dragging ? "#6366f1" : "#cbd5e1"}`, borderRadius: 16,
          padding: "44px 24px", textAlign: "center", marginBottom: 20,
          background: dragging ? "#f5f3ff" : "#f8fafc", cursor: loading ? "default" : "pointer", transition: "all 0.15s" }}>
        {loading ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⏳</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#6366f1", margin: "0 0 4px" }}>{loadMsg}</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>Please wait…</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 38, marginBottom: 10 }}>📂</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", margin: "0 0 6px" }}>Drag &amp; drop here</p>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 14px" }}>
              supports <strong>CSV, Excel, PDF, Word, and Images</strong>
            </p>
            <div style={{ display: "inline-block", padding: "7px 18px", borderRadius: 10, background: "#fff", border: "1.5px solid #e2e8f0", fontSize: 13, fontWeight: 600, color: "#475569" }}>Choose File</div>
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
          style={{ display: "none" }} onChange={handleFileInput} />
      </div>

      {/* Hint */}
      <div style={{ ...S.card, padding: "14px 20px", marginBottom: 20, display: "flex", gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
          CSV / Excel: columns <strong>name</strong>, <strong>phone</strong>, optionally <strong>business_name</strong>.
          PDF &amp; Word: phone numbers auto-detected from text. Images: OCR runs in browser.
        </p>
      </div>

      {parseErr && <div style={S.alert("error")}>{parseErr}</div>}
      {msg      && <div style={S.alert(msg.type)}>{msg.text}</div>}

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div style={S.card}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9",
            display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <p style={{ margin: 0, fontWeight: 700, color: "#1e293b", fontSize: 15 }}>
              Preview — {preview.length} contacts
            </p>
            <button id="cb-save-all-btn" type="button" onClick={handleSave}
              disabled={saving || !preview.length}
              style={{ ...S.btn, ...S.btnPrim, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Saving…" : `💾 Save All (${preview.length})`}
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={S.colH}>#</th>
                  <th style={S.colH}>Name</th>
                  <th style={S.colH}>Phone</th>
                  <th style={S.colH}>Business / Shop Name</th>
                  <th style={S.colH}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr key={idx}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>
                    <td style={{ ...S.cell, color: "#94a3b8", fontSize: 12, width: 36 }}>{idx + 1}</td>
                    <td style={{ ...S.cell, minWidth: 130 }}>
                      <input style={{ ...S.input, padding: "6px 10px", fontSize: 13 }}
                        value={row.name} onChange={(e) => editRow(idx, "name", e.target.value)} />
                    </td>
                    <td style={{ ...S.cell, minWidth: 145 }}>
                      <input style={{ ...S.input, padding: "6px 10px", fontSize: 13, fontFamily: "monospace" }}
                        value={row.phone} onChange={(e) => editRow(idx, "phone", e.target.value)} />
                    </td>
                    <td style={{ ...S.cell, minWidth: 190 }}>
                      <input style={{ ...S.input, padding: "6px 10px", fontSize: 13 }} placeholder="optional"
                        value={row.business_name ?? ""} onChange={(e) => editRow(idx, "business_name", e.target.value)} />
                    </td>
                    <td style={S.cell}>
                      <button type="button" onClick={() => removeRow(idx)}
                        style={{ ...S.btn, ...S.btnDang, padding: "5px 12px", fontSize: 12 }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Send Invites section — visible after bulk save */}
      {saved && (
        <SendInvitesSection
          contacts={contacts}
          bizName={bizName}
          businessCode={businessCode}
          onStatusUpdated={onStatusUpdated}
        />
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function CustomerBoost() {
  const [tab,          setTab]          = useState("manual");
  const [contacts,     setContacts]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadErr,      setLoadErr]      = useState(null);
  const [bizName,      setBizName]      = useState("");
  const [businessCode, setBusinessCode] = useState("");

  // Fetch business profile for [Business Name] + [business_code] auto-fill
  useEffect(() => {
    adminApi("/api/admin/business-profile")
      .then((json) => {
        if (json?.data) {
          setBizName(json.data.business_name ?? "");
          setBusinessCode(json.data.business_code ?? "");
        }
      })
      .catch(() => {}); // non-blocking
  }, []);

  const loadContacts = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const json = await adminApi("/api/admin/customer-contacts");
      setContacts(Array.isArray(json.data) ? json.data : []);
    } catch (e) { setLoadErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  // Update a single contact's status in local state (optimistic)
  function handleStatusUpdated(id, newStatus) {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, invite_status: newStatus } : c));
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>🚀</span>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Customer Boost</h1>
        </div>
        <p style={{ fontSize: 13, color: "#64748b", marginLeft: 42 }}>
          Onboard customers faster — add, upload, and invite via WhatsApp
        </p>
      </div>

      {/* Stats strip */}
      {!loading && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Total Contacts",  value: contacts.length, icon: "👥" },
            { label: "Manual",          value: contacts.filter((c) => c.source === "manual").length, icon: "✍️" },
            { label: "Uploaded",        value: contacts.filter((c) => c.source === "upload").length, icon: "📂" },
            { label: "Invite Sent",     value: contacts.filter((c) => c.invite_status === "sent").length, icon: "✅" },
            { label: "Pending",         value: contacts.filter((c) => c.invite_status === "pending").length, icon: "⏳" },
          ].map((s) => (
            <div key={s.label} style={{ ...S.card, padding: "14px 20px", flex: "1 1 120px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }}>{s.icon}</span>
              <div>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" }}>{s.value}</p>
                <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {[
          { key: "manual",    label: "✍️ Add Manually" },
          { key: "upload",    label: "📂 Upload File" },
          { key: "analytics", label: "📊 Analytics" },
        ].map((t) => (
          <button key={t.key} id={`cb-tab-${t.key}`} type="button"
            onClick={() => setTab(t.key)}
            style={{ ...S.tab, ...(tab === t.key ? S.tabAct : S.tabInac) }}>
            {t.label}
          </button>
        ))}
      </div>

      {loadErr && (
        <div style={S.alert("error")}>
          Failed to load: {loadErr} —{" "}
          <button onClick={loadContacts} style={{ background: "none", border: "none", color: "#6366f1", fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading contacts…</div>
      ) : tab === "analytics" ? (
        <AnalyticsTab />
      ) : tab === "manual" ? (
        <ManualTab
          contacts={contacts}
          onAdded={(c) => setContacts((p) => [c, ...p])}
          onDeleted={(id) => setContacts((p) => p.filter((c) => c.id !== id))}
          onStatusUpdated={handleStatusUpdated}
          bizName={bizName}
          businessCode={businessCode}
        />
      ) : (
        <UploadTab
          onBulkSaved={loadContacts}
          bizName={bizName}
          businessCode={businessCode}
          contacts={contacts}
          onStatusUpdated={handleStatusUpdated}
        />
      )}
    </div>
  );
}
