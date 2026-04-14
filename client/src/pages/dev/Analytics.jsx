import { useEffect, useState, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { devApi } from "../../lib/devApi.js";

// ─── Palette ─────────────────────────────────────────────────────────────────
const BIZ_COLORS  = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];
const STATUS_COLORS = {
  pending:    "#f59e0b",
  confirmed:  "#6366f1",
  dispatched: "#0ea5e9",
  delivered:  "#10b981",
  cancelled:  "#9ca3af",
  rejected:   "#ef4444",
};

const fmt  = (iso) => iso?.slice(5) ?? "";          // MM-DD for axis
const rupI = (n)   => "₹" + Math.round(n).toLocaleString("en-IN");

// ─── Shared card shell ────────────────────────────────────────────────────────
function ChartCard({ title, sub, children, height = 280 }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "20px 20px 16px", boxShadow: "0 1px 3px rgba(0,0,0,.05)", marginBottom: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>{title}</h3>
        {sub && <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 3, marginBottom: 0 }}>{sub}</p>}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

// ─── Day-range buttons ────────────────────────────────────────────────────────
function RangeBtn({ days, active, onClick }) {
  const labels = { 7: "Last 7 days", 30: "Last 30 days", 90: "Last 90 days" };
  return (
    <button
      onClick={() => onClick(days)}
      style={{
        padding: "7px 16px", borderRadius: 7, border: "1px solid",
        borderColor: active ? "#6366f1" : "#e5e7eb",
        background:  active ? "#6366f1" : "#fff",
        color:       active ? "#fff"    : "#374151",
        fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s",
      }}
    >
      {labels[days]}
    </button>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skeleton({ h = 280 }) {
  return <div style={{ height: h, borderRadius: 10, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />;
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, prefix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,.1)", fontSize: 12 }}>
      <p style={{ fontWeight: 700, color: "#111827", marginBottom: 6 }}>{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: "inline-block" }} />
          <span style={{ color: "#6b7280" }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: "#111827" }}>{prefix}{typeof p.value === "number" ? p.value.toLocaleString("en-IN") : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ANALYTICS PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function DevAnalytics() {
  const [days,    setDays]    = useState(7);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback((d) => {
    setLoading(true);
    setError(null);
    devApi(`/api/dev/analytics/rich?days=${d}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(days); }, [days, load]);

  const { daily = [], growth = [], bizDaily = [], top5Names = [], statusBreakdown = [] } = data ?? {};

  // Totals for summary row
  const totalOrders  = daily.reduce((s, d) => s + d.orders, 0);
  const totalRevenue = daily.reduce((s, d) => s + d.revenue, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Analytics</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>Platform-wide order and growth charts</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[7, 30, 90].map((d) => <RangeBtn key={d} days={d} active={days === d} onClick={(v) => setDays(v)} />)}
        </div>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Quick summary */}
      {!loading && data && (
        <div style={{ display: "flex", gap: 14, marginBottom: 24, flexWrap: "wrap" }}>
          {[
            { label: "Orders in period",  value: totalOrders.toLocaleString("en-IN"), color: "#6366f1" },
            { label: "Revenue in period", value: rupI(totalRevenue),                   color: "#10b981" },
          ].map((s) => (
            <div key={s.label} style={{ padding: "12px 20px", borderRadius: 10, background: "#fff", border: "1px solid #e5e7eb", minWidth: 160 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart 1 — Daily orders */}
      <ChartCard title="📦 Daily Orders" sub="Total orders placed per day across all businesses">
        {loading ? <Skeleton /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="orders" name="Orders" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Chart 2 — Revenue per day */}
      <ChartCard title="💰 Revenue per Day" sub="Sum of final_total (excl. cancelled / rejected)">
        {loading ? <Skeleton /> : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`} />
              <Tooltip content={<CustomTooltip prefix="₹" />} formatter={(v) => [Math.round(v).toLocaleString("en-IN"), "Revenue"]} />
              <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Chart 3 — Platform growth */}
      <ChartCard title="📈 Platform Growth" sub="Cumulative businesses and customers over time (all time)" height={260}>
        {loading ? <Skeleton h={260} /> : growth.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af", fontSize: 13 }}>No data yet</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={growth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="total_businesses" name="Businesses" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total_customers"  name="Customers"  stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Chart 4 — Orders per top-5 businesses */}
      <ChartCard title="🏢 Orders per Business (Top 5)" sub="Daily order count for the 5 highest-volume businesses" height={260}>
        {loading ? <Skeleton h={260} /> : bizDaily.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af", fontSize: 13 }}>Not enough data</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bizDaily} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" tickFormatter={fmt} tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              {top5Names.map((name, i) => (
                <Bar key={name} dataKey={name} fill={BIZ_COLORS[i % BIZ_COLORS.length]} radius={[3, 3, 0, 0]} maxBarSize={20} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Chart 5 — Status pie */}
      <ChartCard title="🥧 Order Status Breakdown" sub="Distribution of order statuses in the selected period" height={300}>
        {loading ? <Skeleton h={300} /> : statusBreakdown.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af", fontSize: 13 }}>No orders in this period</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 24, height: "100%" }}>
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie
                  data={statusBreakdown} dataKey="count" nameKey="status"
                  cx="50%" cy="50%" outerRadius={100} innerRadius={50}
                  paddingAngle={2} stroke="none"
                >
                  {statusBreakdown.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#9ca3af"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v.toLocaleString("en-IN"), n]} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div style={{ flex: 1 }}>
              {statusBreakdown.sort((a, b) => b.count - a.count).map((s) => {
                const total = statusBreakdown.reduce((x, r) => x + r.count, 0);
                return (
                  <div key={s.status} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: STATUS_COLORS[s.status] ?? "#9ca3af", display: "inline-block" }} />
                      <span style={{ fontSize: 12, textTransform: "capitalize", color: "#374151" }}>{s.status}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>{s.count.toLocaleString("en-IN")}</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>{total > 0 ? Math.round((s.count / total) * 100) : 0}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ChartCard>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
