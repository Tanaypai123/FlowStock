/**
 * Driver Profile Setup Page — /driver/setup
 * Only accessible when is_profile_complete = false.
 * Standalone page, no layout wrapper.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDriver, driverAuthFetch } from "../../context/DriverContext";

export default function DriverSetup() {
  const navigate = useNavigate();
  const { driver, driverToken, updateDriverInfo } = useDriver();

  const [name, setName]                   = useState(driver?.name ?? "");
  const [password, setPassword]           = useState("");
  const [confirmPass, setConfirmPass]     = useState("");
  const [vehicleDetails, setVehicleDetails] = useState(driver?.vehicle_details ?? "");
  const [licenseNumber, setLicenseNumber]   = useState(driver?.license_number ?? "");
  const [error, setError]     = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Validations
    if (!name.trim() || name.trim().length < 2) {
      setError("Full name is required (at least 2 characters)"); return;
    }
    if (!password || password.length < 6) {
      setError("New password must be at least 6 characters"); return;
    }
    if (password !== confirmPass) {
      setError("Passwords do not match"); return;
    }

    setSubmitting(true);
    try {
      const data = await driverAuthFetch(
        "/api/driver/auth/setup",
        {
          method: "PUT",
          body: JSON.stringify({
            name: name.trim(),
            password,
            vehicle_details: vehicleDetails.trim() || undefined,
            license_number:  licenseNumber.trim()   || undefined,
          }),
        },
        driverToken,
      );

      if (!data.success) {
        setError(data.error || "Setup failed"); return;
      }

      // Update context + localStorage
      updateDriverInfo(data.driver);

      // Go to business selection
      navigate("/driver/select-business", { replace: true });
    } catch (err) {
      setError(err.message || "Setup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="h-14 w-14 rounded-2xl bg-violet-600 flex items-center justify-center text-2xl shadow-lg shadow-violet-900/40">
            🚚
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">Complete Your Profile</h1>
            <p className="text-sm text-slate-400 mt-0.5">Set up your driver account to get started</p>
          </div>
        </div>

        {/* Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="setup-name" className="block text-xs font-medium text-slate-400 mb-1.5">
                Full Name <span className="text-red-400">*</span>
              </label>
              <input
                id="setup-name"
                type="text"
                autoComplete="name"
                placeholder="e.g. Rahul Sharma"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="setup-password" className="block text-xs font-medium text-slate-400 mb-1.5">
                New Password <span className="text-red-400">*</span>
              </label>
              <input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="setup-confirm-pass" className="block text-xs font-medium text-slate-400 mb-1.5">
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <input
                id="setup-confirm-pass"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat your password"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800 pt-2">
              <p className="text-xs text-slate-500 mb-3 font-medium uppercase tracking-wider">Vehicle Info (Optional)</p>
            </div>

            {/* Vehicle Details */}
            <div>
              <label htmlFor="setup-vehicle" className="block text-xs font-medium text-slate-400 mb-1.5">
                Vehicle Details
              </label>
              <input
                id="setup-vehicle"
                type="text"
                placeholder="e.g. White Maruti Alto — RJ14 XX 1234"
                value={vehicleDetails}
                onChange={(e) => setVehicleDetails(e.target.value)}
                className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
              />
            </div>

            {/* License Number */}
            <div>
              <label htmlFor="setup-license" className="block text-xs font-medium text-slate-400 mb-1.5">
                License Number
              </label>
              <input
                id="setup-license"
                type="text"
                placeholder="e.g. RJ-1420210012345"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
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
              id="driver-setup-btn"
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors shadow-lg shadow-violet-900/30 mt-2"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Saving…
                </span>
              ) : (
                "Save & Continue"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Hi {driver?.phone ?? "driver"} — you're almost ready!
        </p>
      </div>
    </div>
  );
}
