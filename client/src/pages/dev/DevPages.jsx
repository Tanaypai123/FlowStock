import { useEffect, useState } from "react";
import { devApi } from "../../lib/devApi.js";

// Reusable table for all simple list pages
function DevTable({ columns, rows, loading, emptyText = "No data" }) {
  const thStyle = {
    padding: "10px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: "0.07em", color: "#6b7280", background: "#f9fafb",
    borderBottom: "1px solid #e5e7eb", textAlign: "left", whiteSpace: "nowrap",
  };
  const tdStyle = {
    padding: "11px 14px", fontSize: 13, color: "#374151", borderBottom: "1px solid #f3f4f6",
    verticalAlign: "middle",
  };

  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {columns.map((c) => <th key={c.key} style={{ ...thStyle, width: c.width }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} style={tdStyle}>
                    <div style={{ height: 14, borderRadius: 4, background: "#f3f4f6", width: c.skeletonW ?? "70%", animation: "pulse 1.5s infinite" }} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ ...tdStyle, textAlign: "center", color: "#9ca3af", padding: 32 }}>{emptyText}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} style={{ transition: "background 0.1s" }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
              onMouseLeave={(e) => e.currentTarget.style.background = ""}>
              {columns.map((c) => (
                <td key={c.key} style={tdStyle}>{c.render ? c.render(row) : row[c.key] ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}

function PageHeader({ title, sub, count }) {
  return (
    <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-end", gap: 12 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>{title}</h1>
        {sub && <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{sub}</p>}
      </div>
      {count != null && (
        <span style={{ marginBottom: 4, padding: "3px 10px", borderRadius: 999, background: "#ede9fe", color: "#6d28d9", fontSize: 12, fontWeight: 700 }}>
          {count}
        </span>
      )}
    </div>
  );
}

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
}

// ─── Businesses ───────────────────────────────────────────────────────────────
export function DevBusinesses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    devApi("/api/dev/businesses").then((r) => setRows(r.data ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Businesses" sub="All registered businesses on the platform" count={loading ? null : rows.length} />
      <DevTable
        loading={loading}
        rows={rows}
        columns={[
          { key: "business_name",  label: "Business Name",  render: (r) => <strong>{r.business_name}</strong> },
          { key: "business_type",  label: "Type",           render: (r) => r.business_type ?? "—" },
          { key: "phone",          label: "Phone"                        },
          { key: "email",          label: "Email",          render: (r) => r.email ?? "—" },
          { key: "created_at",     label: "Joined",         render: (r) => fmt(r.created_at) },
        ]}
      />
    </div>
  );
}

// ─── Customers ────────────────────────────────────────────────────────────────
export function DevCustomers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    devApi("/api/dev/customers").then((r) => setRows(r.data ?? [])).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Customers" sub="All registered customer accounts" count={loading ? null : rows.length} />
      <DevTable
        loading={loading}
        rows={rows}
        columns={[
          { key: "display_name", label: "Name",     render: (r) => r.display_name ?? <span style={{ color: "#9ca3af" }}>—</span> },
          { key: "id",           label: "User ID",  render: (r) => <code style={{ fontSize: 11, color: "#6b7280" }}>{r.id.slice(0, 8)}…</code> },
          { key: "created_at",   label: "Joined",   render: (r) => fmt(r.created_at) },
        ]}
      />
    </div>
  );
}

// ─── Drivers ─────────────────────────────────────────────────────────────────
export function DevDrivers() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    devApi("/api/dev/drivers").then((r) => setRows(r.data ?? [])).finally(() => setLoading(false));
  }, []);

  const badgeStyle = (active) => ({
    padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600,
    background: active ? "#d1fae5" : "#f3f4f6",
    color:      active ? "#065f46" : "#6b7280",
  });

  return (
    <div>
      <PageHeader title="Drivers" sub="All drivers across all businesses" count={loading ? null : rows.length} />
      <DevTable
        loading={loading}
        rows={rows}
        columns={[
          { key: "name",               label: "Name",     render: (r) => r.name ?? <span style={{ color: "#9ca3af" }}>—</span> },
          { key: "phone",              label: "Phone"                          },
          { key: "is_active",          label: "Status",   render: (r) => <span style={badgeStyle(r.is_active)}>{r.is_active ? "Active" : "Inactive"}</span> },
          { key: "is_profile_complete",label: "Profile",  render: (r) => <span style={badgeStyle(r.is_profile_complete)}>{r.is_profile_complete ? "Complete" : "Incomplete"}</span> },
          { key: "created_at",         label: "Joined",   render: (r) => fmt(r.created_at) },
        ]}
      />
    </div>
  );
}

