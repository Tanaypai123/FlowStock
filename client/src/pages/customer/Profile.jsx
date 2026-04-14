import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { customerApi } from "../../lib/customerApi.js";

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type = "success", onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className={[
      "fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-2xl border",
      type === "success" ? "bg-emerald-600 border-emerald-500" : "bg-red-600 border-red-500",
    ].join(" ")}>
      {message}
    </div>
  );
}

const LABEL_OPTIONS = ["Home", "Office", "Shop", "Warehouse", "Other"];

// ─── Add / Edit Address Modal ─────────────────────────────────────────────────
function AddressModal({ onSave, onClose, initial }) {
  const [label,       setLabel]       = useState(initial?.label      ?? "Home");
  const [customLabel, setCustomLabel] = useState("");
  const [region,      setRegion]      = useState(initial?.region     ?? "");
  const [address,     setAddress]     = useState(initial?.address    ?? "");
  const [pincode,     setPincode]     = useState(initial?.pincode    ?? "");
  const [isDefault,   setIsDefault]   = useState(initial?.is_default ?? false);
  const [err,         setErr]         = useState("");
  const [saving,      setSaving]      = useState(false);

  const isEditing = Boolean(initial?.id);

  // GPS state
  const [gpsLoading,  setGpsLoading]  = useState(false);
  const [gpsStatus,   setGpsStatus]   = useState(""); // "" | "success" | "error"
  const [gpsAccuracy, setGpsAccuracy] = useState(null);

  // Colony search state
  const [areaQuery,       setAreaQuery]       = useState("");
  const [areaSuggestions, setAreaSuggestions] = useState([]);
  const [areaLoading,     setAreaLoading]     = useState(false);
  const [areaRect,        setAreaRect]        = useState(null);
  const areaDebounceRef = useRef(null);
  const areaInputRef    = useRef(null);

  // Pincode lookup state
  const [pinLoading, setPinLoading] = useState(false);
  const [pinStatus,  setPinStatus]  = useState(""); // "" | "success" | "error" | "invalid"
  const [pinInfo,    setPinInfo]    = useState(null); // { city, state }

  const finalLabel = label === "Other" ? customLabel : label;

  // ── Pincode → Region auto-detect (India Post API) ───────────────────────
  async function lookupPincode(pin) {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setPinStatus(pin.length > 0 ? "invalid" : "");
      setPinInfo(null);
      return;
    }
    setPinLoading(true); setPinStatus(""); setPinInfo(null);
    try {
      const data = await fetch(`https://api.postalpincode.in/pincode/${pin}`).then((r) => r.json());
      const info = data?.[0];
      if (info?.Status === "Success" && info.PostOffice?.length > 0) {
        const po    = info.PostOffice[0];
        const city  = po.District || po.Name || "";
        const state = po.State || "";
        const regionStr = [city, state].filter(Boolean).join(", ");
        setRegion(regionStr);
        setPinInfo({ city, state, postOffices: info.PostOffice.length });
        setPinStatus("success");
      } else {
        setPinStatus("error");
      }
    } catch {
      setPinStatus("error");
    } finally {
      setPinLoading(false);
    }
  }

  function handlePincodeChange(e) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPincode(val);
    setPinStatus(""); setPinInfo(null);
    if (val.length === 6) lookupPincode(val);
  }

  // ── GPS detect ────────────────────────────────────────────────────────────────
  function detectGps() {
    if (!navigator.geolocation) { setErr("Geolocation not supported."); return; }
    setGpsLoading(true); setGpsStatus(""); setErr("");
    function tryPos(opts, fallback) {
      navigator.geolocation.getCurrentPosition(
        (pos) => handlePos(pos),
        (e) => { if (fallback) fallback(); else { setGpsLoading(false); setGpsStatus("error"); setErr("Location unavailable. Use search below."); } },
        opts
      );
    }
    tryPos({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }, () =>
      tryPos({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }, null)
    );
  }

  async function handlePos(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    setGpsAccuracy(Math.round(accuracy));
    try {
      // BigDataCloud — fast, free, good for India
      let filled = false;
      try {
        const bdc = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
        ).then((r) => r.json());
        const informative = bdc.localityInfo?.informative ?? [];
        const sorted = [...informative].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
        const finest = sorted.find((l) => l.name && l.name.length > 1)?.name || "";
        const locality = bdc.locality || finest || "";
        const city     = bdc.city || locality || "";
        const state    = bdc.principalSubdivision || "";
        const post     = bdc.postcode || "";
        if (city || state) {
          setRegion([locality || city, state].filter(Boolean).join(", "));
          const addrParts = [finest, locality !== city ? locality : "", city, state, post]
            .filter((v, i, a) => v && a.indexOf(v) === i);
          setAddress(addrParts.join(", "));
          if (post) setPincode(post.replace(/\D/g, "").slice(0, 6));
          filled = true;
        }
      } catch { /* fall through */ }

      // Nominatim fallback
      if (!filled) {
        const nom = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=18&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        ).then((r) => r.json());
        const addr = nom.address ?? {};
        const hood = addr.neighbourhood || addr.suburb || addr.quarter || addr.village || "";
        const city = addr.city || addr.town || addr.municipality || hood || "";
        const state = addr.state || "";
        const post  = addr.postcode || "";
        if (city || state) setRegion([hood || city, state].filter(Boolean).join(", "));
        if (post) setPincode(post.replace(/\D/g, "").slice(0, 6));
        setAddress([addr.road || "", hood, city, state, post].filter((v, i, a) => v && a.indexOf(v) === i).join(", "));
      }

      setGpsStatus("success");
      if (accuracy > 1500) setErr(`GPS ±${Math.round(accuracy)}m — colony may be off. Use search to correct.`);
    } catch {
      setGpsStatus("error");
      setErr("Could not resolve address. Enter manually.");
    } finally {
      setGpsLoading(false);
    }
  }

  // ── Colony search (Photon) ────────────────────────────────────────────────────
  async function searchArea(query) {
    if (!query || query.trim().length < 3) { setAreaSuggestions([]); return; }
    setAreaLoading(true);
    try {
      const data = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=en&limit=7&bbox=68.0,6.5,97.5,35.7`
      ).then((r) => r.json());
      const suggestions = (data?.features ?? [])
        .filter((f) => !f.properties?.country || f.properties.country.toLowerCase().includes("india"))
        .map((f) => {
          const p = f.properties ?? {};
          const hood  = p.name || p.locality || p.street || "";
          const city  = p.city || p.district || p.county || "";
          const state = p.state || "";
          const pin   = p.postcode || "";
          const parts = [hood, city, state].filter((v, i, a) => v && a.indexOf(v) === i);
          return { label: parts.join(", ") || p.name || "Unknown", hood, city, state, pin };
        })
        .filter((s) => s.label)
        .slice(0, 6);
      setAreaSuggestions(suggestions);
    } catch { setAreaSuggestions([]); }
    finally { setAreaLoading(false); }
  }

  function handleAreaInput(e) {
    const val = e.target.value;
    setAreaQuery(val);
    if (!val.trim()) { setAreaSuggestions([]); return; }
    if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
    areaDebounceRef.current = setTimeout(() => searchArea(val), 400);
    if (areaInputRef.current) setAreaRect(areaInputRef.current.getBoundingClientRect());
  }

  function selectArea(s) {
    setRegion([s.hood || s.city, s.state].filter(Boolean).join(", "));
    setAddress([s.hood, s.city, s.state, s.pin].filter((v, i, a) => v && a.indexOf(v) === i).join(", "));
    if (s.pin) setPincode(s.pin.replace(/\D/g, "").slice(0, 6));
    setAreaQuery(""); setAreaSuggestions([]); setAreaRect(null); setErr("");
  }

  // ── Submit ─────────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!region.trim())    return setErr("Region / city is required");
    if (!address.trim())   return setErr("Full address is required");
    if (!finalLabel.trim()) return setErr("Label is required");
    setSaving(true);
    try {
      await onSave({ label: finalLabel.trim(), region: region.trim(), address: address.trim(), pincode: pincode.trim(), is_default: isDefault });
      onClose();
    } catch (ex) { setErr(ex.message ?? "Failed to save"); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 sticky top-0 z-10">
          <h2 className="text-base font-semibold text-slate-900">
            {isEditing ? "✏️ Edit Address" : "Add Delivery Address"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Quick-fill at checkout with the saved address</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Label */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-700">Label</label>
            <div className="flex flex-wrap gap-2">
              {LABEL_OPTIONS.map((l) => (
                <button key={l} type="button" onClick={() => setLabel(l)}
                  className={["rounded-full border px-3 py-1 text-xs font-semibold transition-all",
                    label === l ? "bg-slate-900 text-white border-slate-900" : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  ].join(" ")}>
                  {l === "Home" ? "🏠" : l === "Office" ? "🏢" : l === "Shop" ? "🏪" : l === "Warehouse" ? "🏭" : "📍"} {l}
                </button>
              ))}
            </div>
            {label === "Other" && (
              <input type="text" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Enter custom label…" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
            )}
          </div>

          <hr className="border-slate-100" />

          {/* ── Option 1: GPS Live Location ── */}
          <div>
            <p className="mb-2 text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <span>📍</span> Option 1 — Live GPS Location
            </p>
            <button type="button" onClick={detectGps} disabled={gpsLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-400 active:scale-95 transition-all disabled:opacity-60">
              {gpsLoading
                ? <><span className="inline-block h-4 w-4 rounded-full border-2 border-slate-400 border-t-slate-700 animate-spin" /> Detecting…</>
                : gpsStatus === "success"
                ? <><span className="text-emerald-600">✅</span> Detected — tap to re-detect</>
                : <><span>📍</span> Detect My Current Location</>}
            </button>
            {gpsAccuracy && (
              <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5">
                <p className="text-xs text-amber-800 font-medium">GPS ±{gpsAccuracy}m — pincode &amp; state auto-filled. Use Option 2 to correct colony name.</p>
              </div>
            )}
          </div>

          {/* ── Option 2: Search Colony ── */}
          <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3">
            <p className="mb-2 text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1">
              <span>🔍</span> Option 2 — Search Colony / Area
              <span className="ml-1 rounded-full bg-blue-600 text-white text-[10px] px-1.5 py-0.5 font-bold">RECOMMENDED</span>
            </p>
            <div className="relative">
              <input
                ref={areaInputRef}
                type="text"
                value={areaQuery}
                onChange={handleAreaInput}
                onFocus={() => { if (areaInputRef.current) setAreaRect(areaInputRef.current.getBoundingClientRect()); }}
                placeholder="e.g. Jagpura, Jaipur…"
                className="w-full rounded-xl border-2 border-blue-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
              {areaLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-blue-600">Type your colony → pick from dropdown to auto-fill</p>
          </div>

          {/* Dropdown portal */}
          {areaSuggestions.length > 0 && areaRect && (
            <div style={{ position: "fixed", top: areaRect.bottom + 4, left: areaRect.left, width: areaRect.width, zIndex: 9999 }}
              className="rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
              {areaSuggestions.map((s, i) => (
                <button key={i} type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectArea(s); }}
                  className="block w-full px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-blue-50 border-b border-slate-100 last:border-none transition-colors">
                  <span className="font-semibold text-blue-600">📍 </span>{s.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Option 3: Manual Entry ── */}
          <div>
            <p className="mb-2 text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <span>✏️</span> Option 3 — Enter Manually
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Pincode
                  <span className="ml-1 font-normal text-slate-400">(auto-fills region)</span>
                </label>
                <div className="relative">
                  <input
                    type="text" inputMode="numeric" maxLength={6} value={pincode}
                    onChange={handlePincodeChange}
                    placeholder="e.g. 302001"
                    className={[
                      "w-full rounded-xl border px-3 py-2 text-sm outline-none transition-all pr-9",
                      pinStatus === "success" ? "border-emerald-400 bg-emerald-50" :
                      pinStatus === "error" || pinStatus === "invalid" ? "border-red-400 bg-red-50" :
                      "border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
                    ].join(" ")}
                  />
                  {pinLoading && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                    </span>
                  )}
                  {!pinLoading && pinStatus === "success" && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-sm">✓</span>
                  )}
                  {!pinLoading && (pinStatus === "error" || pinStatus === "invalid") && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</span>
                  )}
                </div>
                {pinStatus === "success" && pinInfo && (
                  <div className="mt-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                    <p className="text-xs text-emerald-700 font-semibold">
                      ✅ {pinInfo.city}, {pinInfo.state} — Region auto-filled!
                    </p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">{pinInfo.postOffices} post office{pinInfo.postOffices > 1 ? "s" : ""} found in this pincode</p>
                  </div>
                )}
                {pinStatus === "error" && (
                  <p className="mt-1 text-xs text-red-500">Pincode not found. Check and try again.</p>
                )}
                {pinStatus === "invalid" && (
                  <p className="mt-1 text-xs text-amber-600">Enter a valid 6-digit pincode.</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Region / City <span className="text-red-500">*</span></label>
                <input type="text" value={region} onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. Jagpura, Jaipur, Rajasthan"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Full Address <span className="text-red-500">*</span></label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3}
                  placeholder="House no., street, colony, landmark…"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none resize-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
              </div>
            </div>
          </div>

          {/* Default toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-50 rounded-xl px-3 py-2.5">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}
              className="rounded border-slate-300 h-4 w-4" />
            <span className="text-xs font-medium text-slate-700">Set as default delivery address</span>
          </label>

          {err && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-medium">{err}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-all active:scale-95">
              {saving ? "Saving…" : isEditing ? "Update Address" : "Save Address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Profile Page ─────────────────────────────────────────────────────────
export function CustomerProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile,       setProfile]       = useState({ display_name: "", phone: "", business_name: "", email: "" });
  const [profileLoading,setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving]  = useState(false);
  const [profileDirty,  setProfileDirty]   = useState(false);

  const [addresses,   setAddresses]   = useState([]);
  const [addrLoading, setAddrLoading] = useState(true);
  const [showAddModal,setShowAddModal] = useState(false);
  const [editingAddr, setEditingAddr] = useState(null); // address being edited
  const [deletingId,  setDeletingId]  = useState(null);

  const [toast, setToast] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    customerApi("/api/customer/profile")
      .then((r) => { if (r.success) setProfile(r.data); })
      .catch(() => {})
      .finally(() => setProfileLoading(false));

    customerApi("/api/customer/addresses")
      .then((r) => { if (r.success) setAddresses(r.data ?? []); })
      .catch(() => {})
      .finally(() => setAddrLoading(false));
  }, []);

  // ── Profile save ───────────────────────────────────────────────────────────────
  async function saveProfile(e) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const r = await customerApi("/api/customer/profile", { method: "PUT", body: JSON.stringify(profile) });
      if (r.success) { setProfile(r.data); setProfileDirty(false); setToast({ message: "Profile saved!", type: "success" }); }
      else setToast({ message: r.error ?? "Failed to save", type: "error" });
    } catch (e) { setToast({ message: e.message ?? "Failed", type: "error" }); }
    finally { setProfileSaving(false); }
  }

  function handleProfileChange(key, val) {
    setProfile((p) => ({ ...p, [key]: val }));
    setProfileDirty(true);
  }

  // ── Add address ────────────────────────────────────────────────────────────────
  async function handleAddAddress(payload) {
    const r = await customerApi("/api/customer/addresses", { method: "POST", body: JSON.stringify(payload) });
    if (!r.success) throw new Error(r.error ?? "Failed");
    setAddresses((prev) => {
      const next = payload.is_default ? prev.map((a) => ({ ...a, is_default: false })) : [...prev];
      return [r.data, ...next];
    });
    setToast({ message: "Address saved!", type: "success" });
  }

  // ── Edit address ───────────────────────────────────────────────────────────────
  async function handleEditAddress(payload) {
    const id = editingAddr?.id;
    if (!id) return;
    const r = await customerApi(`/api/customer/addresses/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    if (!r.success) throw new Error(r.error ?? "Failed");
    setAddresses((prev) => prev.map((a) => {
      if (a.id === id) return r.data;
      return payload.is_default ? { ...a, is_default: false } : a;
    }));
    setToast({ message: "Address updated!", type: "success" });
    setEditingAddr(null);
  }

  // ── Set default ────────────────────────────────────────────────────────────────
  async function handleSetDefault(id) {
    try {
      await customerApi(`/api/customer/addresses/${id}/default`, { method: "PUT" });
      setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
      setToast({ message: "Default address updated", type: "success" });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    setDeletingId(id);
    try {
      await customerApi(`/api/customer/addresses/${id}`, { method: "DELETE" });
      setAddresses((prev) => prev.filter((a) => a.id !== id));
      setToast({ message: "Address removed", type: "success" });
    } catch (e) { setToast({ message: e.message, type: "error" }); }
    finally { setDeletingId(null); }
  }

  const displayName = profile.display_name || user?.email || "?";

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-6">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white text-xl font-bold shadow-lg select-none">
              {displayName[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">My Profile</h1>
              <p className="text-sm text-slate-500">
                {profile.business_name ? `${profile.business_name} · ` : ""}
                {user?.email ?? ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-8 space-y-8">

        {/* ── Personal Info ── */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">👤</span>
              <h2 className="text-sm font-semibold text-slate-900">Personal Information</h2>
            </div>
            {profileDirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Unsaved changes</span>}
          </div>
          {profileLoading ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">Loading…</div>
          ) : (
            <form onSubmit={saveProfile} className="px-6 py-6 space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Full Name</label>
                  <input type="text" value={profile.display_name} onChange={(e) => handleProfileChange("display_name", e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 transition-all" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Mobile Number</label>
                  <input type="tel" inputMode="numeric" value={profile.phone} onChange={(e) => handleProfileChange("phone", e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 transition-all" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Email Address</label>
                  <input type="email" value={profile.email} onChange={(e) => handleProfileChange("email", e.target.value)}
                    placeholder="e.g. priya@example.com"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 transition-all" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">Business / Shop Name</label>
                  <input type="text" value={profile.business_name} onChange={(e) => handleProfileChange("business_name", e.target.value)}
                    placeholder="e.g. Sharma Kirana Store"
                    className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-200 transition-all" />
                </div>
              </div>
              {user?.email && (
                <p className="text-xs text-slate-400">🔐 Signed in as: <span className="font-medium text-slate-600">{user.email}</span></p>
              )}
              <button type="submit" disabled={profileSaving || !profileDirty}
                className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40 transition-all active:scale-95">
                {profileSaving ? "Saving…" : "Save Profile"}
              </button>
            </form>
          )}
        </section>

        {/* ── Saved Addresses ── */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">📦</span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Saved Delivery Addresses</h2>
                <p className="text-xs text-slate-500">Appear as quick-fill at checkout</p>
              </div>
            </div>
            <button type="button" onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition-all active:scale-95">
              <span className="text-base leading-none">+</span> Add Address
            </button>
          </div>

          {addrLoading ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">Loading…</div>
          ) : addresses.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-3xl mb-3">📍</p>
              <p className="text-sm font-medium text-slate-600">No saved addresses yet</p>
              <p className="text-xs text-slate-400 mt-1">Add your shop/home address for quick checkout</p>
              <button onClick={() => setShowAddModal(true)}
                className="mt-4 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition-all">
                + Add First Address
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {addresses.map((addr) => (
                <div key={addr.id} className="flex items-start gap-4 px-6 py-4 hover:bg-slate-50/60 transition-colors">
                  <div className={["flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg",
                    addr.is_default ? "bg-emerald-100" : "bg-slate-100"].join(" ")}>
                    {addr.label === "Home" ? "🏠" : addr.label === "Office" ? "🏢" : addr.label === "Shop" ? "🏪" : addr.label === "Warehouse" ? "🏭" : "📍"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{addr.label}</span>
                      {addr.is_default && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase">Default</span>}
                      {addr.pincode && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{addr.pincode}</span>}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5 font-medium">{addr.region}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{addr.address}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditingAddr(addr)}
                      className="rounded-lg border border-blue-200 px-2.5 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50 transition-all whitespace-nowrap">
                      ✏️ Edit
                    </button>
                    {!addr.is_default && (
                      <button onClick={() => handleSetDefault(addr.id)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 transition-all whitespace-nowrap">
                        Set Default
                      </button>
                    )}
                    <button onClick={() => handleDelete(addr.id)} disabled={deletingId === addr.id}
                      className="rounded-lg border border-red-100 px-2.5 py-1 text-[10px] font-semibold text-red-500 hover:bg-red-50 transition-all disabled:opacity-40">
                      {deletingId === addr.id ? "…" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Account Info ── */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-2">
            <span className="text-lg">🔐</span>
            <h2 className="text-sm font-semibold text-slate-900">Account</h2>
          </div>
          <div className="px-6 py-5 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-900">{user?.email ?? "—"}</span>
            </div>
            {user?.phone && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Phone</span>
                <span className="font-medium text-slate-900">{user.phone}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Role</span>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 capitalize">Customer</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Member since</span>
              <span className="font-medium text-slate-900">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
              </span>
            </div>
          </div>
        </section>

        {/* ── Businesses ── */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-2">
            <span className="text-lg">🏢</span>
            <h2 className="text-sm font-semibold text-slate-900">Businesses</h2>
          </div>
          <div className="px-6 py-5 space-y-3">
            <p className="text-xs text-slate-500">
              You can shop from multiple businesses using a single account.
            </p>
            <button
              id="join-another-business-profile-btn"
              type="button"
              onClick={() => navigate("/join")}
              className="flex w-full items-center justify-between rounded-xl border border-dashed border-indigo-300 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-100 hover:border-indigo-400 transition-all active:scale-[0.98]"
            >
              <span className="flex items-center gap-2">
                <span className="text-base">＋</span>
                Join Another Business
              </span>
              <span className="text-indigo-400">→</span>
            </button>
            <button
              type="button"
              onClick={() => navigate("/select-business")}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all"
            >
              <span className="flex items-center gap-2">
                <span className="text-base">🔄</span>
                Switch Business
              </span>
              <span className="text-slate-400">→</span>
            </button>
          </div>
        </section>

      </div>

      {showAddModal && <AddressModal onSave={handleAddAddress} onClose={() => setShowAddModal(false)} />}
      {editingAddr  && <AddressModal onSave={handleEditAddress} onClose={() => setEditingAddr(null)} initial={editingAddr} />}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
