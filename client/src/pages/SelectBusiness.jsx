import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { adminApi } from "../lib/adminApi.js";

const LS_BUSINESS_KEY = "selectedBusinessId";
const ROLE_PATHS = { admin: "/admin/dashboard", customer: "/customer/home", driver: "/driver/dashboard" };
const ROLE_LABELS = { admin: "Admin", customer: "Customer", driver: "Driver" };
const ROLE_COLORS = {
  admin:    "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  customer: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  driver:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

/**
 * SelectBusiness.jsx — /select-business
 *
 * Shown when a user belongs to 2+ businesses.
 * Fetches all their business memberships and lets them pick one.
 */
export default function SelectBusiness() {
  const navigate = useNavigate();
  const { user, loading: authLoading, setSelectedBusinessId } = useAuth();

  const [businesses, setBusinesses] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [selecting,  setSelecting]  = useState(null); // business id being selected

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login", { replace: true }); return; }

    adminApi("/api/business/my-businesses")
      .then((json) => {
        if (!json.success) throw new Error(json.error ?? "Failed to load businesses");
        setBusinesses(json.data ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [authLoading, user, navigate]);

  async function handleSelect(biz) {
    setSelecting(biz.businessId);
    localStorage.setItem(LS_BUSINESS_KEY, biz.businessId);
    if (setSelectedBusinessId) setSelectedBusinessId(biz.businessId);
    const dest = ROLE_PATHS[biz.role] ?? "/customer/home";
    navigate(dest, { replace: true });
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md space-y-5">
        {/* Header */}
        <div className="text-center space-y-1 mb-2">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg mb-3">
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-100">Select Workspace</h1>
          <p className="text-sm text-zinc-500">You belong to {businesses.length} businesses. Choose one to continue.</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 text-xs text-red-400 underline hover:text-red-300"
            >
              Retry
            </button>
          </div>
        )}

        {/* Business list */}
        {!error && businesses.length === 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 text-center space-y-3">
            <p className="text-2xl">🏢</p>
            <p className="text-sm text-zinc-400">You're not part of any business yet.</p>
            <button
              type="button"
              onClick={() => navigate("/join")}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition"
            >
              Join a Business
            </button>
          </div>
        )}

        <div className="space-y-3">
          {businesses.map((biz) => (
            <button
              key={biz.businessId}
              type="button"
              id={`select-biz-${biz.businessId}`}
              onClick={() => handleSelect(biz)}
              disabled={selecting === biz.businessId}
              className="w-full group rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:border-indigo-500/50 hover:bg-zinc-800/60 p-4 flex items-center gap-4 transition-all duration-200 text-left disabled:opacity-60 shadow-lg"
            >
              {/* Logo or placeholder */}
              {biz.logoUrl ? (
                <img src={biz.logoUrl} alt={biz.businessName} className="h-12 w-12 rounded-xl object-contain bg-zinc-800 shrink-0" />
              ) : (
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-xl shrink-0">
                  🏢
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-100 truncate group-hover:text-indigo-300 transition-colors">
                  {biz.businessName}
                </p>
                {biz.address && (
                  <p className="text-xs text-zinc-600 truncate mt-0.5">{biz.address}</p>
                )}
                <span className={`inline-block mt-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ROLE_COLORS[biz.role] ?? ROLE_COLORS.customer}`}>
                  {ROLE_LABELS[biz.role] ?? biz.role}
                </span>
              </div>

              {/* Arrow / spinner */}
              <div className="shrink-0 text-zinc-600 group-hover:text-indigo-400 transition-colors">
                {selecting === biz.businessId ? (
                  <span className="h-4 w-4 block animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                ) : (
                  <span className="text-lg">→</span>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Join another */}
        {!error && businesses.length > 0 && (
          <p className="text-center">
            <button
              type="button"
              onClick={() => navigate("/join")}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition underline underline-offset-2"
            >
              + Join another business
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
