/**
 * Driver History Page — /driver/history
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows all delivered orders for this driver in the selected business.
 * Proof photo thumbnails → click for full size.
 */

import { useEffect, useState } from "react";
import { driverApi } from "../../lib/driverApi.js";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function ProofModal({ url, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-sm font-medium hover:text-slate-300"
        >✕ Close</button>
        <img src={url} alt="Delivery proof" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
      </div>
    </div>
  );
}

export default function DriverHistory() {
  const [deliveries, setDeliveries] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [proofUrl,   setProofUrl]   = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await driverApi("/api/driver/history");
        setDeliveries(Array.isArray(r.data) ? r.data : []);
      } catch (e) {
        setError(e.message || "Failed to load history");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Delivery History</h1>
          <p className="text-xs text-slate-500 mt-0.5">All completed deliveries for this business</p>
        </div>
        {!loading && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-900/30 border border-emerald-700/40 px-3 py-1.5">
            <span className="text-emerald-400 text-lg">✅</span>
            <div>
              <p className="text-xs text-emerald-500 leading-none">Total</p>
              <p className="text-lg font-bold text-emerald-400 leading-none">{deliveries.length}</p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-800/40 border border-slate-800 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && deliveries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-16 w-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl">📦</div>
          <p className="text-slate-400 font-medium">No deliveries completed yet</p>
          <p className="text-xs text-slate-600">Completed deliveries will appear here</p>
        </div>
      )}

      {/* List */}
      {!loading && deliveries.length > 0 && (
        <div className="space-y-3">
          {deliveries.map((d) => (
            <div
              key={d.id}
              className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex items-center gap-4"
            >
              {/* Proof thumbnail */}
              <div className="shrink-0">
                {d.proof_url ? (
                  <button
                    onClick={() => setProofUrl(d.proof_url)}
                    className="h-14 w-14 rounded-xl overflow-hidden border border-slate-700 hover:border-violet-500 transition-colors group"
                    title="View proof photo"
                  >
                    <img
                      src={d.proof_url}
                      alt="proof"
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </button>
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-600 text-xl">
                    📷
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    #{d.short_id}
                  </span>
                  <span className="text-sm font-semibold text-white truncate">{d.customer_name}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  {d.region ?? d.address ?? "No location"}
                </p>
                <p className="text-xs text-emerald-500 mt-0.5">
                  ✅ {d.delivered_at ? formatDate(d.delivered_at) : "Delivered"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Proof Modal */}
      {proofUrl && <ProofModal url={proofUrl} onClose={() => setProofUrl(null)} />}
    </div>
  );
}
