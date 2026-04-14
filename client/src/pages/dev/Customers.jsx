import { useEffect, useState } from "react";
import { devApi } from "../../lib/devApi.js";

const rupee = (n) => n != null ? "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "—";
const fmt   = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—";

function StatCard({ label, value, sub, color = "#6366f1", loading }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 6 }}>{label}</div>
      {loading
        ? <div style={{ height: 32, width: 80, borderRadius: 6, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
        : <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1 }}>{value ?? "—"}</div>}
      {sub && !loading && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
      <div style={{ height: 3, borderRadius: 2, background: color, marginTop: 10, opacity: 0.7 }} />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}

function PriorityBadge({ priority }) {
  const styles = {
    vip:     { background: "#fef3c7", color: "#92400e", label: "⭐ VIP"     },
    regular: { background: "#dbeafe", color: "#1e40af", label: "Regular"    },
    new:     { background: "#f3f4f6", color: "#374151", label: "New"        },
  };
  const s = styles[priority] ?? styles.new;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: s.background, color: s.color }}>
      {s.label}
    </span>
  );
}

export function DevCustomers() {
  const [rows,    setRows]    = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");

  useEffect(() => {
    devApi("/api/dev/customers")
      .then((r) => { setRows(r.data ?? []); setStats(r.stats ?? null); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase();
        return (r.display_name ?? "").toLowerCase().includes(q);
      })
    : rows;

  const th = { padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "left" };
  const td = { padding: "11px 14px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Customers</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>All customer accounts across the platform</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Total Customers"    value={loading ? null : stats?.total}                             color="#6366f1" loading={loading} />
        <StatCard label="Active (30 days)"   value={loading ? null : stats?.active_30d}                       color="#10b981" loading={loading} sub="Placed at least 1 order" />
        <StatCard label="Repeat Customers"   value={loading ? null : stats?.repeat}                           color="#f59e0b" loading={loading} sub="More than 1 order" />
        <StatCard label="Avg Order Value"    value={loading ? null : rupee(stats?.avg_order_val)}             color="#8b5cf6" loading={loading} sub="Platform-wide" />
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, width: 280, outline: "none" }}
        />
        {search && <span style={{ marginLeft: 10, fontSize: 12, color: "#6b7280" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Name", "Businesses", "Total Orders", "Total Spent", "Last Order", "Priority"].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} style={td}><div style={{ height: 14, borderRadius: 4, background: "#f3f4f6", width: "65%", animation: "pulse 1.5s infinite" }} /></td>
                ))}</tr>
              ))
              : filtered.length === 0
                ? <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 32 }}>No customers found</td></tr>
                : filtered.map((r, i) => (
                  <tr key={i}
                    onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                    <td style={td}><strong>{r.display_name ?? <span style={{ color: "#9ca3af" }}>Anonymous</span>}</strong></td>
                    <td style={td}>{r.businesses}</td>
                    <td style={td}><strong>{r.total_orders}</strong></td>
                    <td style={{ ...td, fontWeight: 600, color: "#059669" }}>{rupee(r.total_spent)}</td>
                    <td style={{ ...td, color: "#6b7280" }}>{fmt(r.last_order)}</td>
                    <td style={td}><PriorityBadge priority={r.priority} /></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
