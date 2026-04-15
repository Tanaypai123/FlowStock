/**
 * Driver Login Page — /driver/login
 * Standalone page, no layout wrapper.
 * Uses phone + password (completely separate from Supabase Google auth).
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDriver } from "../../context/DriverContext";

export default function DriverLogin() {
  const navigate = useNavigate();
  const { login, driver, driverToken, selectedBusinessId, loading } = useDriver();

  const [phone, setPhone]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If already logged in, redirect to right place
  useEffect(() => {
    if (loading) return;
    if (driverToken && driver) {
      if (!driver.is_profile_complete) navigate("/driver/setup", { replace: true });
      else if (!selectedBusinessId)    navigate("/driver/select-business", { replace: true });
      else                             navigate("/driver/dashboard", { replace: true });
    }
  }, [loading, driverToken, driver, selectedBusinessId, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!phone.trim()) { setError("Phone number is required"); return; }
    if (!password)     { setError("Password is required"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/driver/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Invalid phone or password");
        return;
      }

      // Store token and driver info
      login(data.token, data.driver, data.businesses ?? []);

      // Route based on profile status
      if (!data.driver.is_profile_complete) {
        navigate("/driver/setup", { replace: true });
      } else if (!data.businesses?.length) {
        navigate("/driver/select-business", { replace: true });
      } else {
        navigate("/driver/select-business", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

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

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", position: "relative", overflow: "hidden", ...PAGE_BG }}>

      {/* ── Animated background blobs ── */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "-100px", right: "-80px",
          width: "420px", height: "420px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)",
          animation: "driverBlob 10s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: "-80px", left: "-60px",
          width: "380px", height: "380px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
          animation: "driverBlob 8s ease-in-out infinite reverse",
        }} />
        <div style={{
          position: "absolute", top: "50%", left: "20%",
          width: "280px", height: "280px", borderRadius: "50%",
          background: "radial-gradient(circle, rgba(79,70,229,0.1) 0%, transparent 70%)",
          animation: "driverBlob 6s ease-in-out infinite 1.5s",
        }} />
        <style>{`
          @keyframes driverBlob {
            0%,100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-24px) scale(1.05); }
          }
          @media (prefers-reduced-motion: reduce) {
            * { animation-duration: 0.01ms !important; }
          }
        `}</style>
      </div>

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "400px" }}>

        {/* ── Brand header ── */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: "64px", height: "64px", borderRadius: "18px", marginBottom: "16px",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            boxShadow: "0 8px 32px rgba(99,102,241,0.45)",
            fontSize: "28px",
          }}>
            🚚
          </div>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
              FlowStock <span style={{ color: "#818cf8" }}>Driver</span>
            </h1>
            <p style={{ fontSize: "14px", color: "#9ca3af", margin: 0 }}>
              Sign in to your driver account
            </p>
          </div>
        </div>

        {/* ── Glass card ── */}
        <div style={CARD_STYLE}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, color: "#fff", margin: "0 0 28px" }}>
            Driver Login
          </h2>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>

            {/* Phone */}
            <div>
              <label htmlFor="driver-phone" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(196,181,253,0.7)", marginBottom: "6px" }}>
                Phone Number
              </label>
              <input
                id="driver-phone"
                type="tel"
                autoComplete="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: "100%", borderRadius: "12px", padding: "12px 16px",
                  fontSize: "14px", color: "#fff", boxSizing: "border-box", outline: "none",
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.2)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="driver-password" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "rgba(196,181,253,0.7)", marginBottom: "6px" }}>
                Password
              </label>
              <input
                id="driver-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%", borderRadius: "12px", padding: "12px 16px",
                  fontSize: "14px", color: "#fff", boxSizing: "border-box", outline: "none",
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)",
                  transition: "border-color 0.2s, box-shadow 0.2s",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#6366f1"; e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.2)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{ borderRadius: "10px", padding: "10px 14px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>
                <p style={{ fontSize: "13px", color: "#fca5a5", margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="driver-login-btn"
              type="submit"
              disabled={submitting}
              style={{
                width: "100%", borderRadius: "12px", padding: "14px 20px",
                fontSize: "15px", fontWeight: 700, color: "#fff", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 4px 20px rgba(99,102,241,0.45)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                opacity: submitting ? 0.6 : 1,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => { if (!submitting) { e.currentTarget.style.filter = "brightness(1.12)"; e.currentTarget.style.transform = "scale(1.02)"; }}}
              onMouseLeave={(e) => { e.currentTarget.style.filter = ""; e.currentTarget.style.transform = ""; }}
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Signing in…
                </>
              ) : "Login"}
            </button>
          </form>
        </div>

        {/* Footer note */}
        <p style={{ textAlign: "center", fontSize: "13px", color: "#6b7280", marginTop: "24px" }}>
          Contact your fleet manager if you need access.
        </p>
      </div>
    </div>
  );
}
