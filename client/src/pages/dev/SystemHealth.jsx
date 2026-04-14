import { useEffect, useState, useCallback, useRef } from "react";
import { devApi } from "../../lib/devApi.js";

const fmtTime = (iso) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "#6366f1", loading, mono = false }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", padding: "18px 20px", boxShadow: "0 1px 3px rgba(0,0,0,.05)" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", marginBottom: 6 }}>{label}</div>
      {loading
        ? <div style={{ height: 28, width: 90, borderRadius: 6, background: "#f3f4f6", animation: "pulse 1.5s infinite" }} />
        : <div style={{ fontSize: mono ? 13 : 26, fontWeight: 800, color: "#111827", lineHeight: 1.2, wordBreak: "break-all", fontFamily: mono ? "monospace" : undefined }}>{value ?? "—"}</div>}
      {sub && !loading && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
      <div style={{ height: 3, borderRadius: 2, background: color, marginTop: 10, opacity: .7 }} />
    </div>
  );
}

// ─── Method badge ─────────────────────────────────────────────────────────────
function MethodBadge({ method }) {
  const c = { GET: ["#dbeafe", "#1e40af"], POST: ["#d1fae5", "#065f46"], PUT: ["#fef3c7", "#92400e"], DELETE: ["#fef2f2", "#991b1b"], PATCH: ["#ede9fe", "#6d28d9"] };
  const [bg, fg] = c[method] ?? ["#f3f4f6", "#374151"];
  return <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: bg, color: fg, letterSpacing: "0.05em" }}>{method}</span>;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ code }) {
  const is5 = code >= 500;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: is5 ? "#fef2f2" : "#fff7ed", color: is5 ? "#991b1b" : "#92400e" }}>
      {code}
    </span>
  );
}

