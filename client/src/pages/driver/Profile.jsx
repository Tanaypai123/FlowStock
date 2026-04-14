/**
 * Driver Profile Page — /driver/profile
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows driver info + allows editing name/vehicle/license.
 * Change password section uses PUT /api/driver/auth/change-password.
 * Stats: total deliveries, businesses count.
 */

import { useEffect, useState } from "react";
import { driverApi }           from "../../lib/driverApi.js";
import { driverAuthFetch }     from "../../context/DriverContext.jsx";
import { useDriver }           from "../../context/DriverContext.jsx";

function Field({ label, id, type = "text", value, onChange, readOnly, placeholder }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-500 mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        className={[
          "w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors",
          readOnly
            ? "bg-slate-800/50 border-slate-700 text-slate-400 cursor-not-allowed"
            : "bg-slate-800 border-slate-700 text-white placeholder-slate-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30",
        ].join(" ")}
      />
    </div>
  );
}

function Toast({ message, type }) {
  return (
    <div className={[
      "fixed bottom-24 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-xl z-50 transition-all",
      type === "success"
        ? "bg-emerald-600 text-white"
        : "bg-red-600 text-white",
    ].join(" ")}>
      {message}
    </div>
  );
}

export default function DriverProfile() {
  const { driver, updateDriverInfo, driverBusinesses } = useDriver();

  // Profile form
  const [name,           setName]           = useState(driver?.name ?? "");
  const [vehicleDetails, setVehicleDetails] = useState(driver?.vehicle_details ?? "");
  const [licenseNumber,  setLicenseNumber]  = useState(driver?.license_number ?? "");
  const [savingProfile,  setSavingProfile]  = useState(false);

  // Change password form
  const [oldPw,  setOldPw]  = useState("");
  const [newPw,  setNewPw]  = useState("");
  const [confPw, setConfPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Stats
  const [stats, setStats] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Fetch stats (total delivered + businesses)
  useEffect(() => {
    async function loadStats() {
      try {
        const r = await driverApi("/api/driver/history");
        const delivered = Array.isArray(r.data) ? r.data.length : 0;

        // Current month
        const now = new Date();
        const thisMonth = (r.data ?? []).filter((d) => {
          if (!d.delivered_at) return false;
          const dt = new Date(d.delivered_at);
          return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
        }).length;

        setStats({ delivered, thisMonth });
      } catch { /* non-critical */ }
    }
    loadStats();
  }, []);

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const r = await driverApi("/api/driver/profile", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, vehicle_details: vehicleDetails, license_number: licenseNumber }),
      });
      if (r.success && r.data) {
        updateDriverInfo({
          name:            r.data.name,
          vehicle_details: r.data.vehicle_details,
          license_number:  r.data.license_number,
        });
        setName(r.data.name ?? "");
        setVehicleDetails(r.data.vehicle_details ?? "");
        setLicenseNumber(r.data.license_number ?? "");
        showToast("Profile updated ✓");
      }
    } catch (e) {
      showToast(e.message || "Failed to save", "error");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPw !== confPw) { showToast("Passwords don't match", "error"); return; }
    if (newPw.length < 6)  { showToast("New password must be 6+ characters", "error"); return; }

    setSavingPw(true);
    try {
      const token = localStorage.getItem("driverToken");
      const r = await driverAuthFetch(
        "/api/driver/auth/change-password",
        { method: "PUT", body: JSON.stringify({ old_password: oldPw, new_password: newPw }) },
        token,
      );
      if (r.success) {
        showToast("Password changed ✓");
        setOldPw(""); setNewPw(""); setConfPw("");
      }
    } catch (e) {
      showToast(e.message || "Failed to change password", "error");
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-violet-700 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-violet-900/40">
          {(driver?.name ?? "D")[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">{driver?.name ?? "Driver"}</h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{driver?.phone ?? "—"}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Delivered", value: stats?.delivered ?? "—",   icon: "✅", color: "text-emerald-400" },
          { label: "This Month",      value: stats?.thisMonth  ?? "—",   icon: "📅", color: "text-sky-400"     },
          { label: "Businesses",      value: driverBusinesses.length,    icon: "🏢", color: "text-violet-400"  },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="text-xl mb-0.5">{icon}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Profile form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Personal Details</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Field label="Full Name" id="profile-name" value={name}
            onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <Field label="Phone Number" id="profile-phone" value={driver?.phone ?? ""}
            readOnly />
          <Field label="Vehicle Details" id="profile-vehicle" value={vehicleDetails}
            onChange={(e) => setVehicleDetails(e.target.value)} placeholder="e.g. Toyota Innova • DL-01-AB-1234" />
          <Field label="License Number" id="profile-license" value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)} placeholder="e.g. DL0420110010" />
          <button
            type="submit"
            id="save-profile-btn"
            disabled={savingProfile}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
          >
            {savingProfile ? "Saving…" : "Save Profile"}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Change Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Field label="Current Password" id="old-pw" type="password" value={oldPw}
            onChange={(e) => setOldPw(e.target.value)} placeholder="Enter current password" />
          <Field label="New Password" id="new-pw" type="password" value={newPw}
            onChange={(e) => setNewPw(e.target.value)} placeholder="Min 6 characters" />
          <Field label="Confirm New Password" id="conf-pw" type="password" value={confPw}
            onChange={(e) => setConfPw(e.target.value)} placeholder="Repeat new password" />
          <button
            type="submit"
            id="change-password-btn"
            disabled={savingPw || !oldPw || !newPw || !confPw}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            {savingPw ? "Changing…" : "Change Password"}
          </button>
        </form>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}
