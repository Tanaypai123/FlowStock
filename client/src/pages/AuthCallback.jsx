import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

const VALID_ROLES     = ["admin", "customer", "driver"];
const LS_BUSINESS_KEY = "selectedBusinessId";
/** If user was created within this many ms ago → treat as new signup */
const NEW_USER_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * AuthCallback v3 — fixes the DB trigger role-override race condition.
 *
 * Root cause of bug:
 *   When Google creates a new auth.users row the DB trigger fires IMMEDIATELY
 *   and inserts profiles(id, role='customer') — BEFORE this page even loads.
 *   So when AuthCallback later reads the profile it sees 'customer' even if
 *   the user selected 'Business Owner'.
 *
 * Fix:
 *   1. Read pendingRole from localStorage (set before OAuth redirect).
 *   2. Check user.created_at — if < 5 min ago → new user.
 *   3. For new users → UPSERT profile with pendingRole (overrides trigger default).
 *   4. For returning users → use DB role unchanged (pendingRole ignored → security).
 *   5. Log finalRole for debugging.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("Completing sign-in…");
  const [error,  setError]  = useState(null);
  const ran = useRef(false); // prevent double-execution in React StrictMode

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    handleCallback();

    async function handleCallback() {
      try {
        // ── Step 1: Get session ───────────────────────────────────────────────
        const { data: { session }, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !session?.user) {
          throw new Error(
            sessionError?.message ??
            "Google sign-in did not return a session. Please try again."
          );
        }

        const user = session.user;
        setStatus("Checking your profile…");

        // ── Step 2: Is this a NEW user? ───────────────────────────────────────
        const createdAt      = new Date(user.created_at).getTime();
        const isNewUser      = Date.now() - createdAt < NEW_USER_WINDOW_MS;
        const pendingRole    = localStorage.getItem("pendingRole");
        const pendingIsValid = pendingRole && VALID_ROLES.includes(pendingRole);

        // ── Step 3: Resolve final role ────────────────────────────────────────
        let finalRole;

        if (isNewUser && pendingIsValid) {
          // 🆕 NEW USER + role was selected before OAuth redirect
          // The trigger already inserted 'customer' — we override it with UPSERT
          setStatus("Setting up your account…");

          const { error: upsertErr } = await supabase
            .from("profiles")
            .upsert(
              { id: user.id, role: pendingRole, updated_at: new Date().toISOString() },
              { onConflict: "id" }
            );

          if (upsertErr) {
            console.warn("[AuthCallback] upsert warn:", upsertErr.message);
            // Non-fatal — read whatever is in DB
          }

          // Read back to confirm
          const { data: confirmed } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

          finalRole = confirmed?.role ?? pendingRole;

        } else {
          // 🔄 RETURNING USER — DB role is source of truth, ignore pendingRole
          const { data: existing, error: profileErr } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();

          if (profileErr) throw new Error(`Profile fetch failed: ${profileErr.message}`);

          if (!existing?.role || !VALID_ROLES.includes(existing.role)) {
            // Edge case: profile exists but role is invalid — use pendingRole as fallback
            finalRole = pendingIsValid ? pendingRole : "customer";
          } else {
            finalRole = existing.role;
          }
        }

        // ── Step 4: Clean up localStorage ────────────────────────────────────
        localStorage.removeItem("pendingRole");

        // ── Step 5: Safety log ────────────────────────────────────────────────
        console.log("[AuthCallback] Final role:", finalRole, "| New user:", isNewUser, "| User:", user.email ?? user.id);

        if (!VALID_ROLES.includes(finalRole)) {
          throw new Error(`Invalid role resolved: "${finalRole}". Contact support.`);
        }

        // ── Step 6: Business routing ──────────────────────────────────────────
        setStatus("Loading your workspace…");

        if (finalRole === "admin") {
          await routeAdmin(user.id, session.access_token);
        } else if (finalRole === "customer") {
          await routeCustomer(user.id, session.access_token);
        } else {
          navigate("/driver/dashboard", { replace: true });
        }

      } catch (err) {
        console.error("[AuthCallback] Error:", err);
        setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      }
    }

    async function routeAdmin(userId, token) {
      const { data: business } = await supabase
        .from("business_profile")
        .select("id")
        .eq("admin_id", userId)
        .maybeSingle();

      if (!business) {
        navigate("/onboarding/business", { replace: true });
      } else {
        localStorage.setItem(LS_BUSINESS_KEY, business.id);
        navigate("/admin/dashboard", { replace: true });
      }
    }

    async function routeCustomer(_userId, token) {
      // 1. Check if there's a pending join code from an invite link
      const pendingJoinCode = localStorage.getItem("pendingJoinCode");
      if (pendingJoinCode) {
        localStorage.removeItem("pendingJoinCode");
        try {
          setStatus("Joining business…");
          const joinRes = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/business/join`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ businessCode: pendingJoinCode }),
          });
          const joinJson = await joinRes.json();
          if (joinJson.success && joinJson.businessId) {
            localStorage.setItem(LS_BUSINESS_KEY, joinJson.businessId);
            navigate("/customer/home", { replace: true });
            return;
          }
        } catch (e) {
          console.warn("[AuthCallback] pendingJoinCode join failed:", e.message);
          // Fall through to normal routing
        }
      }

      // 2. Check how many businesses this customer belongs to
      try {
        const bizRes  = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/business/my-businesses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const bizJson = await bizRes.json();
        const list    = bizJson.data ?? [];

        if (list.length === 0) {
          navigate("/join", { replace: true });
        } else if (list.length === 1) {
          localStorage.setItem(LS_BUSINESS_KEY, list[0].businessId);
          navigate("/customer/home", { replace: true });
        } else {
          navigate("/select-business", { replace: true });
        }
      } catch (e) {
        console.warn("[AuthCallback] my-businesses failed:", e.message);
        navigate("/customer/home", { replace: true });
      }
    }

  }, [navigate]);

  // ── Error UI ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-5 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center space-y-3">
          <p className="text-3xl">⚠️</p>
          <p className="text-sm font-medium text-red-200">Authentication Error</p>
          <p className="text-sm text-red-300/80 leading-relaxed">{error}</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { setError(null); ran.current = false; window.location.reload(); }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition"
          >
            Try Again
          </button>
          <button
            type="button"
            onClick={() => navigate("/login", { replace: true })}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  // ── Loading UI ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      </div>
      <div className="relative flex flex-col items-center gap-6">
        <div className="relative h-16 w-16 flex items-center justify-center">
          <span className="absolute h-16 w-16 animate-ping rounded-full bg-indigo-500/20" style={{ animationDuration: "1.5s" }} />
          <span className="absolute h-12 w-12 animate-ping rounded-full bg-indigo-500/10" style={{ animationDuration: "2s", animationDelay: "0.3s" }} />
          <span className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-indigo-500/30">
            F
          </span>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-zinc-100">{status}</p>
          <div className="flex items-center justify-center gap-1.5 mt-2">
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </div>
        </div>
        <p className="text-xs text-zinc-600">Powered by FlowStock</p>
      </div>
    </div>
  );
}