// ─── Products ─────────────────────────────────────────────────────────────────
export function DevProducts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    devApi("/api/dev/products").then((r) => setRows(r.data ?? [])).finally(() => setLoading(false));
  }, []);

  const stageBadge = (stage) => {
    const colors = {
      ready:     { bg: "#d1fae5", color: "#065f46" },
      draft:     { bg: "#f3f4f6", color: "#6b7280" },
      archived:  { bg: "#fef2f2", color: "#991b1b" },
    };
    const c = colors[stage] ?? { bg: "#ede9fe", color: "#6d28d9" };
    return <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, ...c }}>{stage}</span>;
  };

  return (
    <div>
      <PageHeader title="Products" sub="All inventory items across all businesses" count={loading ? null : rows.length} />
      <DevTable
        loading={loading}
        rows={rows}
        columns={[
          { key: "name",       label: "Name",       render: (r) => <strong>{r.name}</strong> },
          { key: "stage",      label: "Stage",      render: (r) => stageBadge(r.stage) },
          { key: "quantity",   label: "Stock",      render: (r) => Number(r.quantity).toLocaleString("en-IN") },
          { key: "unit_price", label: "Price",      render: (r) => r.unit_price != null ? `₹${Number(r.unit_price).toLocaleString("en-IN")}` : "—" },
          { key: "created_at", label: "Added",      render: (r) => fmt(r.created_at) },
        ]}
      />
    </div>
  );
}

// ─── Analytics ────────────────────────────────────────────────────────────────
export function DevAnalytics() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    devApi("/api/dev/analytics").then((r) => setRows(r.data ?? [])).finally(() => setLoading(false));
  }, []);

  const maxOrders  = Math.max(1, ...rows.map((r) => r.orders));
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <div>
      <PageHeader title="Analytics" sub="Orders and revenue across all businesses — last 30 days" />

      {loading ? (
        <div style={{ height: 220, borderRadius: 10, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No orders in the last 30 days.</div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "24px 20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, marginBottom: 16 }}>
            <span style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#6366f1", display: "inline-block" }} /> Orders
            </span>
            <span style={{ fontSize: 12, color: "#6b7280", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: "#10b981", display: "inline-block" }} /> Revenue
            </span>
          </div>

          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, minWidth: rows.length * 28, height: 180 }}>
              {rows.map((r) => (
                <div key={r.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 20, gap: 2 }}>
                  {/* Revenue bar */}
                  <div
                    title={`Revenue: ₹${Number(r.revenue).toLocaleString("en-IN")}`}
                    style={{
                      width: "40%",
                      height: `${(r.revenue / maxRevenue) * 130}px`,
                      background: "#10b981",
                      borderRadius: "3px 3px 0 0",
                      opacity: 0.8,
                      minHeight: r.revenue > 0 ? 2 : 0,
                    }}
                  />
                  {/* Orders bar */}
                  <div
                    title={`Orders: ${r.orders}`}
                    style={{
                      width: "40%",
                      height: `${(r.orders / maxOrders) * 130}px`,
                      background: "#6366f1",
                      borderRadius: "3px 3px 0 0",
                      minHeight: r.orders > 0 ? 2 : 0,
                    }}
                  />
                  <span style={{ fontSize: 9, color: "#9ca3af", marginTop: 4, transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>
                    {r.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Summary table */}
          <div style={{ marginTop: 24 }}>
            <DevTable
              loading={false}
              rows={[...rows].reverse().slice(0, 10)}
              columns={[
                { key: "date",    label: "Date" },
                { key: "orders",  label: "Orders",  render: (r) => r.orders.toLocaleString("en-IN") },
                { key: "revenue", label: "Revenue", render: (r) => `₹${Number(r.revenue).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
              ]}
            />
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}

// ─── System Health ────────────────────────────────────────────────────────────
export function DevSystemHealth() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    devApi("/api/dev/system-health").then((r) => setData(r.data)).finally(() => setLoading(false));
  }, []);

  const check = (status) => status === "ok"
    ? <span style={{ color: "#065f46", fontWeight: 700 }}>✅ OK</span>
    : <span style={{ color: "#991b1b", fontWeight: 700 }}>❌ Error</span>;

  return (
    <div>
      <PageHeader title="System Health" sub="Current database connectivity status" />

      {loading ? (
        <div style={{ height: 160, borderRadius: 10, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {[
            { label: "Overall Status",   value: data?.status === "healthy" ? "✅ Healthy" : "⚠️ Degraded", bg: data?.status === "healthy" ? "#f0fdf4" : "#fff7ed", border: data?.status === "healthy" ? "#bbf7d0" : "#fed7aa", color: data?.status === "healthy" ? "#166534" : "#9a3412" },
            { label: "Profiles DB",      value: check(data?.db),         bg: "#fff", border: "#e5e7eb", color: "#111" },
            { label: "Orders DB",        value: check(data?.orders_db),  bg: "#fff", border: "#e5e7eb", color: "#111" },
            { label: "Drivers DB",       value: check(data?.drivers_db), bg: "#fff", border: "#e5e7eb", color: "#111" },
          ].map((c) => (
            <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {data?.checked_at && !loading && (
        <p style={{ marginTop: 16, fontSize: 12, color: "#9ca3af" }}>
          Checked at: {new Date(data.checked_at).toLocaleTimeString("en-IN")}
        </p>
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }`}</style>
    </div>
  );
}
