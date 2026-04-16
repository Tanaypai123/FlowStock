import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi.js";

/* ── Source badge config ─────────────────────────────────────────────────── */
const SOURCE_META = {
  invite_upload:  { label: "Invite",   emoji: "🟢", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  join_code:      { label: "Code",     emoji: "🔵", bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  join_link:      { label: "Link",     emoji: "🟣", bg: "#faf5ff", color: "#7c3aed", border: "#ddd6fe" },
  manual_invite:  { label: "Manual",   emoji: "🟡", bg: "#fefce8", color: "#a16207", border: "#fde68a" },
  boost_contact:  { label: "Boost",    emoji: "🚀", bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
};

function SourceBadge({ source }) {
  const m = SOURCE_META[source] ?? SOURCE_META.join_code;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontSize: 11, fontWeight: 700, borderRadius: 999,
      padding: "3px 10px",
      background: m.bg, color: m.color, border: `1px solid ${m.border}`,
    }}>
      {m.emoji} {m.label}
    </span>
  );
}

/* ── Invite status badge ─────────────────────────────────────────────────── */
const INVITE_META = {
  pending: { label: "⏳ Pending", color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1" },
  sent:    { label: "✅ Sent",    color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  invited: { label: "📨 Invited", color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" },
  joined:  { label: "🎉 Joined",  color: "#7e22ce", bg: "#fdf4ff", border: "#e9d5ff" },
};
function InviteBadge({ status }) {
  if (!status) return null;
  const m = INVITE_META[status] ?? INVITE_META.pending;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "2px 8px",
      background: m.bg, color: m.color, border: `1px solid ${m.border}`, whiteSpace: "nowrap" }}>
      {m.label}
    </span>
  );
}

/* ── Filter tab config ───────────────────────────────────────────────────── */
const TABS = [
  { key: "all",           label: "All" },
  { key: "invite_upload", label: "🟢 Invite" },
  { key: "join_code",     label: "🔵 Code" },
  { key: "join_link",     label: "🟣 Link" },
  { key: "manual_invite", label: "🟡 Manual" },
  { key: "boost_contact", label: "🚀 Boost" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [search,    setSearch]    = useState("");

  const load = useCallback(async (tab) => {
    setLoading(true);
    setError(null);
    try {
      const path = tab === "all"
        ? "/api/admin/customers"
        : `/api/admin/customers?source=${tab}`;
      const json = await adminApi(path);
      setCustomers(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(activeTab); }, [load, activeTab]);

  // Client-side search filter
  const filtered = search.trim()
    ? customers.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name?.toLowerCase().includes(q) ||
          c.phone?.toLowerCase().includes(q) ||
          c.business_name?.toLowerCase().includes(q)
        );
      })
    : customers;

  /* ── Styles ── */
  const S = {
    card:      { background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", overflow: "hidden" },
    colH:      { padding: "11px 16px", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
    cell:      { padding: "13px 16px", fontSize: 14, color: "#334155", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
    tabBase:   { fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 999, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", transition: "all 0.12s" },
    tabActive: { background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none" },
    tabInact:  { color: "#475569" },
  };

  // Count per type for summary
  const platformCount = customers.filter((c) => c.type === "platform").length;
  const boostCount    = customers.filter((c) => c.type === "contact").length;

  return (
    <div style={{ padding: "28px 32px", minHeight: "100%", background: "#f8fafc" }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 }}>Customers</h1>
        {!loading && (
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            {customers.length} total —{" "}
            <span style={{ color: "#6366f1", fontWeight: 600 }}>{platformCount} joined app</span>
            {boostCount > 0 && (
              <> · <span style={{ color: "#c2410c", fontWeight: 600 }}>{boostCount} from Boost</span></>
            )}
          </p>
        )}
        {loading && <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Loading…</p>}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
            style={{ ...S.tabBase, ...(activeTab === t.key ? S.tabActive : S.tabInact) }}>
            {t.label}
          </button>
        ))}
        <input
          type="text" placeholder="🔍 Search name, phone, business…"
          value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0",
            fontSize: 13, outline: "none", minWidth: 220, color: "#0f172a" }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", color: "#dc2626", fontSize: 13, marginBottom: 20 }}>
          ⚠ {error} —{" "}
          <button onClick={() => load(activeTab)} style={{ color: "#6366f1", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", fontSize: 14 }}>Loading customers…</div>}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ ...S.card, padding: "60px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#1e293b", margin: 0 }}>No customers found</p>
          <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>
            {search ? "Clear your search to see all customers." :
              activeTab === "all"
                ? "Customers appear here once they join your business or are added via Customer Boost."
                : `No customers found for filter "${activeTab}".`}
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div style={S.card}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={S.colH}>#</th>
                <th style={S.colH}>Customer</th>
                <th style={S.colH}>Phone</th>
                <th style={S.colH}>Business / Shop</th>
                <th style={S.colH}>Source</th>
                <th style={S.colH}>Invite Status</th>
                <th style={S.colH}>Added On</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <tr key={c.id}
                  style={{ background: "#fff", transition: "background 0.1s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>

                  <td style={{ ...S.cell, color: "#94a3b8", fontSize: 12, width: 40 }}>{i + 1}</td>

                  {/* Name + sub-label */}
                  <td style={{ ...S.cell, fontWeight: 600, color: "#1e293b", minWidth: 160 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {/* Avatar */}
                      <div style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                        background: c.type === "platform" ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#f97316,#ea580c)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 13, fontWeight: 700 }}>
                        {(c.name?.[0] ?? "?").toUpperCase()}
                      </div>
                      <div>
                        <div>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                          {c.type === "platform"
                            ? `ID: ${String(c.user_id).slice(0, 10)}…`
                            : "Contact (not yet on app)"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ ...S.cell, fontFamily: "monospace", fontSize: 12, color: "#475569" }}>
                    {c.phone || <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>

                  <td style={{ ...S.cell, color: "#475569", fontSize: 13 }}>
                    {c.business_name || <span style={{ color: "#cbd5e1" }}>—</span>}
                  </td>

                  <td style={S.cell}><SourceBadge source={c.join_source} /></td>

                  <td style={S.cell}>
                    {c.invite_status
                      ? <InviteBadge status={c.invite_status} />
                      : <span style={{ color: "#cbd5e1", fontSize: 12 }}>Joined app ✓</span>}
                  </td>

                  <td style={{ ...S.cell, color: "#64748b", fontSize: 13 }}>
                    {formatDate(c.joined_at)}
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
