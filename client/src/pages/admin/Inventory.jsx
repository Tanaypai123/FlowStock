import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi, adminApiRaw } from "../../lib/adminApi.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  { value: "raw",        label: "Raw" },
  { value: "processing", label: "Processing" },
  { value: "packaged",   label: "Packaged" },
  { value: "ready",      label: "Ready" },
];
const POLL_INTERVAL_MS = 4000;

const UNITS = ["piece", "kg", "litre", "box", "dozen", "gram", "ml"];

const emptyForm = {
  name:            "",
  stage:           "raw",
  quantity:        "0",
  initial_stock:   "0",
  low_stock_alert: "0",
  unit_price:      "0",
  unit:            "piece",
  description:     "",
  image_urls:      [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stageLabel(value) {
  return STAGES.find((s) => s.value === value)?.label ?? value;
}

function formatUpdated(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function formatRupee(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/** Returns "out_of_stock" | "critical" | "warning" | "normal" */
function getStatus(item) {
  const qty     = Number(item.quantity);
  const initial = Number(item.initial_stock);
  const alertAt = Number(item.low_stock_alert);
  if (qty <= 0)                                                         return "out_of_stock";
  if (Number.isFinite(alertAt) && alertAt > 0 && qty <= alertAt)        return "critical";
  if (Number.isFinite(initial) && initial > 0 && qty <= initial * 0.5)  return "warning";
  return "normal";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = {
    normal:       { label: "Normal",       cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
    warning:      { label: "Warning",      cls: "bg-amber-100  text-amber-800  ring-amber-200"  },
    critical:     { label: "Critical",     cls: "bg-red-100    text-red-800    ring-red-200"    },
    out_of_stock: { label: "Out of Stock", cls: "bg-slate-800  text-white      ring-slate-700"  },
  };
  const { label, cls } = cfg[status] ?? cfg.normal;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}
    >
      {label}
    </span>
  );
}

function ProgressBar({ value, max, status }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color =
    status === "critical" ? "bg-red-500"
    : status === "warning" ? "bg-amber-400"
    : "bg-emerald-500";
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{pct}% remaining</span>
        <span>{value} / {max}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Insights Modal ───────────────────────────────────────────────────────────

function InsightsModal({ item, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi(`/api/inventory/${item.id}/insights`)
      .then((json) => { if (!cancelled) setData(json.data); })
      .catch((e)  => { if (!cancelled) setError(e.message); })
      .finally(()  => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item.id]);

  const status = data?.status ?? getStatus(item);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">📊 Stock Insights</h2>
            <p className="text-xs text-slate-500 mt-0.5">{item.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <button
              type="button"
              onClick={onClose}
              className="ml-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-slate-400">
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 inline-block" />
              Loading insights…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 py-4 text-center">{error}</p>
          ) : (
            <div className="space-y-5">
              {/* Progress bar */}
              <ProgressBar
                value={data.quantity}
                max={data.initial_stock}
                status={status}
              />

              {/* Stat grid */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Stock",  value: data.initial_stock,   icon: "📦" },
                  { label: "Sold",         value: data.sold_quantity,   icon: "🛒" },
                  { label: "Remaining",    value: data.quantity,        icon: "🏷️" },
                ].map(({ label, value, icon }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center"
                  >
                    <p className="text-lg">{icon}</p>
                    <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Prediction */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prediction
                </p>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Avg sales / day</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {data.avg_sales_per_day > 0 ? data.avg_sales_per_day : "—"}
                    {data.avg_sales_per_day > 0 ? " units" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Tracked for</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {data.days_tracked} day{data.days_tracked !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Est. days left</span>
                  <span className={`font-bold tabular-nums ${
                    data.estimated_days_left === null       ? "text-slate-400"
                    : data.estimated_days_left <= 7         ? "text-red-600"
                    : data.estimated_days_left <= 14        ? "text-amber-600"
                    : "text-emerald-600"
                  }`}>
                    {data.estimated_days_left !== null
                      ? `~${data.estimated_days_left} days`
                      : "No sales data yet"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Alert threshold</span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {data.low_stock_alert} units
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function ItemModal({ mode, item, onClose, onSaved }) {
  const [form, setForm] = useState(
    mode === "edit" && item
      ? {
          name:            item.name  ?? "",
          stage:           item.stage ?? "raw",
          quantity:        String(item.quantity        ?? 0),
          initial_stock:   String(item.initial_stock   ?? item.quantity ?? 0),
          low_stock_alert: String(item.low_stock_alert ?? 0),
          unit_price:      String(item.unit_price       ?? 0),
          unit:            item.unit ?? "piece",
          description:     item.description ?? "",
          image_urls:      Array.isArray(item.image_urls) && item.image_urls.length > 0
                             ? item.image_urls
                             : item.image_url ? [item.image_url] : [],
        }
      : emptyForm,
  );

  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState(null);
  const [uploading, setUploading] = useState(false); // which slot is uploading

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  const MAX_PHOTOS = 5;

  async function handlePhotoUpload(file) {
    if (!file) return;
    if (form.image_urls.length >= MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos allowed. Remove one first.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const json = await adminApiRaw("/api/inventory/upload-image", file, file.type);
      if (!json.success) throw new Error(json.error ?? "Upload failed");
      setForm((f) => ({ ...f, image_urls: [...f.image_urls, json.url] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removePhoto(idx) {
    setForm((f) => ({ ...f, image_urls: f.image_urls.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const payload = {
      name:            form.name.trim(),
      stage:           form.stage,
      quantity:        Number(form.quantity),
      initial_stock:   Number(form.initial_stock),
      low_stock_alert: Number(form.low_stock_alert),
      unit_price:      Number(form.unit_price),
      unit:            form.unit || "piece",
      description:     form.description?.trim() || null,
      image_urls:      form.image_urls,
      image_url:       form.image_urls[0] ?? null, // primary thumbnail
    };
    try {
      if (mode === "add") {
        await adminApi("/api/inventory", { method: "POST", body: JSON.stringify(payload) });
      } else {
        await adminApi(`/api/inventory/${item.id}`, { method: "PUT", body: JSON.stringify(payload) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  const field = (id, label, key, opts = {}) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-slate-600">{label}</label>
      <input
        id={id}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={saving}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
        {...opts}
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="border-b border-slate-200 px-5 py-4 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "add" ? "Add Product" : "Edit Product"}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="space-y-4 p-5">

            {field("inv-name", "Product Name", "name", { required: true, placeholder: "e.g. Basmati Rice" })}

            {/* Description */}
            <div className="space-y-1.5">
              <label htmlFor="inv-desc" className="text-xs font-medium text-slate-600">
                Description <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                id="inv-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                disabled={saving}
                rows={3}
                placeholder="Describe the product — quality, origin, packaging, usage, etc."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none resize-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
              />
            </div>

            {/* Stage */}
            <div className="space-y-1.5">
              <label htmlFor="inv-stage" className="text-xs font-medium text-slate-600">Stage</label>
              <select
                id="inv-stage"
                value={form.stage}
                onChange={(e) => set("stage", e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
              >
                {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {field("inv-qty",   "Current Qty",     "quantity",        { type: "number", min: 0, step: "any", required: true })}
              {field("inv-init",  "Initial Stock",   "initial_stock",   { type: "number", min: 0, step: "any", required: true })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("inv-low",   "Alert Threshold", "low_stock_alert", { type: "number", min: 0, step: "any", required: true })}
              {field("inv-price", "Unit Price (₹)",  "unit_price",      { type: "number", min: 0, step: "any" })}
            </div>

            {/* Unit */}
            <div className="space-y-1.5">
              <label htmlFor="inv-unit" className="text-xs font-medium text-slate-600">Unit</label>
              <select
                id="inv-unit"
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Product Photos — up to 5 */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">
                Product Photos
                <span className="font-normal text-slate-400 ml-1">
                  ({form.image_urls.length}/{MAX_PHOTOS} — first photo is the thumbnail)
                </span>
              </label>

              {/* Existing photos grid */}
              {form.image_urls.length > 0 && (
                <div className="grid grid-cols-5 gap-2">
                  {form.image_urls.map((url, idx) => (
                    <div key={idx} className="relative group aspect-square">
                      <img
                        src={url}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover rounded-lg border border-slate-200"
                      />
                      {idx === 0 && (
                        <span className="absolute bottom-0.5 left-0.5 rounded bg-indigo-600 px-1 text-[9px] font-bold text-white">
                          Main
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-md"
                      >✕</button>
                    </div>
                  ))}

                  {/* Add more slot */}
                  {form.image_urls.length < MAX_PHOTOS && (
                    <label className={`aspect-square cursor-pointer rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition text-xs gap-1 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                      {uploading ? (
                        <span className="text-[10px]">...</span>
                      ) : (
                        <>
                          <span className="text-lg leading-none">+</span>
                          <span className="text-[9px]">Add</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="sr-only"
                        disabled={saving || uploading}
                        onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Empty state — full upload area */}
              {form.image_urls.length === 0 && (
                <label className={`block cursor-pointer rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
                  <span className="text-2xl block mb-1">📷</span>
                  {uploading ? "Uploading…" : "Click to upload photos (up to 5)"}
                  <span className="block text-xs text-slate-400 mt-0.5">JPG, PNG or WebP • Max 5MB each</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={saving || uploading}
                    onChange={(e) => handlePhotoUpload(e.target.files?.[0])}
                  />
                </label>
              )}
            </div>

            <p className="text-xs text-slate-400">
              Initial Stock is used for the 50% warning alert. Set it to the original quantity when first stocked.
            </p>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Footer buttons */}
          <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : mode === "add" ? "Create Product" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Inventory() {
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Edit / add modal
  const [modal,       setModal]       = useState(null); // null | { mode:"add"|"edit", item? }

  // Insights modal
  const [insightItem, setInsightItem] = useState(null);

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadItems = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const json = await adminApi("/api/inventory");
      setItems(Array.isArray(json.data) ? json.data : []);
      setLastRefresh(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory");
      setItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { void loadItems(); }, [loadItems]);

  // ── Real-time polling every 4 seconds ─────────────────────────────────────
  const pollRef = useRef(null);
  useEffect(() => {
    pollRef.current = setInterval(() => void loadItems(true), POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [loadItems]);

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete(item) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await adminApi(`/api/inventory/${item.id}`, { method: "DELETE" });
      await loadItems(true);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  const outOfStockCount = items.filter((i) => getStatus(i) === "out_of_stock").length;
  const criticalCount   = items.filter((i) => getStatus(i) === "critical").length;
  const warningCount    = items.filter((i) => getStatus(i) === "warning").length;
  const totalSold       = items.reduce((s, i) => s + Number(i.sold_quantity ?? 0), 0);

  return (
    <div className="p-6 md:p-8">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Inventory Intelligence
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Live stock levels with dual alerts and predictive analytics.
            {lastRefresh && (
              <span className="ml-2 text-slate-400">
                ↻ Updated {lastRefresh.toLocaleTimeString([], { timeStyle: "short" })}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: "add" })}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          + Add item
        </button>
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total SKUs",   value: items.length,    icon: "📦", color: "text-slate-700"  },
            { label: "Out of Stock", value: outOfStockCount, icon: "🔴", color: "text-slate-900"  },
            { label: "Critical",     value: criticalCount,   icon: "🚨", color: "text-red-600"    },
            { label: "Total Sold",   value: totalSold,       icon: "🛍", color: "text-emerald-600" },
            // Warning card hidden — functionality (alerts, badges, WhatsApp) still active
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-lg">{icon}</p>
              <p className={`text-2xl font-bold tabular-nums mt-1 ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading inventory…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">No items yet. Add your first SKU.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  {["Name", "Stage", "Status", "Remaining", "Sold Qty", "Alert At", "Price", "Updated", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-slate-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const status = getStatus(item); // always recompute — never trust stale DB status
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-slate-900">{item.name}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{stageLabel(item.stage)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className={`font-semibold ${
                          status === "critical"     ? "text-red-600"   :
                          status === "warning"      ? "text-amber-600" :
                          status === "out_of_stock" ? "text-slate-400" :
                          "text-slate-800"
                        }`}>
                          {item.quantity}
                        </span>
                        {Number(item.initial_stock) > 0 && (
                          <span className="text-slate-400 text-xs ml-1">/ {item.initial_stock}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">
                        {item.sold_quantity ?? 0}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">{item.low_stock_alert}</td>
                      <td className="px-4 py-3 text-slate-600">{item.unit_price ? formatRupee(item.unit_price) : "—"}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatUpdated(item.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInsightItem(item)}
                            className="rounded-md border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                          >
                            📊 Insights
                          </button>
                          <button
                            type="button"
                            onClick={() => setModal({ mode: "edit", item })}
                            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {modal && (
        <ItemModal
          mode={modal.mode}
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void loadItems(true); }}
        />
      )}
      {insightItem && (
        <InsightsModal
          item={insightItem}
          onClose={() => setInsightItem(null)}
        />
      )}
    </div>
  );
}
