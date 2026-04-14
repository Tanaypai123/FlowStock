import { useEffect, useState } from "react";
import { devApi } from "../../lib/devApi.js";

const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";

function SuccessRate({ rate }) {
  if (rate == null) return <span style={{ color: "#9ca3af", fontSize: 12 }}>N/A</span>;
  const color = rate >= 90 ? "#059669" : rate >= 70 ? "#d97706" : "#dc2626";
  const bg    = rate >= 90 ? "#d1fae5"  : rate >= 70 ? "#fef3c7"  : "#fef2f2";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 64, height: 6, borderRadius: 3, background: "#e5e7eb" }}>
        <div style={{ width: `${Math.min(100, rate)}%`, height: "100%", borderRadius: 3, background: color, transition: "width .4s" }} />
      </div>
      <span style={{ padding: "2px 7px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: bg, color }}>{rate}%</span>
    </div>
  );
}

export function DevDrivers() {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    devApi("/api/dev/drivers")
      .then((r) => setRows(r.data ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const th = { padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "11px 14px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

  const cols = [
    {
      label: "Driver",
      render: (r) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, background: r.is_active ? "#dbeafe" : "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: r.is_active ? "#1e40af" : "#6b7280", flexShrink: 0 }}>
            {(r.name || "D").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: "#111827" }}>{r.name ?? "—"}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{r.phone}</div>
          </div>
        </div>
      ),
    },
    { label: "Businesses",       render: (r) => r.businesses },
    { label: "Total Deliveries", render: (r) => <strong>{r.total_deliveries}</strong> },
    { label: "Delivered",        render: (r) => <span style={{ color: "#059669", fontWeight: 600 }}>{r.delivered_count}</span> },
    { label: "Failed",           render: (r) => <span style={{ color: r.failed_count > 0 ? "#dc2626" : "#9ca3af", fontWeight: r.failed_count > 0 ? 700 : 400 }}>{r.failed_count}</span> },
    { label: "Success Rate",     render: (r) => <SuccessRate rate={r.success_rate} /> },
    { label: "Avg Time",         render: (r) => r.avg_delivery_time != null ? <span>{r.avg_delivery_time} min</span> : <span style={{ color: "#9ca3af" }}>—</span> },
    { label: "Last Active",      render: (r) => <span style={{ color: "#6b7280" }}>{fmt(r.last_active)}</span> },
    {
      label: "Status",
      render: (r) => (
        <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.is_active ? "#d1fae5" : "#f3f4f6", color: r.is_active ? "#065f46" : "#6b7280" }}>
          {r.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Drivers</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Delivery performance across all businesses</p>
        </div>
        {!loading && <span style={{ padding: "3px 10px", borderRadius: 999, background: "#ede9fe", color: "#6d28d9", fontSize: 12, fontWeight: 700 }}>{rows.length} drivers</span>}
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{cols.map((c, i) => <th key={i} style={th}>{c.label}</th>)}</tr></thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{cols.map((_, j) => (
                  <td key={j} style={td}>
                    <div style={{ height: 14, borderRadius: 4, background: "#f3f4f6", width: "65%", animation: "pulse 1.5s infinite" }} />
                  </td>
                ))}</tr>
              ))
              : rows.length === 0
                ? <tr><td colSpan={cols.length} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 32 }}>No drivers found</td></tr>
                : rows.map((row, i) => (
                  <tr key={i}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                    {cols.map((c, j) => <td key={j} style={td}>{c.render ? c.render(row) : "—"}</td>)}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
