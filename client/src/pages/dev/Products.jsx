import { useEffect, useState } from "react";
import { devApi } from "../../lib/devApi.js";

const rupee = (n) => n != null ? "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—";

function Section({ title, sub, badge, badgeColor = "#6366f1", children }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h2>
        {badge != null && (
          <span style={{ padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: badgeColor + "18", color: badgeColor }}>
            {badge}
          </span>
        )}
        {sub && <span style={{ fontSize: 12, color: "#9ca3af" }}>— {sub}</span>}
      </div>
      {children}
    </div>
  );
}

function SimpleTable({ columns, rows, loading }) {
  const th = { padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "10px 14px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{columns.map((c) => <th key={c.key} style={th}>{c.label}</th>)}</tr></thead>
        <tbody>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>{columns.map((c) => (
                <td key={c.key} style={td}>
                  <div style={{ height: 13, borderRadius: 4, background: "#f3f4f6", width: "60%", animation: "pulse 1.5s infinite" }} />
                </td>
              ))}</tr>
            ))
            : rows.length === 0
              ? <tr><td colSpan={columns.length} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 28 }}>No data</td></tr>
              : rows.map((row, i) => (
                <tr key={i}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                  onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                  {columns.map((c) => <td key={c.key} style={td}>{c.render ? c.render(row, i) : row[c.key] ?? "—"}</td>)}
                </tr>
              ))}
        </tbody>
      </table>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

export function DevProducts() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    devApi("/api/dev/products")
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const topSelling = data?.topSelling ?? [];
  const lowStock   = data?.lowStock   ?? [];
  const deadStock  = data?.deadStock  ?? [];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Products</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Inventory intelligence across all businesses</p>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* MOST SELLING */}
      <Section title="🔥 Most Selling" sub="Top 10 products by units ordered" badge={loading ? null : topSelling.length} badgeColor="#f59e0b">
        <SimpleTable
          loading={loading}
          rows={topSelling}
          columns={[
            { key: "rank",      label: "#",          render: (_, i) => <strong style={{ color: "#6366f1" }}>{i + 1}</strong> },
            { key: "name",      label: "Product",    render: (r) => <strong>{r.name}</strong> },
            { key: "business",  label: "Business",   render: (r) => <span style={{ fontSize: 12, color: "#6b7280" }}>{r.business}</span> },
            { key: "total_qty", label: "Units Sold", render: (r) => <strong style={{ color: "#059669" }}>{Number(r.total_qty).toLocaleString("en-IN")}</strong> },
            { key: "revenue",   label: "Revenue",    render: (r) => <strong>{rupee(r.revenue)}</strong> },
          ]}
        />
      </Section>

      {/* LOW STOCK */}
      <Section title="⚠️ Low Stock" sub="Items at or below alert threshold" badge={loading ? null : lowStock.length} badgeColor="#f59e0b">
        <SimpleTable
          loading={loading}
          rows={lowStock}
          columns={[
            { key: "name",      label: "Product",   render: (r) => <strong>{r.name}</strong> },
            { key: "business",  label: "Business",  render: (r) => <span style={{ fontSize: 12, color: "#6b7280" }}>{r.business}</span> },
            { key: "quantity",  label: "Stock",     render: (r) => (
              <span style={{
                padding: "2px 8px", borderRadius: 999, fontSize: 12, fontWeight: 700,
                background: r.out_of_stock ? "#fef2f2" : "#fff7ed",
                color:      r.out_of_stock ? "#991b1b" : "#92400e",
              }}>
                {r.out_of_stock ? "⛔ Out of Stock" : `${r.quantity} left`}
              </span>
            )},
            { key: "alert",     label: "Alert At",  render: (r) => `≤ ${r.alert} units` },
          ]}
        />
      </Section>

      {/* DEAD STOCK */}
      <Section title="💤 Dead Stock" sub="Has stock but no orders in last 30 days" badge={loading ? null : deadStock.length} badgeColor="#9ca3af">
        <SimpleTable
          loading={loading}
          rows={deadStock}
          columns={[
            { key: "name",      label: "Product",       render: (r) => <strong>{r.name}</strong> },
            { key: "business",  label: "Business",      render: (r) => <span style={{ fontSize: 12, color: "#6b7280" }}>{r.business}</span> },
            { key: "quantity",  label: "Stock",         render: (r) => `${Number(r.quantity).toLocaleString("en-IN")} units` },
            { key: "days_idle", label: "Days Idle",     render: (r) => (
              <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: r.days_idle > 90 ? "#fef2f2" : "#f3f4f6", color: r.days_idle > 90 ? "#991b1b" : "#374151" }}>
                {r.days_idle}d
              </span>
            )},
          ]}
        />
      </Section>
    </div>
  );
}
