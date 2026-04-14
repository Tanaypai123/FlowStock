import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../lib/adminApi.js";

// ─── Step indicator ────────────────────────────────────────────────────────────

function Step({ n, label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      <span className={[
        "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all",
        done  ? "bg-indigo-600 text-white" :
        active ? "bg-indigo-600 text-white ring-4 ring-indigo-500/20" :
                 "bg-zinc-800 text-zinc-500",
      ].join(" ")}>
        {done ? "✓" : n}
      </span>
      <span className={`text-xs font-medium ${active || done ? "text-zinc-100" : "text-zinc-600"}`}>
        {label}
      </span>
    </div>
  );
}

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-zinc-300">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-zinc-600 leading-snug">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-sm text-zinc-100 " +
  "placeholder:text-zinc-600 outline-none transition focus:border-indigo-500 focus:ring-2 " +
  "focus:ring-indigo-500/20 disabled:opacity-50";

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CreateBusiness() {
  const navigate  = useNavigate();
  const { user, loading: authLoading, setSelectedBusinessId } = useAuth();

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate("/login", { replace: true });
  }, [authLoading, user, navigate]);

  const [step,       setStep]       = useState(1); // 1 = basic info, 2 = location
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const [geoStatus,  setGeoStatus]  = useState(null); // null | "loading" | "ok" | "denied"

  const [form, setForm] = useState({
    business_name: "",
    address:       "",
    phone:         "",
    gst_number:    "",
    warehouse_lat: "",
    warehouse_lng: "",
  });

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // ── Geolocation ──────────────────────────────────────────────────────────────
  const handleGeoLocate = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          warehouse_lat: pos.coords.latitude.toFixed(6),
          warehouse_lng: pos.coords.longitude.toFixed(6),
        }));
        setGeoStatus("ok");
      },
      () => setGeoStatus("denied"),
      { timeout: 10000 },
    );
  }, []);

  // ── Step 1 validation ────────────────────────────────────────────────────────
  function validateStep1() {
    if (!form.business_name.trim()) return "Business name is required.";
    if (!form.address.trim())       return "Address is required.";
    if (!form.phone.trim())         return "Phone number is required.";
    return null;
  }

  function handleNextStep() {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError(null);
    setStep(2);
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    const err = validateStep1();
    if (err) { setError(err); setStep(1); return; }

    setError(null);
    setSubmitting(true);

    try {
      const body = {
        business_name:  form.business_name.trim(),
        address:        form.address.trim(),
        phone:          form.phone.trim(),
        gst_number:     form.gst_number.trim() || null,
        warehouse_lat:  form.warehouse_lat || null,
        warehouse_lng:  form.warehouse_lng || null,
      };

      const json = await adminApi("/api/business/setup", {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!json.success) throw new Error(json.error ?? "Failed to create business.");

      // Store business id
      if (json.businessId) {
        localStorage.setItem("selectedBusinessId", json.businessId);
        if (setSelectedBusinessId) setSelectedBusinessId(json.businessId);
      }

      navigate("/admin/dashboard", { replace: true });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading guard ────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      {/* Gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo + heading */}
        <div className="mb-7 text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/25 mb-2">
            <span className="text-white font-bold text-xl">F</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
            Set up your business
          </h1>
          <p className="text-sm text-zinc-500">
            Complete your profile to start using FlowStock
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-3 mb-6 px-1">
          <Step n={1} label="Business Info"  active={step === 1} done={step > 1} />
          <div className="flex-1 h-px bg-zinc-800" />
          <Step n={2} label="Location"       active={step === 2} done={false} />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-sm p-6 shadow-2xl shadow-black/50">
          <form onSubmit={handleSubmit} noValidate>

            {/* ── Step 1 — Business Info ───────────────────────────────────── */}
            {step === 1 && (
              <div className="space-y-4">
                <Field label="Business Name" required hint="This will appear on invoices and customer portal">
                  <input
                    id="biz-name"
                    type="text"
                    placeholder="e.g. Sharma Traders"
                    value={form.business_name}
                    onChange={(e) => set("business_name", e.target.value)}
                    disabled={submitting}
                    className={inputCls}
                    autoFocus
                  />
                </Field>

                <Field label="Business Address" required hint="Full address including city and PIN code">
                  <textarea
                    id="biz-address"
                    rows={3}
                    placeholder="123 Market Street, Jaipur, Rajasthan - 302001"
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                    disabled={submitting}
                    className={`${inputCls} resize-none`}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone Number" required>
                    <input
                      id="biz-phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      disabled={submitting}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="GST Number" hint="Optional">
                    <input
                      id="biz-gst"
                      type="text"
                      placeholder="22AAAAA0000A1Z5"
                      value={form.gst_number}
                      onChange={(e) => set("gst_number", e.target.value.toUpperCase())}
                      disabled={submitting}
                      className={inputCls}
                    />
                  </Field>
                </div>

                {/* Error */}
                {error && (
                  <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={submitting}
                  className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                >
                  Continue → Add Location
                </button>
              </div>
            )}

            {/* ── Step 2 — Warehouse Location ──────────────────────────────── */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-4 text-center space-y-3">
                  <p className="text-xs text-zinc-400 font-medium">Warehouse / Office Location</p>
                  <p className="text-[11px] text-zinc-600 leading-relaxed">
                    Used for driver dispatch and delivery distance calculations.
                  </p>

                  {/* Auto-detect button */}
                  <button
                    type="button"
                    onClick={handleGeoLocate}
                    disabled={geoStatus === "loading" || submitting}
                    className="flex items-center gap-2 mx-auto rounded-xl bg-zinc-700 hover:bg-zinc-600 px-4 py-2.5 text-sm font-medium text-zinc-200 transition disabled:opacity-50"
                  >
                    {geoStatus === "loading" ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
                    ) : "📍"}
                    {geoStatus === "loading" ? "Detecting…" :
                     geoStatus === "ok"      ? "✓ Location captured — click to retry" :
                     geoStatus === "denied"  ? "⚠ Access denied — enter manually" :
                     "Use my current location"}
                  </button>

                  {geoStatus === "ok" && (
                    <p className="text-xs text-emerald-400 font-medium">
                      ✓ {form.warehouse_lat}, {form.warehouse_lng}
                    </p>
                  )}
                </div>

                {/* Manual entry */}
                <div>
                  <p className="text-xs text-zinc-500 text-center mb-3">— or enter manually —</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Latitude">
                      <input
                        id="biz-lat"
                        type="number"
                        step="any"
                        placeholder="26.9124"
                        value={form.warehouse_lat}
                        onChange={(e) => set("warehouse_lat", e.target.value)}
                        disabled={submitting}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Longitude">
                      <input
                        id="biz-lng"
                        type="number"
                        step="any"
                        placeholder="75.7873"
                        value={form.warehouse_lng}
                        onChange={(e) => set("warehouse_lng", e.target.value)}
                        disabled={submitting}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-600 text-center">
                  Location is optional — you can always update it later in Settings.
                </p>

                {/* Error */}
                {error && (
                  <p className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setStep(1); setError(null); }}
                    disabled={submitting}
                    className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-400 hover:bg-zinc-800 transition disabled:opacity-50"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Creating…
                      </span>
                    ) : "Create Business →"}
                  </button>
                </div>

                {/* Skip option */}
                <p className="text-center">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="text-xs text-zinc-600 hover:text-zinc-400 transition underline underline-offset-2"
                  >
                    Skip location — set it up later
                  </button>
                </p>
              </div>
            )}

          </form>
        </div>

        {/* Footer */}
        <p className="mt-5 text-center text-xs text-zinc-700">
          Logged in as <span className="text-zinc-500">{user?.email ?? user?.phone ?? "—"}</span>
        </p>
      </div>
    </div>
  );
}
