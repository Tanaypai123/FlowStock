import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";

/* ── API helpers ─────────────────────────────────────────────────────────── */
async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}
async function apiFetch(path, opts = {}) {
  const token = await getToken();
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}
async function downloadBlob(url, method = "GET", body, filename) {
  const token = await getToken();
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); }
  const blob = await res.blob();
  const burl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = burl; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(burl), 60_000);
}
async function viewBlob(url) {
  const token = await getToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || `Error ${res.status}`); }
  const blob = await res.blob();
  const burl = URL.createObjectURL(blob);
  window.open(burl, "_blank");
  setTimeout(() => URL.revokeObjectURL(burl), 60_000);
}

/* ── Formatting ──────────────────────────────────────────────────────────── */
const fmt = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—";
const money = (n) => { const x = Number(n); return `Rs. ${Number.isFinite(x) ? x.toFixed(2) : "0.00"}`; };

/* ── Common styles ───────────────────────────────────────────────────────── */
const S = {
  colH: { padding: "11px 14px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "2px solid #e2e8f0" },
  cell: { padding: "13px 14px", fontSize: 14, color: "#334155", verticalAlign: "middle", borderBottom: "1px solid #f1f5f9" },
  input: { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff" },
  label: { fontSize: 12, fontWeight: 600, color: "#64748b", display: "block", marginBottom: 5 },
  btnPrimary: { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", borderRadius: 10, padding: "9px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  btnOutline: { background: "#fff", color: "#6366f1", border: "1px solid #c7d2fe", borderRadius: 10, padding: "9px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
  btnSm: (v) => ({ fontSize: 12, fontWeight: 600, color: v === "ghost" ? "#6366f1" : "#fff", background: v === "ghost" ? "#eef2ff" : "linear-gradient(135deg,#6366f1,#8b5cf6)", border: v === "ghost" ? "1px solid #c7d2fe" : "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }),
  card: { background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", overflow: "hidden" },
};

/* ══════════════════════════════════════════════════════════════════════════
   PRODUCT SEARCH DROPDOWN
══════════════════════════════════════════════════════════════════════════ */
function ProductSearch({ onSelect }) {
  const [q, setQ]         = useState("");
  const [results, setRes] = useState([]);
  const [open, setOpen]   = useState(false);
  const [loading, setLd]  = useState(false);
  const debounce          = useRef(null);

  const search = useCallback((val) => {
    clearTimeout(debounce.current);
    if (!val.trim()) { setRes([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      setLd(true);
      try {
        const j = await apiFetch(`/api/invoices/products?q=${encodeURIComponent(val)}`);
        setRes(j.data ?? []);
        setOpen(true);
      } catch { setRes([]); }
      finally { setLd(false); }
    }, 280);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <input
        style={S.input} placeholder="🔍 Search inventory..." value={q}
        onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
        onFocus={() => q && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
      />
      {loading && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#94a3b8" }}>…</span>}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto", marginTop: 4 }}>
          {results.map((p) => (
            <div key={p.id}
              onMouseDown={() => { onSelect(p); setQ(""); setOpen(false); }}
              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f5f3ff"}
              onMouseLeave={(e) => e.currentTarget.style.background = ""}
            >
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{p.name}</span>
              <span style={{ color: "#6366f1", fontWeight: 700 }}>Rs. {Number(p.unit_price).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && q.trim() && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
          No products found
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SETTINGS PANEL
══════════════════════════════════════════════════════════════════════════ */
function SettingsPanel({ onClose, onSaved }) {
  const [charges, setCh] = useState([]);
  const [loading, setLd] = useState(true);
  const [saving, setSv]  = useState(false);
  const [err, setErr]    = useState(null);

  useEffect(() => {
    apiFetch("/api/invoices/settings")
      .then((j) => setCh(j.data?.charges ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLd(false));
  }, []);

  const presets = [
    { label: "GST 18%",        type: "percent", value: 18 },
    { label: "CGST 9%",        type: "percent", value: 9  },
    { label: "SGST 9%",        type: "percent", value: 9  },
    { label: "Delivery Rs.50", type: "fixed",   value: 50 },
  ];
  const add    = () => setCh((p) => [...p, { label: "", type: "percent", value: "" }]);
  const remove = (i) => setCh((p) => p.filter((_, idx) => idx !== i));
  const upd    = (i, k, v) => setCh((p) => p.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const save   = async () => {
    setSv(true); setErr(null);
    try { await apiFetch("/api/invoices/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ charges }) }); onSaved(); }
    catch (e) { setErr(e.message); }
    finally { setSv(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "min(620px,95vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Tax & Charge Settings</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Applies to all new invoices</p></div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        {err && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>⚠ {err}</div>}
        {loading ? <p style={{ textAlign: "center", color: "#94a3b8" }}>Loading…</p> : (
          <>
            <p style={{ ...S.label, marginBottom: 10 }}>Quick-add presets</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {presets.map((p, i) => <button key={i} type="button" onClick={() => setCh((prev) => [...prev, { ...p, value: String(p.value) }])} style={{ fontSize: 12, color: "#4f46e5", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 999, padding: "5px 14px", cursor: "pointer", fontWeight: 600 }}>+ {p.label}</button>)}
            </div>
            {charges.length === 0 && <p style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No charges. Add one below.</p>}
            {charges.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 36px", gap: 8, alignItems: "center", marginBottom: 8, background: "#f8fafc", borderRadius: 10, padding: "10px 12px" }}>
                <input style={S.input} placeholder="Label (e.g. GST)" value={c.label} onChange={(e) => upd(i, "label", e.target.value)} />
                <select value={c.type} onChange={(e) => upd(i, "type", e.target.value)} style={{ ...S.input, width: "auto" }}>
                  <option value="percent">% Percent</option>
                  <option value="fixed">Rs. Fixed</option>
                </select>
                <input style={{ ...S.input, textAlign: "right" }} type="number" min="0" step="0.01" placeholder="Value" value={c.value} onChange={(e) => upd(i, "value", e.target.value)} />
                <button onClick={() => remove(i)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 8, padding: "8px", cursor: "pointer", fontWeight: 700, fontSize: 16 }}>−</button>
              </div>
            ))}
            <button type="button" onClick={add} style={{ ...S.btnOutline, width: "100%", marginTop: 6, marginBottom: 20 }}>+ Add Custom Charge</button>
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#92400e", marginBottom: 20 }}>
              ⚠ Saving creates a new version. Old invoices already generated will <strong>not</strong> change.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={onClose} style={S.btnOutline}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Settings"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CREATE INVOICE MODAL
══════════════════════════════════════════════════════════════════════════ */
function CreateInvoiceModal({ onClose, onCreated }) {
  const [form, setForm]     = useState({ customer_name: "", customer_phone: "", customer_address: "", notes: "" });
  const [items, setItems]   = useState([{ item_name: "", quantity: 1, unit_price: "" }]);
  const [charges, setCh]    = useState([]);
  const [discount, setDisc] = useState({ type: "fixed", input: "" });
  const [saving, setSv]     = useState(false);
  const [err, setErr]       = useState(null);

  useEffect(() => { apiFetch("/api/invoices/settings").then((j) => setCh(j.data?.charges ?? [])).catch(() => {}); }, []);

  const setF    = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const addItem = () => setItems((p) => [...p, { item_name: "", quantity: 1, unit_price: "" }]);
  const remItem = (i) => setItems((p) => p.filter((_, idx) => idx !== i));
  const updItem = (i, k, v) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addProduct = (p) => setItems((prev) => [...prev, { item_name: p.name, quantity: 1, unit_price: String(Number(p.unit_price).toFixed(2)) }]);

  // Live totals
  const subtotal = items.reduce((s, it) => { const q = Number(it.quantity), p = Number(it.unit_price); return s + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0); }, 0);
  const chargesTotal = charges.reduce((s, c) => { const v = Number(c.value); return Number.isFinite(v) ? s + (c.type === "percent" ? (subtotal * v) / 100 : v) : s; }, 0);
  const preDiscount = subtotal + chargesTotal;
  const dInput = Number(discount.input || 0);
  const discountAmt = discount.type === "percent" ? Math.min(preDiscount, (preDiscount * Math.min(100, dInput)) / 100) : Math.min(preDiscount, dInput);
  const grand = Math.max(0, preDiscount - discountAmt);

  const submit = async () => {
    setSv(true); setErr(null);
    try {
      await apiFetch("/api/invoices/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, line_items: items, discount_type: discount.type, discount_input: dInput }) });
      onCreated();
    } catch (e) { setErr(e.message); }
    finally { setSv(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "min(760px,96vw)", maxHeight: "93vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div><h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Create Invoice</h2><p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Taxes from settings auto-applied</p></div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>
        {err && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 16px", color: "#dc2626", fontSize: 13, marginBottom: 16 }}>⚠ {err}</div>}

        {/* Customer details */}
        <p style={{ ...S.label, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>CUSTOMER DETAILS</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div><span style={S.label}>Name *</span><input style={S.input} value={form.customer_name} onChange={(e) => setF("customer_name", e.target.value)} placeholder="Customer name" /></div>
          <div><span style={S.label}>Phone</span><input style={S.input} value={form.customer_phone} onChange={(e) => setF("customer_phone", e.target.value)} placeholder="+91..." /></div>
        </div>
        <div style={{ marginBottom: 24 }}>
          <span style={S.label}>Address</span>
          <input style={S.input} value={form.customer_address} onChange={(e) => setF("customer_address", e.target.value)} placeholder="Delivery address" />
        </div>

        {/* Product search */}
        <p style={{ ...S.label, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>LINE ITEMS</p>
        <div style={{ marginBottom: 10 }}>
          <span style={S.label}>Search & add from inventory</span>
          <ProductSearch onSelect={addProduct} />
        </div>

        {/* Item rows */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 100px 36px", gap: 8, marginBottom: 6, padding: "0 2px" }}>
          {["Item Name", "Qty", "Unit Price", ""].map((h, i) => <span key={i} style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>)}
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 72px 100px 36px", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input style={S.input} placeholder="Item name" value={it.item_name} onChange={(e) => updItem(i, "item_name", e.target.value)} />
            <input style={{ ...S.input, textAlign: "right" }} type="number" min="1" value={it.quantity} onChange={(e) => updItem(i, "quantity", e.target.value)} />
            <input style={{ ...S.input, textAlign: "right" }} type="number" min="0" step="0.01" placeholder="0.00" value={it.unit_price} onChange={(e) => updItem(i, "unit_price", e.target.value)} />
            <button onClick={() => remItem(i)} disabled={items.length === 1} style={{ background: items.length === 1 ? "#f1f5f9" : "#fee2e2", color: items.length === 1 ? "#cbd5e1" : "#dc2626", border: "none", borderRadius: 8, padding: "8px", cursor: items.length === 1 ? "not-allowed" : "pointer", fontWeight: 700 }}>−</button>
          </div>
        ))}
        <button type="button" onClick={addItem} style={{ ...S.btnOutline, fontSize: 13, marginBottom: 24 }}>+ Add Row</button>

        {/* Discount */}
        <p style={{ ...S.label, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "#94a3b8", marginBottom: 10 }}>DISCOUNT (OPTIONAL)</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div>
            <span style={S.label}>Type</span>
            <select style={S.input} value={discount.type} onChange={(e) => setDisc((p) => ({ ...p, type: e.target.value }))}>
              <option value="fixed">Rs. Fixed Amount</option>
              <option value="percent">% Percentage</option>
            </select>
          </div>
          <div>
            <span style={S.label}>{discount.type === "percent" ? "Percentage (%)" : "Amount (Rs.)"}</span>
            <input style={{ ...S.input, textAlign: "right" }} type="number" min="0" step="0.01" placeholder="0" value={discount.input} onChange={(e) => setDisc((p) => ({ ...p, input: e.target.value }))} />
          </div>
        </div>

        {/* Summary */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}>
          <div style={{ minWidth: 260, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px" }}>
            <Row label="Subtotal" val={`Rs. ${subtotal.toFixed(2)}`} />
            {charges.map((c, i) => {
              const v = Number(c.value), amt = c.type === "percent" ? (subtotal * v) / 100 : v;
              return <Row key={i} label={`${c.label}${c.type === "percent" ? ` (${v}%)` : ""}`} val={`Rs. ${Number.isFinite(amt) ? amt.toFixed(2) : "0.00"}`} />;
            })}
            {discountAmt > 0 && <Row label={`Discount${discount.type === "percent" ? ` (${dInput}%)` : ""}`} val={`-Rs. ${discountAmt.toFixed(2)}`} color="#16a34a" />}
            <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 8, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>Grand Total</span>
              <span style={{ fontWeight: 700, color: "#4f46e5", fontSize: 16 }}>Rs. {grand.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 24 }}>
          <span style={S.label}>Notes (optional)</span>
          <textarea style={{ ...S.input, resize: "vertical", minHeight: 56 }} value={form.notes} onChange={(e) => setF("notes", e.target.value)} placeholder="Any additional notes..." />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={S.btnOutline}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? "Creating…" : "Create Invoice"}</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, val, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: color || "#64748b", marginBottom: 5 }}>
      <span>{label}</span><span style={color ? { color } : {}}>{val}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   DATE RANGE DOWNLOAD BAR
══════════════════════════════════════════════════════════════════════════ */
function RangeDownload({ onToast }) {
  const [from, setFrom]   = useState("");
  const [to, setTo]       = useState("");
  const [busy, setBusy]   = useState(false);

  const download = async () => {
    if (!from || !to) { onToast("Select both From and To dates", "error"); return; }
    if (from > to) { onToast("'From' must be before 'To'", "error"); return; }
    setBusy(true);
    try {
      await downloadBlob("/api/invoices/range-pdf", "POST", { from, to }, `FlowStock-invoices-${from}-${to}.pdf`);
      onToast("Range PDF downloaded");
    } catch (e) { onToast(e.message, "error"); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "12px 16px", marginBottom: 20 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>📅 Download by range:</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input type="date" style={{ ...S.input, width: "auto", fontSize: 13 }} value={from} onChange={(e) => setFrom(e.target.value)} />
        <span style={{ color: "#94a3b8", fontWeight: 600 }}>—</span>
        <input type="date" style={{ ...S.input, width: "auto", fontSize: 13 }} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <button onClick={download} disabled={busy} style={{ ...S.btnPrimary, fontSize: 13, padding: "8px 18px", opacity: busy ? 0.7 : 1 }}>
        {busy ? "Generating…" : "⬇ Download PDF"}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PAGINATION
══════════════════════════════════════════════════════════════════════════ */
function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btnBase = { width: 34, height: 34, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 20 }}>
      <button disabled={page === 1} onClick={() => onPage(1)}    style={{ ...btnBase, opacity: page === 1 ? 0.4 : 1 }}>«</button>
      <button disabled={page === 1} onClick={() => onPage(page - 1)} style={{ ...btnBase, opacity: page === 1 ? 0.4 : 1 }}>‹</button>
      {nums.map((n, i) =>
        n === "…"
          ? <span key={i} style={{ width: 28, textAlign: "center", color: "#94a3b8" }}>…</span>
          : <button key={n} onClick={() => onPage(n)} style={{ ...btnBase, background: n === page ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "#fff", color: n === page ? "#fff" : "#334155", border: n === page ? "none" : "1px solid #e2e8f0" }}>{n}</button>
      )}
      <button disabled={page === pages} onClick={() => onPage(page + 1)} style={{ ...btnBase, opacity: page === pages ? 0.4 : 1 }}>›</button>
      <button disabled={page === pages} onClick={() => onPage(pages)}  style={{ ...btnBase, opacity: page === pages ? 0.4 : 1 }}>»</button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════════════════ */
const PAGE_SIZE = 15;

export function Invoices() {
  const [invoices, setInvoices]   = useState([]);
  const [meta, setMeta]           = useState({ total: 0, page: 1, pages: 1 });
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [selected, setSelected]   = useState([]);        // { id, source }
  const [dlBusy, setDlBusy]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [showSettings, setSetP]   = useState(false);
  const [showCreate, setCreate]   = useState(false);

  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (pg = 1) => {
    setLoading(true); setError(null);
    try {
      const j = await apiFetch(`/api/invoices?page=${pg}&limit=${PAGE_SIZE}`);
      setInvoices(j.data ?? []);
      setMeta(j.meta ?? { total: 0, page: pg, pages: 1 });
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  /* ── Selection ── */
  const isSelected = (inv) => selected.some((s) => s.id === inv.id);
  const toggleAll  = () => setSelected(selected.length === invoices.length ? [] : invoices.map((inv) => ({ id: inv.id, source: inv.source })));
  const toggleOne  = (inv) => setSelected((p) => isSelected(inv) ? p.filter((s) => s.id !== inv.id) : [...p, { id: inv.id, source: inv.source }]);
  const selIds     = (src) => selected.filter((s) => s.source === src).map((s) => s.id);

  /* ── Per-row actions ── */
  const handleView = async (inv) => {
    try { await viewBlob(inv.source === "manual" ? `/api/invoices/manual/${inv.id}/pdf` : `/api/invoices/${inv.id}/pdf`); }
    catch (e) { showToast(e.message, "error"); }
  };
  const handleDl = async (inv) => {
    try { await downloadBlob(inv.source === "manual" ? `/api/invoices/manual/${inv.id}/pdf` : `/api/invoices/${inv.id}/pdf`, "GET", null, `FlowStock-invoice-${inv.short_id}.pdf`); }
    catch (e) { showToast(e.message, "error"); }
  };

  /* ── Bulk download ── */
  const downloadBulk = async () => {
    if (!selected.length) return;
    setDlBusy(true);
    try {
      await downloadBlob("/api/invoices/bulk-pdf", "POST", { orderIds: selIds("order"), manualIds: selIds("manual") }, `FlowStock-invoices-${selected.length}.pdf`);
      showToast(`${selected.length} invoice${selected.length > 1 ? "s" : ""} downloaded`);
      setSelected([]);
    } catch (e) { showToast(e.message, "error"); }
    finally { setDlBusy(false); }
  };

  return (
    <div style={{ padding: "28px 32px", minHeight: "100%", background: "#f8fafc" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, borderRadius: 999, padding: "10px 24px", background: toast.type === "error" ? "#dc2626" : "#16a34a", color: "#fff", fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }}>
          {toast.type === "error" ? "⚠ " : "✓ "}{toast.msg}
        </div>
      )}

      {showSettings && <SettingsPanel onClose={() => setSetP(false)} onSaved={() => { setSetP(false); showToast("Settings saved — new invoices will use updated taxes"); }} />}
      {showCreate && <CreateInvoiceModal onClose={() => setCreate(false)} onCreated={() => { setCreate(false); load(1); showToast("Invoice created"); }} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Invoices</h1>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            {meta.total} invoice{meta.total !== 1 ? "s" : ""} · Auto-generated on confirm · Manual creation supported
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {selected.length > 0 && (
            <button type="button" onClick={downloadBulk} disabled={dlBusy} style={{ ...S.btnPrimary, opacity: dlBusy ? 0.7 : 1 }}>
              🧾 {dlBusy ? "Generating…" : `Download ${selected.length} as PDF`}
            </button>
          )}
          <button type="button" onClick={() => setCreate(true)} style={S.btnPrimary}>+ Create Invoice</button>
          <button type="button" onClick={() => setSetP(true)} style={S.btnOutline}>⚙ Tax Settings</button>
        </div>
      </div>

      {/* Date range download */}
      <RangeDownload onToast={showToast} />

      {/* Loading / Error / Empty */}
      {loading && <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 14 }}>Loading invoices…</div>}
      {!loading && error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "20px 24px", color: "#dc2626", fontSize: 14 }}>
          ⚠ {error} — <button onClick={() => load(page)} style={{ color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Retry</button>
        </div>
      )}
      {!loading && !error && invoices.length === 0 && (
        <div style={{ ...S.card, padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: 0 }}>No invoices yet</p>
          <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>Invoices appear here when orders are confirmed, or create one manually.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && invoices.length > 0 && (
        <div style={S.card}>
          {selected.length > 0 && (
            <div style={{ padding: "9px 18px", background: "#eef2ff", borderBottom: "1px solid #c7d2fe", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
              <span style={{ color: "#4f46e5", fontWeight: 600 }}>{selected.length} selected</span>
              <button onClick={() => setSelected([])} style={{ color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>Clear</button>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.colH}><input type="checkbox" checked={selected.length === invoices.length && invoices.length > 0} onChange={toggleAll} style={{ cursor: "pointer", accentColor: "#6366f1" }} /></th>
                <th style={S.colH}>Invoice ID</th>
                <th style={S.colH}>Type</th>
                <th style={S.colH}>Customer</th>
                <th style={S.colH}>Amount</th>
                <th style={S.colH}>Date</th>
                <th style={{ ...S.colH, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} style={{ background: isSelected(inv) ? "#f5f3ff" : "#fff", transition: "background 0.12s" }}>
                  <td style={S.cell}><input type="checkbox" checked={isSelected(inv)} onChange={() => toggleOne(inv)} style={{ cursor: "pointer", accentColor: "#6366f1" }} /></td>
                  <td style={S.cell}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4f46e5", background: "#eef2ff", borderRadius: 6, padding: "3px 8px" }}>#{inv.short_id}</span>
                  </td>
                  <td style={S.cell}>
                    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "3px 10px", background: inv.source === "manual" ? "#f0fdf4" : "#f0f9ff", color: inv.source === "manual" ? "#16a34a" : "#0369a1", border: `1px solid ${inv.source === "manual" ? "#bbf7d0" : "#bae6fd"}` }}>
                      {inv.source === "manual" ? "Manual" : "Order"}
                    </span>
                  </td>
                  <td style={{ ...S.cell, fontWeight: 600, color: "#1e293b" }}>{inv.customer_name}</td>
                  <td style={{ ...S.cell, fontWeight: 600 }}>{money(inv.amount)}</td>
                  <td style={{ ...S.cell, color: "#64748b", fontSize: 13 }}>{fmt(inv.date)}</td>
                  <td style={{ ...S.cell, textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button type="button" onClick={() => handleView(inv)} style={S.btnSm("ghost")}>View</button>
                      <button type="button" onClick={() => handleDl(inv)}   style={S.btnSm("fill")}>⬇ Download</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid #f1f5f9" }}>
            <Pagination page={meta.page} pages={meta.pages} onPage={(p) => { setPage(p); setSelected([]); }} />
          </div>
        </div>
      )}
    </div>
  );
}
