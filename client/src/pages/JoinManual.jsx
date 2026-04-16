import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { adminApi } from "../lib/adminApi.js";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

const LS_BUSINESS_KEY = "selectedBusinessId";

/**
 * JoinManual.jsx — /join
 *
 * Shown when a customer has 0 businesses after login,
 * or when they click "Join Another Business" from within the app.
 *
 * After a successful join:
 *   - The user sees a "Joined X — Switch now?" action toast
 *   - Their current business is NOT disturbed unless they click "Switch"
 *   - Previous businesses remain intact
 */
export default function JoinManual() {
  const navigate  = useNavigate();
  const { user, loading: authLoading, selectedBusinessId, setSelectedBusinessId } = useAuth();

  const [code,      setCode]      = useState("");
  const [searching, setSearching] = useState(false);
  const [joining,   setJoining]   = useState(false);
  const [biz,       setBiz]       = useState(null); // found business info
  const [searchErr, setSearchErr] = useState(null);
  const [joinErr,   setJoinErr]   = useState(null);

  // After join: show "Switch now?" toast
  const [joinedBiz, setJoinedBiz] = useState(null); // { businessId, businessName }

  // ── Find business by code ────────────────────────────────────────────────────
  async function handleFind(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setSearchErr(null);
    setBiz(null);
    setJoinErr(null);
    setJoinedBiz(null);
    setSearching(true);

    try {
      const res  = await fetch(`${API_BASE}/api/business/info/${encodeURIComponent(code.trim().toUpperCase())}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Business not found");
      setBiz(json);
    } catch (err) {
      setSearchErr(
        err.message.toLowerCase().includes("not found")
          ? "Business not found. Check the code and try again."
          : err.message,
      );
    } finally {
      setSearching(false);
    }
  }

  // ── Join the found business ──────────────────────────────────────────────────
  async function handleJoin() {
    if (!biz) return;
    setJoinErr(null);
    setJoining(true);

    try {
      const json = await adminApi("/api/business/join", {
        method: "POST",
        body: JSON.stringify({ businessCode: biz.businessCode }),
      });
      if (!json.success) throw new Error(json.error ?? "Failed to join");

      // Always save the mapping — but do NOT overwrite current business silently.
      // Show a toast asking if user wants to switch.
      const hasCurrentBusiness = Boolean(selectedBusinessId);
      if (!hasCurrentBusiness) {
        // No active business yet → switch automatically (first join)
        localStorage.setItem(LS_BUSINESS_KEY, json.businessId);
        setSelectedBusinessId(json.businessId);
        navigate("/customer/home", { replace: true });
      } else {
        // Already shopping somewhere → show confirmation toast
        setJoinedBiz({ businessId: json.businessId, businessName: json.businessName });
        setBiz(null);
        setCode("");
      }
    } catch (err) {
      setJoinErr(err.message);
    } finally {
      setJoining(false);
    }
  }

  // ── Switch to newly joined business ─────────────────────────────────────────
  function handleSwitchNow() {
    if (!joinedBiz) return;
    localStorage.setItem(LS_BUSINESS_KEY, joinedBiz.businessId);
    setSelectedBusinessId(joinedBiz.businessId);
    navigate("/customer/home", { replace: true });
    setTimeout(() => window.location.reload(), 50);
  }

  // ── Stay on current business ─────────────────────────────────────────────────
  function handleStay() {
    // Go back to current dashboard — old business still active
    if (selectedBusinessId) {
      navigate("/customer/home", { replace: true });
    } else {
      setJoinedBiz(null);
    }
  }

  if (authLoading) {
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

      <div className="relative w-full max-w-sm space-y-5">

        {/* ── Post-join confirmation card ── */}
        {joinedBiz && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl mt-0.5">✅</span>
              <div>
                <p className="text-sm font-bold text-emerald-300">
                  Joined {joinedBiz.businessName}!
                </p>
                <p className="text-xs text-emerald-400/80 mt-0.5">
                  Your previous business is still active. Do you want to switch?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                id="switch-now-btn"
                type="button"
                onClick={handleSwitchNow}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition"
              >
                Switch Now
              </button>
              <button
                id="stay-btn"
                type="button"
                onClick={handleStay}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition"
              >
                Stay Here
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/select-business")}
              className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition underline underline-offset-2"
            >
              View all my businesses →
            </button>
          </div>
        )}

        {/* ── Header ── */}
        {!joinedBiz && (
          <>
            <div className="text-center space-y-1 mb-2">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg mb-3">
                <span className="text-white font-bold text-lg">F</span>
              </div>
              <h1 className="text-xl font-bold text-zinc-100">Join a Business</h1>
              <p className="text-sm text-zinc-500">Enter the code your supplier gave you</p>
            </div>

            {/* Search form */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 shadow-2xl shadow-black/40 space-y-4">
              <form onSubmit={handleFind} className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="biz-code" className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Business Code
                  </label>
                  <input
                    id="biz-code"
                    type="text"
                    maxLength={6}
                    placeholder="e.g. KX7B2Q"
                    value={code}
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setBiz(null); setSearchErr(null); }}
                    disabled={searching || joining}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-3 text-sm text-zinc-100 font-mono tracking-widest placeholder:text-zinc-600 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 uppercase text-center text-base"
                  />
                </div>

                {searchErr && (
                  <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300 text-center">
                    {searchErr}
                  </p>
                )}

                <button
                  id="find-business-btn"
                  type="submit"
                  disabled={searching || !code.trim() || joining}
                  className="w-full rounded-xl bg-zinc-700 hover:bg-zinc-600 py-3 text-sm font-semibold text-zinc-100 transition disabled:opacity-50"
                >
                  {searching ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                      Searching…
                    </span>
                  ) : "Find Business"}
                </button>
              </form>

              {/* Found business card */}
              {biz && (
                <div className="space-y-3 border-t border-zinc-800 pt-4">
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-center gap-3">
                    {biz.logoUrl ? (
                      <img src={biz.logoUrl} alt={biz.businessName} className="h-10 w-10 rounded-lg object-contain bg-zinc-800" />
                    ) : (
                      <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg">🏢</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-100 truncate">{biz.businessName}</p>
                      {biz.address && <p className="text-xs text-zinc-500 truncate">{biz.address}</p>}
                    </div>
                    <span className="text-emerald-400 text-sm">✓</span>
                  </div>

                  {joinErr && (
                    <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300 text-center">
                      {joinErr}
                    </p>
                  )}

                  <button
                    id="confirm-join-btn"
                    type="button"
                    onClick={handleJoin}
                    disabled={joining}
                    className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                  >
                    {joining ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Joining…
                      </span>
                    ) : `Join ${biz.businessName} →`}
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="space-y-2 text-center">
              <p className="text-xs text-zinc-700">
                {user ? `Signed in as ${user.email ?? user.phone ?? ""}` : ""}
              </p>
              {selectedBusinessId && (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="text-xs text-zinc-600 hover:text-zinc-400 transition underline underline-offset-2"
                >
                  ← Back
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