// ─── Speed badge ─────────────────────────────────────────────────────────────
function SpeedBadge({ ms }) {
  const color = ms > 1000 ? ["#fef2f2", "#991b1b"] : ms > 500 ? ["#fff7ed", "#92400e"] : ["#d1fae5", "#065f46"];
  return <span style={{ padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: color[0], color: color[1] }}>{ms}ms</span>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM HEALTH PAGE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function DevSystemHealth() {
  // ── Stats ─────────────────────────────────────────────────────────────────
  const [stats,        setStats]        = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Error log ─────────────────────────────────────────────────────────────
  const [errors,     setErrors]     = useState([]);
  const [errTotal,   setErrTotal]   = useState(0);
  const [errPages,   setErrPages]   = useState(1);
  const [errPage,    setErrPage]    = useState(1);
  const [errFilter,  setErrFilter]  = useState("all");  // "all" | "4xx" | "5xx"
  const [errSearch,  setErrSearch]  = useState("");
  const [errLoading, setErrLoading] = useState(true);

  // ── Slow endpoints ────────────────────────────────────────────────────────
  const [slow,        setSlow]        = useState([]);
  const [slowLoading, setSlowLoading] = useState(true);

  // ── Auto-refresh countdown ────────────────────────────────────────────────
  const [secondsAgo, setSecondsAgo] = useState(0);
  const lastRefreshRef = useRef(Date.now());

  // ── Fetch stats ───────────────────────────────────────────────────────────
  const fetchStats = useCallback(() => {
    setStatsLoading(true);
    devApi("/api/dev/system/stats")
      .then((r) => setStats(r.data))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, []);

  // ── Fetch errors ──────────────────────────────────────────────────────────
  const fetchErrors = useCallback((page = 1, filter = "all") => {
    setErrLoading(true);
    devApi(`/api/dev/system/errors?page=${page}&filter=${filter}`)
      .then((r) => {
        setErrors(r.data ?? []);
        setErrTotal(r.total ?? 0);
        setErrPages(r.pages ?? 1);
        setErrPage(r.page ?? 1);
      })
      .catch(() => setErrors([]))
      .finally(() => setErrLoading(false));
  }, []);

  // ── Fetch slow endpoints ──────────────────────────────────────────────────
  const fetchSlow = useCallback(() => {
    setSlowLoading(true);
    devApi("/api/dev/system/slow-endpoints")
      .then((r) => setSlow(r.data ?? []))
      .catch(() => setSlow([]))
      .finally(() => setSlowLoading(false));
  }, []);

  // ── Full refresh ──────────────────────────────────────────────────────────
  const refresh = useCallback(() => {
    lastRefreshRef.current = Date.now();
    setSecondsAgo(0);
    fetchStats();
    fetchErrors(errPage, errFilter);
    fetchSlow();
  }, [fetchStats, fetchErrors, fetchSlow, errPage, errFilter]);

  // ── Mount: initial fetch + auto-refresh every 30s ─────────────────────────
  useEffect(() => {
    refresh();
    const refreshId = setInterval(refresh, 30000);
    // ── "Xs ago" counter — ticks every second ──
    const tickId = setInterval(() => {
      setSecondsAgo(Math.round((Date.now() - lastRefreshRef.current) / 1000));
    }, 1000);
    return () => { clearInterval(refreshId); clearInterval(tickId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Refetch errors when filter/page changes ───────────────────────────────
  useEffect(() => { fetchErrors(errPage, errFilter); }, [errPage, errFilter, fetchErrors]);

  // ── Client-side search on error rows ─────────────────────────────────────
  const filteredErrors = errSearch.trim()
    ? errors.filter((r) => r.endpoint.toLowerCase().includes(errSearch.toLowerCase()))
    : errors;

  const th = { padding: "9px 14px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6b7280", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", textAlign: "left", whiteSpace: "nowrap" };
  const td = { padding: "10px 14px", fontSize: 12, color: "#374151", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };

  function SkeletonRows({ cols, n = 5 }) {
    return Array.from({ length: n }).map((_, i) => (
      <tr key={i}>{Array.from({ length: cols }).map((_, j) => (
        <td key={j} style={td}><div style={{ height: 12, borderRadius: 4, background: "#f3f4f6", width: "65%", animation: "pulse 1.5s infinite" }} /></td>
      ))}</tr>
    ));
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: 0 }}>System Health</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
            API logs and performance monitoring · Auto-refreshes every 30s
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>Updated {secondsAgo}s ago</span>
          <button onClick={refresh} style={{ padding: "7px 14px", borderRadius: 7, border: "1px solid #e5e7eb", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#374151" }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard label="API Calls Today"    value={stats?.totalCalls?.toLocaleString("en-IN")}    color="#6366f1" loading={statsLoading} />
        <StatCard label="Error Rate"         value={stats != null ? `${stats.errorRate}%` : null}   color={stats?.errorRate > 5 ? "#ef4444" : "#10b981"} loading={statsLoading} sub="Status ≥ 400 / total" />
        <StatCard label="Avg Response Time"  value={stats != null ? `${stats.avgResponseTime}ms` : null} color="#f59e0b" loading={statsLoading} />
        <StatCard label="Slowest Endpoint"   value={stats?.slowestEndpoint}  sub={stats?.slowestMs ? `${stats.slowestMs}ms avg` : undefined} color="#ef4444" loading={statsLoading} mono />
      </div>

      {/* Error log section */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Error Log</h2>
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2, marginBottom: 0 }}>Last 24 hours · {errTotal} errors</p>
          </div>
          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {["all", "4xx", "5xx"].map((f) => (
              <button key={f} onClick={() => { setErrFilter(f); setErrPage(1); }} style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid",
                borderColor: errFilter === f ? "#6366f1" : "#e5e7eb",
                background:  errFilter === f ? "#ede9fe" : "#fff",
                color:       errFilter === f ? "#6d28d9" : "#374151",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
                {f === "all" ? "All errors" : f.toUpperCase()}
              </button>
            ))}
            <input
              type="text" placeholder="Filter by endpoint…" value={errSearch}
              onChange={(e) => setErrSearch(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 7, border: "1px solid #e5e7eb", fontSize: 12, width: 200, outline: "none" }}
            />
          </div>
        </div>

        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Time", "Method", "Endpoint", "Status", "Error"].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {errLoading
                ? <SkeletonRows cols={5} />
                : filteredErrors.length === 0
                  ? <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 28 }}>No errors 🎉</td></tr>
                  : filteredErrors.map((r) => (
                    <tr key={r.id}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#fef2f2"}
                      onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                      <td style={{ ...td, color: "#6b7280", whiteSpace: "nowrap" }}>{fmtTime(r.created_at)}</td>
                      <td style={td}><MethodBadge method={r.method} /></td>
                      <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <code style={{ fontSize: 11 }}>{r.endpoint}</code>
                      </td>
                      <td style={td}><StatusBadge code={r.status_code} /></td>
                      <td style={{ ...td, color: "#6b7280", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.error_message ?? "—"}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {errPages > 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 12 }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Page {errPage} of {errPages}</span>
            <button disabled={errPage <= 1} onClick={() => setErrPage((p) => p - 1)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: errPage <= 1 ? "not-allowed" : "pointer", fontSize: 12, opacity: errPage <= 1 ? 0.4 : 1 }}>← Prev</button>
            <button disabled={errPage >= errPages} onClick={() => setErrPage((p) => p + 1)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff", cursor: errPage >= errPages ? "not-allowed" : "pointer", fontSize: 12, opacity: errPage >= errPages ? 0.4 : 1 }}>Next →</button>
          </div>
        )}
      </div>

      {/* Slow endpoints */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Slow Endpoints</h2>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Last 24 hours · grouped by endpoint · sorted by avg response time</p>
        </div>

        <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.04)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{["Endpoint", "Avg Time", "Calls"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {slowLoading
                ? <SkeletonRows cols={3} n={6} />
                : slow.length === 0
                  ? <tr><td colSpan={3} style={{ ...td, textAlign: "center", color: "#9ca3af", padding: 28 }}>No data in last 24 hours</td></tr>
                  : slow.map((r, i) => (
                    <tr key={i}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                      onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                      <td style={{ ...td, maxWidth: 320 }}>
                        <code style={{ fontSize: 12 }}>{r.endpoint}</code>
                      </td>
                      <td style={td}><SpeedBadge ms={r.avg_ms} /></td>
                      <td style={{ ...td, color: "#6b7280" }}>{r.calls.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 12 }}>
          💡 Tip: Run <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4 }}>DELETE FROM api_logs WHERE created_at &lt; now() - interval '30 days'</code> weekly in Supabase SQL editor to keep this table lean.
        </p>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
