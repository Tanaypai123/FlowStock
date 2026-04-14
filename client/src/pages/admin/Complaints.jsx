import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function shortId(uuid) {
  return uuid ? uuid.slice(0, 8).toUpperCase() : null;
}

const STATUS_OPTIONS = [
  { value: "open",      label: "Open"      },
  { value: "in_review", label: "In Review" },
  { value: "resolved",  label: "Resolved"  },
];

function StatusBadge({ status }) {
  const cfg = {
    open:       { label: "Open",       cls: "bg-amber-100 text-amber-800 ring-amber-200" },
    in_review:  { label: "In Review",  cls: "bg-blue-100  text-blue-800  ring-blue-200"  },
    resolved:   { label: "Resolved",   cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  };
  const { label, cls } = cfg[status] ?? cfg.open;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

function IssueTypeBadge({ type }) {
  if (!type) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-800 ring-1 ring-violet-200 px-2.5 py-0.5 text-xs font-semibold">
      {type}
    </span>
  );
}

// ─── Inline Resolve Panel ─────────────────────────────────────────────────────

function ResolvePanel({ complaint, onResolved, onStatusChange, updating }) {
  const [adminComment,      setAdminComment]      = useState(complaint.admin_comment      ?? "");
  const [resolutionMessage, setResolutionMessage] = useState(complaint.resolution_message ?? "");
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState(null);

  async function handleResolve() {
    setSaving(true); setErr(null);
    try {
      const data = await adminApi(`/api/complaints/${complaint.id}/resolve`, {
        method: "PUT",
        body: JSON.stringify({ admin_comment: adminComment, resolution_message: resolutionMessage }),
      });
      onResolved(complaint.id, { admin_comment: adminComment, resolution_message: resolutionMessage, status: "resolved" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to resolve");
    } finally { setSaving(false); }
  }

  const isAlreadyResolved = complaint.status === "resolved";

  return (
    <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Admin Response</p>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Internal Comment <span className="font-normal text-slate-400">(not shown to customer)</span></label>
        <textarea
          value={adminComment}
          onChange={(e) => setAdminComment(e.target.value)}
          rows={2}
          disabled={isAlreadyResolved || saving}
          placeholder="e.g. Checked with warehouse — confirmed damage during transit"
          className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Resolution Message <span className="font-normal text-slate-400">(shown to customer)</span></label>
        <textarea
          value={resolutionMessage}
          onChange={(e) => setResolutionMessage(e.target.value)}
          rows={2}
          disabled={isAlreadyResolved || saving}
          placeholder="e.g. We apologise for the inconvenience. A replacement will be dispatched within 2 days."
          className="w-full rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
        />
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      <div className="flex items-center gap-2 justify-between flex-wrap">
        {/* Status dropdown */}
        <select
          value={complaint.status}
          disabled={updating || saving}
          onChange={(e) => onStatusChange(complaint.id, e.target.value)}
          className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 disabled:opacity-50 cursor-pointer"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {!isAlreadyResolved && (
          <button
            type="button"
            disabled={saving}
            onClick={handleResolve}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? "Saving…" : "✓ Mark as Resolved"}
          </button>
        )}

        {isAlreadyResolved && (
          <span className="text-xs text-emerald-600 font-semibold">✅ Resolved on {fmtDate(complaint.resolved_at)}</span>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [expanded,   setExpanded]   = useState(null); // id of expanded row
  const [updating,   setUpdating]   = useState(null); // id of row being updated
  const [lightbox,   setLightbox]   = useState(null); // image URL for lightbox

  // Filter state
  const [filterStatus, setFilterStatus] = useState("all");
  const [search,       setSearch]       = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const json = await adminApi("/api/complaints");
      setComplaints(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load complaints");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleStatusChange(id, newStatus) {
    setUpdating(id);
    try {
      await adminApi(`/api/complaints/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      setComplaints((prev) => prev.map((c) => c.id === id ? { ...c, status: newStatus } : c));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally { setUpdating(null); }
  }

  function handleResolved(id, patch) {
    setComplaints((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }

  // Summary counts
  const openCount     = complaints.filter((c) => c.status === "open").length;
  const inReviewCount = complaints.filter((c) => c.status === "in_review").length;
  const resolvedCount = complaints.filter((c) => c.status === "resolved").length;

  // Filtered
  const filtered = (() => {
    let list = filterStatus === "all" ? complaints : complaints.filter((c) => c.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) =>
        (c.customer_name ?? "").toLowerCase().includes(q) ||
        (c.order_id ?? "").toLowerCase().includes(q) ||
        (c.product_name ?? "").toLowerCase().includes(q) ||
        (c.issue_type ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  })();

  return (
    <div className="p-6 md:p-8">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Complaints</h1>
          <p className="mt-1 text-sm text-slate-500">Review, respond to, and resolve customer complaints.</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Open",      value: openCount,     cls: "text-amber-700",   bg: "bg-amber-50   border-amber-200",   status: "open"      },
          { label: "In Review", value: inReviewCount, cls: "text-blue-700",    bg: "bg-blue-50    border-blue-200",    status: "in_review" },
          { label: "Resolved",  value: resolvedCount, cls: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", status: "resolved"  },
        ].map(({ label, value, cls, bg, status }) => (
          <button
            key={label}
            type="button"
            onClick={() => setFilterStatus(filterStatus === status ? "all" : status)}
            className={`rounded-xl border p-4 text-left transition hover:opacity-90 ${bg} ${filterStatus === status ? "ring-2 ring-offset-1 ring-indigo-400" : ""}`}
          >
            <p className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div>
      )}

      {/* ── Search ─────────────────────────────────────────────────────── */}
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, order ID, product or issue type…"
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {/* ── Complaint list ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading complaints…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm text-slate-400">{filterStatus === "all" ? "No complaints yet." : `No ${filterStatus.replace("_"," ")} complaints.`}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const isExpanded = expanded === c.id;
              const msgPreview = (c.message ?? "").length > 120
                ? (c.message ?? "").slice(0, 120) + "…"
                : (c.message ?? "");
              const hasImages = Array.isArray(c.image_urls) && c.image_urls.length > 0;

              return (
                <div key={c.id} className="p-4 hover:bg-slate-50/60 transition-colors">
                  <div className="flex items-start gap-3 flex-wrap">

                    {/* Left: content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Top row — customer + badges + date */}
                      <div
                        className="flex items-center gap-2 flex-wrap cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : c.id)}
                      >
                        <span className="font-semibold text-sm text-slate-900">{c.customer_name}</span>
                        <StatusBadge status={c.status} />
                        {c.issue_type && <IssueTypeBadge type={c.issue_type} />}
                        <span className="text-xs text-slate-400 ml-auto">{fmtDate(c.created_at)}</span>
                      </div>

                      {/* Product + order meta */}
                      {(c.product_name || c.order_id) && (
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          {c.product_name && <span>📦 <span className="font-medium text-slate-700">{c.product_name}</span></span>}
                          {c.order_id && <span>🧾 Order <span className="font-mono">#{shortId(c.order_id)}</span></span>}
                        </div>
                      )}

                      {/* Message (click to expand) */}
                      <div
                        className="cursor-pointer"
                        onClick={() => setExpanded(isExpanded ? null : c.id)}
                      >
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {isExpanded ? (c.message ?? "") : msgPreview}
                        </p>
                        {(c.message ?? "").length > 120 && (
                          <button type="button" className="text-xs text-sky-600 hover:text-sky-700 font-medium mt-0.5">
                            {isExpanded ? "Show less ↑" : "Show more ↓"}
                          </button>
                        )}
                      </div>

                      {/* Images */}
                      {hasImages && (
                        <div className="flex gap-2 flex-wrap pt-1">
                          {c.image_urls.map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setLightbox(url); }}
                              className="shrink-0"
                            >
                              <img
                                src={url}
                                alt={`proof ${i + 1}`}
                                className="h-16 w-16 rounded-xl object-cover border border-slate-200 hover:opacity-90 transition shadow-sm"
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Existing admin response summary (collapsed view) */}
                      {!isExpanded && c.resolution_message && (
                        <p className="text-xs text-emerald-600 font-medium">
                          ✅ Resolution: "{c.resolution_message.slice(0, 80)}{c.resolution_message.length > 80 ? "…" : ""}"
                        </p>
                      )}

                      {/* Expanded: resolve panel */}
                      {isExpanded && (
                        <ResolvePanel
                          complaint={c}
                          onResolved={handleResolved}
                          onStatusChange={handleStatusChange}
                          updating={updating === c.id}
                        />
                      )}
                    </div>

                    {/* Right: expand toggle only (status is in resolve panel) */}
                    <button
                      type="button"
                      onClick={() => setExpanded(isExpanded ? null : c.id)}
                      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                    >
                      {isExpanded ? "Close ↑" : "Respond ↓"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────────── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="proof" className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl object-contain" />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/30"
          >✕</button>
        </div>
      )}
    </div>
  );
}
