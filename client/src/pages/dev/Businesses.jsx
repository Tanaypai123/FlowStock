import { useEffect, useState, useCallback } from "react";
import { devApi } from "../../lib/devApi.js";

// ─── Shared table shell ────────────────────────────────────────────────────────
function DevTable({ columns, rows, loading }) {
  const th = { padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "11px 14px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{columns.map((c) => <th key={c.key} style={th}>{c.label}</th>)}</tr></thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>{columns.map((c) => (
                <td key={c.key} style={td}>
                  <div style={{ height: 14, borderRadius: 4, background: "#f3f4f6", width: "65%", animation: "pulse 1.5s infinite" }} />
                </td>
              ))}</tr>
            ))
            : rows.length === 0
              ? <tr><td colSpan={columns.length} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 32 }}>No data</td></tr>
              : rows.map((row, i) => (
                <tr key={i}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                  onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                  {columns.map((c) => <td key={c.key} style={td}>{c.render ? c.render(row) : row[c.key] ?? "—"}</td>)}
                </tr>
              ))}
        </tbody>
      </table>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";
const rupee = (n) => n != null ? "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—";

// ─── Detail Side Panel ─────────────────────────────────────────────────────────
function BusinessPanel({ id, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    devApi(`/api/dev/business/${id}/detail`)
      .then((r) => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id]);

  function copyInvite() {
    const link = `${window.location.origin}${detail?.invite_link}`;
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  const statusColor = (s) => ({
    delivered: "#065f46", dispatched: "#1e40af", confirmed: "#6d28d9",
    pending: "#92400e", rejected: "#991b1b", cancelled: "#374151",
  }[s] ?? "#374151");

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 99, backdropFilter: "blur(2px)" }} />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: Math.min(480, window.innerWidth),
        background: "#fff", zIndex: 100, overflowY: "auto",
        boxShadow: "-4px 0 30px rgba(0,0,0,.15)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 4 }}>Business Detail</div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#111827", margin: 0 }}>{loading ? "Loading…" : detail?.business_name ?? "—"}</h2>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "#f3f4f6", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 14, color: "#374151" }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>
            {[80, 60, 90, 50].map((w, i) => (
              <div key={i} style={{ height: 14, borderRadius: 4, background: "#f3f4f6", width: `${w}%`, marginBottom: 12, animation: "pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : detail ? (
          <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Info block */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { label: "Owner",   value: detail.owner_name },
                { label: "Phone",   value: detail.phone },
                { label: "Email",   value: detail.email    ?? "—" },
                { label: "GST",     value: detail.gst_number ?? "—" },
                { label: "Address", value: detail.address  ?? "—" },
                { label: "Customers", value: detail.customer_count },
              ].map((f) => (
                <div key={f.label} style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 3 }}>{f.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", wordBreak: "break-word" }}>{f.value ?? "—"}</div>
                </div>
              ))}
            </div>

            {/* Invite link */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 8 }}>Invite Link</div>
              <div style={{ display: "flex", gap: 8 }}>
                <code style={{ flex: 1, fontSize: 12, background: "#f3f4f6", borderRadius: 6, padding: "8px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {window.location.origin}{detail.invite_link}
                </code>
                <button onClick={copyInvite} style={{
                  padding: "8px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: copied ? "#d1fae5" : "#6366f1", color: copied ? "#065f46" : "#fff", transition: "all .2s",
                }}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>
            </div>

            {/* Last 5 orders */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 8 }}>Last 5 Orders</div>
              {detail.last_orders.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9ca3af" }}>No orders yet.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      {["ID", "Amount", "Status", "Date"].map((h) => (
                        <th key={h} style={{ padding: "7px 10px", fontWeight: 700, textAlign: "left", color: "#6b7280", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.last_orders.map((o) => (
                      <tr key={o.id}>
                        <td style={{ padding: "7px 10px", borderBottom: "1px solid #f3f4f6" }}><code style={{ fontSize: 11 }}>{o.id.slice(0, 8)}…</code></td>
                        <td style={{ padding: "7px 10px", borderBottom: "1px solid #f3f4f6", fontWeight: 600 }}>{rupee(o.final_total)}</td>
                        <td style={{ padding: "7px 10px", borderBottom: "1px solid #f3f4f6" }}>
                          <span style={{ padding: "2px 7px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: "#f3f4f6", color: statusColor(o.status) }}>{o.status}</span>
                        </td>
                        <td style={{ padding: "7px 10px", borderBottom: "1px solid #f3f4f6", color: "#6b7280" }}>{fmt(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top 3 products */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 8 }}>Top 3 Products by Sales</div>
              {detail.top_products.length === 0
                ? <p style={{ fontSize: 13, color: "#9ca3af" }}>No sales data.</p>
                : detail.top_products.map((p, i) => (
                  <div key={p.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ fontSize: 13, color: "#111827" }}><strong style={{ marginRight: 6, color: "#6366f1" }}>#{i + 1}</strong>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>{Number(p.total_qty).toLocaleString("en-IN")} units</span>
                  </div>
                ))}
            </div>

            {/* Drivers */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 8 }}>Drivers ({detail.drivers.length})</div>
              {detail.drivers.length === 0
                ? <p style={{ fontSize: 13, color: "#9ca3af" }}>No drivers linked.</p>
                : detail.drivers.map((d, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 999, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#6d28d9", flexShrink: 0 }}>
                      {(d.name || "D").slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{d.name}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>{d.phone}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: 24, color: "#9ca3af", fontSize: 14 }}>Failed to load details.</div>
        )}
      </div>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUSINESSES PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function DevBusinesses() {
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [panelId,    setPanelId]    = useState(null);

  useEffect(() => {
    devApi("/api/dev/businesses").then((r) => setRows(r.data ?? [])).finally(() => setLoading(false));
  }, []);

  const cols = [
    { key: "business_name", label: "Business",     render: (r) => <strong>{r.business_name}</strong> },
    { key: "owner",         label: "Owner",         render: (r) => <div><div style={{ fontWeight: 600 }}>{r.owner_name}</div><div style={{ fontSize: 11, color: "#9ca3af" }}>{r.email ?? "—"}</div></div> },
    { key: "total_orders",  label: "Orders",        render: (r) => <strong>{r.total_orders?.toLocaleString("en-IN")}</strong> },
    { key: "total_customers",label: "Customers"                                                          },
    { key: "total_drivers", label: "Drivers"                                                             },
    { key: "total_revenue", label: "Revenue",       render: (r) => <strong style={{ color: "#059669" }}>{rupee(r.total_revenue)}</strong> },
    { key: "created_at",    label: "Joined",        render: (r) => fmt(r.created_at) },
    { key: "actions",       label: "",              render: (r) => (
      <button onClick={() => setPanelId(r.id)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6366f1", whiteSpace: "nowrap" }}>
        View Details →
      </button>
    )},
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Businesses</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>All businesses registered on the platform</p>
        </div>
        {!loading && <span style={{ padding: "3px 10px", borderRadius: 999, background: "#ede9fe", color: "#6d28d9", fontSize: 12, fontWeight: 700 }}>{rows.length}</span>}
      </div>

      <DevTable columns={cols} rows={rows} loading={loading} />
      {panelId && <BusinessPanel id={panelId} onClose={() => setPanelId(null)} />}
    </div>
  );
}
