import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabase.js";
import { adminApi } from "../lib/adminApi.js";

const LS_JOIN_CODE_KEY = "pendingJoinCode";
const LS_BUSINESS_KEY  = "selectedBusinessId";

/** Google logo SVG */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

/**
 * Join.jsx — /join/:code
 *
 * Invite link page. Fetches business info by code.
 * If logged in → join directly.
 * If not logged in → store code, redirect to Google OAuth.
 */
export default function Join() {
  const { code }    = useParams();
  const navigate    = useNavigate();
  const { user, setSelectedBusinessId } = useAuth();

  const [biz,       setBiz]       = useState(null);   // { businessId, businessName, ... }
  const [fetching,  setFetching]  = useState(true);
  const [joining,   setJoining]   = useState(false);
  const [notFound,  setNotFound]  = useState(false);
  const [error,     setError]     = useState(null);

  // ── Fetch business info (public, no auth) ──────────────────────────────────
  useEffect(() => {
    if (!code) { setNotFound(true); setFetching(false); return; }

    fetch(`/api/business/info/${encodeURIComponent(code.toUpperCase())}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) { setNotFound(true); }
        else               { setBiz(json); }
      })
      .catch(() => setNotFound(true))
      .finally(() => setFetching(false));
  }, [code]);

  // ── Join action (authenticated) ────────────────────────────────────────────
  async function handleJoin() {
    setError(null);
    setJoining(true);
    try {
      const json = await adminApi("/api/business/join", {
        method: "POST",
        body: JSON.stringify({ businessCode: code.toUpperCase() }),
      });
      if (!json.success) throw new Error(json.error ?? "Failed to join");

      localStorage.setItem(LS_BUSINESS_KEY, json.businessId);
      if (setSelectedBusinessId) setSelectedBusinessId(json.businessId);
      navigate("/customer/home", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setJoining(false);
    }
  }

  // ── Google OAuth (not logged in) ───────────────────────────────────────────
  async function handleGoogleJoin() {
    localStorage.setItem(LS_JOIN_CODE_KEY, code.toUpperCase());
    localStorage.setItem("pendingRole", "customer");
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (fetching) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (notFound || !biz) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-5 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-red-500/25 bg-red-500/10 p-7 text-center space-y-3">
          <p className="text-3xl">🔗</p>
          <p className="text-sm font-semibold text-red-200">Invalid Invite Link</p>
          <p className="text-sm text-red-300/80">
            This business code was not found. Ask the business owner for a valid invite link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition"
        >
          ← Back to Login
        </button>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm space-y-5">
        {/* Logo */}
        <div className="text-center space-y-1 mb-2">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 mb-3">
            <span className="text-white font-bold text-lg">F</span>
          </div>
          <p className="text-xs text-zinc-500 uppercase tracking-widest">FlowStock</p>
        </div>

        {/* Business card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 shadow-2xl shadow-black/40 space-y-5">
          {/* Business info */}
          <div className="text-center space-y-1">
            {biz.logoUrl && (
              <img src={biz.logoUrl} alt={biz.businessName} className="h-14 w-14 object-contain rounded-xl mx-auto mb-2" />
            )}
            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">You're invited to join</p>
            <h1 className="text-xl font-bold text-zinc-100">{biz.businessName}</h1>
            {biz.address && <p className="text-xs text-zinc-600">{biz.address}</p>}
          </div>

          <div className="border-t border-zinc-800" />

          {/* CTA */}
          {error && (
            <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300 text-center">
              {error}
            </p>
          )}

          {user ? (
            /* Already logged in → join directly */
            <button
              id="join-btn"
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
              ) : `Join ${biz.businessName}`}
            </button>
          ) : (
            /* Not logged in → Google OAuth */
            <button
              id="google-join-btn"
              type="button"
              onClick={handleGoogleJoin}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-white py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 active:scale-[0.98] transition-all shadow-sm"
            >
              <GoogleIcon />
              Join with Google
            </button>
          )}

          <p className="text-center text-xs text-zinc-600">
            You'll be added as a customer of this business.
          </p>
        </div>
      </div>
    </div>
  );
}
