import { useEffect, useState } from "react";
import { devApi } from "../../lib/devApi.js";

function StatCard({ label, value, sub, color = "#6366f1", loading }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      padding: "20px 22px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af" }}>
        {label}
      </span>
      {loading ? (
        <div style={{ height: 36, width: 80, borderRadius: 6, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
      ) : (
        <span style={{ fontSize: 32, fontWeight: 800, color: "#111827", lineHeight: 1 }}>
          {value ?? "—"}
        </span>
      )}
      {sub && !loading && (
        <span style={{ fontSize: 12, color: "#6b7280" }}>{sub}</span>
      )}
      <div style={{ height: 3, borderRadius: 2, background: color, marginTop: 8, opacity: 0.7 }} />
    </div>
  );
}

function rupee(n) {
  if (n == null || !Number.isFinite(Number(n))) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function DevOverview() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    devApi("/api/dev/overview")
      .then((r) => { setData(r.data); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>Overview</h1>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
          Platform-wide stats across all businesses · {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
        </p>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: 13, marginBottom: 20 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Row 1 — Platform totals */}
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 12 }}>Platform Totals</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <StatCard label="Total Businesses" value={data?.total_businesses}      color="#6366f1" loading={loading} />
        <StatCard label="Total Customers"  value={data?.total_customers}       color="#0ea5e9" loading={loading} />
        <StatCard label="Total Drivers"    value={data?.total_drivers}         color="#8b5cf6" loading={loading} />
        <StatCard label="Total Orders"     value={data?.total_orders?.toLocaleString("en-IN")} color="#f59e0b" loading={loading} />
      </div>

      {/* Row 2 — Today */}
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9ca3af", marginBottom: 12 }}>Today</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        <StatCard label="Orders Today"           value={data?.orders_today}                          color="#10b981" loading={loading} />
        <StatCard label="Revenue Today"          value={data ? rupee(data.revenue_today) : null}      color="#f59e0b" loading={loading} sub="Excl. cancelled/rejected" />
        <StatCard label="Active Deliveries"      value={data?.active_deliveries}                     color="#ef4444" loading={loading} sub="Dispatched + Out for delivery" />
        <StatCard label="New Businesses / Month" value={data?.new_businesses_this_month}             color="#6366f1" loading={loading} sub="This calendar month" />
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}
