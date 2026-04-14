/**
 * Driver Select Business Page — /driver/select-business
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows after login / profile setup.
 * Fetches ALL businesses via refreshBusinesses() from context.
 *
 * Logic:
 *   0 businesses → "Contact admin" empty state
 *   1 business   → auto-select → redirect /driver/dashboard
 *   2+ businesses → show cards, driver picks one
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDriver } from "../../context/DriverContext";

export default function DriverSelectBusiness() {
  const navigate = useNavigate();
  const {
    driver,
    driverBusinesses,
    refreshBusinesses,
    setSelectedBusinessId,
    selectedBusinessId,
    loading: ctxLoading,
  } = useDriver();

  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState("");

  // On mount: refresh businesses from API to ensure we have the full list
  useEffect(() => {
    if (ctxLoading) return;

    async function doRefresh() {
      setRefreshing(true);
      setError("");
      try {
        await refreshBusinesses();
      } catch (e) {
        setError(e?.message || "Failed to load businesses");
      } finally {
        setRefreshing(false);
      }
    }

    doRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoading]);

  // Auto-select when exactly 1 business is available
  useEffect(() => {
    if (ctxLoading || refreshing) return;
    if (driverBusinesses.length === 1) {
      setSelectedBusinessId(driverBusinesses[0].id);
      navigate("/driver/dashboard", { replace: true });
    }
  }, [ctxLoading, refreshing, driverBusinesses, setSelectedBusinessId, navigate]);

  function handleSelect(biz) {
    setSelectedBusinessId(biz.id);
    navigate("/driver/dashboard", { replace: true });
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (ctxLoading || refreshing) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm text-slate-400">Loading businesses…</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 gap-5">
        <div className="h-14 w-14 rounded-2xl bg-red-900/30 border border-red-700/40 flex items-center justify-center text-2xl">⚠️</div>
        <div className="text-center">
          <h2 className="text-white font-semibold">Error Loading Businesses</h2>
          <p className="text-sm text-red-400 mt-1 max-w-xs">{error}</p>
        </div>
        <button
          onClick={async () => {
            setError("");
            setRefreshing(true);
            try { await refreshBusinesses(); }
            catch (e) { setError(e?.message || "Retry failed"); }
            finally { setRefreshing(false); }
          }}
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors active:scale-95"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Zero businesses ─────────────────────────────────────────────────────
  if (driverBusinesses.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 gap-5">
        <div className="h-16 w-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl">🏢</div>
        <div className="text-center max-w-xs">
          <h2 className="text-lg font-bold text-white">No Businesses Assigned</h2>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            You haven't been added to any business yet.
            Contact your admin to get assigned.
          </p>
        </div>
        <button
          onClick={async () => {
            setRefreshing(true);
            try { await refreshBusinesses(); }
            catch { /* silent */ }
            finally { setRefreshing(false); }
          }}
          className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  // ── Multiple businesses — show picker ────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="h-16 w-16 rounded-2xl bg-violet-600 flex items-center justify-center text-3xl shadow-xl shadow-violet-900/40">
            🚚
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">Select Business</h1>
            <p className="text-sm text-slate-400 mt-1">
              Hi <span className="text-violet-300 font-semibold">{driver?.name ?? "Driver"}</span>!
              {" "}Which business are you delivering for today?
            </p>
          </div>
        </div>

        {/* Business cards */}
        <div className="space-y-3">
          {driverBusinesses.map((biz) => (
            <button
              key={biz.id}
              id={`select-biz-${biz.id}`}
              onClick={() => handleSelect(biz)}
              className="w-full flex items-center gap-4 bg-slate-900 border border-slate-800 hover:border-violet-500 hover:bg-violet-950/20 rounded-2xl p-4 transition-all group text-left shadow-sm active:scale-[0.99]"
            >
              {/* Logo / initials */}
              <div className="h-12 w-12 rounded-xl bg-violet-900/40 border border-violet-800/50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {biz.logoUrl ? (
                  <img src={biz.logoUrl} alt={biz.businessName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-violet-300">
                    {biz.businessName?.[0]?.toUpperCase() ?? "B"}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm group-hover:text-violet-300 transition-colors truncate">
                  {biz.businessName}
                </p>
                {biz.address ? (
                  <p className="text-xs text-slate-500 mt-0.5 truncate">📍 {biz.address}</p>
                ) : (
                  <p className="text-xs text-slate-600 mt-0.5">No address set</p>
                )}
              </div>

              {/* CTA */}
              <div className="flex items-center gap-1 shrink-0">
                <span className="hidden sm:block text-xs font-semibold text-violet-400 group-hover:text-violet-300 transition-colors">
                  Start Deliveries
                </span>
                <svg className="h-4 w-4 text-slate-600 group-hover:text-violet-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-slate-600 mt-8">
          Signed in as <span className="font-mono">{driver?.phone ?? "—"}</span>
        </p>
      </div>
    </div>
  );
}
