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
    admin: { icon: "🏢", label: "Business Owner", desc: "Manage inventory, orders & team" },
    customer: { icon: "👤", label: "Customer", desc: "Browse products & place orders" },
  };
  const { icon, label, desc } = config[role];

  return (
    <button
      type="button"
      onClick={() => onClick(role)}
      style={{
        flex: 1,
        borderRadius: "12px",
        padding: "16px 12px",
        textAlign: "left",
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.16,1,0.3,1)",
        background: selected ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.05)",
        border: selected ? "1px solid rgba(99,102,241,0.7)" : "1px solid rgba(255,255,255,0.1)",
        boxShadow: selected ? "0 0 0 3px rgba(99,102,241,0.2), 0 4px 16px rgba(99,102,241,0.25)" : "none",
      }}
    >
      <span style={{ fontSize: "22px", display: "block", marginBottom: "8px" }}>{icon}</span>
      <p style={{ fontSize: "13px", fontWeight: 600, color: selected ? "#c4b5fd" : "rgba(255,255,255,0.85)", margin: 0 }}>
        {label}
      </p>
      <p style={{ fontSize: "11px", color: "rgba(167,139,250,0.5)", margin: "3px 0 0", lineHeight: 1.4 }}>{desc}</p>
      {selected && (
        <span style={{
          marginTop: "8px", display: "inline-block", borderRadius: "999px",
          padding: "2px 10px", fontSize: "10px", fontWeight: 700,
          background: "rgba(99,102,241,0.7)", color: "#fff", letterSpacing: "0.05em",
        }}>
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
      navigate(from && from !== "/login" ? from : ROLE_DASHBOARD_PATHS[role], { replace: true });
    }
  }, [user, role, loading, navigate, from]);

  // ── Google OAuth ────────────────────────────────────────────────────────────
  async function handleGoogleSignIn() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle(selectedRole);
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
    if (!normalized.startsWith("+")) { setError("Include country code with + (example: +919876543210)."); return; }
    if (!isValidE164(normalized)) { setError("Enter a valid phone number in international format."); return; }
    setSubmitting(true);
    try {
      const { error: signInError } = await signIn({ phone: normalized, password });
      if (signInError) { setError(messageForAuthError(signInError)); return; }
    } catch (err) {
      setError(messageForUnknownError(err));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ──
  const PAGE_BG = { background: "linear-gradient(135deg, #0a0118 0%, #1a0533 50%, #0d0d2b 100%)" };
  const CARD_STYLE = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
    borderRadius: "24px",
    padding: "40px",
  };

  // ── Loading / no-role guards ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...PAGE_BG }}>
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  if (user && !role) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", ...PAGE_BG }}>
        <div style={{ maxWidth: "360px", textAlign: "center", ...CARD_STYLE }}>
          <p style={{ fontSize: "14px", lineHeight: 1.7, color: "rgba(253,230,138,0.9)", marginBottom: "16px" }}>
            Signed in, but your profile has no valid role. Ask an administrator
            to set <code style={{ color: "rgba(253,230,138,1)" }}>profiles.role</code>.
          </p>
          <button type="button" onClick={() => signOut()}
            style={{ fontSize: "14px", color: "rgba(125,211,252,0.85)", background: "none", border: "none", cursor: "pointer" }}>
            Sign out
          </button>
          <br />
          <Link to="/landing.html" style={{ fontSize: "12px", color: "rgba(167,139,250,0.5)" }}>Home</Link>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", overflow: "hidden", ...PAGE_BG }}>

      {/* ── Animated background blobs ── */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "-120px", left: "-100px",
          width: "480px", height: "480px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
          animation: "loginBlob1 9s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-100px", right: "-80px",
          width: "400px", height: "400px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
          animation: "loginBlob1 12s ease-in-out infinite reverse",
        }} />
        <div style={{
          position: "absolute", top: "40%", left: "55%",
          width: "320px", height: "320px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,70,229,0.12) 0%, transparent 70%)",
          animation: "loginBlob1 7s ease-in-out infinite 2s",
        }} />
        <style>{`
          @keyframes loginBlob1 {
            0%,100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-28px) scale(1.06); }
          }
          @media (prefers-reduced-motion: reduce) {
            * { animation-duration: 0.01ms !important; }
          }
        `}</style>
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "420px" }}>

        {/* ── Brand header ── */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "64px", height: "64px", borderRadius: "18px", marginBottom: "16px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            boxShadow: "0 8px 32px rgba(99,102,241,0.45)",
            fontSize: "28px",
          }}>
            F
          </div>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
              FlowStock
            </h1>
            <p style={{ fontSize: "12px", color: "#a5b4fc", letterSpacing: "0.2em", textTransform: "uppercase", margin: 0 }}>
              B2B Inventory &amp; Logistics
            </p>
          </div>
        </div>

        {/* ── Glass card ── */}
        <div style={CARD_STYLE}>

          {/* Headline */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            <h2 style={{ fontSize: "26px", fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>Welcome Back</h2>
            <p style={{ fontSize: "14px", color: "#9ca3af", margin: 0 }}>Choose your role to continue</p>
          </div>

          {/* Role selector */}
          <div style={{ marginBottom: "24px" }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#6b7280", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px" }}>
              Sign in as
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <RoleCard role="admin"    selected={selectedRole === "admin"}    onClick={setSelectedRole} />
              <RoleCard role="customer" selected={selectedRole === "customer"} onClick={setSelectedRole} />
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", marginBottom: "24px" }} />

          {/* Admin/Customer Sign In */}
          <div style={{ marginBottom: "0" }}>
            <button
              type="button"
              id="google-signin-btn"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || submitting}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                gap: "10px", borderRadius: "12px", padding: "14px 20px",
                fontSize: "14px", fontWeight: 700, color: "#fff", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 4px 20px rgba(99,102,241,0.45)",
                transition: "all 0.2s ease",
                opacity: googleLoading || submitting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => { if (!googleLoading && !submitting) { e.currentTarget.style.filter = "brightness(1.12)"; e.currentTarget.style.transform = "scale(1.02)"; }}}
              onMouseLeave={(e) => { e.currentTarget.style.filter = ""; e.currentTarget.style.transform = ""; }}
            >
              {googleLoading
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                : <GoogleIcon />}
              {googleLoading ? "Redirecting to Google…" : "🏢  Admin / Customer Sign In"}
            </button>

            {error && (
              <p style={{ borderRadius: "10px", padding: "10px 14px", fontSize: "13px", color: "#fca5a5", margin: "12px 0 0",
                background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }} role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Phone toggle */}
          <div style={{ position: "relative", margin: "20px 0" }}>
            <div style={{ height: "1px", background: "rgba(255,255,255,0.08)" }} />
            <div style={{ display: "flex", justifyContent: "center", marginTop: "-10px" }}>
              <button type="button" onClick={() => setShowPhoneForm((s) => !s)}
                style={{ padding: "0 12px", fontSize: "11px", color: "rgba(167,139,250,0.55)", background: "rgba(15,1,24,0.8)", border: "none", cursor: "pointer" }}>
                {showPhoneForm ? "▲ Hide" : "▼ Sign in with phone instead"}
              </button>
            </div>
          </div>

          {/* Phone + password form */}
          {showPhoneForm && (
            <form onSubmit={handlePhoneSubmit} style={{ marginBottom: "4px" }} noValidate>
              <div style={{ marginBottom: "14px" }}>
                <label htmlFor="login-phone" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(196,181,253,0.7)", marginBottom: "6px" }}>
                  Phone
                </label>
                <input
                  id="login-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel"
                  placeholder="+91 98765 43210" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={submitting || googleLoading} required
                  style={{ width: "100%", borderRadius: "12px", padding: "12px 16px", fontSize: "14px", color: "#fff", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", outline: "none" }}
                  onFocus={(e) => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.2)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.boxShadow = "none"; }}
                />
                <p style={{ fontSize: "11px", color: "rgba(167,139,250,0.45)", margin: "4px 0 0" }}>
                  International format with country code (E.164).
                </p>
              </div>
              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="login-password" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(196,181,253,0.7)", marginBottom: "6px" }}>
                  Password
                </label>
                <input
                  id="login-password" name="password" type="password" autoComplete="current-password"
                  placeholder="••••••••" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting || googleLoading} required
                  style={{ width: "100%", borderRadius: "12px", padding: "12px 16px", fontSize: "14px", color: "#fff", boxSizing: "border-box",
                    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", outline: "none" }}
                  onFocus={(e) => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.2)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <button type="submit" disabled={submitting || googleLoading}
                style={{ width: "100%", borderRadius: "12px", padding: "13px", fontSize: "14px", fontWeight: 700, color: "#fff", border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6)", boxShadow: "0 4px 16px rgba(99,102,241,0.35)",
                  opacity: submitting || googleLoading ? 0.6 : 1, transition: "all 0.2s ease" }}>
                {submitting ? "Signing in…" : "Sign in with phone"}
              </button>
            </form>
          )}

          {/* Driver login separator */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", marginTop: "20px", paddingTop: "20px" }}>
            <Link
              to="/driver/login"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
                width: "100%", borderRadius: "12px", padding: "13px 20px",
                fontSize: "14px", fontWeight: 700, color: "rgba(255,255,255,0.85)",
                background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                textDecoration: "none", transition: "all 0.2s ease", boxSizing: "border-box",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              🚚 Driver Login
            </Link>
          </div>
        </div>

        {/* Footer */}
        <p style={{ textAlign: "center", fontSize: "12px", color: "#4b5563", marginTop: "24px" }}>
          © 2026 FlowStock &nbsp;·&nbsp;
          <Link to="/landing.html" style={{ color: "#6b7280", textDecoration: "none" }}>← Home</Link>
        </p>
      </div>
    </div>
  );
}
