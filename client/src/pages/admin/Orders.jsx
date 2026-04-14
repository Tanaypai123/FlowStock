import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "../../lib/adminApi.js";
import { supabase } from "../../lib/supabase.js";

const STATUS_TABS = [
  { value: "all",              label: "All" },
  { value: "pending",          label: "Pending" },
  { value: "confirmed",        label: "Confirmed" },
  { value: "dispatched",       label: "Dispatched" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered",        label: "Delivered" },
  { value: "rejected",         label: "Rejected" },
  { value: "cancelled",        label: "Cancelled" },
];

const STATUS_OPTIONS = STATUS_TABS.filter((t) => t.value !== "all");

function statusBadgeClass(status) {
  switch (status) {
    case "pending":          return "bg-slate-100   text-slate-700    ring-slate-200";
    case "confirmed":        return "bg-blue-100    text-blue-800     ring-blue-200";
    case "dispatched":       return "bg-orange-100  text-orange-800   ring-orange-200";
    case "out_for_delivery": return "bg-teal-100    text-teal-800     ring-teal-200";
    case "delivered":        return "bg-emerald-100 text-emerald-800  ring-emerald-200";
    case "rejected":         return "bg-red-100     text-red-700      ring-red-200";
    case "cancelled":        return "bg-red-50      text-red-400      ring-red-100 line-through";
    default:                 return "bg-slate-100   text-slate-700    ring-slate-200";
  }
}

function timeAgo(iso) {
  if (!iso) return "—";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60)   return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60)   return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24)   return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7)    return `${d}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch { return iso; }
}

function formatCreated(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

// ── SLA helpers ───────────────────────────────────────────────────────────────
const SLA = {
  pending:    { warn: 20, red: 30 },
  confirmed:  { warn: 45, red: 60 },
  dispatched: { warn: 90, red: 120 },
};

function slaTimestamp(order) {
  switch (order.status) {
    case "pending":    return order.created_at;
    case "confirmed":  return order.confirmed_at  || order.created_at;
    case "dispatched": return order.dispatched_at || order.created_at;
    default:           return null;
  }
}

function slaElapsedMin(ts) {
  if (!ts) return null;
  return (Date.now() - new Date(ts).getTime()) / 60000;
}

function SlaCell({ order }) {
  const ts     = slaTimestamp(order);
  const limits = SLA[order.status];
  if (!ts || !limits) {
    return <span className="text-slate-400 text-xs" title={formatCreated(order.created_at)}>{timeAgo(order.created_at)}</span>;
  }
  const min = slaElapsedMin(ts);
  const color = min >= limits.red  ? "text-red-600 font-semibold"  :
                min >= limits.warn ? "text-orange-500 font-medium" :
                "text-emerald-600";
  const icon  = min >= limits.red  ? " ⚠" : "";
  const label = min < 60 ? `${Math.floor(min)}m` : `${(min/60).toFixed(1)}h`;
  return (
    <span className={`text-xs ${color}`} title={`Since last status change: ${formatCreated(ts)}`}>
      {label}{icon}
    </span>
  );
}

// ── Priority badge ────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  if (priority === "vip") {
    return <span className="mr-1 text-amber-400 text-sm" title="VIP customer">★</span>;
  }
  if (priority === "regular") {
    return <span className="mr-1.5 inline-block w-2 h-2 rounded-full bg-orange-400" title="Regular customer" />;
  }
  return (
    <span className="mr-1.5 inline-flex rounded px-1 py-0 text-[10px] font-bold bg-slate-100 text-slate-400 ring-1 ring-slate-200">NEW</span>
  );
}

// ── Order timeline ─────────────────────────────────────────────────────────────
function OrderTimeline({ order }) {
  const steps = [
    { label: "Order Placed",  ts: order.created_at,   slaLimit: null },
    { label: "Confirmed",     ts: order.confirmed_at,  slaLimit: SLA.confirmed },
    { label: "Dispatched",    ts: order.dispatched_at, slaLimit: SLA.dispatched },
    { label: "Delivered",     ts: order.delivered_at,  slaLimit: null },
  ];
  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Timeline</h3>
      <ol className="relative border-l border-slate-200 ml-2 space-y-4">
        {steps.map((step, i) => {
          const done = Boolean(step.ts);
          const elapsed = step.slaLimit && step.ts ? slaElapsedMin(step.ts) : null;
          const exceeded = elapsed !== null && elapsed > step.slaLimit.red;
          return (
            <li key={i} className="ml-4">
              <span className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${
                done ? "bg-slate-800" : "bg-slate-200"
              }`} />
              <p className="text-xs font-semibold text-slate-700">{step.label}</p>
              {done ? (
                <p className={`text-xs mt-0.5 ${exceeded ? "text-red-500" : "text-slate-400"}`}>
                  {formatCreated(step.ts)}
                </p>
              ) : (
                <p className="text-xs mt-0.5 text-slate-300 italic">Pending</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** @param {Array<{ quantity?: unknown; unit_price?: unknown; price?: unknown }> | undefined} lines */
function lineItemsTotal(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  let sum = 0;
  for (const line of lines) {
    const unit = Number(line.price ?? line.unit_price);
    sum += Number(line.quantity) * unit;
  }
  if (!Number.isFinite(sum)) return null;
  return sum;
}

function discountFromSubtotal(subtotal, mode, inputRaw) {
  const n = Number(inputRaw);
  if (!Number.isFinite(subtotal) || subtotal < 0) return 0;
  if (!Number.isFinite(n) || n < 0) return 0;
  if (mode === "percent") {
    return Math.min(subtotal, (subtotal * Math.min(100, n)) / 100);
  }
  return Math.min(subtotal, n);
}

/** @param {Array<{ quantity?: unknown }> | undefined} lines */
function lineItemsQuantitySum(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return 0;
  let sum = 0;
  for (const line of lines) {
    sum += Number(line.quantity);
  }
  return Number.isFinite(sum) ? sum : 0;
}

async function openInvoicePdf(orderId) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (sessionError || !token) {
    window.alert("You must be signed in to download the invoice.");
    return;
  }

  const res = await fetch(`/api/orders/${orderId}/invoice`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const msg =
      typeof errJson.error === "string"
        ? errJson.error
        : `Could not download invoice (${res.status})`;
    window.alert(msg);
    return;
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function Orders() {
  const [filter, setFilter] = useState("all");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);
  const [showOtp, setShowOtp] = useState(false);       // gated OTP reveal
  const [createOpen, setCreateOpen] = useState(false);
  const [createCustomers, setCreateCustomers] = useState([]);
  const [createCustomersLoading, setCreateCustomersLoading] = useState(false);
  const [createCustomerId, setCreateCustomerId] = useState("");
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [createCustomerPhone, setCreateCustomerPhone] = useState("");
  const [createRegion, setCreateRegion] = useState("");
  const [createAddress, setCreateAddress] = useState("");
  const [createInventory, setCreateInventory] = useState([]);
  const [createLineItems, setCreateLineItems] = useState([]);
  const [draftItemId, setDraftItemId] = useState("");
  const [draftQty, setDraftQty] = useState("1");
  const [draftPrice, setDraftPrice] = useState("");
  const [discountMode, setDiscountMode] = useState("fixed");
  const [discountInput, setDiscountInput] = useState("0");
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);
  // Delivery location
  const [createDeliveryLat, setCreateDeliveryLat] = useState(null);
  const [createDeliveryLng, setCreateDeliveryLng] = useState(null);
  const [createDeliveryNotes, setCreateDeliveryNotes] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [autoAssigning, setAutoAssigning]          = useState(false);
  const [dispatchEta, setDispatchEta]               = useState(null);
  const [dispatchEtaLoading, setDispatchEtaLoading] = useState(false);
  const [search, setSearch]                         = useState("");
  const [dateFilter, setDateFilter]                 = useState("all");
  const [customFrom, setCustomFrom]                 = useState("");
  const [customTo, setCustomTo]                     = useState("");
  const [, setTick]                                 = useState(0);
  const tickRef                                     = useRef(null);
  const [sortOrder, setSortOrder]                   = useState("desc");
  // ── Pagination ──
  const [pageLimit, setPageLimit]                   = useState(10);
  const [page, setPage]                             = useState(1);
  // ── Bulk selection ──
  const [selectedOrders, setSelectedOrders]         = useState([]);
  const [bulkLoading, setBulkLoading]               = useState(false);
  const [toast, setToast]                           = useState(null); // { msg, type }
  const [driverPopover, setDriverPopover]           = useState(false);
  // ── Auto Confirm ──
  const [acOpen, setAcOpen]                         = useState(false);
  const [acPreview, setAcPreview]                   = useState(null); // { toConfirm, toReject }
  const [acLoading, setAcLoading]                   = useState(false);
  const [acConfirming, setAcConfirming]             = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q =
        filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
      const json = await adminApi(`/api/orders${q}`);
      setOrders(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const loadDrivers = useCallback(async () => {
    try {
      const json = await adminApi("/api/orders/drivers");
      setDrivers(Array.isArray(json.data) ? json.data : []);
    } catch {
      setDrivers([]);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  // Reset to page 1 whenever any filter changes
  useEffect(() => { setPage(1); }, [search, filter, dateFilter, customFrom, customTo, sortOrder, pageLimit]);

  // SLA timer
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(tickRef.current);
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    (async () => {
      setCreateCustomersLoading(true);
      setCreateError(null);
      try {
        const [custJson, invJson] = await Promise.all([
          adminApi("/api/orders/customers"),
          adminApi("/api/inventory"),
        ]);
        if (!cancelled) {
          setCreateCustomers(Array.isArray(custJson.data) ? custJson.data : []);
          setCreateInventory(Array.isArray(invJson.data) ? invJson.data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setCreateError(
            e instanceof Error ? e.message : "Failed to load form data",
          );
          setCreateCustomers([]);
          setCreateInventory([]);
        }
      } finally {
        if (!cancelled) setCreateCustomersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen]);

  const openDetail = useCallback(async (id) => {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    setDispatchEta(null);
    setDispatchEtaLoading(false);

    try {
      const json = await adminApi(`/api/orders/${id}`);
      setDetail(json.data ?? null);
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Failed to load order",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeDetail = useCallback(() => {
    setDetailId(null);
    setDetail(null);
    setDetailError(null);
  }, []);

  async function handleStatusChange(nextStatus) {
    if (!detailId || !detail) return;
    if (nextStatus === "dispatched" && !detail.driver_id) {
      window.alert("Assign driver before dispatch");
      return;
    }
    setSavingStatus(true);
    setDetailError(null);
    try {
      const json = await adminApi(`/api/orders/${detailId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status: nextStatus }),
      });
      const row = json.data;
      if (row) {
        setDetail((d) =>
          d
            ? {
                ...d,
                status: row.status,
                updated_at: row.updated_at,
                driver_id: row.driver_id,
                driver_name: row.driver_name,
                driver: row.driver_id
                  ? {
                      id: row.driver_id,
                      name: row.driver_name,
                      role: "driver",
                    }
                  : null,
              }
            : d,
        );
      }
      await loadOrders();
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Failed to update status",
      );
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleDriverChange(driverId) {
    if (!detailId) return;
    setSavingDriver(true);
    setDetailError(null);
    const body =
      driverId === "" || driverId == null
        ? { driver_id: null }
        : { driver_id: driverId };
    try {
      const json = await adminApi(`/api/orders/${detailId}/assign-driver`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      const row = json.data;
      if (row && detail) {
        setDetail({
          ...detail,
          driver_id: row.driver_id,
          driver_name: row.driver_name,
          driver: row.driver_id
            ? {
                id: row.driver_id,
                name: row.driver_name,
                role: "driver",
              }
            : null,
          updated_at: row.updated_at,
        });
      }
      await loadOrders();
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "Failed to assign driver",
      );
    } finally {
      setSavingDriver(false);
    }
  }

  async function handleAutoAssign() {
    if (!detailId) return;
    setAutoAssigning(true);
    setDetailError(null);
    try {
      const json = await adminApi("/api/admin/auto-assign-driver", {
        method: "POST",
        body: JSON.stringify({ order_id: detailId }),
      });
      const d = json.data;
      if (d && detail) {
        setDetail({
          ...detail,
          driver_id:   d.driver_id,
          driver_name: d.driver_name,
          driver: { id: d.driver_id, name: d.driver_name, role: "driver" },
        });
      }
      await loadOrders();
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "Auto-assign failed");
    } finally {
      setAutoAssigning(false);
    }
  }

  async function handleDispatchEta() {
    if (!detailId) return;
    setDispatchEtaLoading(true);
    setDispatchEta(null);
    try {
      const json = await adminApi(`/api/admin/dispatch-eta?order_id=${detailId}`);
      if (json.available) setDispatchEta(json);
    } catch { /* non-critical — ignore */ }
    finally { setDispatchEtaLoading(false); }
  }

  function openCreateModal() {
    setEditingOrderId(null);
    setCreateOpen(true);
    setCreateCustomerId("");
    setCreateCustomerName("");
    setCreateCustomerPhone("");
    setCreateRegion("");
    setCreateAddress("");
    setCreateLineItems([]);
    setDraftItemId("");
    setDraftQty("1");
    setDraftPrice("");
    setDiscountMode("fixed");
    setDiscountInput("0");
    setCreateError(null);
  }

  function updateCreateLine(key, patch) {
    setCreateLineItems((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addProductToOrder() {
    if (!draftItemId) {
      setCreateError("Select a product to add.");
      return;
    }
    const q = Number(draftQty);
    if (!Number.isFinite(q) || q <= 0) {
      setCreateError("Enter a valid quantity.");
      return;
    }
    const inv = createInventory.find((i) => i.id === draftItemId);
    if (!inv) {
      setCreateError("Product not found.");
      return;
    }
    const defaultP = Number(inv.unit_price);
    const entered =
      draftPrice.trim() === "" ? NaN : Number(draftPrice);
    const price =
      Number.isFinite(entered) && entered >= 0
        ? entered
        : Number.isFinite(defaultP) && defaultP >= 0
          ? defaultP
          : 0;
    setCreateLineItems((prev) => {
      const idx = prev.findIndex(
        (p) =>
          p.item_id === draftItemId &&
          Math.abs(Number(p.price) - price) < 1e-9,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: next[idx].quantity + q,
        };
        return next;
      }
      return [
        ...prev,
        {
          key: `${draftItemId}-${price}-${Date.now()}`,
          item_id: draftItemId,
          name: inv.name,
          quantity: q,
          price,
        },
      ];
    });
    setCreateError(null);
  }

  function removeProductLine(key) {
    setCreateLineItems((prev) => prev.filter((p) => p.key !== key));
  }

  const openEditFromDetail = useCallback(async (d) => {
    if (!d?.id) return;
    setCreateCustomersLoading(true);
    setCreateError(null);
    try {
      const [custJson, invJson] = await Promise.all([
        adminApi("/api/orders/customers"),
        adminApi("/api/inventory"),
      ]);
      const invList = Array.isArray(invJson.data) ? invJson.data : [];
      const custList = Array.isArray(custJson.data) ? custJson.data : [];
      setCreateCustomers(custList);
      setCreateInventory(invList);

      const invByName = new Map(
        invList.map((x) => [x.name.trim().toLowerCase(), x]),
      );
      const lines = (d.line_items ?? []).map((li, idx) => {
        let itemId = li.inventory_item_id ?? "";
        if (!itemId && li.item_name) {
          const g = invByName.get(String(li.item_name).trim().toLowerCase());
          itemId = g?.id ?? "";
        }
        return {
          key: `edit-${li.id ?? idx}`,
          item_id: itemId,
          name: li.item_name,
          quantity: Number(li.quantity),
          price: Number(li.price ?? li.unit_price ?? 0),
        };
      });

      setEditingOrderId(d.id);
      setCreateCustomerId(d.customer_id ?? "");
      setCreateCustomerName(d.customer?.name ?? d.customer_name ?? "");
      setCreateCustomerPhone(
        String(d.customer?.phone ?? d.guest_customer_phone ?? "").trim(),
      );
      setCreateRegion(d.region ?? "");
      setCreateAddress(d.customer?.address ?? d.customer_address ?? "");
      setDiscountMode(d.discount_type === "percent" ? "percent" : "fixed");
      setDiscountInput(String(d.discount_input ?? 0));
      setCreateLineItems(lines);
      setDraftItemId("");
      setDraftQty("1");
      setDraftPrice("");
      // Restore delivery location
      setCreateDeliveryLat(d.delivery_lat ?? null);
      setCreateDeliveryLng(d.delivery_lng ?? null);
      setCreateDeliveryNotes(d.delivery_notes ?? "");
      setGpsError(null);
      setCreateOpen(true);
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Failed to open editor",
      );
    } finally {
      setCreateCustomersLoading(false);
    }
  }, []);

  function closeCreateModal() {
    setCreateOpen(false);
    setEditingOrderId(null);
    setCreateError(null);
    setCreateSubmitting(false);
    setCreateDeliveryLat(null);
    setCreateDeliveryLng(null);
    setCreateDeliveryNotes("");
    setGpsLoading(false);
    setGpsError(null);
  }

  function captureGPS() {
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCreateDeliveryLat(pos.coords.latitude);
        setCreateDeliveryLng(pos.coords.longitude);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError("Could not get location: " + err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleCreateOrder(e) {
    e.preventDefault();
    const phone = createCustomerPhone.trim();
    if (!phone) {
      setCreateError("Customer phone is required.");
      return;
    }
    if (!createCustomerId && !createCustomerName.trim()) {
      setCreateError(
        "Enter a customer name or choose an existing account customer.",
      );
      return;
    }
    if (createLineItems.length === 0) {
      setCreateError("Add at least one product.");
      return;
    }
    for (const row of createLineItems) {
      if (!row.item_id) {
        setCreateError("Each line must have a valid product.");
        return;
      }
      const pq = Number(row.quantity);
      const pp = Number(row.price);
      if (!Number.isFinite(pq) || pq <= 0) {
        setCreateError("Each line must have quantity greater than 0.");
        return;
      }
      if (!Number.isFinite(pp) || pp < 0) {
        setCreateError("Each line must have price ≥ 0.");
        return;
      }
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const payload = {
        customer_phone: phone,
        region: createRegion,
        address: createAddress,
        discount_type: discountMode,
        discount_input: Number(discountInput) || 0,
        items: createLineItems.map(({ item_id, quantity, price }) => ({
          item_id,
          quantity,
          price: Number(price),
        })),
        // Delivery location
        ...(createDeliveryLat != null && createDeliveryLng != null
          ? { delivery_lat: createDeliveryLat, delivery_lng: createDeliveryLng }
          : {}),
        delivery_notes: createDeliveryNotes.trim() || null,
      };
      if (createCustomerId) {
        payload.customer_id = createCustomerId;
      } else {
        payload.customer_name = createCustomerName.trim();
      }
      const path = editingOrderId
        ? `/api/orders/${editingOrderId}`
        : "/api/orders";
      const method = editingOrderId ? "PUT" : "POST";
      await adminApi(path, {
        method,
        body: JSON.stringify(payload),
      });
      const editedId = editingOrderId;
      closeCreateModal();
      await loadOrders();
      if (editedId && detailId === editedId) {
        await openDetail(editedId);
      }
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to save order",
      );
    } finally {
      setCreateSubmitting(false);
    }
  }

  // ── Bulk action helpers ───────────────────────────────────────────────
  async function runBulkAction(body) {
    setBulkLoading(true);
    try {
      const res = await adminApi("/api/orders/bulk-action", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return res;
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Bulk action failed", type: "error" });
      return null;
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkConfirm() {
    const pending = selectedOrders.filter((id) => orders.find((o) => o.id === id)?.status === "pending");
    const skipped = selectedOrders.length - pending.length;
    if (pending.length === 0) { setToast({ msg: "No pending orders selected", type: "error" }); return; }
    const res = await runBulkAction({ orderIds: pending, action: "confirm" });
    if (!res) return;
    const msg = `${res.count} order${res.count !== 1 ? "s" : ""} confirmed` + (skipped > 0 ? ` · ${skipped} skipped` : "");
    setToast({ msg, type: "success" });
    setSelectedOrders([]);
    await loadOrders();
  }

  async function handleBulkDispatch() {
    const noDriver = selectedOrders.filter((id) => {
      const o = orders.find((x) => x.id === id);
      return o && o.status === "confirmed" && !o.driver_id;
    }).map((id) => { const o = orders.find((x) => x.id === id); return `#${o?.short_id}`; });
    if (noDriver.length > 0) {
      setToast({ msg: `No driver: ${noDriver.join(", ")}`, type: "error" });
    }
    const res = await runBulkAction({ orderIds: selectedOrders, action: "dispatch" });
    if (!res) return;
    const skipped = (res.failed ?? []).length;
    const msg = `${res.count} dispatched` + (skipped > 0 ? ` · ${skipped} skipped (no driver/wrong status)` : "");
    setToast({ msg, type: res.count > 0 ? "success" : "error" });
    setSelectedOrders([]);
    await loadOrders();
  }

  async function handleBulkAssign(dId) {
    setDriverPopover(false);
    const res = await runBulkAction({ orderIds: selectedOrders, action: "assign-driver", driverId: dId });
    if (!res) return;
    setToast({ msg: `Driver assigned to ${res.count} order${res.count !== 1 ? "s" : ""}`, type: "success" });
    setSelectedOrders([]);
    await loadOrders();
  }

  // ── Auto Confirm handlers ──────────────────────────────────────────
  async function openAutoConfirmPreview() {
    setAcOpen(true);
    setAcPreview(null);
    setAcLoading(true);
    try {
      const data = await adminApi("/api/orders/auto-confirm-preview");
      setAcPreview(data);
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Preview failed", type: "error" });
      setAcOpen(false);
    } finally {
      setAcLoading(false);
    }
  }

  async function runAutoConfirm() {
    setAcConfirming(true);
    try {
      const res = await adminApi("/api/orders/auto-confirm", { method: "POST" });
      setAcOpen(false);
      setAcPreview(null);
      setSelectedOrders([]);
      await loadOrders();
      const msg = `✓ ${res.confirmed} confirmed` + (res.rejected > 0 ? ` · ${res.rejected} rejected (out of stock)` : "");
      setToast({ msg, type: "success" });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Auto-confirm failed", type: "error" });
    } finally {
      setAcConfirming(false);
    }
  }

  // ── Date filter helper ─────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);
  function passesDate(o) {
    if (dateFilter === "all")   return true;
    const d = (o.created_at ?? "").slice(0, 10);
    if (dateFilter === "today")  return d === todayStr;
    if (dateFilter === "past")   return d < todayStr;
    if (dateFilter === "week") {
      const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
      return d >= weekAgo;
    }
    if (dateFilter === "custom") {
      if (customFrom && d < customFrom) return false;
      if (customTo   && d > customTo)   return false;
      return true;
    }
    return true;
  }

  // ── Summary counts (all loaded orders) ────────────────────────────────
  const counts = {
    total:            orders.length,
    pending:          orders.filter((o) => o.status === "pending").length,
    confirmed:        orders.filter((o) => o.status === "confirmed").length,
    dispatched:       orders.filter((o) => o.status === "dispatched").length,
    out_for_delivery: orders.filter((o) => o.status === "out_for_delivery").length,
    delivered:        orders.filter((o) => o.status === "delivered").length,
    cancelled:        orders.filter((o) => o.status === "cancelled").length,
  };

  // ── Today analytics ────────────────────────────────────────────────────
  const todayOrders = orders.filter((o) => (o.created_at ?? "").slice(0, 10) === todayStr);
  const revenueToday = todayOrders
    .filter((o) => !["cancelled", "rejected"].includes(o.status))
    .reduce((s, o) => s + (Number(o.final_total) || 0), 0);
  const avgOrderValue = todayOrders.length > 0 ? revenueToday / todayOrders.length : 0;
  const activeDeliveries = orders.filter((o) => o.status === "dispatched" || o.status === "out_for_delivery").length;
  const pendingCount     = orders.filter((o) => o.status === "pending").length;

  // ── Client-side search + date + status filter + sort + paginate ────────
  const q = search.trim().toLowerCase();
  const visible = orders
    .filter((o) => {
      if (!passesDate(o)) return false;
      if (q && !(
        (o.short_id ?? "").toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.region ?? "").toLowerCase().includes(q) ||
        (o.driver_name ?? "").toLowerCase().includes(q)
      )) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === "asc" ? ta - tb : tb - ta;
    });

  const totalPages = Math.max(1, Math.ceil(visible.length / pageLimit));
  const safePage   = Math.min(page, totalPages);
  const paged      = visible.slice((safePage - 1) * pageLimit, safePage * pageLimit);

  return (
    <div className="p-6 md:p-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Track fulfillment, status, and driver assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAutoConfirmPreview}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            ⚡ Auto Confirm
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="shrink-0 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
          >
            + Create Order
          </button>
        </div>
      </div>

      {/* ── Analytics bar ───────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: "Orders Today",      value: todayOrders.length,                       color: "text-slate-800" },
          { label: "Revenue Today",     value: `₹${revenueToday.toLocaleString("en-IN")}`, color: "text-emerald-700" },
          { label: "Avg Order Value",   value: `₹${Math.round(avgOrderValue).toLocaleString("en-IN")}`, color: "text-blue-700" },
          { label: "Active Deliveries", value: activeDeliveries,                          color: "text-orange-700" },
          { label: "Pending",           value: pendingCount,                               color: "text-slate-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs shadow-sm">
            <span className={`font-bold tabular-nums ${color}`}>{value}</span>
            <span className="text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-7 mb-6">
        {[
          { label: "Total",            value: counts.total,            color: "text-slate-800",   bg: "bg-white",          filterVal: "all"              },
          { label: "Pending",          value: counts.pending,          color: "text-slate-600",   bg: "bg-slate-50",       filterVal: "pending"          },
          { label: "Confirmed",        value: counts.confirmed,        color: "text-blue-700",    bg: "bg-blue-50",        filterVal: "confirmed"        },
          { label: "Dispatched",       value: counts.dispatched,       color: "text-orange-700",  bg: "bg-orange-50",      filterVal: "dispatched"       },
          { label: "Out for Delivery", value: counts.out_for_delivery, color: "text-teal-700",    bg: "bg-teal-50",        filterVal: "out_for_delivery" },
          { label: "Delivered",        value: counts.delivered,        color: "text-emerald-700", bg: "bg-emerald-50",     filterVal: "delivered"        },
          { label: "Cancelled",        value: counts.cancelled,        color: "text-red-500",     bg: "bg-red-50",         filterVal: "cancelled"        },
        ].map(({ label, value, color, bg, filterVal }) => (
          <button
            key={label}
            type="button"
            onClick={() => setFilter(filterVal)}
            className={`rounded-xl border border-slate-200 ${bg} p-4 text-left shadow-sm hover:shadow-md transition-shadow ${
              filter === filterVal ? "ring-2 ring-offset-1 ring-slate-400" : ""
            }`}
          >
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </button>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Status dropdown */}
        <select
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setSearch(""); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 cursor-pointer"
        >
          {STATUS_TABS.map((tab) => (
            <option key={tab.value} value={tab.value}>
              {tab.label}{tab.value !== "all" ? ` (${orders.filter((o) => o.status === tab.value).length})` : ""}
            </option>
          ))}
        </select>

        {/* Period dropdown */}
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 cursor-pointer"
        >
          <option value="all">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="past">Past</option>
          <option value="custom">Custom Range</option>
        </select>

        {/* Custom date range inputs — shown only when custom is selected */}
        {dateFilter === "custom" && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              title="From date"
              className="rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 cursor-pointer"
            />
            <span className="text-slate-400 text-xs select-none">→</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => setCustomTo(e.target.value)}
              title="To date"
              className="rounded-lg border border-blue-300 bg-white px-2.5 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 cursor-pointer"
            />
            {(customFrom || customTo) && (
              <button
                type="button"
                onClick={() => { setCustomFrom(""); setCustomTo(""); }}
                className="text-xs text-slate-400 hover:text-slate-600 px-1"
                title="Clear dates"
              >
                ✕
              </button>
            )}
          </>
        )}

        {/* Sort dropdown */}
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 cursor-pointer"
        >
          <option value="desc">↓ Newest First</option>
          <option value="asc">↑ Oldest First</option>
        </select>

        {/* Search */}
        <div className="sm:ml-auto">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, customer, location…"
            className="w-full sm:w-60 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 placeholder:text-slate-400"
          />
        </div>

        {/* Active filter count + Select All Today */}
        <div className="sm:ml-auto flex items-center gap-3">
          {visible.length !== orders.length && (
            <span className="text-xs text-slate-400">{visible.length} of {orders.length} orders</span>
          )}
          {(() => {
            const todayCount = orders.filter((o) => (o.created_at ?? "").slice(0, 10) === todayStr).length;
            return todayCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  const ids = orders.filter((o) => (o.created_at ?? "").slice(0, 10) === todayStr).map((o) => o.id);
                  setSelectedOrders(ids);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
              >
                Select All Today ({todayCount})
              </button>
            ) : null;
          })()}
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}

      {/* Show N per page + range label */}
      {!loading && visible.length > 0 && (
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-xs text-slate-400">
            Showing {(safePage - 1) * pageLimit + 1}–{Math.min(safePage * pageLimit, visible.length)} of {visible.length} orders
          </p>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            Show
            <select
              value={pageLimit}
              onChange={(e) => setPageLimit(Number(e.target.value))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-slate-400 cursor-pointer"
            >
              {[10, 15, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            per page
          </label>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-16 text-center text-sm text-slate-400">Loading orders…</div>
        ) : visible.length === 0 ? (
          <div className="p-16 text-center">
            <p className="text-2xl mb-2">📋</p>
            <p className="text-sm text-slate-400">{search ? "No orders match your search." : "No orders for this filter."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="sticky top-0 border-b border-slate-200 bg-slate-50 z-10">
                  {/* Header checkbox — selects current page */}
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      className="cursor-pointer accent-slate-800"
                      checked={paged.length > 0 && paged.every((o) => selectedOrders.includes(o.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrders((prev) => [...new Set([...prev, ...paged.map((o) => o.id)])]);
                        } else {
                          setSelectedOrders((prev) => prev.filter((id) => !paged.some((o) => o.id === id)));
                        }
                      }}
                    />
                  </th>
                  {["Order ID", "Customer", "Location", "Driver", "Status", "Time", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paged.map((o) => (
                  <tr
                    key={o.id}
                    className={[
                      "hover:bg-slate-50 transition-colors cursor-pointer group",
                      selectedOrders.includes(o.id) ? "border-l-2 border-l-amber-400 bg-amber-50/30" : "",
                    ].join(" ")}
                    onClick={() => openDetail(o.id)}
                  >
                    {/* Per-row checkbox */}
                    <td className="w-10 px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="cursor-pointer accent-slate-800"
                        checked={selectedOrders.includes(o.id)}
                        onChange={(e) => {
                          setSelectedOrders((prev) =>
                            e.target.checked ? [...prev, o.id] : prev.filter((id) => id !== o.id)
                          );
                        }}
                      />
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-700">
                      #{o.short_id}
                    </td>
                    <td className="px-4 py-3.5">
                      <PriorityBadge priority={o.priority} />
                      <span className="font-medium text-slate-900">{o.customer_name}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-500">
                      {o.region || <span className="italic text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      {o.driver_name
                        ? <span className="font-semibold text-slate-800">{o.driver_name}</span>
                        : <span className="text-xs text-slate-300 italic">Not assigned</span>
                      }
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={[
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset",
                        statusBadgeClass(o.status),
                      ].join(" ")}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5" title={formatCreated(o.created_at)}>
                      <SlaCell order={o} />
                    </td>
                    <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openDetail(o.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pagination controls ───────────────────────────────────── */}
      {!loading && totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => setPage(1)}
            disabled={safePage === 1}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => Math.abs(p - safePage) <= 2)
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={[
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  p === safePage
                    ? "border-slate-800 bg-slate-800 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                ].join(" ")}
              >
                {p}
              </button>
            ))}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => setPage(totalPages)}
            disabled={safePage === totalPages}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            »
          </button>
        </div>
      )}

      {/* ── Floating Bulk Action Bar ──────────────────────────────────────── */}
      {selectedOrders.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 shadow-2xl text-white text-sm">
          <span className="font-semibold text-slate-300 whitespace-nowrap">
            {selectedOrders.length} selected
          </span>
          <div className="h-4 w-px bg-slate-700" />

          {/* Confirm */}
          <button
            type="button"
            onClick={handleBulkConfirm}
            disabled={bulkLoading}
            className="rounded-full bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            ✓ Confirm
          </button>

          {/* Dispatch */}
          <button
            type="button"
            onClick={handleBulkDispatch}
            disabled={bulkLoading}
            className="rounded-full bg-orange-500 hover:bg-orange-400 px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            🚚 Dispatch
          </button>

          {/* Assign Driver — popover */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDriverPopover((v) => !v)}
              disabled={bulkLoading}
              className="rounded-full bg-violet-600 hover:bg-violet-500 px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              👤 Assign Driver
            </button>
            {driverPopover && (
              <div className="absolute bottom-10 left-0 min-w-[180px] rounded-xl border border-slate-700 bg-slate-800 shadow-xl overflow-hidden">
                <p className="px-3 py-2 text-[10px] uppercase tracking-wide text-slate-400 font-semibold border-b border-slate-700">
                  Pick a driver
                </p>
                {drivers.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-slate-400 italic">No drivers available</p>
                ) : (
                  drivers.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleBulkAssign(d.id)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 transition-colors"
                    >
                      {d.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-slate-700" />

          {/* Clear */}
          <button
            type="button"
            onClick={() => { setSelectedOrders([]); setDriverPopover(false); }}
            className="text-slate-400 hover:text-white text-xs transition-colors"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={[
            "fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white shadow-xl transition-all",
            toast.type === "error" ? "bg-red-600" : "bg-emerald-600",
          ].join(" ")}
        >
          <span>{toast.type === "error" ? "⚠" : "✓"}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      {detailId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
        >
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-5 py-4">
              <h2
                id="order-detail-title"
                className="text-lg font-semibold text-slate-900"
              >
                Order{" "}
                <span className="font-mono text-base">
                  {detail?.short_id ?? "…"}
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {detailId && !detailLoading && detail ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void openEditFromDetail(detail)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Edit order
                    </button>
                    <button
                      type="button"
                      onClick={() => void openInvoicePdf(detailId)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      Download Invoice
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={closeDetail}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-4 p-5">
              {detailLoading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : null}
              {detailError ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  role="alert"
                >
                  {detailError}
                </p>
              ) : null}

              {detail ? (
                <>
                  <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Customer
                    </h3>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {detail.customer?.name ?? detail.customer_name}
                    </p>
                    {detail.customer_id ? (
                      <p className="mt-1 text-xs font-mono text-slate-500">
                        {detail.customer_id}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        Walk-in customer
                      </p>
                    )}
                    {(detail.customer?.phone || detail.guest_customer_phone) ? (
                      <p className="mt-2 text-sm text-slate-600">
                        <span className="text-slate-500">Phone: </span>
                        {detail.customer?.phone ??
                          detail.guest_customer_phone}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-600">
                      <span className="text-slate-500">Region: </span>
                      {detail.region || "—"}
                    </p>
                    {(detail.customer?.address || detail.customer_address) ? (
                      <p className="mt-2 text-sm text-slate-600">
                        <span className="text-slate-500">Address: </span>
                        {detail.customer?.address || detail.customer_address}
                      </p>
                    ) : null}
                  </section>

                  {/* Delivery Location */}
                  {(detail.delivery_lat != null && detail.delivery_lng != null) || detail.delivery_notes ? (
                    <section className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 shadow-sm">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-violet-600">
                        📍 Delivery Location
                      </h3>
                      {detail.delivery_lat != null && detail.delivery_lng != null ? (
                        <div className="mt-2 space-y-1.5">
                          <p className="font-mono text-sm text-violet-900">
                            {Number(detail.delivery_lat).toFixed(5)}, {Number(detail.delivery_lng).toFixed(5)}
                          </p>
                          <a
                            href={`https://www.google.com/maps?q=${detail.delivery_lat},${detail.delivery_lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                          >
                            Open in Google Maps ↗
                          </a>
                        </div>
                      ) : null}
                      {detail.delivery_notes ? (
                        <p className="mt-2 text-sm text-violet-800">
                          <span className="font-medium">Notes: </span>{detail.delivery_notes}
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Status
                    </h3>
                    {detail.status === "cancelled" ? (
                      <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 flex items-center gap-2">
                        <span className="text-base">🚫</span>
                        <div>
                          <p className="text-sm font-semibold text-red-700">Customer Cancelled</p>
                          <p className="text-xs text-red-500 mt-0.5">This order was cancelled by the customer. No further actions can be taken.</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <select
                          value={detail.status}
                          onChange={(e) => {
                            handleStatusChange(e.target.value);
                            if (e.target.value === "dispatched") handleDispatchEta();
                          }}
                          disabled={savingStatus}
                          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm capitalize text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option
                              key={s.value}
                              value={s.value}
                              disabled={
                                s.value === "dispatched" &&
                                !detail.driver_id &&
                                detail.status !== "dispatched"
                              }
                            >
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {savingStatus ? (
                          <p className="mt-1 text-xs text-slate-500">Saving…</p>
                        ) : null}
                        {/* Dispatch ETA banner */}
                        {dispatchEtaLoading && (
                          <p className="mt-2 text-xs text-slate-400">⏳ Calculating ETA…</p>
                        )}
                        {dispatchEta && !dispatchEtaLoading && (
                          <div className={[
                            "mt-2 rounded-lg border px-3 py-2.5 flex items-start gap-2",
                            dispatchEta.on_time
                              ? "border-emerald-200 bg-emerald-50"
                              : "border-red-200 bg-red-50",
                          ].join(" ")}>
                            <span className="text-base mt-0.5">
                              {dispatchEta.on_time ? "🟢" : "🔴"}
                            </span>
                            <div>
                              <p className={`text-sm font-semibold ${ dispatchEta.on_time ? "text-emerald-800" : "text-red-800"}`}>
                                {dispatchEta.suggestion}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                ~{dispatchEta.duration_min} min · {dispatchEta.distance_km} km
                                {dispatchEta.source === "estimate" ? " (estimated)" : ""}
                              </p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Assigned driver
                    </h3>
                    {detail.status === "cancelled" ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <p className="text-sm text-slate-400 italic">Driver assignment locked — order cancelled</p>
                      </div>
                    ) : (
                      <>
                        <p className="mt-2 text-sm font-medium text-slate-800">
                          <span className="font-normal text-slate-500">Driver: </span>
                          {detail.driver_name ?? detail.driver?.name ?? "Not assigned"}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <select
                            value={detail.driver_id ?? ""}
                            onChange={(e) => handleDriverChange(e.target.value)}
                            disabled={savingDriver || autoAssigning}
                            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                          >
                            <option value="">Unassigned</option>
                            {drivers.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                          <button
                            id="auto-assign-btn"
                            type="button"
                            onClick={handleAutoAssign}
                            disabled={autoAssigning || savingDriver}
                            title="Automatically pick the least-loaded driver"
                            className="shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-50 transition-colors"
                          >
                            {autoAssigning ? "…" : "⚡ Auto"}
                          </button>
                        </div>
                        {savingDriver ? (
                          <p className="mt-1 text-xs text-slate-500">Saving…</p>
                        ) : null}
                        {autoAssigning ? (
                          <p className="mt-1 text-xs text-violet-500">Finding best driver…</p>
                        ) : null}
                      </>
                    )}
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Products
                    </h3>
                    {detail.line_items?.length ? (
                      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                              <th className="px-3 py-2">Product</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Price</th>
                              <th className="px-3 py-2 text-right">Line</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {detail.line_items.map((line) => (
                              <tr key={line.id}>
                                <td className="px-3 py-2 text-slate-900">
                                  {line.item_name}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                  {line.quantity}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                                  ₹
                                  {Number(
                                    line.price ?? line.unit_price,
                                  ).toFixed(2)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                                  ₹
                                  {(
                                    Number(line.quantity) *
                                    Number(line.price ?? line.unit_price)
                                  ).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        No line items.
                      </p>
                    )}
                    <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm">
                      <div className="flex justify-between text-slate-600">
                        <span>Total items (qty sum)</span>
                        <span className="tabular-nums font-medium text-slate-800">
                          {lineItemsQuantitySum(detail.line_items)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span>
                        <span className="tabular-nums font-medium text-slate-800">
                          ₹
                          {(() => {
                            const s =
                              detail.totals?.subtotal ??
                              lineItemsTotal(detail.line_items);
                            return s != null ? s.toFixed(2) : "—";
                          })()}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>
                          Discount
                          {detail.discount_type === "percent"
                            ? " (%)"
                            : " (₹)"}
                        </span>
                        <span className="tabular-nums font-medium text-slate-800">
                          −₹
                          {Number(
                            detail.totals?.discount_value ??
                              detail.discount_value ??
                              0,
                          ).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                        <span>Grand total</span>
                        <span className="tabular-nums">
                          ₹
                          {(() => {
                            const sub =
                              detail.totals?.subtotal ??
                              lineItemsTotal(detail.line_items);
                            const disc = Number(
                              detail.totals?.discount_value ??
                                detail.discount_value ??
                                0,
                            );
                            const g =
                              detail.totals?.grand_total ??
                              (sub != null
                                ? Math.max(0, sub - disc)
                                : null);
                            return g != null ? g.toFixed(2) : "—";
                          })()}
                        </span>
                      </div>
                    </div>
                  </section>

                  <OrderTimeline order={detail} />

                  {/* ── Out for Delivery quick-action ──────────────────────── */}
                  {detail.status === "dispatched" && (
                    <button
                      type="button"
                      onClick={() => { handleStatusChange("out_for_delivery"); setShowOtp(false); }}
                      disabled={savingStatus}
                      className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    >
                      {savingStatus ? "Updating…" : "🚚 Mark Out for Delivery"}
                    </button>
                  )}

                  {/* ── Delivery Verification ──────────────────────────────── */}
                  {detail.verification_otp && (
                    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Delivery Verification
                        </h3>
                        {detail.verification_status === "verified" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            ✓ Verified via {detail.verification_method?.toUpperCase() ?? "OTP"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                            Pending
                          </span>
                        )}
                      </div>

                      {(detail.status === "out_for_delivery" || detail.status === "delivered") ? (
                        !showOtp ? (
                          <button
                            type="button"
                            onClick={() => setShowOtp(true)}
                            className="w-full rounded-lg border border-teal-300 bg-teal-50 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
                          >
                            🔐 View Delivery OTP
                          </button>
                        ) : (
                          <div className="flex items-start gap-4">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Delivery OTP</p>
                              <p className="font-mono text-3xl font-bold tracking-[0.3em] text-slate-800 select-all">
                                {detail.verification_otp}
                              </p>
                              <button
                                type="button"
                                onClick={() => setShowOtp(false)}
                                className="mt-1 text-[10px] text-slate-400 hover:text-slate-600"
                              >
                                Hide OTP
                              </button>
                            </div>
                            <div className="ml-auto shrink-0">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">QR Code</p>
                              <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(JSON.stringify({ orderId: detail.id, otp: detail.verification_otp }))}`}
                                alt="Delivery QR"
                                width={96}
                                height={96}
                                className="rounded-lg border border-slate-200 bg-white"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            </div>
                          </div>
                        )
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-1">
                          OTP visible only after order is marked "Out for Delivery"
                        </p>
                      )}
                    </section>
                  )}

                  <p className="text-xs text-slate-500">
                    Created {formatCreated(detail.created_at)} · Updated{" "}
                    {formatCreated(detail.updated_at)}
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-order-title"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h2
                id="create-order-title"
                className="text-lg font-semibold text-slate-900"
              >
                {editingOrderId ? "Edit order" : "Create order"}
              </h2>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateOrder} className="space-y-4 p-5">
              {createError ? (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                  role="alert"
                >
                  {createError}
                </p>
              ) : null}

              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm space-y-4">
                <div>
                  <label
                    htmlFor="create-order-customer"
                    className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Link account (optional)
                  </label>
                  <select
                    id="create-order-customer"
                    value={createCustomerId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreateCustomerId(v);
                      if (v) {
                        const c = createCustomers.find((x) => x.id === v);
                        if (c) {
                          setCreateCustomerName(c.name);
                          if (c.phone) setCreateCustomerPhone(c.phone);
                        }
                      }
                    }}
                    disabled={createCustomersLoading || createSubmitting}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                  >
                    <option value="">
                      {createCustomersLoading
                        ? "Loading customers…"
                        : "Walk-in (no linked account)"}
                    </option>
                    {createCustomers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="create-order-name"
                    className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Customer name
                    {!createCustomerId ? (
                      <span className="font-normal text-red-600"> *</span>
                    ) : null}
                  </label>
                  <input
                    id="create-order-name"
                    type="text"
                    value={createCustomerName}
                    onChange={(e) => setCreateCustomerName(e.target.value)}
                    placeholder="Full name"
                    disabled={createSubmitting}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="create-order-phone"
                    className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Customer phone <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="create-order-phone"
                    type="tel"
                    value={createCustomerPhone}
                    onChange={(e) => setCreateCustomerPhone(e.target.value)}
                    placeholder="e.g. +919876543210"
                    required
                    disabled={createSubmitting}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="create-order-region"
                      className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Region
                    </label>
                    <input
                      id="create-order-region"
                      type="text"
                      value={createRegion}
                      onChange={(e) => setCreateRegion(e.target.value)}
                      placeholder="Zone / area"
                      disabled={createSubmitting}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="create-order-address"
                      className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Address (optional)
                    </label>
                    <input
                      id="create-order-address"
                      type="text"
                      value={createAddress}
                      onChange={(e) => setCreateAddress(e.target.value)}
                      placeholder="Street, landmark"
                      disabled={createSubmitting}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>

              {/* ── Delivery Location ─────────────────────────── */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Delivery Location
                    <span className="ml-1 font-normal normal-case text-slate-400">(optional — visible to driver)</span>
                  </h3>
                  <button
                    type="button"
                    onClick={captureGPS}
                    disabled={gpsLoading || createSubmitting}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {gpsLoading ? (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent inline-block" />
                    ) : (
                      <span>📍</span>
                    )}
                    {gpsLoading ? "Locating…" : "Use current location"}
                  </button>
                </div>

                {gpsError ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
                    {gpsError}
                  </p>
                ) : null}

                {createDeliveryLat != null && createDeliveryLng != null ? (
                  <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                    <span className="text-emerald-600">✓</span>
                    <span className="font-medium text-emerald-800">
                      {createDeliveryLat.toFixed(5)}, {createDeliveryLng.toFixed(5)}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${createDeliveryLat},${createDeliveryLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-emerald-700 underline hover:text-emerald-900"
                    >
                      Preview ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => { setCreateDeliveryLat(null); setCreateDeliveryLng(null); }}
                      className="text-slate-400 hover:text-slate-600"
                      aria-label="Clear GPS"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No GPS pin set. Click "Use current location" or type coordinates below.</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={createDeliveryLat ?? ""}
                      onChange={(e) => setCreateDeliveryLat(e.target.value === "" ? null : Number(e.target.value))}
                      placeholder="e.g. 28.6139"
                      disabled={createSubmitting}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={createDeliveryLng ?? ""}
                      onChange={(e) => setCreateDeliveryLng(e.target.value === "" ? null : Number(e.target.value))}
                      placeholder="e.g. 77.2090"
                      disabled={createSubmitting}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 mb-1">Notes for driver (optional)</label>
                  <textarea
                    value={createDeliveryNotes}
                    onChange={(e) => setCreateDeliveryNotes(e.target.value)}
                    placeholder="e.g. Ring the bell, 3rd floor, near blue gate…"
                    rows={2}
                    disabled={createSubmitting}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm resize-none outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 shadow-sm space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Products
                </h3>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[180px] flex-1">
                    <label
                      htmlFor="create-draft-product"
                      className="block text-xs text-slate-500"
                    >
                      Product
                    </label>
                    <select
                      id="create-draft-product"
                      value={draftItemId}
                      onChange={(e) => setDraftItemId(e.target.value)}
                      disabled={createSubmitting || createCustomersLoading}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    >
                      <option value="">Select product</option>
                      {createInventory.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.name}
                          {inv.unit_price != null &&
                          Number(inv.unit_price) > 0
                            ? ` (${Number(inv.unit_price).toFixed(2)})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <label
                      htmlFor="create-draft-qty"
                      className="block text-xs text-slate-500"
                    >
                      Qty
                    </label>
                    <input
                      id="create-draft-qty"
                      type="number"
                      min="0.01"
                      step="any"
                      value={draftQty}
                      onChange={(e) => setDraftQty(e.target.value)}
                      disabled={createSubmitting}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                  <div className="w-28">
                    <label
                      htmlFor="create-draft-price"
                      className="block text-xs text-slate-500"
                    >
                      Price (₹)
                    </label>
                    <input
                      id="create-draft-price"
                      type="number"
                      min="0"
                      step="any"
                      value={draftPrice}
                      onChange={(e) => setDraftPrice(e.target.value)}
                      placeholder="Auto"
                      disabled={createSubmitting}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addProductToOrder}
                    disabled={createSubmitting}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Add product
                  </button>
                </div>
                {createLineItems.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Price (₹)</th>
                          <th className="px-3 py-2 text-right">Line</th>
                          <th className="w-16 px-3 py-2 text-right"> </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {createLineItems.map((row) => (
                          <tr key={row.key}>
                            <td className="px-3 py-2 text-slate-900">
                              <select
                                value={row.item_id}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  const inv = createInventory.find(
                                    (i) => i.id === id,
                                  );
                                  const up = Number(inv?.unit_price);
                                  updateCreateLine(row.key, {
                                    item_id: id,
                                    name: inv?.name ?? row.name,
                                    price:
                                      Number.isFinite(up) && up >= 0
                                        ? up
                                        : row.price,
                                  });
                                }}
                                className="max-w-[220px] rounded border border-slate-200 px-2 py-1 text-sm"
                              >
                                <option value="">Select product</option>
                                {createInventory.map((inv) => (
                                  <option key={inv.id} value={inv.id}>
                                    {inv.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={row.quantity}
                                onChange={(e) =>
                                  updateCreateLine(row.key, {
                                    quantity: Number(e.target.value),
                                  })
                                }
                                className="w-20 rounded border border-slate-200 px-2 py-1 text-right tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={row.price}
                                onChange={(e) =>
                                  updateCreateLine(row.key, {
                                    price: Number(e.target.value),
                                  })
                                }
                                className="w-24 rounded border border-slate-200 px-2 py-1 text-right tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                              ₹
                              {(
                                Number(row.quantity) * Number(row.price)
                              ).toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeProductLine(row.key)}
                                className="text-xs font-medium text-red-600 hover:text-red-700"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    No products added yet. Add at least one product (required).
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="create-discount-mode"
                      className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      Discount type
                    </label>
                    <select
                      id="create-discount-mode"
                      value={discountMode}
                      onChange={(e) => setDiscountMode(e.target.value)}
                      disabled={createSubmitting}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    >
                      <option value="fixed">Fixed (₹)</option>
                      <option value="percent">Percent (%)</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="create-discount-input"
                      className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {discountMode === "percent"
                        ? "Discount (%)"
                        : "Discount (₹)"}
                    </label>
                    <input
                      id="create-discount-input"
                      type="number"
                      min="0"
                      step="any"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      disabled={createSubmitting}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:opacity-50"
                    />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="tabular-nums font-medium text-slate-900">
                      ₹
                      {(() => {
                        const s = lineItemsTotal(createLineItems);
                        return s != null ? s.toFixed(2) : "0.00";
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Discount</span>
                    <span className="tabular-nums font-medium text-slate-900">
                      −₹
                      {discountFromSubtotal(
                        lineItemsTotal(createLineItems) ?? 0,
                        discountMode,
                        discountInput,
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                    <span>Grand total</span>
                    <span className="tabular-nums">
                      ₹
                      {(() => {
                        const sub = lineItemsTotal(createLineItems) ?? 0;
                        const disc = discountFromSubtotal(
                          sub,
                          discountMode,
                          discountInput,
                        );
                        return Math.max(0, sub - disc).toFixed(2);
                      })()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  disabled={createSubmitting}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting || createCustomersLoading}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                >
                  {createSubmitting
                    ? editingOrderId
                      ? "Saving…"
                      : "Creating…"
                    : editingOrderId
                      ? "Save changes"
                      : "Create order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Auto Confirm Preview Modal ────────────────────────────────────── */}
      {acOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setAcOpen(false); }}
        >
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">⚡ Auto Confirm Preview</h2>
              <button
                type="button"
                onClick={() => setAcOpen(false)}
                className="text-slate-400 hover:text-slate-700 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
              {acLoading ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <div className="w-8 h-8 rounded-full border-4 border-slate-200 border-t-slate-700 animate-spin" />
                  <p className="text-sm text-slate-500">Checking stock levels…</p>
                </div>
              ) : acPreview ? (
                acPreview.toConfirm.length === 0 && acPreview.toReject.length === 0 ? (
                  <p className="text-center text-sm text-slate-400 py-8">No pending orders to process.</p>
                ) : (
                  <div className="space-y-4">
                    {acPreview.toConfirm.length > 0 && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-sm font-semibold text-emerald-700 mb-2">
                          ✓ {acPreview.toConfirm.length} order{acPreview.toConfirm.length !== 1 ? "s" : ""} will be confirmed
                        </p>
                        <ul className="space-y-1">
                          {acPreview.toConfirm.map((r) => (
                            <li key={r.orderId} className="text-xs text-emerald-800">
                              #{String(r.orderId).slice(0, 8).toUpperCase()} — {r.customerName}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {acPreview.toReject.length > 0 && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <p className="text-sm font-semibold text-red-700 mb-2">
                          ✗ {acPreview.toReject.length} order{acPreview.toReject.length !== 1 ? "s" : ""} will be rejected — out of stock
                        </p>
                        <ul className="space-y-1.5">
                          {acPreview.toReject.map((r) => (
                            <li key={r.orderId} className="text-xs text-red-800">
                              #{String(r.orderId).slice(0, 8).toUpperCase()} — {r.customerName}
                              <span className="block text-red-500 pl-2">{r.reason}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAcOpen(false)}
                disabled={acConfirming}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runAutoConfirm}
                disabled={acLoading || acConfirming || !acPreview || (acPreview.toConfirm.length === 0 && acPreview.toReject.length === 0)}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              >
                {acConfirming ? "Processing…" : "Confirm All"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
