import { useCallback, useEffect, useRef, useState } from "react";
import { customerApi } from "../../lib/customerApi.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const ISSUE_TYPES = [
  "Damaged Product",
  "Wrong Item",
  "Missing Item",
  "Quality Issue",
  "Other",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
}

function shortId(uuid) {
  return uuid ? uuid.slice(0, 8).toUpperCase() : "—";
}

function StatusBadge({ status }) {
  const cfg = {
    open:       { label: "Open",       cls: "bg-amber-100 text-amber-800 ring-amber-200" },
    in_review:  { label: "In Review",  cls: "bg-blue-100  text-blue-800  ring-blue-200"  },
    resolved:   { label: "Resolved",   cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  };
  const { label, cls } = cfg[status] ?? cfg.open;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

function IssueTypeBadge({ type }) {
  if (!type) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-violet-100 text-violet-800 ring-1 ring-violet-200 px-2.5 py-0.5 text-xs font-semibold">
      {type}
    </span>
  );
}

// ─── Image Upload Preview ─────────────────────────────────────────────────────

function ImagePicker({ images, onAdd, onRemove, uploading }) {
  const fileRef = useRef(null);

  async function handleFiles(e) {
    const files = Array.from(e.target.files ?? []).slice(0, 3 - images.length);
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      onAdd({ file, preview: URL.createObjectURL(file), uploading: true, url: null });
    }
    e.target.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold text-slate-700">
        Proof Images <span className="font-normal text-slate-400">(up to 3)</span>
      </label>
      <div className="flex flex-wrap gap-3">
        {images.map((img, i) => (
          <div key={i} className="relative h-20 w-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
            <img src={img.preview} alt="proof" className="h-full w-full object-cover" />
            {img.uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </div>
            )}
            {!img.uploading && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center shadow hover:bg-red-600"
              >✕</button>
            )}
          </div>
        ))}

        {images.length < 3 && !uploading && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-20 w-20 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition shrink-0"
          >
            <span className="text-2xl leading-none">+</span>
            <span className="text-[10px] mt-0.5">Add</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={handleFiles} className="hidden" />
      <p className="text-xs text-slate-400">PNG, JPG or WEBP · max 5 MB each</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CustomerSupport() {
  // ── Past complaints ────────────────────────────────────────────────────────
  const [complaints, setComplaints] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [listError,  setListError]  = useState(null);

  // ── Orders (for dropdown) ─────────────────────────────────────────────────
  const [orders,        setOrders]       = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [selectedOrder,   setSelectedOrder]  = useState("");
  const [orderItems,      setOrderItems]     = useState([]); // line items of selected order
  const [selectedProduct, setSelectedProduct] = useState("");
  const [issueType,       setIssueType]      = useState("");
  const [description,     setDescription]   = useState("");
  const [images,          setImages]         = useState([]); // { file, preview, uploading, url }
  const [submitting,      setSubmitting]     = useState(false);
  const [formError,       setFormError]      = useState(null);
  const [success,         setSuccess]        = useState(false);

  // ── Lightbox ────────────────────────────────────────────────────────────────
  const [lightbox, setLightbox] = useState(null);

  // ── Load past complaints ──────────────────────────────────────────────────
  const loadComplaints = useCallback(async () => {
    setLoading(true); setListError(null);
    try {
      const json = await customerApi("/api/complaints/mine");
      setComplaints(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load complaints");
    } finally { setLoading(false); }
  }, []);

  // ── Load orders ────────────────────────────────────────────────────────────
  useEffect(() => {
    setOrdersLoading(true);
    customerApi("/api/customer/orders")
      .then((r) => setOrders(Array.isArray(r.data) ? r.data.slice(0, 30) : []))
      .catch(() => {})
      .finally(() => setOrdersLoading(false));
  }, []);

  useEffect(() => { void loadComplaints(); }, [loadComplaints]);

  // ── When order changes, fetch its line items ───────────────────────────────
  useEffect(() => {
    setSelectedProduct("");
    setOrderItems([]);
    if (!selectedOrder) return;

    customerApi(`/api/customer/orders/${selectedOrder}/items`)
      .then((r) => setOrderItems(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [selectedOrder]);

  // ── Image handling ─────────────────────────────────────────────────────────
  function addImage(imgObj) {
    setImages((prev) => [...prev, imgObj]);
    // Upload immediately
    uploadImage(imgObj.file, images.length).then((url) => {
      setImages((prev) => prev.map((im) =>
        im.file === imgObj.file ? { ...im, url, uploading: false } : im
      ));
    }).catch(() => {
      setImages((prev) => prev.filter((im) => im.file !== imgObj.file));
    });
  }

  async function uploadImage(file, index) {
    const { data: sessionData } = await (await import("../../lib/supabase.js")).supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error("Not signed in");

    const buf = await file.arrayBuffer();
    const res = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/complaints/upload-image`, {
      method: "POST",
      body: buf,
      headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "Upload failed");
    return json.url;
  }

  function removeImage(index) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null); setSuccess(false);

    if (!issueType) { setFormError("Please select an issue type."); return; }
    if (description.trim().length < 10) { setFormError("Please describe your issue (at least 10 characters)."); return; }
    if (images.some((im) => im.uploading)) { setFormError("Please wait for images to finish uploading."); return; }

    setSubmitting(true);
    try {
      const imageUrls = images.map((im) => im.url).filter(Boolean);
      await customerApi("/api/complaints", {
        method: "POST",
        body: JSON.stringify({
          message:      description.trim(),
          order_id:     selectedOrder || undefined,
          product_name: selectedProduct || undefined,
          issue_type:   issueType,
          image_urls:   imageUrls,
        }),
      });

      // Reset form
      setSelectedOrder(""); setSelectedProduct(""); setIssueType(""); setDescription(""); setImages([]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 5000);
      await loadComplaints();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to submit complaint");
    } finally { setSubmitting(false); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-2xl mx-auto py-2">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Support</h1>
        <p className="mt-1 text-sm text-slate-500">
          Report a product issue with your order — we'll review it promptly.
        </p>
      </div>

      {/* ── Raise a complaint form ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">📣 Raise a Complaint</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* Order selection */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Select Order <span className="font-normal text-slate-400">(optional)</span></label>
            {ordersLoading ? (
              <p className="text-xs text-slate-400 py-2">Loading your orders…</p>
            ) : (
              <select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
              >
                <option value="">— Choose an order —</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    Order #{o.id.slice(0, 8).toUpperCase()} · {fmtDate(o.created_at)} · ₹{Number(o.total_amount ?? 0).toFixed(0)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Product selection */}
          {orderItems.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-slate-700">Select Product</label>
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {orderItems.map((item) => (
                  <label key={item.id ?? item.item_name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="radio"
                      name="product"
                      value={item.item_name}
                      checked={selectedProduct === item.item_name}
                      onChange={(e) => setSelectedProduct(e.target.value)}
                      className="accent-indigo-600"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.item_name}</p>
                      <p className="text-xs text-slate-400">Qty: {item.quantity} · ₹{Number(item.unit_price ?? 0).toFixed(0)}/unit</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Issue type */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Issue Type <span className="text-red-500">*</span></label>
            <select
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
            >
              <option value="">— Select issue type —</option>
              {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-slate-700">Describe your issue <span className="text-red-500">*</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="e.g. The rice bag was torn and the contents had spilled…"
              disabled={submitting}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none resize-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50 placeholder:text-slate-400"
            />
            <p className="text-xs text-slate-400">{description.trim().length} / 10 min characters</p>
          </div>

          {/* Image upload */}
          <ImagePicker
            images={images}
            onAdd={addImage}
            onRemove={removeImage}
            uploading={images.some((im) => im.uploading)}
          />

          {/* Success */}
          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 flex items-center gap-2">
              <span>✅</span>
              <span>Complaint submitted! Our team will review it shortly.</span>
            </div>
          )}

          {/* Error */}
          {formError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {formError}
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting || images.some((im) => im.uploading)}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {submitting ? "Submitting…" : "Submit Complaint"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Past complaints ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">My Complaints</h2>

        {listError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{listError}</div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">Loading…</div>
        ) : complaints.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
            <p className="text-2xl mb-2">💬</p>
            <p className="text-sm text-slate-500">No complaints raised yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {complaints.map((c) => (
              <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={c.status} />
                    {c.issue_type && <IssueTypeBadge type={c.issue_type} />}
                  </div>
                  <span className="text-xs text-slate-400">{fmtDate(c.created_at)}</span>
                </div>

                {/* Product + order */}
                {(c.product_name || c.order_id) && (
                  <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                    {c.product_name && <span>📦 <span className="font-medium text-slate-700">{c.product_name}</span></span>}
                    {c.order_id && <span>🧾 Order #{shortId(c.order_id)}</span>}
                  </div>
                )}

                {/* Description */}
                <p className="text-sm text-slate-700 leading-relaxed">{c.message}</p>

                {/* Images */}
                {Array.isArray(c.image_urls) && c.image_urls.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {c.image_urls.map((url, i) => (
                      <button key={i} type="button" onClick={() => setLightbox(url)}>
                        <img src={url} alt="proof" className="h-16 w-16 rounded-xl object-cover border border-slate-200 hover:opacity-90 transition" />
                      </button>
                    ))}
                  </div>
                )}

                {c.status === "resolved" && !c.resolution_message && (
                  <p className="text-xs text-emerald-600 font-medium">✅ This complaint has been resolved.</p>
                )}
                {c.status === "in_review" && (
                  <p className="text-xs text-blue-600 font-medium">🔍 Our team is reviewing this complaint.</p>
                )}

                {/* Admin Response Card */}
                {c.resolution_message && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wide text-emerald-600">✅ Response from Support Team</p>
                    <p className="text-sm text-emerald-900 leading-relaxed">{c.resolution_message}</p>
                    {c.resolved_at && (
                      <p className="text-xs text-emerald-500">Resolved on {fmtDate(c.resolved_at)}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="proof" className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl object-contain" />
          <button type="button" onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/20 text-white text-xl flex items-center justify-center hover:bg-white/30">
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
