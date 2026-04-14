import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, adminApiRaw } from "../../lib/adminApi.js";

const BUSINESS_TYPES = ["Retail", "Wholesale", "Distributor", "Manufacturer"];

function normalizePhone(raw = "") {
  let p = String(raw).replace(/[\s\-().]/g, "").trim();
  if (p && !p.startsWith("+")) p = `+91${p}`;
  return p;
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-800 break-all">{value}</p>
    </div>
  );
}

function Field({ label, name, value, onChange, placeholder, type = "text", required, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children ?? (
        <input
          type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-400 transition"
        />
      )}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// ─── Logo Upload section ──────────────────────────────────────────────────────
function LogoUploader({ currentUrl, onUploaded }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState(currentUrl || null);
  const [err, setErr]             = useState(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX = 2 * 1024 * 1024; // 2 MB
    if (file.size > MAX) { setErr("Logo must be under 2 MB"); return; }
    if (!file.type.startsWith("image/")) { setErr("Please select an image file"); return; }

    // Local preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setErr(null);
    setUploading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await adminApiRaw(
        "/api/admin/business-profile/logo",
        arrayBuffer,
        file.type
      );
      onUploaded(result.logo_url);
    } catch (e) {
      setErr(e?.message ?? "Upload failed");
      setPreview(currentUrl || null);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-700">Business Logo</label>
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="h-16 w-16 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
          {preview ? (
            <img src={preview} alt="Logo preview" className="h-full w-full object-contain" />
          ) : (
            <span className="text-2xl">🏢</span>
          )}
        </div>

        {/* Upload button */}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition"
          >
            {uploading ? (
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-300 border-t-indigo-600 animate-spin inline-block" />
                Uploading…
              </span>
            ) : preview ? "Change Logo" : "Upload Logo"}
          </button>
          <p className="text-xs text-slate-400">PNG, JPG or WEBP — max 2 MB</p>
          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function BusinessSetup() {
  const navigate = useNavigate();
  const [saving, setSaving]     = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [saved, setSaved]       = useState(false);
  const [existing, setExisting] = useState(null);
  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState({
    business_name: "", owner_name: "", phone: "", email: "", address: "",
    warehouse_location: "", business_type: "", gst_number: "",
    brand_color: "#6366f1", updates_phone: "", logo_url: "",
  });

  useEffect(() => {
    adminApi("/api/admin/business-profile")
      .then((r) => {
        if (r.data) {
          setExisting(r.data);
          setForm((prev) => ({ ...prev, ...r.data }));
          setEditMode(false);
        } else {
          setEditMode(true);
        }
      })
      .catch(() => { setEditMode(true); })
      .finally(() => setLoading(false));
  }, []);

  const set = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  function validate() {
    if (!form.business_name.trim()) return "Business name is required";
    if (!form.owner_name.trim())    return "Owner name is required";
    if (!form.phone.trim())         return "Phone is required";
    if (!form.updates_phone.trim()) return "Important Updates Number is required";
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError(null);
    setSaving(true);
    try {
      const res = await adminApi("/api/admin/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          phone:         normalizePhone(form.phone),
          updates_phone: normalizePhone(form.updates_phone),
        }),
      });
      setExisting(res.data);
      setForm((prev) => ({ ...prev, ...res.data }));
      setEditMode(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e?.message ?? "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleLogoUploaded(url) {
    setForm((prev) => ({ ...prev, logo_url: url }));
    setExisting((prev) => prev ? { ...prev, logo_url: url } : prev);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Business Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage your business identity, invoice branding, and alert number.
          </p>
        </div>
        <button type="button" onClick={() => navigate("/admin/dashboard")}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
          ← Dashboard
        </button>
      </div>

      {/* ─── Current Profile Summary Card ────────────────────────────── */}
      {existing && !editMode && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3">
                {/* Logo or initials */}
                {existing.logo_url ? (
                  <img src={existing.logo_url} alt="Business logo"
                    className="h-14 w-14 rounded-xl object-contain border border-slate-200 bg-white p-1 shadow-sm" />
                ) : (
                  <div className="h-14 w-14 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow"
                    style={{ backgroundColor: existing.brand_color || "#6366f1" }}>
                    {existing.business_name?.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{existing.business_name}</h2>
                  <p className="text-sm text-slate-500">{existing.business_type || "Business"} {existing.gst_number ? `· GST: ${existing.gst_number}` : ""}</p>
                </div>
              </div>
              <button type="button" onClick={() => { setEditMode(true); setError(null); }}
                className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition shadow-sm">
                ✏️ Edit Profile
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <InfoRow label="Owner"     value={existing.owner_name} />
              <InfoRow label="Phone"     value={existing.phone} />
              <InfoRow label="Email"     value={existing.email} />
              <InfoRow label="Address"   value={existing.address} />
              <InfoRow label="Warehouse" value={existing.warehouse_location} />
              <InfoRow label="GST"       value={existing.gst_number} />
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2 flex-1">
                <span className="text-lg">📲</span>
                <div>
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Important Updates Number</p>
                  <p className="text-sm font-semibold text-indigo-900">{existing.updates_phone}</p>
                </div>
              </div>
              <div className="h-8 w-8 rounded-lg border border-slate-200 shrink-0"
                style={{ backgroundColor: existing.brand_color || "#6366f1" }} title="Brand color" />
            </div>
          </div>
          {saved && (
            <div className="px-6 pb-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 font-medium">
                ✅ Business profile saved successfully!
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Edit / Create Form ───────────────────────────────────────── */}
      {editMode && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">
                {existing ? "Edit Business Profile" : "Set Up Business Profile"}
              </h2>
              {existing && (
                <button type="button" onClick={() => { setEditMode(false); setError(null); }}
                  className="text-sm text-slate-500 hover:text-slate-700 underline">Cancel</button>
              )}
            </div>

            {/* Logo upload */}
            <LogoUploader
              currentUrl={form.logo_url}
              onUploaded={handleLogoUploaded}
            />

            {/* Basic Info */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <p className="pt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Basic Information</p>
              <Field label="Business Name" name="business_name" value={form.business_name} onChange={set} placeholder="e.g. Sharma Traders" required />
              <Field label="Owner Name"    name="owner_name"    value={form.owner_name}    onChange={set} placeholder="e.g. Rajesh Sharma"   required />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone" name="phone" value={form.phone} onChange={set} placeholder="+91 98765 43210" required />
                <Field label="Email" name="email" value={form.email} onChange={set} placeholder="info@business.com" type="email" />
              </div>
              <Field label="Business Address" name="address" value={form.address} onChange={set} placeholder="123 Market St, Jaipur, Rajasthan" />
            </div>

            {/* Business Details */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <p className="pt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">Business Details</p>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Business Type</label>
                <select name="business_type" value={form.business_type} onChange={set}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition">
                  <option value="">Select type…</option>
                  {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="GST Number (optional)" name="gst_number" value={form.gst_number} onChange={set} placeholder="22AAAAA0000A1Z5" />
                <Field label="Warehouse Location" name="warehouse_location" value={form.warehouse_location} onChange={set} placeholder="Jaipur, Rajasthan" />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Brand Color</label>
                <input type="color" name="brand_color" value={form.brand_color} onChange={set}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200" />
                <span className="text-sm font-mono text-slate-500">{form.brand_color}</span>
              </div>
            </div>

            {/* Alert Number */}
            <div className="pt-2 border-t border-slate-100">
              <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📲</span>
                  <p className="text-sm font-bold text-indigo-800">Important Updates Number</p>
                  <span className="text-red-500 text-sm">*</span>
                </div>
                <p className="text-xs text-indigo-600">Receive low stock alerts & order notifications via WhatsApp.</p>
                <input type="tel" name="updates_phone" value={form.updates_phone} onChange={set}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-lg border border-indigo-300 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400 transition" />
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {error}</div>
            )}

            <div className="flex gap-3 pt-1">
              {existing && (
                <button type="button" onClick={() => { setEditMode(false); setError(null); }}
                  className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                  Cancel
                </button>
              )}
              <button type="submit" disabled={saving}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition shadow-sm">
                {saving ? "Saving…" : "✓ Save Business Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">Powered by FlowStock.in</p>
    </div>
  );
}
