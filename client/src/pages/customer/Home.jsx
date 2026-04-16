import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { customerApi } from "../../lib/customerApi.js";
import { useAuth } from "../../context/AuthContext";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function customerDisplayName(user) {
  if (!user) return "there";
  const meta = user.user_metadata ?? {};
  if (typeof meta.full_name === "string" && meta.full_name.trim())
    return meta.full_name.trim().split(" ")[0];
  if (typeof meta.name === "string" && meta.name.trim())
    return meta.name.trim().split(" ")[0];
  // Don't fall back to raw phone — wait for profile API instead
  if (user.email) return user.email.split("@")[0];
  return "there";
}

function rupee(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

// ─── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type = "success", onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div
      className={[
        "fixed bottom-20 sm:bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl transition-all",
        type === "success" ? "bg-emerald-600" : "bg-red-600",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

// ─── Business Details Modal ────────────────────────────────────────────────────

function BusinessDetailModal({ info, onClose }) {
  if (!info) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-violet-500" />
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Seller Information</h3>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
          </div>
          {/* Logo + Name */}
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-100 p-3">
            {info.logo_url ? (
              <img src={info.logo_url} alt={info.business_name} className="h-12 w-12 rounded-xl object-contain bg-white border border-slate-200 p-1" />
            ) : (
              <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                {(info.business_name || "B").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-bold text-slate-900">{info.business_name}</p>
              {info.business_type && <p className="text-xs text-slate-500">{info.business_type}</p>}
            </div>
          </div>
          {/* Details */}
          <div className="space-y-2 text-sm">
            {info.address && (
              <div className="flex items-start gap-2 text-slate-700">
                <span className="text-base shrink-0">📍</span>
                <span>{info.address}</span>
              </div>
            )}
            {info.gst_number && (
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <span>🏛️</span> GST: {info.gst_number}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product Detail Modal (Customer) ──────────────────────────────────────────

function ProductDetailModal({ item, cartQty, onAdd, onRemove, onChangeQty, businessInfo, onClose }) {
  const [activeImg, setActiveImg] = useState(0);
  const overlayRef = useRef(null);

  // Build image list from image_urls or fallback to image_url
  const images = Array.isArray(item.image_urls) && item.image_urls.length > 0
    ? item.image_urls
    : item.image_url ? [item.image_url] : [];

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isLow = item.low_stock_alert > 0 && item.quantity <= item.low_stock_alert;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div className="relative w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">

        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center text-slate-500 hover:text-slate-800 shadow-sm border border-slate-200 text-sm font-bold"
        >✕</button>

        {/* Image Gallery */}
        <div className="relative bg-slate-100 shrink-0" style={{ height: images.length > 0 ? 260 : 0 }}>
          {images.length > 0 ? (
            <>
              <img
                key={activeImg}
                src={images[activeImg]}
                alt={`${item.name} photo ${activeImg + 1}`}
                className="w-full h-full object-cover"
                style={{ animation: "fadeIn 0.2s ease" }}
              />
              {/* Prev / Next */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveImg((i) => (i - 1 + images.length) % images.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow text-slate-700 hover:bg-white"
                  >‹</button>
                  <button
                    type="button"
                    onClick={() => setActiveImg((i) => (i + 1) % images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow text-slate-700 hover:bg-white"
                  >›</button>
                  {/* Dots */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveImg(i)}
                        className={`h-1.5 rounded-full transition-all ${i === activeImg ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
                      />
                    ))}
                  </div>
                </>
              )}
              {/* Thumbnail strip */}
              {images.length > 1 && (
                <div className="absolute bottom-0 left-0 right-0 flex gap-1.5 px-3 pb-7 overflow-x-auto">
                  {images.map((src, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveImg(i)}
                      className={`shrink-0 h-9 w-9 rounded-lg overflow-hidden border-2 transition ${i === activeImg ? "border-white shadow-lg" : "border-transparent opacity-60 hover:opacity-90"}`}
                    >
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-32 flex items-center justify-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-600 to-slate-900 flex items-center justify-center text-white font-bold text-2xl">
                {item.name.slice(0, 2).toUpperCase()}
              </div>
            </div>
          )}
        </div>

        {/* Details — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Name + badges */}
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 leading-tight">{item.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${isLow ? "bg-amber-100 text-amber-700 ring-amber-200" : "bg-emerald-100 text-emerald-700 ring-emerald-200"}`}>
                {isLow ? "⚠ Low Stock" : "✓ In Stock"}
              </span>
              <span className="rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ring-slate-200">
                {item.stage}
              </span>
              {businessInfo?.business_name && (
                <span className="text-xs text-slate-400">Sold by <span className="font-medium text-slate-600">{businessInfo.business_name}</span></span>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {rupee(item.unit_price)}
                <span className="ml-1 text-sm font-normal text-slate-400">/ {item.unit || "unit"}</span>
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{item.quantity} units available</p>
            </div>
          </div>

          {/* Description */}
          {item.description && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">About this product</p>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{item.description}</p>
            </div>
          )}

          {/* Details table */}
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            {[
              { label: "Stage",      value: item.stage },
              { label: "Unit",       value: item.unit || "piece" },
              { label: "Available",  value: `${item.quantity} units` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0 border-slate-100">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs font-semibold text-slate-800 capitalize">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Add to Cart sticky footer */}
        <div className="shrink-0 px-5 py-4 border-t border-slate-100 bg-white">
          {cartQty === 0 ? (
            <button
              type="button"
              onClick={() => onAdd(item)}
              className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white hover:bg-slate-700 active:scale-95 transition-all"
            >
              🛒 Add to Cart
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 flex-1 justify-center rounded-xl border border-slate-200 py-2.5">
                <button type="button" onClick={() => onChangeQty(item.id, Math.max(0, cartQty - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 font-bold text-slate-700 hover:bg-slate-200">−</button>
                <span className="w-8 text-center text-base font-bold tabular-nums">{cartQty}</span>
                <button type="button" onClick={() => onChangeQty(item.id, Math.min(item.quantity, cartQty + 1))}
                  disabled={cartQty >= item.quantity}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-bold text-white hover:bg-slate-700 disabled:opacity-30">+</button>
              </div>
              <button type="button" onClick={() => onRemove(item.id)}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition">
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes fadeIn { from { opacity:0 } to { opacity:1 } }`}</style>
    </div>
  );
}

// ─── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ item, cartQty, onAdd, onRemove, onChangeQty, businessInfo, onViewDetail }) {
  const [showDetails, setShowDetails] = useState(false);
  const [imgErr,      setImgErr]      = useState(false);

  // Reset error state when product changes (prevents stale error from previous render)
  useEffect(() => { setImgErr(false); }, [item.id]);

  const isLow = item.low_stock_alert > 0 && item.quantity <= item.low_stock_alert;

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:shadow-md active:scale-[0.99]">

      {/* ── MOBILE layout: horizontal row ──────────────────────────── */}
      <div className="flex flex-row sm:flex-col h-full">

        {/* Left accent — vertical stripe on mobile, hidden on desktop (desktop has top bar) */}
        <div className="w-1 shrink-0 bg-gradient-to-b from-slate-700 to-slate-900 sm:hidden" />

        {/* Desktop-only top accent bar */}
        <div className="hidden sm:block h-1.5 w-full bg-gradient-to-r from-slate-800 to-slate-600" />

        {/* ── Product Image ───────────────────────────────────────── */}
        <div
          className="relative bg-slate-100 overflow-hidden cursor-pointer group shrink-0
                     w-[88px] h-[88px] m-2 rounded-xl
                     sm:m-0 sm:w-full sm:h-40 sm:rounded-none"
          onClick={() => onViewDetail(item)}
        >
          {item.image_url && !imgErr ? (
            <img
              src={item.image_url}
              alt={item.name}
              onError={() => setImgErr(true)}
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover sm:group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900">
              <span className="text-white font-bold text-xl sm:text-2xl">
                {item.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}

          {/* Stage tag — top-right on desktop, hidden on mobile (shown in content column) */}
          <span className="hidden sm:inline-flex absolute top-2 right-2 rounded-full bg-white/90 backdrop-blur-sm px-2 py-0.5 text-xs font-medium capitalize text-slate-600 shadow-sm border border-slate-200">
            {item.stage}
          </span>

          {/* Cart qty badge overlay */}
          {cartQty > 0 && (
            <span className="absolute bottom-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white shadow">
              {cartQty}
            </span>
          )}

          {/* Hover hint — desktop only */}
          <div className="hidden sm:flex absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold text-white bg-black/50 rounded-full px-3 py-1 backdrop-blur-sm">
              View Details
            </span>
          </div>

          {/* Photo count */}
          {Array.isArray(item.image_urls) && item.image_urls.length > 1 && (
            <span className="absolute bottom-1 right-1 rounded-full bg-black/50 text-white text-[10px] px-1.5 py-0.5 font-medium backdrop-blur-sm">
              📷 {item.image_urls.length}
            </span>
          )}
        </div>

        {/* ── Content column ─────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col justify-between min-w-0 px-3 py-2.5 sm:p-4 gap-1.5 sm:gap-2.5">

          {/* Name + Sold by */}
          <div className="space-y-0.5">
            <h3
              className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2 cursor-pointer hover:text-indigo-700 transition-colors"
              onClick={() => onViewDetail(item)}
            >
              {item.name}
            </h3>

            {businessInfo?.business_name && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-[11px] text-slate-400">
                  Sold by: <span className="font-semibold text-slate-600">{businessInfo.business_name}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
                >
                  Details
                </button>
              </div>
            )}

            {/* Stage chip — mobile only (desktop shows it on image overlay) */}
            <span className="inline-flex sm:hidden rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 text-[10px] font-medium capitalize border border-slate-200">
              {item.stage}
            </span>
          </div>

          {/* Price + Stock */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {item.unit_price != null ? (
              <p className="text-base sm:text-xl font-bold tabular-nums text-slate-900">
                {rupee(item.unit_price)}
                <span className="ml-0.5 text-[11px] sm:text-xs font-normal text-slate-400">
                  / {item.unit || "unit"}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-400 italic">Price on request</p>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${
              isLow
                ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200"
                : "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
            }`}>
              {isLow ? "⚠ Low Stock" : "✓ In Stock"}
            </span>
          </div>

          {/* Cart controls */}
          <div>
            {cartQty === 0 ? (
              <button
                type="button"
                onClick={() => onAdd(item)}
                className="w-full rounded-xl bg-slate-900 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-slate-700 active:scale-95 transition-all"
              >
                Add to Cart
              </button>
            ) : (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 active:scale-90 transition-all font-bold text-base"
                >
                  −
                </button>
                <input
                  type="number" min={1} max={item.quantity} value={cartQty}
                  onChange={(e) => onChangeQty(item.id, Math.min(item.quantity, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-slate-300 px-2 py-1 sm:py-1.5 text-center text-sm font-semibold outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <button
                  type="button"
                  onClick={() => onChangeQty(item.id, Math.min(item.quantity, cartQty + 1))}
                  disabled={cartQty >= item.quantity}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white hover:bg-slate-700 active:scale-90 transition-all font-bold text-base disabled:opacity-30"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Business details modal */}
      {showDetails && (
        <BusinessDetailModal info={businessInfo} onClose={() => setShowDetails(false)} />
      )}
    </div>
  );
}


// ─── Confirm Order Modal ────────────────────────────────────────────────────────


function ConfirmModal({ cart, products, onCancel, onConfirm, placing }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState("");

  // GPS state
  const [locLoading, setLocLoading] = useState(false);
  const [locStatus, setLocStatus] = useState(""); // "" | "success" | "error" | "low-accuracy"
  const [gpsAccuracy, setGpsAccuracy] = useState(null); // metres

  // Pincode state
  const [pinLoading, setPinLoading] = useState(false);
  const [pinStatus, setPinStatus] = useState(""); // "" | "success" | "error" | "invalid"

  // Area/colony search state
  const [areaQuery, setAreaQuery] = useState("");
  const [areaSuggestions, setAreaSuggestions] = useState([]);
  const [areaLoading, setAreaLoading] = useState(false);
  const [areaInputRect, setAreaInputRect] = useState(null); // for fixed dropdown position
  const areaDebounceRef = useRef(null); // stable timer ref, never resets
  const areaInputRef = useRef(null); // ref to the search input

  // Saved addresses from profile
  const [savedAddresses, setSavedAddresses] = useState([]);

  useEffect(() => {
    customerApi("/api/customer/addresses")
      .then((r) => { if (r.success) setSavedAddresses(r.data ?? []); })
      .catch(() => { });
  }, []);


  const subtotal = cart.reduce((s, ci) => {
    const p = products.find((x) => x.id === ci.item_id);
    return s + (Number(p?.unit_price) || 0) * ci.quantity;
  }, 0);

  // ── GPS Auto-detect ────────────────────────────────────────────────────────
  function detectLocation() {
    if (!navigator.geolocation) {
      setLocStatus("error");
      setErr("Geolocation is not supported in this browser.");
      return;
    }
    setLocLoading(true);
    setLocStatus("");
    setErr("");

    // Try high-accuracy first, fall back to low-accuracy if it fails
    function tryPosition(opts, fallback) {
      navigator.geolocation.getCurrentPosition(
        (pos) => handleGotPosition(pos),
        (geoErr) => {
          if (fallback) {
            fallback();
          } else {
            setLocLoading(false);
            setLocStatus("error");
            if (geoErr.code === 1) setErr("Location permission denied. Use area search below.");
            else setErr("Location unavailable. Use area search or pincode below.");
          }
        },
        opts
      );
    }

    // Try GPS (high accuracy), timeout 8s
    tryPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }, () => {
      // Fallback: network-based (less accurate, faster)
      tryPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }, null);
    });
  }

  async function handleGotPosition(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    setGpsAccuracy(Math.round(accuracy));

    const LOW_ACCURACY = accuracy > 1500; // metres

    try {
      // ── Primary: BigDataCloud — fast + free ──────────────────────────────
      let filled = false;
      try {
        const bdcRes = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
        );
        const bdc = await bdcRes.json();

        // Walk localityInfo.informative from most-specific to least-specific
        const informative = bdc.localityInfo?.informative ?? [];
        // Sort descending by order (higher order = more specific)
        const sorted = [...informative].sort((a, b) => (b.order ?? 0) - (a.order ?? 0));
        const finestLocality = sorted.find((l) => l.name && l.name.length > 1)?.name || "";

        const locality = bdc.locality || finestLocality || "";
        const city = bdc.city || bdc.principalSubdivision2 || locality || "";
        const state = bdc.principalSubdivision || "";
        const postcode = bdc.postcode || "";

        if (city || state) {
          // For region: use finest locality + state for precision
          const regionParts = [locality || city, state].filter(Boolean);
          setRegion(regionParts.join(", "));

          // Address: colony/area, city, state, pin
          const addrParts = [finestLocality, locality !== city ? locality : "", city, state, postcode]
            .filter((v, i, a) => v && a.indexOf(v) === i);
          setAddress(addrParts.join(", "));
          if (postcode) setPincode(postcode.replace(/\D/g, "").slice(0, 6));
          filled = true;
        }
      } catch { /* fall through */ }

      // ── Fallback: Nominatim zoom=18 ──────────────────────────────────────
      if (!filled) {
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=18&addressdetails=1`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await nomRes.json();
        const addr = data.address ?? {};
        const road = addr.road || addr.pedestrian || addr.footway || "";
        const hood = addr.neighbourhood || addr.suburb || addr.quarter || addr.village || "";
        const city = addr.city || addr.town || addr.municipality || hood || "";
        const state = addr.state || "";
        const post = addr.postcode || "";
        if (city || state) setRegion([hood || city, state].filter(Boolean).join(", "));
        if (post) setPincode(post.replace(/\D/g, "").slice(0, 6));
        const parts = [road, hood, city, state, post].filter((v, i, a) => v && a.indexOf(v) === i);
        if (parts.length) setAddress(parts.join(", "));
      }

      setLocStatus(LOW_ACCURACY ? "low-accuracy" : "success");
      if (LOW_ACCURACY) {
        setErr(`📍 GPS accuracy is ±${Math.round(accuracy)}m — location may be approximate. Search your exact colony below.`);
      }
    } catch {
      setLocStatus("error");
      setErr("Could not resolve address. Use area search below.");
    } finally {
      setLocLoading(false);
    }
  }

  // ── Area / Colony Search — Photon API (komoot, no rate limit, great for India) ─
  async function searchArea(query) {
    if (!query || query.trim().length < 3) {
      setAreaSuggestions([]);
      return;
    }
    setAreaLoading(true);
    try {
      // Photon is OpenStreetMap-powered, no API key, no rate limit, great for India
      const res = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lang=en&limit=7&bbox=68.0,6.5,97.5,35.7`
        // bbox restricts results to India
      );
      const data = await res.json();
      const features = data?.features ?? [];
      const suggestions = features
        .filter((f) => {
          const c = f.properties?.country;
          return !c || c.toLowerCase().includes("india");
        })
        .map((f) => {
          const p = f.properties ?? {};
          const hood = p.name || p.locality || p.street || "";
          const city = p.city || p.district || p.county || "";
          const state = p.state || "";
          const pin = p.postcode || "";
          const parts = [hood, city, state].filter((v, i, a) => v && a.indexOf(v) === i);
          return { label: parts.join(", ") || p.name || "Unknown", hood, city, state, pin };
        })
        .filter((s) => s.label);
      setAreaSuggestions(suggestions.slice(0, 6));
    } catch {
      setAreaSuggestions([]);
    } finally {
      setAreaLoading(false);
    }
  }

  function handleAreaInput(e) {
    const val = e.target.value;
    setAreaQuery(val);
    if (!val.trim()) { setAreaSuggestions([]); return; }
    // Stable debounce using ref (not useState which resets every render)
    if (areaDebounceRef.current) clearTimeout(areaDebounceRef.current);
    areaDebounceRef.current = setTimeout(() => searchArea(val), 400);
    // Capture input position for fixed dropdown
    if (areaInputRef.current) {
      setAreaInputRect(areaInputRef.current.getBoundingClientRect());
    }
  }

  function selectArea(s) {
    setRegion([s.hood || s.city, s.state].filter(Boolean).join(", "));
    const addrParts = [s.hood, s.city, s.state, s.pin].filter((v, i, a) => v && a.indexOf(v) === i);
    setAddress(addrParts.join(", "));
    if (s.pin) setPincode(s.pin.replace(/\D/g, "").slice(0, 6));
    setAreaQuery("");
    setAreaSuggestions([]);
    setAreaInputRect(null);
    setErr("");
  }

  // ── Pincode Lookup (India Post API → District + State → Region) ─────────────
  async function lookupPincode(pin) {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setPinStatus(pin.length > 0 ? "invalid" : "");
      return;
    }
    setPinLoading(true);
    setPinStatus("");
    setErr("");
    try {
      const data = await fetch(`https://api.postalpincode.in/pincode/${pin}`).then((r) => r.json());
      const info = data?.[0];
      if (info?.Status === "Success" && Array.isArray(info.PostOffice) && info.PostOffice.length > 0) {
        const po = info.PostOffice[0];
        const city = po.District || po.Name || "";
        const state = po.State || "";
        // Set region = "District, State" — used by admin/driver for routing
        setRegion([city, state].filter(Boolean).join(", "));
        setPinStatus("success");
      } else {
        setPinStatus("error");
        setErr("Pincode not found. Please check and retry.");
      }
    } catch {
      setPinStatus("error");
      setErr("Could not look up pincode. Please fill in manually.");
    } finally {
      setPinLoading(false);
    }
  }


  function handlePincodeChange(e) {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setPincode(val);
    setPinStatus("");
    if (val.length === 6) lookupPincode(val);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!region.trim()) return setErr("Please enter a delivery region.");
    if (!address.trim()) return setErr("Please enter your delivery address.");
    setErr("");
    onConfirm({ region: region.trim(), address: address.trim(), preferred_date: date || null });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 sticky top-0 z-10">
          <h2 className="text-base font-semibold text-slate-900">Confirm Your Order</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {cart.length} item{cart.length !== 1 ? "s" : ""} · Total {rupee(subtotal)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Order summary */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100 max-h-28 overflow-y-auto">
            {cart.map((ci) => {
              const p = products.find((x) => x.id === ci.item_id);
              if (!p) return null;
              return (
                <div key={ci.item_id} className="flex justify-between px-3 py-2 text-xs">
                  <span className="text-slate-700 font-medium truncate mr-2">{p.name} × {ci.quantity}</span>
                  <span className="text-slate-600 shrink-0 tabular-nums">{rupee((Number(p.unit_price) || 0) * ci.quantity)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-sm font-semibold text-slate-900 border-t border-slate-200 pt-2">
            <span>Total</span>
            <span>{rupee(subtotal)}</span>
          </div>

          {/* ── Saved Addresses (from profile) ── */}
          {savedAddresses.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <span>⚡</span> Quick-fill from Saved Addresses
              </p>
              <div className="space-y-2">
                {savedAddresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setRegion(a.region);
                      setAddress(a.address);
                      if (a.pincode) setPincode(a.pincode);
                      setErr("");
                    }}
                    className={[
                      "w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all hover:shadow-sm active:scale-[0.99]",
                      a.is_default
                        ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                        : "border-slate-200 bg-white hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <span className="text-lg shrink-0">
                      {a.label === "Home" ? "🏠" : a.label === "Office" ? "🏢" : a.label === "Shop" ? "🏪" : a.label === "Warehouse" ? "🏭" : "📍"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-800">{a.label}</span>
                        {a.is_default && <span className="text-[9px] font-bold text-emerald-600 uppercase">Default</span>}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{a.region}{a.pincode ? ` · ${a.pincode}` : ""}</p>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">Use →</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 text-slate-300">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-[10px] font-medium text-slate-400">or fill manually below</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
            </div>
          )}

          {/* ── Step 1: GPS detect ── */}
          <div>
            <p className="mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 1 — Auto-fill Pincode &amp; State via GPS</p>
            <button
              type="button"
              onClick={detectLocation}
              disabled={locLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-400 active:scale-95 transition-all disabled:opacity-60"
            >
              {locLoading ? (
                <>
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-400 border-t-slate-700 animate-spin" />
                  Detecting GPS…
                </>
              ) : locStatus === "success" || locStatus === "low-accuracy" ? (
                <><span className="text-emerald-600">✅</span> GPS done — tap to re-detect</>
              ) : (
                <><span>📍</span> Detect My Location (gets Pincode &amp; State)</>
              )}
            </button>
            {gpsAccuracy && (
              <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-xs text-amber-800 font-semibold">
                  ✅ GPS accurate to ±{gpsAccuracy}m — pincode &amp; state auto-filled
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  ⚠️ Colony/area name may be wrong (free APIs use administrative boundaries, not colony names).
                  <strong> Use Step 2 below to enter your exact colony.</strong>
                </p>
              </div>
            )}
          </div>

          {/* ── Step 2: Colony/Area search ── */}
          <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3">
            <p className="mb-1.5 text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1">
              <span>🔍</span> Step 2 — Search Your Exact Colony / Area
              <span className="ml-1 rounded-full bg-blue-600 text-white text-[10px] px-1.5 py-0.5 font-bold">RECOMMENDED</span>
            </p>
            <div className="relative">
              <input
                ref={areaInputRef}
                type="text"
                value={areaQuery}
                onChange={handleAreaInput}
                onFocus={() => {
                  if (areaInputRef.current)
                    setAreaInputRect(areaInputRef.current.getBoundingClientRect());
                }}
                placeholder="Type colony name e.g. Jagpura, Jaipur…"
                className="w-full rounded-xl border-2 border-blue-300 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-medium"
              />
              {areaLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-blue-600 font-medium">
              ↑ Type here to find your exact colony — overrides GPS area name
            </p>
          </div>


          {/* Suggestions — rendered OUTSIDE scroll container via fixed positioning */}
          {areaSuggestions.length > 0 && areaInputRect && (
            <div
              style={{
                position: "fixed",
                top: areaInputRect.bottom + 4,
                left: areaInputRect.left,
                width: areaInputRect.width,
                zIndex: 9999,
              }}
              className="rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
            >
              {areaSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectArea(s); }}
                  className="block w-full px-3 py-2.5 text-left text-xs text-slate-700 hover:bg-blue-50 border-b border-slate-100 last:border-none transition-colors"
                >
                  <span className="font-semibold text-blue-600">📍 </span>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Pincode ── */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">
              Pincode
              <span className="ml-1 font-normal text-slate-400">(auto-fills district)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={pincode}
                onChange={handlePincodeChange}
                placeholder="e.g. 302001"
                className={[
                  "w-full rounded-xl border px-3 py-2 text-sm outline-none transition-all",
                  pinStatus === "success"
                    ? "border-emerald-400 bg-emerald-50"
                    : pinStatus === "error" || pinStatus === "invalid"
                      ? "border-red-400 bg-red-50"
                      : "border-slate-300 focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
                ].join(" ")}
              />
              {pinLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <span className="inline-block h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                </span>
              )}
              {!pinLoading && pinStatus === "success" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 font-bold">✓</span>
              )}
              {!pinLoading && (pinStatus === "error" || pinStatus === "invalid") && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 text-sm">✕</span>
              )}
            </div>
            {pinStatus === "success" && region && (
              <div className="mt-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5">
                <p className="text-xs text-emerald-700 font-semibold">✅ {region} — Region auto-filled!</p>
                <p className="text-[11px] text-emerald-600">Driver will be assigned based on this region</p>
              </div>
            )}
            {pinStatus === "error" && <p className="mt-1 text-xs text-red-500">Pincode not found. Check and try again.</p>}
            {pinStatus === "invalid" && <p className="mt-1 text-xs text-amber-600">Enter a valid 6-digit pincode.</p>}
          </div>

          {/* ── Editable fields ── */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Delivery Region <span className="text-red-500">*</span>
              </label>
              <input
                type="text" value={region} onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g. Jagpura, Jaipur, Rajasthan"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Delivery Address <span className="text-red-500">*</span>
              </label>
              <textarea
                value={address} onChange={(e) => setAddress(e.target.value)}
                rows={2} placeholder="Full delivery address (house no., street, colony…)"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 resize-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                Preferred Delivery Date <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="date" value={date} min={todayStr}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>

          {err && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-medium">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onCancel}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={placing}
              className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-all active:scale-95">
              {placing ? "Placing…" : "Place Order →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Cart Sidebar ──────────────────────────────────────────────────────────────


function CartSidebar({ cart, products, onClose, onClearItem, onChangeQty, onCheckout, onAddRec }) {
  const subtotal = cart.reduce((s, ci) => {
    const p = products.find((x) => x.id === ci.item_id);
    return s + (Number(p?.unit_price) || 0) * ci.quantity;
  }, 0);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 flex h-full w-full max-w-sm flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Cart
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({cart.reduce((s, c) => s + c.quantity, 0)} item{cart.reduce((s, c) => s + c.quantity, 0) !== 1 ? "s" : ""})
            </span>
          </h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">✕</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {cart.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">Your cart is empty.</p>
          ) : (
            <>
              {cart.map((ci) => {
                const p = products.find((x) => x.id === ci.item_id);
                if (!p) return null;
                const lineTotal = (Number(p.unit_price) || 0) * ci.quantity;
                return (
                  <div key={ci.item_id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex gap-2.5 flex-1 min-w-0">
                        {/* Mini thumbnail in cart */}
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} crossOrigin="anonymous" referrerPolicy="no-referrer" className="h-10 w-10 rounded-lg object-cover shrink-0 border border-slate-100" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                            {p.name.slice(0,2).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">{p.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {rupee(p.unit_price)} × {ci.quantity}
                            <span className="ml-2 font-semibold text-slate-700">= {rupee(lineTotal)}</span>
                          </p>
                        </div>
                      </div>
                      <button type="button" onClick={() => onClearItem(ci.item_id)}
                        className="text-slate-400 hover:text-red-500 transition-colors shrink-0 text-sm">✕</button>
                    </div>
                    {/* Qty controls */}
                    <div className="flex items-center gap-2 ml-12">
                      <button type="button" onClick={() => onChangeQty(ci.item_id, Math.max(1, ci.quantity - 1))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold">−</button>
                      <span className="w-8 text-center text-sm font-semibold tabular-nums">{ci.quantity}</span>
                      <button type="button" onClick={() => onChangeQty(ci.item_id, Math.min(p.quantity, ci.quantity + 1))}
                        disabled={ci.quantity >= p.quantity}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 font-bold disabled:opacity-30">+</button>
                      <span className="ml-1 text-xs text-slate-400">of {p.quantity}</span>
                    </div>
                  </div>
                );
              })}

              {/* Recommendations */}
              {(() => {
                const inCartIds = new Set(cart.map((c) => c.item_id));
                const recs = products
                  .filter((p) => !inCartIds.has(p.id) && p.quantity > 0)
                  .slice(0, 3);
                if (recs.length === 0) return null;
                return (
                  <div className="px-5 py-4 bg-slate-50">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">You might also like</p>
                    <div className="space-y-2">
                      {recs.map((p) => (
                        <div key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} crossOrigin="anonymous" referrerPolicy="no-referrer" className="h-9 w-9 rounded-lg object-cover shrink-0 border border-slate-100" />
                          ) : (
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                              {p.name.slice(0,2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">{p.name}</p>
                            <p className="text-xs text-slate-500">{rupee(p.unit_price)} / {p.unit || "unit"}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onAddRec(p)}
                            className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 transition-colors"
                          >+ Add</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="border-t border-slate-200 px-5 py-4 space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal ({cart.length} line{cart.length !== 1 ? "s" : ""})</span>
                <span className="tabular-nums">{rupee(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Discount</span>
                <span>₹0 (admin applies)</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-100 pt-1.5">
                <span>Total</span>
                <span className="tabular-nums">{rupee(subtotal)}</span>
              </div>
            </div>
            <button type="button" onClick={onCheckout}
              className="w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 active:scale-95 transition-all">
              Place Order →
            </button>
            <p className="text-center text-xs text-slate-400">
              Prices confirmed by admin. Discount applied at order processing.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function CustomerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Fetch profile name from DB (display_name saved in profiles table)
  const [profileName, setProfileName] = useState("");
  useEffect(() => {
    customerApi("/api/customer/profile")
      .then((r) => { if (r.success && r.data?.display_name) setProfileName(r.data.display_name.trim().split(" ")[0]); })
      .catch(() => { });
  }, []);
  // Use profileName if available, else fallback to user_metadata or email
  const firstName = profileName || customerDisplayName(user);

  // Business branding — for "Sold by" on product cards and Details modal
  const [businessInfo, setBusinessInfo] = useState(null);
  useEffect(() => {
    customerApi("/api/customer/business-info")
      .then((r) => { if (r.success && r.data) setBusinessInfo(r.data); })
      .catch(() => {});
  }, []);

  // Track selected business so products reload when business switches
  const [selectedBusinessId, setSelectedBusinessId] = useState(
    () => localStorage.getItem("selectedBusinessId") ?? ""
  );

  // Products
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  // Cart: [{ item_id, quantity }]
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  // Confirm modal + placing state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  // Toast
  const [toast, setToast] = useState(null); // { message, type }

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  // ── Sync selectedBusinessId from localStorage (handles business switches) ──
  useEffect(() => {
    function syncBusiness() {
      const id = localStorage.getItem("selectedBusinessId") ?? "";
      setSelectedBusinessId((prev) => (prev !== id ? id : prev));
    }
    window.addEventListener("storage", syncBusiness);
    // Also poll every 1s to catch same-tab changes (localStorage events don't fire in same tab)
    const interval = setInterval(syncBusiness, 1000);
    return () => { window.removeEventListener("storage", syncBusiness); clearInterval(interval); };
  }, []);

  // ── Fetch products ─────────────────────────────────────────────────────────
  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await customerApi("/api/customer/products");
      setProducts(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  // selectedBusinessId in deps ensures refetch when business switches
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBusinessId]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  // ── Handle reorder from Orders page ────────────────────────────────────────
  useEffect(() => {
    if (!location.state?.reorder) return;
    try {
      const raw = sessionStorage.getItem("reorder_items");
      if (!raw) return;
      const items = JSON.parse(raw);
      sessionStorage.removeItem("reorder_items");
      if (!Array.isArray(items) || items.length === 0) return;
      // Wait for products to load before setting cart
      const tryAdd = () => {
        setProducts((prods) => {
          if (prods.length === 0) return prods; // products not loaded yet
          const newCart = [];
          for (const it of items) {
            const found = prods.find((p) => p.id === it.item_id);
            if (found && found.quantity > 0) {
              newCart.push({ item_id: found.id, quantity: Math.min(it.quantity ?? 1, found.quantity) });
            }
          }
          if (newCart.length > 0) {
            setCart(newCart);
            setCartOpen(true);
            setToast({ message: `🔁 ${newCart.length} item(s) added to cart from previous order!`, type: "success" });
          }
          return prods;
        });
      };
      // Small delay to ensure products are loaded
      setTimeout(tryAdd, 600);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.reorder]);

  // ── Cart helpers ──────────────────────────────────────────────────

  function addToCart(item) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === item.id);
      if (existing) {
        const next = Math.min(item.quantity, existing.quantity + 1);
        return prev.map((c) => c.item_id === item.id ? { ...c, quantity: next } : c);
      }
      return [...prev, { item_id: item.id, quantity: 1 }];
    });
  }

  function removeFromCart(itemId) {
    setCart((prev) => prev.filter((c) => c.item_id !== itemId));
  }

  function changeQty(itemId, qty) {
    if (qty < 1) { removeFromCart(itemId); return; }
    setCart((prev) => prev.map((c) => c.item_id === itemId ? { ...c, quantity: qty } : c));
  }

  async function handlePlaceOrder({ region, address, preferred_date }) {
    setPlacing(true);
    try {
      const payload = {
        items: cart.map((c) => ({ item_id: c.item_id, quantity: c.quantity })),
        region,
        address,
        preferred_date,
      };
      const json = await customerApi('/api/customer/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!json.success) throw new Error(json.error ?? 'Order failed');
      setCart([]);
      setConfirmOpen(false);
      setToast({ message: ' Order placed! Redirecting to your orders&', type: 'success' });
      setTimeout(() => navigate('/customer/orders'), 2000);
    } catch (e) {
      setToast({ message: e instanceof Error ? e.message : 'Failed to place order', type: 'error' });
      setPlacing(false);
    }
  }
  const [stockFilter, setStockFilter] = useState('all');
  const [detailItem, setDetailItem] = useState(null);

  const filtered = (() => {
    let list = products;
    if (search.trim()) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (stockFilter === 'in_stock') list = list.filter((p) => !(p.low_stock_alert > 0 && p.quantity <= p.low_stock_alert));
    if (stockFilter === 'low_stock') list = list.filter((p) => p.low_stock_alert > 0 && p.quantity <= p.low_stock_alert);
    return list;
  })();

  const cartTotal = cart.reduce((s, ci) => {
    const p = products.find((x) => x.id === ci.item_id);
    return s + (Number(p?.unit_price) || 0) * ci.quantity;
  }, 0);

  return (
    <>
      {/* ── Welcome header ───────────────────────────────────────────────── */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight">
            👋 Hello, <span className="text-indigo-600">{firstName}</span>!
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-500 truncate">
            Browse available products and add them to your cart.
          </p>
        </div>
        {/* Cart button — icon-only on mobile, full on sm+ */}
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="relative flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 transition-colors"
        >
          🛝️
          <span className="hidden sm:inline">Cart</span>
          {cartCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
              {cartCount}
            </span>
          )}
        </button>
      </div>t       {/* ── Search + Filters ───────────────────────────────────────────────── */}
      <div className="mb-4 space-y-3">
        {/* Search field with icon */}
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">
            🔍
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm outline-none shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto">
          {[
            { key: "all",       label: "All" },
            { key: "in_stock",  label: "✓ In Stock" },
            { key: "low_stock", label: "⚠ Low Stock" },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStockFilter(key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-all border ${
                stockFilter === key
                  ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* ── Product list/grid ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 sm:h-56 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-4xl mb-3">{search ? "🔍" : "📦"}</p>
          <p className="text-sm font-medium text-slate-700">
            {search ? `No products match “${search}”` : "No products available right now"}
          </p>
          {search && (
            <button type="button" onClick={() => setSearch("")} className="mt-3 text-xs text-indigo-600 font-semibold hover:underline">
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-400 font-medium">
            {filtered.length} product{filtered.length !== 1 ? "s" : ""} available
          </p>
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                cartQty={cart.find((c) => c.item_id === item.id)?.quantity ?? 0}
                onAdd={addToCart}
                onRemove={removeFromCart}
                onChangeQty={changeQty}
                businessInfo={businessInfo}
                onViewDetail={setDetailItem}
              />
            ))}
          </div>
        </>
      )}
      {/* ── Floating cart bar — mobile only ──────────────────────────────── */}
      {cartCount > 0 && !cartOpen && !confirmOpen && (
        <div
          className="sm:hidden fixed left-4 right-4 z-30"
          style={{ bottom: "calc(56px + env(safe-area-inset-bottom, 6px) + 8px)" }}
        >
          <div
            className="flex items-center justify-between rounded-2xl px-4 py-3"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            }}
          >
            <div className="flex items-center gap-2.5 text-white min-w-0">
              <span className="text-lg shrink-0">🛝️</span>
              <p className="text-xs font-bold truncate">
                {cartCount} item{cartCount !== 1 ? "s" : ""}
                <span className="mx-1.5 text-slate-500">·</span>
                <span className="text-emerald-400">{rupee(cartTotal)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="shrink-0 ml-3 rounded-xl bg-white text-slate-900 px-4 py-2 text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all"
            >
              View Cart →
            </button>
          </div>
        </div>
      )}

      {/* Cart sidebar */}
      {cartOpen && (
        <CartSidebar
          cart={cart} products={products}
          onClose={() => setCartOpen(false)}
          onClearItem={removeFromCart} onChangeQty={changeQty}
          onCheckout={() => { setCartOpen(false); setConfirmOpen(true); }}
          onAddRec={addToCart}
        />
      )}

      {/* Product Detail Modal */}
      {detailItem && (
        <ProductDetailModal
          item={detailItem}
          cartQty={cart.find((c) => c.item_id === detailItem.id)?.quantity ?? 0}
          onAdd={addToCart}
          onRemove={removeFromCart}
          onChangeQty={changeQty}
          businessInfo={businessInfo}
          onClose={() => setDetailItem(null)}
        />
      )}

      {/* Confirm order modal */}
      {confirmOpen && (
        <ConfirmModal
          cart={cart} products={products}
          onCancel={() => { setConfirmOpen(false); setCartOpen(true); }}
          onConfirm={handlePlaceOrder}
          placing={placing}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </>
  );
}
