import { useCallback, useEffect, useRef, useState } from "react";
import { driverApi } from "../../lib/driverApi.js";
import { useDriver } from "../../context/DriverContext.jsx";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const rupee = (n) => `₹${Number(n ?? 0).toFixed(2)}`;

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function StatusBadge({ status }) {
  const cfg = {
    confirmed:        { cls: "bg-sky-500/20 text-sky-300 ring-sky-500/30",           label: "Assigned" },
    dispatched:       { cls: "bg-violet-500/20 text-violet-300 ring-violet-500/30",   label: "Dispatched" },
    out_for_delivery: { cls: "bg-teal-500/20 text-teal-300 ring-teal-500/30",         label: "Out for Delivery" },
    delivered:        { cls: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30", label: "Delivered" },
    cancelled:        { cls: "bg-slate-500/20 text-slate-400 ring-slate-500/20",       label: "Cancelled" },
  }[status] ?? { cls: "bg-slate-500/20 text-slate-400 ring-slate-500/20", label: status };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset capitalize ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ─── Status Timeline ──────────────────────────────────────────────────────────

const STEPS = [
  { key: "confirmed",        icon: "📋", label: "Assigned" },
  { key: "dispatched",       icon: "🚚", label: "Dispatched" },
  { key: "out_for_delivery", icon: "📦", label: "Out for Delivery" },
  { key: "delivered",        icon: "✅", label: "Delivered" },
];

function Timeline({ status }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  return (
    <div className="flex items-center gap-0 mt-1">
      {STEPS.map((step, i) => {
        const done   = i <= idx;
        const active = i === idx;
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className={[
              "flex flex-col items-center gap-0.5",
              done ? "opacity-100" : "opacity-30",
            ].join(" ")}>
              <div className={[
                "flex h-8 w-8 items-center justify-center rounded-full text-sm ring-2 transition-all",
                active  ? "bg-violet-600 ring-violet-400 scale-110 shadow-lg shadow-violet-800/40" :
                done    ? "bg-emerald-600/30 ring-emerald-500/50" :
                          "bg-slate-800 ring-slate-700",
              ].join(" ")}>
                {step.icon}
              </div>
              <span className={`text-[10px] font-medium ${active ? "text-violet-300" : done ? "text-emerald-400" : "text-slate-600"}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={[
                "flex-1 h-0.5 mx-1 mb-4 rounded-full transition-all",
                i < idx ? "bg-emerald-500/50" : "bg-slate-700",
              ].join(" ")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Proof Upload Modal ────────────────────────────────────────────────────────

function ProofUploadModal({ order, onClose, onDelivered }) {
  const [file,      setFile]      = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(""); // status text
  const [err,       setErr]       = useState("");
  const inputRef = useRef(null);

  function handleFile(f) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("Please select an image file."); return; }
    if (f.size > 10 * 1024 * 1024)   { setErr("File too large (max 10 MB)"); return; }
    setFile(f);
    setErr("");
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  }

  async function handleSubmit() {
    setUploading(true);
    setErr("");
    setProgress(file ? "📦 Preparing image…" : "⏳ Completing delivery…");

    try {
      let body = {};

      if (file) {
        // Convert to base64 on the frontend, send as JSON to server
        setProgress("📸 Encoding image…");
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = (e) => {
            // Strip the data-URI prefix — server handles raw base64
            const result = e.target.result;
            const b64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        body = { file_b64: base64, file_type: file.type, file_ext: ext };
        setProgress("☁️ Uploading to server…");
      }

      const r = await driverApi(`/api/driver/deliveries/${order.id}/complete`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      setProgress("✅ Done!");
      onDelivered(order.id, r.proof_url ?? null);
      onClose();
    } catch (e) {
      setErr(e.message ?? "Upload failed. Please try again.");
      setProgress("");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={!uploading ? onClose : undefined} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="border-b border-slate-800 bg-slate-800/60 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Mark as Delivered</h2>
            <p className="text-xs text-slate-400 mt-0.5">Order #{order.short_id}</p>
          </div>
          {!uploading && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700 transition-colors">✕</button>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Drop / tap zone */}
          <div
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (!uploading) handleFile(e.dataTransfer.files[0]); }}
            className={[
              "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition-all",
              uploading ? "opacity-50 cursor-not-allowed border-slate-700 bg-slate-800/40"
                        : "cursor-pointer border-slate-700 bg-slate-800/40 hover:border-violet-500 hover:bg-violet-900/10",
            ].join(" ")}
          >
            {preview ? (
              <div className="relative">
                <img src={preview} alt="Preview" className="max-h-36 rounded-xl object-contain shadow-lg" />
                {!uploading && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
                    className="absolute -top-2 -right-2 rounded-full bg-slate-700 text-white text-xs h-5 w-5 flex items-center justify-center hover:bg-red-600 transition-colors"
                  >✕</button>
                )}
              </div>
            ) : (
              <>
                <span className="text-4xl">{uploading ? "⏳" : "📸"}</span>
                <p className="text-sm font-medium text-slate-300">
                  {uploading ? progress : "Tap to capture/upload photo"}
                </p>
                <p className="text-xs text-slate-600">JPG, PNG, HEIC — max 10 MB</p>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
              disabled={uploading}
            />
          </div>

          {/* Progress text */}
          {uploading && (
            <div className="flex items-center gap-2 rounded-xl bg-violet-900/30 border border-violet-700/40 px-4 py-2.5">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent shrink-0" />
              <p className="text-sm text-violet-300 font-medium">{progress}</p>
            </div>
          )}

          {/* Error */}
          {err && (
            <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-3 py-2">
              <p className="text-xs text-red-400">{err}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={uploading}
              className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={uploading}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-all active:scale-95">
              {uploading ? "…" : "✅ Confirm Delivered"}
            </button>
          </div>

          {!file && !uploading && (
            <p className="text-center text-xs text-slate-600">
              Photo is optional — you can confirm delivery without it
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Delivery Detail Modal ─────────────────────────────────────────────────────

function DeliveryDetail({ order, onClose, onStart, onMarkDelivered, startingId }) {
  const hasPin  = order.delivery_lat != null && order.delivery_lng != null;
  const subtotal = order.line_items?.reduce((s, li) => s + Number(li.unit_price ?? 0) * Number(li.quantity ?? 0), 0) ?? 0;

  // ── Route state ────────────────────────────────────────────────────────────
  const [routeInfo,    setRouteInfo]    = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeErr,     setRouteErr]     = useState("");

  async function getRoute() {
    setRouteLoading(true);
    setRouteErr("");
    setRouteInfo(null);
    try {
      const params = new URLSearchParams();
      if (hasPin) {
        params.set("dest_lat", order.delivery_lat);
        params.set("dest_lng", order.delivery_lng);
      }
      if (order.region) params.set("dest_text", order.region);

      const r = await driverApi(`/api/driver/route?${params.toString()}`);
      setRouteInfo(r);
    } catch (e) {
      setRouteErr(e.message ?? "Could not fetch route");
    } finally {
      setRouteLoading(false);
    }
  }

  // Source label + color
  const sourceBadge = {
    google:    { label: "Google Maps",         cls: "bg-sky-900/40 text-sky-300 border-sky-700/40" },
    ors:       { label: "OpenRouteService",     cls: "bg-violet-900/40 text-violet-300 border-violet-700/40" },
    estimate:  { label: "Estimate",             cls: "bg-amber-900/40 text-amber-300 border-amber-700/40" },
    link_only: { label: "Maps Link",            cls: "bg-slate-800 text-slate-400 border-slate-700" },
  }[routeInfo?.source] ?? { label: "Unknown", cls: "bg-slate-800 text-slate-400 border-slate-700" };

  const isEstimate = routeInfo?.source === "estimate";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500 font-mono uppercase">#{order.short_id}</p>
            <h2 className="text-base font-semibold text-white mt-0.5">{order.customer_name}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-colors">✕</button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Timeline */}
          <Timeline status={order.status} />

          {/* Action buttons */}
          {order.status === "confirmed" && (
            <button onClick={() => onStart(order.id)} disabled={startingId === order.id}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 active:scale-[0.99] transition-all shadow-lg shadow-violet-900/40">
              {startingId === order.id
                ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Starting…</>
                : <><span className="text-lg">🚚</span> Start Delivery</>}
            </button>
          )}
          {order.status === "dispatched" && (
            <button onClick={() => onMarkOutForDelivery(order.id)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-500 active:scale-[0.99] transition-all shadow-lg shadow-teal-900/40">
              <span className="text-lg">📦</span> Mark Out for Delivery
            </button>
          )}
          {order.status === "out_for_delivery" && (
            <button onClick={() => onMarkDelivered(order)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 active:scale-[0.99] transition-all shadow-lg shadow-emerald-900/40">
              <span className="text-lg">🔐</span> Verify OTP to Deliver
            </button>
          )}
          {order.status === "delivered" && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-900/30 border border-emerald-700/40 px-4 py-3">
              <span className="text-lg">🎉</span>
              <p className="text-sm font-semibold text-emerald-300">Delivered successfully!</p>
            </div>
          )}

          {/* Customer info */}
          <section className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Customer</h3>
            <p className="text-sm font-medium text-slate-100">{order.customer_name}</p>
            {order.customer_phone && (
              <a href={`tel:${order.customer_phone}`}
                className="flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300 transition-colors w-fit">
                📞 {order.customer_phone}
              </a>
            )}
            {order.region && (
              <p className="text-sm text-slate-400">📍 <span className="font-medium text-slate-300">{order.region}</span></p>
            )}
            {order.customer_address && (
              <p className="text-sm text-slate-400">🏠 {order.customer_address}</p>
            )}
          </section>

          {/* ── Route Optimization Section ──────────────────────────────────── */}
          <section className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-emerald-400">
                🗺 Route from Warehouse
              </h3>
              {!routeInfo && !routeLoading && (
                <button
                  onClick={getRoute}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 active:scale-95 transition-all"
                >
                  Get Route
                </button>
              )}
              {routeInfo && !routeLoading && (
                <button
                  onClick={getRoute}
                  className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  ↺ Refresh
                </button>
              )}
            </div>

            {/* Loading */}
            {routeLoading && (
              <div className="flex items-center gap-2 py-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent shrink-0" />
                <p className="text-sm text-emerald-300">Calculating route…</p>
              </div>
            )}

            {/* Error */}
            {routeErr && !routeLoading && (
              <p className="text-xs text-red-400">{routeErr}</p>
            )}

            {/* Idle hint */}
            {!routeInfo && !routeLoading && !routeErr && (
              <p className="text-xs text-slate-600">
                Tap "Get Route" to see estimated distance and drive time from the warehouse.
              </p>
            )}

            {/* Result card */}
            {routeInfo && !routeLoading && (
              <div className="space-y-3">
                {/* Stats row */}
                {(routeInfo.distance_km != null || routeInfo.duration_min != null) && (
                  <div className="flex items-center gap-3">
                    {routeInfo.duration_min != null && (
                      <div className="flex-1 rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Duration</p>
                        <p className="text-xl font-bold text-white">
                          {isEstimate ? "~" : ""}{routeInfo.duration_min}
                          <span className="text-sm font-medium text-slate-400 ml-1">min</span>
                        </p>
                      </div>
                    )}
                    {routeInfo.distance_km != null && (
                      <div className="flex-1 rounded-xl bg-slate-800/80 border border-slate-700 px-4 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Distance</p>
                        <p className="text-xl font-bold text-white">
                          {isEstimate ? "~" : ""}{routeInfo.distance_km}
                          <span className="text-sm font-medium text-slate-400 ml-1">km</span>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Source badge */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${sourceBadge.cls}`}>
                    {sourceBadge.label}
                  </span>
                  {isEstimate && (
                    <span className="text-[10px] text-amber-400/70">
                      Add API key for real-time data
                    </span>
                  )}
                </div>

                {/* Open in Maps button */}
                <a
                  href={routeInfo.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors active:scale-[0.99]"
                >
                  🗺 Open in Google Maps
                </a>

                {/* Warehouse origin */}
                {routeInfo.warehouse && (
                  <p className="text-[11px] text-slate-600 text-center">
                    From: {routeInfo.warehouse.name} ({routeInfo.warehouse.lat.toFixed(4)}, {routeInfo.warehouse.lng.toFixed(4)})
                  </p>
                )}
              </div>
            )}
          </section>

          {/* GPS Navigation (if pin set) */}
          {hasPin && (
            <section className="rounded-xl border border-violet-700/40 bg-violet-900/20 p-4 space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-violet-400">📍 Delivery GPS Pin</h3>
              <p className="font-mono text-sm text-violet-300">
                {Number(order.delivery_lat).toFixed(5)}, {Number(order.delivery_lng).toFixed(5)}
              </p>
              {order.delivery_notes && (
                <div className="rounded-lg bg-violet-900/30 border border-violet-700/30 px-3 py-2">
                  <p className="text-xs font-medium text-violet-400">Notes</p>
                  <p className="text-sm text-violet-200 mt-0.5">{order.delivery_notes}</p>
                </div>
              )}
            </section>
          )}

          {/* Order items */}
          {order.line_items?.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 px-4 py-3 border-b border-slate-800">
                Order Items
              </h3>
              <div className="divide-y divide-slate-800/60">
                {order.line_items.map((li, i) => (
                  <div key={li.id ?? i} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{li.name}</p>
                      <p className="text-xs text-slate-500">{rupee(li.unit_price)} / unit</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-100">{rupee(Number(li.unit_price) * Number(li.quantity))}</p>
                      <p className="text-xs text-slate-500">Qty: {li.quantity}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-800/60">
                  <span className="text-sm font-bold text-slate-300">Total</span>
                  <span className="text-sm font-bold text-white">{rupee(subtotal)}</span>
                </div>
              </div>
            </section>
          )}

          {/* Proof image */}
          {order.proof_url && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Delivery Proof</h3>
              <img src={order.proof_url} alt="Proof" className="rounded-xl border border-slate-700 w-full object-cover max-h-48" />
            </section>
          )}

          <p className="text-xs text-slate-600">Created {fmtDate(order.created_at)} · Updated {fmtDate(order.updated_at)}</p>
        </div>
      </div>
    </div>
  );
}


// ─── Route Optimizer Panel ────────────────────────────────────────────────────

const SOURCE_LABELS = {
  google:    { label: "Google Maps",     cls: "bg-blue-500/20 text-blue-300 ring-blue-500/30" },
  ors:       { label: "OpenRouteService",cls: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/30" },
  estimate:  { label: "Smart Estimate",  cls: "bg-amber-500/20 text-amber-300 ring-amber-500/30" },
  no_coords: { label: "No GPS",          cls: "bg-slate-500/20 text-slate-400 ring-slate-500/30" },
  empty:     { label: "No Orders",       cls: "bg-slate-500/20 text-slate-400 ring-slate-500/30" },
};

function RouteOptimizerPanel({ onClose }) {
  const [state, setState] = useState("idle"); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState("");

  async function optimize() {
    setState("loading");
    setErrMsg("");
    try {
      const json = await driverApi("/api/driver/optimize-route", { method: "POST" });
      setResult(json);
      setState("done");
    } catch (e) {
      setErrMsg(e.message ?? "Failed to optimize route");
      setState("error");
    }
  }

  const src = result ? (SOURCE_LABELS[result.source] ?? SOURCE_LABELS.estimate) : null;

  return (
    <div className="rounded-2xl border border-violet-800/50 bg-gradient-to-br from-violet-950/40 to-slate-900 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🗺</span>
          <div>
            <p className="text-sm font-bold text-white">Route Optimizer</p>
            <p className="text-[11px] text-slate-500">Best sequence for all active deliveries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {state === "done" && (
            <button onClick={optimize}
              className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800 transition-colors">
              ↻ Refresh
            </button>
          )}
          <button onClick={onClose}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400 hover:bg-slate-800 transition-colors">
            ✕
          </button>
        </div>
      </div>

      {/* Idle */}
      {state === "idle" && (
        <button onClick={optimize} id="optimize-route-btn"
          className="w-full rounded-xl bg-violet-600 hover:bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition-all shadow-lg shadow-violet-900/40">
          ⚡ Optimize My Route
        </button>
      )}

      {/* Loading */}
      {state === "loading" && (
        <div className="flex items-center justify-center gap-3 py-5">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Calculating best route…</p>
        </div>
      )}

      {/* Error */}
      {state === "error" && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{errMsg}</span>
          <button onClick={optimize} className="text-xs underline ml-3">Retry</button>
        </div>
      )}

      {/* Results */}
      {state === "done" && result && (
        <div className="space-y-3">
          {/* Summary strip */}
          {result.total_km != null && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-800/60 border border-slate-700/60 px-4 py-2.5">
              <span className="text-sm font-bold text-white">
                {result.total_min} min
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-sm font-bold text-white">{result.total_km} km</span>
              {result.fuel_liters != null && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-sm text-amber-300">⛽ ~{result.fuel_liters} L</span>
                </>
              )}
              <div className="ml-auto">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${src.cls}`}>
                  {src.label}
                </span>
              </div>
            </div>
          )}

          {/* No orders state */}
          {result.source === "empty" && (
            <p className="text-center text-sm text-slate-500 py-2">No active deliveries to optimize.</p>
          )}

          {/* Stop list */}
          {result.stops?.length > 0 && (
            <div className="space-y-1.5">
              {result.stops.map((stop) => (
                <div key={stop.order_id}
                  className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/40 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600/30 text-xs font-bold text-violet-300 ring-1 ring-violet-500/40">
                    {stop.sequence}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{stop.customer_name}</p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="font-mono text-[10px] text-slate-600">#{stop.short_id}</span>
                      {" · "}{stop.region}
                    </p>
                  </div>
                  {!stop.has_coords && (
                    <span className="text-[10px] text-amber-400/80 italic">No GPS</span>
                  )}
                  <StatusBadge status={stop.status} />
                </div>
              ))}
            </div>
          )}

          {/* Open in Maps button */}
          {result.maps_url && (
            <a href={result.maps_url} target="_blank" rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-lg shadow-emerald-900/30">
              🗺 Open Full Route in Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
}



// ── OTP Verify Modal ──────────────────────────────────────────────────────────
function OtpVerifyModal({ order, onClose, onVerified }) {
  const [otp,     setOtp]     = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  async function handleVerify() {
    if (otp.trim().length !== 6) { setErr("Enter the 6-digit OTP"); return; }
    setLoading(true); setErr("");
    try {
      const r = await driverApi(`/api/orders/${order.id}/verify-delivery`, {
        method: "POST",
        body: JSON.stringify({ otp: otp.trim(), method: "otp" }),
      });
      onVerified(order.id, r.data);
      onClose();
    } catch (e) {
      setErr(e.message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={!loading ? onClose : undefined} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="border-b border-slate-800 bg-slate-800/60 px-5 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Verify Delivery</h2>
            <p className="text-xs text-slate-400 mt-0.5">Order #{order.short_id} — {order.customer_name}</p>
          </div>
          {!loading && (
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-700 transition-colors">✕</button>
          )}
        </div>
        <div className="px-5 py-5 space-y-4">
          <p className="text-sm text-slate-400">Ask the customer for their <span className="font-semibold text-violet-300">6-digit delivery OTP</span> and enter it below.</p>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Delivery OTP</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
              placeholder="000000"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] text-white outline-none focus:border-violet-500 placeholder:text-slate-600 placeholder:tracking-normal"
              disabled={loading}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            />
          </div>
          {err && (
            <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-3 py-2">
              <p className="text-xs text-red-400">{err}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={loading}
              className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleVerify} disabled={loading || otp.length !== 6}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 transition-all active:scale-95">
              {loading
                ? <span className="flex items-center justify-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Verifying…</span>
                : "✅ Confirm Delivery"}
            </button>
          </div>
          <p className="text-center text-xs text-slate-600">OTP was sent to the customer when the order was placed.</p>
        </div>
      </div>
    </div>
  );
}

const FILTER_TABS = [
  { value: "all",              label: "All" },
  { value: "confirmed",        label: "Assigned" },
  { value: "dispatched",       label: "Dispatched" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered",        label: "Delivered" },
];

export function DriverDashboardPage() {
  const { selectedBusinessId } = useDriver();

  const [deliveries, setDeliveries]       = useState([]);
  const [loading,    setLoading]          = useState(true);
  const [error,      setError]            = useState(null);
  const [filter,     setFilter]           = useState("all");
  const [selected,   setSelected]         = useState(null);
  const [proofOrder, setProofOrder]       = useState(null);
  const [otpOrder,   setOtpOrder]         = useState(null);
  const [startingId, setStartingId]       = useState(null);
  const [myLat,      setMyLat]            = useState(null);
  const [myLng,      setMyLng]            = useState(null);
  const [gpsLoading, setGpsLoading]       = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);

  const loadDeliveries = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await driverApi("/api/driver/deliveries");
      setDeliveries(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      setError(e.message ?? "Failed to load deliveries");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the selected business changes
  useEffect(() => { void loadDeliveries(); }, [loadDeliveries, selectedBusinessId]);

  // Pin my location
  function pinLocation() {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setMyLat(p.coords.latitude); setMyLng(p.coords.longitude); setGpsLoading(false); },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // Start delivery (confirmed → dispatched)
  async function handleStart(orderId) {
    setStartingId(orderId);
    try {
      await driverApi(`/api/driver/deliveries/${orderId}/start`, { method: "PUT" });
      setDeliveries((prev) => prev.map((d) => d.id === orderId ? { ...d, status: "dispatched" } : d));
      setSelected((prev) => prev?.id === orderId ? { ...prev, status: "dispatched" } : prev);
    } catch (e) {
      alert(e.message);
    } finally {
      setStartingId(null);
    }
  }

  // Mark out for delivery (dispatched → out_for_delivery)
  // Uses the driver-specific route — no admin auth required
  async function handleOutForDelivery(orderId) {
    try {
      const r = await driverApi(`/api/driver/orders/${orderId}/out-for-delivery`, {
        method: "PUT",
      });
      const newStatus = r.data?.status ?? "out_for_delivery";
      setDeliveries((prev) => prev.map((d) => d.id === orderId ? { ...d, status: newStatus } : d));
      setSelected((prev) => prev?.id === orderId ? { ...prev, status: newStatus } : prev);
    } catch (e) {
      alert(e.message ?? "Failed to update status");
    }
  }

  // After delivery confirmed
  function handleDelivered(orderId, proofUrl) {
    setDeliveries((prev) => prev.map((d) => d.id === orderId ? { ...d, status: "delivered", proof_url: proofUrl } : d));
    setSelected((prev) => prev?.id === orderId ? { ...prev, status: "delivered", proof_url: proofUrl } : prev);
  }

  // After OTP verification succeeds — update state, then optionally collect photo proof
  function handleOtpVerified(orderId, updatedOrder) {
    setDeliveries((prev) => prev.map((d) => d.id === orderId ? { ...d, status: "delivered" } : d));
    setSelected((prev) => prev?.id === orderId ? { ...prev, status: "delivered" } : prev);
    // Offer optional photo proof upload
    if (updatedOrder) setProofOrder(updatedOrder);
  }

  // Filtered view
  const visible = filter === "all"
    ? deliveries
    : deliveries.filter((d) => d.status === filter);

  const counts = {
    all:        deliveries.length,
    confirmed:  deliveries.filter((d) => d.status === "confirmed").length,
    dispatched: deliveries.filter((d) => d.status === "dispatched").length,
    delivered:  deliveries.filter((d) => d.status === "delivered").length,
  };

  return (
    <div className="space-y-5">

      {/* Hero */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-violet-950/30 to-slate-900 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs text-violet-400 font-semibold uppercase tracking-widest">Driver Portal</p>
            <h1 className="text-xl font-bold text-white mt-1">
              {counts.dispatched > 0
                ? `${counts.dispatched} in transit`
                : counts.confirmed > 0
                ? `${counts.confirmed} awaiting pickup`
                : "All caught up! 🎉"}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {counts.all} total · {counts.delivered} delivered today
            </p>
          </div>
          <div className="flex gap-2">
            {myLat && (
              <a href={`https://www.google.com/maps?q=${myLat},${myLng}`} target="_blank" rel="noopener noreferrer"
                className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-medium text-violet-300 hover:bg-slate-700 transition-colors">
                📍 My location
              </a>
            )}
            <button onClick={pinLocation} disabled={gpsLoading}
              className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors">
              {gpsLoading ? <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> : "📍 Pin Me"}
            </button>
            <button onClick={() => setShowOptimizer((v) => !v)}
              id="toggle-optimizer-btn"
              className={[
                "rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                showOptimizer
                  ? "bg-violet-600 border-violet-500 text-white"
                  : "bg-slate-800 border-slate-700 text-violet-300 hover:bg-slate-700",
              ].join(" ")}>
              🗺 Optimize
            </button>
            <button onClick={loadDeliveries}
              className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors">
              🔄
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Stats Bar ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Assigned",       value: counts.confirmed,  color: "border-sky-700/50 bg-sky-950/30",     text: "text-sky-300",     icon: "📋" },
          { label: "In Transit",     value: counts.dispatched, color: "border-violet-700/50 bg-violet-950/30", text: "text-violet-300", icon: "🚚" },
          { label: "Delivered Today",value: counts.delivered,  color: "border-emerald-700/50 bg-emerald-950/30", text: "text-emerald-300", icon: "✅" },
        ].map(({ label, value, color, text, icon }) => (
          <div key={label} className={`rounded-2xl border ${color} p-3.5 text-center`}>
            <p className="text-xl mb-0.5">{icon}</p>
            <p className={`text-2xl font-bold ${text}`}>{value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Route Optimizer Panel */}
      {showOptimizer && (
        <RouteOptimizerPanel onClose={() => setShowOptimizer(false)} />
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTER_TABS.map((tab) => (
          <button key={tab.value} onClick={() => setFilter(tab.value)}
            className={[
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
              filter === tab.value
                ? "bg-violet-600 text-white shadow-lg shadow-violet-900/30"
                : "bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700",
            ].join(" ")}>
            {tab.label}
            {counts[tab.value] > 0 && (
              <span className={[
                "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                filter === tab.value ? "bg-violet-500 text-white" : "bg-slate-700 text-slate-300"
              ].join(" ")}>
                {counts[tab.value]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {error ? (
        <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">{error}</div>
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-slate-800/40 border border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 py-16 text-center">
          <p className="text-4xl mb-3">🚚</p>
          <p className="text-sm font-medium text-slate-400">
            {filter === "all" ? "No deliveries assigned to you yet." : `No ${filter} deliveries.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelected(order)}
              className="w-full text-left rounded-2xl border border-slate-800 bg-slate-900/60 p-4 hover:border-violet-700/50 hover:bg-slate-800/60 transition-all group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Top row */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-[11px] font-bold text-slate-500">#{order.short_id}</span>
                    <StatusBadge status={order.status} />
                    {order.status === "dispatched" && (
                      <span className="rounded-full bg-violet-900/40 border border-violet-700/40 px-2 py-0.5 text-[10px] font-bold text-violet-400 animate-pulse">
                        LIVE
                      </span>
                    )}
                  </div>
                  {/* Customer */}
                  <p className="text-sm font-semibold text-slate-100 truncate group-hover:text-white transition-colors">
                    {order.customer_name}
                  </p>
                  {/* Region */}
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                    <span>📍</span>
                    <span className="truncate">{order.region || "No region"}</span>
                  </p>
                  {/* Items summary */}
                  {order.line_items?.length > 0 && (
                    <p className="text-xs text-slate-600 mt-1 truncate">
                      {order.line_items.map((li) => `${li.name} ×${li.quantity}`).join(", ")}
                    </p>
                  )}
                </div>

                {/* Right side actions */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {order.status === "confirmed" && (
                    <span onClick={(e) => { e.stopPropagation(); handleStart(order.id); }}
                      className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-500 transition-all active:scale-95 cursor-pointer">
                      {startingId === order.id ? "…" : "🚚 Start"}
                    </span>
                  )}
                  {order.status === "dispatched" && (
                    <span onClick={(e) => { e.stopPropagation(); handleOutForDelivery(order.id); }}
                      className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-500 transition-all active:scale-95 cursor-pointer">
                      📦 Out for Delivery
                    </span>
                  )}
                  {order.status === "out_for_delivery" && (
                    <span onClick={(e) => { e.stopPropagation(); setOtpOrder(order); }}
                      className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition-all active:scale-95 cursor-pointer">
                      🔐 Verify OTP
                    </span>
                  )}
                  <span className="text-[10px] text-slate-600">{fmtDate(order.created_at)}</span>
                </div>
              </div>

              {/* Mini timeline */}
              <div className="mt-3 pt-3 border-t border-slate-800/60">
                <Timeline status={order.status} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modals */}
      {selected && (
        <DeliveryDetail
          order={selected}
          onClose={() => setSelected(null)}
          onStart={handleStart}
          onMarkOutForDelivery={handleOutForDelivery}
          onMarkDelivered={(o) => { setSelected(null); setOtpOrder(o); }}
          startingId={startingId}
        />
      )}
      {otpOrder && (
        <OtpVerifyModal
          order={otpOrder}
          onClose={() => setOtpOrder(null)}
          onVerified={(id, data) => { setOtpOrder(null); handleOtpVerified(id, data); }}
        />
      )}
      {proofOrder && (
        <ProofUploadModal
          order={proofOrder}
          onClose={() => setProofOrder(null)}
          onDelivered={handleDelivered}
        />
      )}
    </div>
  );
}
