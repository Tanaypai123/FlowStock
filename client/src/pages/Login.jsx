import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ROLE_DASHBOARD_PATHS, useAuth } from "../context/AuthContext";

/** Strip spaces/dashes/parens; Supabase expects E.164 (e.g. +14155552671). */
function normalizePhone(raw) {
  return String(raw).replace(/[\s\-().]/g, "").trim();
}

/** Loose E.164 check: + then 8–15 digits. */
function isValidE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

function messageForAuthError(error) {
  const msg = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";
  if (
    code === "invalid_credentials" ||
    msg.includes("invalid login") ||
    msg.includes("invalid_grant") ||
    msg.includes("wrong")
  ) {
    return "Incorrect phone number or password.";
  }
  return error?.message || "Sign-in failed. Try again.";
}

function messageForUnknownError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("load failed") ||
    err?.name === "TypeError"
  ) {
    return "Network error. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

// ─── Google logo SVG ──────────────────────────────────────────────────────────

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

// ─── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({ role, selected, onClick }) {
  const config = {
    admin: {
      icon: "🏢",
      label: "Business Owner",
      desc: "Manage inventory, orders & team",
    },
    customer: {
      icon: "👤",
      label: "Customer",
      desc: "Browse products & place orders",
    },
  };
  const { icon, label, desc } = config[role];

  return (
    <button
      type="button"
      onClick={() => onClick(role)}
      className={[
        "flex-1 rounded-xl border-2 p-4 text-left transition-all duration-200 cursor-pointer",
        selected
          ? "border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10"
          : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-600 hover:bg-zinc-800/60",
      ].join(" ")}
    >
      <span className="text-2xl block mb-2">{icon}</span>
      <p className={`text-sm font-semibold ${selected ? "text-indigo-300" : "text-zinc-100"}`}>
        {label}
      </p>
      <p className="text-xs text-zinc-500 mt-0.5 leading-snug">{desc}</p>
      {selected && (
        <span className="mt-2 inline-block rounded-full bg-indigo-500 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
          Selected ✓
        </span>
      )}
    </button>
  );
}

// ─── Main Login Page ──────────────────────────────────────────────────────────

export default function Login() {
  const { user, role, loading, signIn, signOut, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;

  // Role selection
  const [selectedRole, setSelectedRole] = useState("customer");

  // Phone login state (kept intact)
  const [phone, setPhone]         = useState("");
  const [password, setPassword]   = useState("");
  const [error, setError]         = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPhoneForm, setShowPhoneForm] = useState(false);

  // Redirect if already logged in
  useEffect(() => {
    if (loading) return;
    if (user && role) {
      navigate(from && from !== "/login" ? from : ROLE_DASHBOARD_PATHS[role], {
        replace: true,
      });
    }
  }, [user, role, loading, navigate, from]);

  // ── Google OAuth ────────────────────────────────────────────────────────────
  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle(selectedRole);
      // Page will redirect — no need to setLoading(false)
    } catch (err) {
      setError(messageForUnknownError(err));
      setGoogleLoading(false);
    }
  }

  // ── Phone + Password (existing — unchanged) ─────────────────────────────────
  async function handlePhoneSubmit(e) {
    e.preventDefault();
    setError(null);

    const normalized = normalizePhone(phone);
    if (!normalized.startsWith("+")) {
      setError("Include country code with + (example: +919876543210).");
      return;
    }
    if (!isValidE164(normalized)) {
      setError("Enter a valid phone number in international format.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: signInError } = await signIn({ phone: normalized, password });
      if (signInError) {
        setError(messageForAuthError(signInError));
        return;
      }
    } catch (err) {
      setError(messageForUnknownError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / no-role guards ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (user && !role) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <p className="text-sm text-amber-200/90 leading-relaxed">
            Signed in, but your profile has no valid role. Ask an administrator
            to set <code className="text-amber-100/90">profiles.role</code>.
          </p>
          <button
            type="button"
            onClick={() => signOut()}
            className="text-sm text-sky-400 hover:text-sky-300"
          >
            Sign out
          </button>
          <p>
            <Link to="/" className="text-xs text-zinc-600 hover:text-zinc-400">Home</Link>
          </p>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* Background gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo + branding */}
        <div className="mb-8 text-center space-y-1">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25 mb-3">
            <span className="text-white font-bold text-xl">F</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">FlowStock</h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest">B2B Inventory & Logistics</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm p-6 shadow-2xl shadow-black/40 space-y-5">

          {/* Step 1 — Role selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Sign in as
            </p>
            <div className="flex gap-3">
              <RoleCard role="admin"    selected={selectedRole === "admin"}    onClick={setSelectedRole} />
              <RoleCard role="customer" selected={selectedRole === "customer"} onClick={setSelectedRole} />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800" />

          {/* Step 2 — Google button */}
          <div className="space-y-3">
            <button
              type="button"
              id="google-signin-btn"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || submitting}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-white py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-100 active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm"
            >
              {googleLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
              ) : (
                <GoogleIcon />
              )}
              {googleLoading ? "Redirecting to Google…" : "Continue with Google"}
            </button>

            {/* Error */}
            {error && (
              <p
                className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300/95"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>

          {/* Divider — toggle phone form */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center">
              <button
                type="button"
                onClick={() => setShowPhoneForm((s) => !s)}
                className="bg-zinc-900 px-3 text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {showPhoneForm ? "▲ Hide" : "▼ Sign in with phone instead"}
              </button>
            </div>
          </div>

          {/* Phone + password form (existing — collapsible) */}
          {showPhoneForm && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="login-phone" className="block text-xs font-medium text-zinc-500">
                  Phone
                </label>
                <input
                  id="login-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={submitting || googleLoading}
                  required
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-[box-shadow,border-color] focus:border-zinc-700 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
                />
                <p className="text-[11px] text-zinc-600">
                  International format with country code (E.164).
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="login-password" className="block text-xs font-medium text-zinc-500">
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting || googleLoading}
                  required
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition-[box-shadow,border-color] focus:border-zinc-700 focus:ring-2 focus:ring-sky-500/30 disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || googleLoading}
                className="w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-medium text-zinc-950 hover:bg-white disabled:opacity-50 transition-colors"
              >
                {submitting ? "Signing in…" : "Sign in with phone"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 text-center">
          <Link to="/" className="text-xs text-zinc-600 transition-colors hover:text-zinc-400">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
