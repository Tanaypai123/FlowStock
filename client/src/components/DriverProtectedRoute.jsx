/**
 * DriverProtectedRoute.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Guards all /driver/* routes EXCEPT /driver/login.
 *
 * requireBusiness={false} → only check token (used for /driver/setup and /driver/select-business)
 * requireBusiness={true}  → full check: token + profile complete + business selected
 */

import { Navigate, Outlet } from "react-router-dom";
import { useDriver } from "../context/DriverContext";

export function DriverProtectedRoute({ requireBusiness = true }) {
  const { driver, driverToken, selectedBusinessId, loading } = useDriver();

  // Still verifying token with server — show spinner
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "2px solid #7c3aed", borderTopColor: "transparent",
            animation: "spin 0.7s linear infinite", margin: "0 auto"
          }} />
          <p style={{ color: "#94a3b8", fontSize: 13, marginTop: 12 }}>Verifying session…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // No token → redirect to driver login
  if (!driverToken || !driver) {
    return <Navigate to="/driver/login" replace />;
  }

  // ── Full protection (dashboard and other protected pages) ────────────────
  if (requireBusiness) {
    // Profile not complete → send to setup
    if (!driver.is_profile_complete) {
      return <Navigate to="/driver/setup" replace />;
    }
    // Business not selected → send to select-business
    if (!selectedBusinessId) {
      return <Navigate to="/driver/select-business" replace />;
    }
  }

  // ── Semi-protection (setup / select-business pages) ──────────────────────
  // Only check token above — don't redirect back to setup from setup itself!

  return <Outlet />;
}
