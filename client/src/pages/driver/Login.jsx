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
      const res = await fetch("/api/driver/auth/login", {
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      {/* Card */}
      <div className="w-full max-w-sm">
        {/* Logo & Branding */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="h-14 w-14 rounded-2xl bg-violet-600 flex items-center justify-center text-2xl shadow-lg shadow-violet-900/40">
            🚚
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white tracking-tight">
              FlowStock <span className="text-violet-400">Driver</span>
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">Sign in to your driver account</p>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-base font-semibold text-white mb-6">Driver Login</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone */}
            <div>
              <label htmlFor="driver-phone" className="block text-xs font-medium text-slate-400 mb-1.5">
                Phone Number
              </label>
              <input
                id="driver-phone"
                type="tel"
                autoComplete="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="driver-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <input
                id="driver-password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-900/30 border border-red-700/50 px-3.5 py-2.5">
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              id="driver-login-btn"
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-lg shadow-violet-900/30 mt-2"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Signing in…
                </span>
              ) : (
                "Login"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Contact your fleet manager if you need access.
        </p>
      </div>
    </div>
  );
}
