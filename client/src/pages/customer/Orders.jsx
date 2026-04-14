import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { customerApi } from "../../lib/customerApi.js";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rupee(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

// Items summary: "Rice x2, Dal x1"
function itemsSummary(items) {
  if (!items || items.length === 0) return "No items";
  const parts = items.slice(0, 3).map((li) => `${li.name} ×${li.quantity}`);
  if (items.length > 3) parts.push(`+${items.length - 3} more`);
  return parts.join(", ");
}

// ─── Status Config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:          { label: "Pending",          color: "#d97706", bg: "rgba(217,119,6,0.12)",  ring: "rgba(217,119,6,0.3)"   },
  confirmed:        { label: "Confirmed",        color: "#0ea5e9", bg: "rgba(14,165,233,0.12)", ring: "rgba(14,165,233,0.3)"  },
  dispatched:       { label: "Dispatched",       color: "#a855f7", bg: "rgba(168,85,247,0.12)", ring: "rgba(168,85,247,0.3)"  },
  out_for_delivery: { label: "Out for Delivery", color: "#14b8a6", bg: "rgba(20,184,166,0.12)", ring: "rgba(20,184,166,0.3)"  },
  delivered:        { label: "Delivered",        color: "#22c55e", bg: "rgba(34,197,94,0.12)",  ring: "rgba(34,197,94,0.3)"   },
  rejected:         { label: "Rejected",         color: "#ef4444", bg: "rgba(239,68,68,0.12)",  ring: "rgba(239,68,68,0.3)"   },
  cancelled:        { label: "Cancelled",        color: "#ef4444", bg: "rgba(239,68,68,0.12)",  ring: "rgba(239,68,68,0.3)"   },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "#94a3b8", bg: "rgba(148,163,184,0.12)", ring: "rgba(148,163,184,0.3)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "0.2rem 0.7rem",
      borderRadius: "9999px",
      fontSize: "0.72rem",
      fontWeight: 700,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
      color: cfg.color,
      background: cfg.bg,
      boxShadow: `0 0 0 1px ${cfg.ring}`,
    }}>
      {cfg.label}
    </span>
  );
}

// ─── Status Timeline ──────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { key: "pending",          label: "Pending",          icon: "\u{1f550}" },
  { key: "confirmed",        label: "Confirmed",        icon: "\u2705" },
  { key: "dispatched",       label: "Dispatched",       icon: "\ud83d\ude9a" },
  { key: "out_for_delivery", label: "Out for Delivery", icon: "\ud83d\udce6" },
  { key: "delivered",        label: "Delivered",        icon: "\ud83c\udf89" },
];

const STATUS_STEP_INDEX = {
  pending:          0,
  confirmed:        1,
  dispatched:       2,
  out_for_delivery: 3,
  delivered:        4,
  rejected: -1,
  cancelled: -1,
};

function StatusTimeline({ status }) {
  const currentIdx = STATUS_STEP_INDEX[status] ?? -1;
  const isFailed = status === "rejected" || status === "cancelled";

  if (isFailed) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: "0.5rem",
        padding: "0.75rem 1rem",
        borderRadius: "10px",
        background: "rgba(239,68,68,0.08)",
        border: "1px solid rgba(239,68,68,0.2)",
        fontSize: "0.8rem", color: "#f87171",
      }}>
        <span>⚠️</span>
        <span>
          This order was <strong>{status}</strong> and will not be fulfilled.
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex", alignItems: "center",
      gap: 0,
      padding: "0.75rem 0.5rem",
      overflowX: "auto",
    }}>
      {TIMELINE_STEPS.map((step, idx) => {
        const isPast    = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isFuture  = idx > currentIdx;

        const dotColor = isPast ? "#22c55e" : isCurrent ? "#6366f1" : "#334155";
        const textColor = isPast ? "#86efac" : isCurrent ? "#a5b4fc" : "#475569";
        const lineColor = isPast ? "#22c55e" : "#1e293b";

        return (
          <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx < TIMELINE_STEPS.length - 1 ? 1 : 0, minWidth: 0 }}>
            {/* Step */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: isCurrent ? "rgba(99,102,241,0.18)" : isPast ? "rgba(34,197,94,0.12)" : "rgba(51,65,85,0.3)",
                border: `2px solid ${dotColor}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.95rem",
                boxShadow: isCurrent ? "0 0 0 4px rgba(99,102,241,0.15)" : "none",
                transition: "all 0.25s",
              }}>
                {isPast ? "✓" : step.icon}
              </div>
              <span style={{
                fontSize: "0.68rem", fontWeight: isCurrent ? 700 : 500,
                color: textColor, whiteSpace: "nowrap",
                letterSpacing: "0.02em",
              }}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < TIMELINE_STEPS.length - 1 && (
              <div style={{
                flex: 1, height: 2,
                background: lineColor,
                marginBottom: "1.2rem",
                transition: "background 0.3s",
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Order Detail Modal ────────────────────────────────────────────────────────

function OrderDetailModal({ order, onClose, onCancelled }) {
  const overlayRef = useRef(null);
  const navigate   = useNavigate();
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr]   = useState("");

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  async function handleCancel() {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    setCancelling(true);
    setCancelErr("");
    try {
      await customerApi(`/api/customer/orders/${order.id}/cancel`, { method: "PUT" });
      onCancelled(order.id);
    } catch (e) {
      setCancelErr(e instanceof Error ? e.message : "Failed to cancel order");
    } finally {
      setCancelling(false);
    }
  }

  const subtotal    = order.subtotal ?? 0;
  const finalTotal  = order.final_total ?? 0;
  const hasDiscount = subtotal !== finalTotal;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
        animation: "overlayIn 0.2s ease",
      }}
    >
      <div style={{
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 20,
        width: "100%", maxWidth: 640,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        animation: "modalIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid #334155",
          position: "sticky", top: 0, background: "#1e293b", zIndex: 1, borderRadius: "20px 20px 0 0",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: "rgba(99,102,241,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1.1rem",
            }}>📦</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, color: "#f1f5f9", fontSize: "0.95rem" }}>
                  #{order.short_id}
                </span>
                <StatusBadge status={order.status} />
              </div>
              <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.15rem" }}>
                {formatDate(order.created_at)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent", border: "none", color: "#64748b",
              fontSize: "1.1rem", cursor: "pointer", width: 32, height: 32,
              borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#334155"; e.currentTarget.style.color = "#f1f5f9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#64748b"; }}
          >✕</button>
        </div>

        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Timeline */}
          <StatusTimeline status={order.status} />

          {/* Meta info grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem",
          }}>
            <InfoCard icon="📍" label="Region" value={order.region || "—"} />
            <InfoCard icon="🗺️" label="Delivery Address" value={order.address || "—"} />
            <InfoCard
              icon="🧑‍✈️"
              label="Driver"
              value={order.driver_name ?? "Being arranged…"}
              valueStyle={!order.driver_name ? { color: "#64748b", fontStyle: "italic" } : {}}
            />
            <InfoCard icon="🕐" label="Last Updated" value={formatDate(order.updated_at)} />
          </div>

          {/* Line items table */}
          <div>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
              Items
            </p>
            <div style={{ borderRadius: 10, border: "1px solid #334155", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0f172a" }}>
                    {["Product", "Qty", "Price/unit", "Total"].map((h, i) => (
                      <th key={h} style={{
                        padding: "0.6rem 0.9rem",
                        fontSize: "0.7rem", fontWeight: 600, color: "#64748b",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        textAlign: i > 0 ? "right" : "left",
                        borderBottom: "1px solid #334155",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(order.items ?? []).map((li, i) => {
                    const lineTotal = (li.unit_price ?? 0) * (li.quantity ?? 0);
                    return (
                      <tr key={i} style={{ borderBottom: i < order.items.length - 1 ? "1px solid #1e2d41" : "none" }}>
                        <td style={{ padding: "0.65rem 0.9rem", color: "#e2e8f0", fontSize: "0.85rem", fontWeight: 500 }}>{li.name}</td>
                        <td style={{ padding: "0.65rem 0.9rem", color: "#94a3b8", fontSize: "0.85rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{li.quantity}</td>
                        <td style={{ padding: "0.65rem 0.9rem", color: "#94a3b8", fontSize: "0.85rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{rupee(li.unit_price)}</td>
                        <td style={{ padding: "0.65rem 0.9rem", color: "#f1f5f9", fontSize: "0.85rem", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{rupee(lineTotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div style={{
            background: "#0f172a",
            borderRadius: 12,
            padding: "1rem 1.25rem",
            display: "flex", flexDirection: "column", gap: "0.5rem",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#94a3b8" }}>
              <span>Subtotal</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{rupee(subtotal)}</span>
            </div>
            {hasDiscount && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#4ade80" }}>
                <span>Discount</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>-{rupee(subtotal - finalTotal)}</span>
              </div>
            )}
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: "1rem", fontWeight: 800,
              color: "#f1f5f9",
              borderTop: "1px solid #334155", paddingTop: "0.5rem", marginTop: "0.1rem",
            }}>
              <span>Final Total</span>
              <span style={{ fontVariantNumeric: "tabular-nums", color: "#818cf8" }}>{rupee(finalTotal)}</span>
            </div>
          </div>

          {/* OTP Banner — visible only when order is out for delivery */}
          {order.status === "out_for_delivery" && order.verification_otp && (
            <div style={{
              background: "linear-gradient(135deg, rgba(20,184,166,0.15), rgba(20,184,166,0.05))",
              border: "1px solid rgba(20,184,166,0.4)",
              borderRadius: 14,
              padding: "1.25rem 1.5rem",
              display: "flex", flexDirection: "column", gap: "0.5rem",
              boxShadow: "0 0 0 4px rgba(20,184,166,0.08)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.2rem" }}>🔐</span>
                <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#14b8a6", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Delivery OTP
                </p>
              </div>
              <p style={{
                fontFamily: "monospace",
                fontSize: "2rem",
                fontWeight: 900,
                letterSpacing: "0.4em",
                color: "#f0fdf4",
                lineHeight: 1,
              }}>
                {order.verification_otp}
              </p>
              <p style={{ fontSize: "0.78rem", color: "#5eead4", lineHeight: 1.5 }}>
                Share this OTP with the driver when they arrive to confirm your delivery.
              </p>
            </div>
          )}

          {/* Delivery proof */}
          {order.status === "delivered" && order.proof_url && (
            <div>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
                Delivery Proof
              </p>
              <div style={{
                borderRadius: 12, overflow: "hidden",
                border: "1px solid #334155",
                background: "#0f172a",
              }}>
                <img
                  src={order.proof_url}
                  alt="Delivery proof"
                  style={{ width: "100%", maxHeight: 320, objectFit: "cover", display: "block" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
            </div>
          )}

          {/* Cancel button */}
          {order.status === "pending" && (
            <div>
              {cancelErr && (
                <div style={{
                  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 8, padding: "0.6rem 0.9rem",
                  color: "#f87171", fontSize: "0.82rem", marginBottom: "0.5rem",
                }}>
                  {cancelErr}
                </div>
              )}
              <button
                id={`cancel-order-${order.id}`}
                onClick={handleCancel}
                disabled={cancelling}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                  padding: "0.7rem 1rem",
                  borderRadius: 10,
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#f87171", fontWeight: 700, fontSize: "0.875rem",
                  cursor: cancelling ? "not-allowed" : "pointer",
                  opacity: cancelling ? 0.6 : 1,
                  transition: "all 0.18s",
                }}
                onMouseEnter={(e) => { if (!cancelling) { e.currentTarget.style.background = "rgba(239,68,68,0.15)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.5)"; } }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)"; }}
              >
                {cancelling
                  ? <><span className="o-spinner" />Cancelling…</>
                  : <>✕ Cancel Order</>
                }
              </button>
            </div>
          )}

          {/* Reorder — shown for delivered or cancelled orders */}
          {["delivered", "cancelled", "rejected"].includes(order.status) && Array.isArray(order.items) && order.items.length > 0 && (
            <button
              id={`reorder-${order.id}`}
              type="button"
              onClick={() => {
                // Store items in sessionStorage so Home.jsx can pick them up
                try {
                  sessionStorage.setItem(
                    "reorder_items",
                    JSON.stringify(order.items.map((it) => ({ item_id: it.id ?? it.inventory_item_id, name: it.name, quantity: it.quantity ?? 1 })))
                  );
                } catch { /* ignore storage errors */ }
                onClose();
                navigate("/customer/home", { state: { reorder: true } });
              }}
              style={{
                width: "100%", marginTop: "0.5rem",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                padding: "0.7rem 1rem",
                borderRadius: 10,
                background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.35)",
                color: "#a5b4fc", fontWeight: 700, fontSize: "0.875rem",
                cursor: "pointer", transition: "all 0.18s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.1)"; }}
            >
              🔁 Reorder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value, valueStyle = {} }) {
  return (
    <div style={{
      background: "#0f172a",
      borderRadius: 10,
      padding: "0.75rem 1rem",
      border: "1px solid #1e293b",
    }}>
      <p style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>
        {icon} {label}
      </p>
      <p style={{ fontSize: "0.82rem", color: "#cbd5e1", fontWeight: 500, lineHeight: 1.4, ...valueStyle }}>
        {value}
      </p>
    </div>
  );
}

// ─── Order Card ────────────────────────────────────────────────────────────────

function OrderCard({ order, onClick }) {
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;

  return (
    <button
      id={`order-card-${order.id}`}
      type="button"
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        background: "#1e293b",
        border: "1px solid #334155",
        borderRadius: 16,
        padding: "1.1rem 1.25rem",
        cursor: "pointer",
        transition: "border-color 0.18s, transform 0.18s, box-shadow 0.18s",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#6366f1";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(99,102,241,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#334155";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "0.6rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "0.9rem", color: "#f1f5f9" }}>
            #{order.short_id}
          </span>
          <StatusBadge status={order.status} />
          {order.region && (
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>📍 {order.region}</span>
          )}
        </div>
        <span style={{ fontSize: "0.75rem", color: "#64748b", flexShrink: 0 }}>
          {formatDate(order.created_at)}
        </span>
      </div>

      {/* Items summary */}
      <p style={{ fontSize: "0.82rem", color: "#94a3b8", marginBottom: "0.8rem", lineHeight: 1.4 }}>
        {itemsSummary(order.items)}
      </p>

      {/* Bottom row: pricing */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
            Subtotal: <span style={{ fontWeight: 600, color: "#94a3b8", fontVariantNumeric: "tabular-nums" }}>{rupee(order.subtotal)}</span>
          </span>
          <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
            Total: <span style={{ fontWeight: 700, color: "#818cf8", fontVariantNumeric: "tabular-nums" }}>{rupee(order.final_total)}</span>
          </span>
        </div>
        <span style={{ fontSize: "0.72rem", color: "#475569", flexShrink: 0 }}>
          View details →
        </span>
      </div>
    </button>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function CustomerOrders() {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [selectedOrder, setSelected] = useState(null);
  const [filterStatus, setFilter] = useState("all");
  const [toast, setToast]         = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await customerApi("/api/customer/orders");
      setOrders(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function handleCancelled(orderId) {
    setOrders((prev) =>
      prev.map((o) => o.id === orderId ? { ...o, status: "cancelled" } : o)
    );
    setSelected((prev) => prev?.id === orderId ? { ...prev, status: "cancelled" } : prev);
    setToast({ message: "✅ Order cancelled successfully.", type: "success" });
    setTimeout(() => setToast(null), 3500);
  }

  const FILTERS = [
    { key: "all", label: "All" },
    { key: "pending",   label: "Pending" },
    { key: "confirmed", label: "Confirmed" },
    { key: "dispatched",       label: "Dispatched" },
    { key: "out_for_delivery", label: "Out for Delivery" },
    { key: "delivered", label: "Delivered" },
    { key: "rejected",  label: "Rejected" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const filtered = filterStatus === "all"
    ? orders
    : orders.filter((o) => o.status === filterStatus);

  return (
    <>
      <style>{`
        @keyframes overlayIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.94) translateY(12px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes o-spin { to { transform: rotate(360deg) } }
        @keyframes o-fadeSlide { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .o-spinner {
          display: inline-block; width: 13px; height: 13px;
          border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff;
          border-radius: 50%; animation: o-spin 0.7s linear infinite;
        }
      `}</style>

      {/* Page Header */}
      <div style={{ marginBottom: "1.75rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.02em" }}>
            My Orders
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "0.2rem" }}>
            {orders.length} order{orders.length !== 1 ? "s" : ""} placed •{" "}
            <Link to="/customer/home" style={{ color: "#818cf8", textDecoration: "none", fontWeight: 600 }}>
              Continue Shopping →
            </Link>
          </p>
        </div>
        <button
          id="refresh-orders-btn"
          type="button"
          onClick={load}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            padding: "0.55rem 1rem",
            borderRadius: 9, background: "transparent",
            border: "1px solid #334155", color: "#94a3b8",
            fontWeight: 600, fontSize: "0.82rem", cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#1e293b"; e.currentTarget.style.color = "#f1f5f9"; e.currentTarget.style.borderColor = "#475569"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.borderColor = "#334155"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          marginBottom: "1rem", padding: "0.75rem 1rem",
          borderRadius: 10, fontSize: "0.85rem",
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171",
        }}>
          {error}{" "}
          <button onClick={load} style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", fontWeight: 600, fontSize: "0.82rem" }}>
            Retry
          </button>
        </div>
      )}

      {/* Filter tabs */}
      {!loading && orders.length > 0 && (
        <div style={{
          display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1.25rem",
        }}>
          {FILTERS.map(({ key, label }) => {
            const count = key === "all" ? orders.length : orders.filter((o) => o.status === key).length;
            if (key !== "all" && count === 0) return null;
            const isActive = filterStatus === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: "0.35rem 0.9rem",
                  borderRadius: 9999,
                  fontSize: "0.78rem", fontWeight: 600,
                  cursor: "pointer",
                  border: isActive ? "1px solid #6366f1" : "1px solid #334155",
                  background: isActive ? "rgba(99,102,241,0.15)" : "transparent",
                  color: isActive ? "#818cf8" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                {label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeletons */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              height: 112, borderRadius: 16,
              background: "linear-gradient(90deg, #1e293b 25%, #263248 50%, #1e293b 75%)",
              backgroundSize: "200% 100%",
              animation: "o-fadeSlide 0.4s ease both",
              animationDelay: `${i * 0.05}s`,
            }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          borderRadius: 16,
          background: "#1e293b", border: "1px solid #334155",
          padding: "5rem 1rem", textAlign: "center",
        }}>
          <p style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
            {filterStatus === "all" ? "📦" : "🔍"}
          </p>
          <p style={{ fontSize: "0.9rem", fontWeight: 600, color: "#e2e8f0" }}>
            {filterStatus === "all" ? "No orders yet" : `No ${filterStatus} orders`}
          </p>
          <p style={{ marginTop: "0.3rem", fontSize: "0.8rem", color: "#64748b" }}>
            {filterStatus === "all" ? (
              <>Head to the <Link to="/customer/home" style={{ color: "#818cf8", fontWeight: 600, textDecoration: "none" }}>Shop</Link> to place your first order.</>
            ) : (
              <button onClick={() => setFilter("all")} style={{ background: "none", border: "none", color: "#818cf8", cursor: "pointer", fontWeight: 600, fontSize: "0.8rem" }}>
                Show all orders
              </button>
            )}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => setSelected(order)}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelected(null)}
          onCancelled={handleCancelled}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: "1.5rem", left: "50%", transform: "translateX(-50%)",
          zIndex: 2000,
          padding: "0.7rem 1.4rem",
          borderRadius: 12,
          background: toast.type === "success" ? "#16a34a" : "#dc2626",
          color: "#fff", fontWeight: 600, fontSize: "0.875rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          animation: "o-fadeSlide 0.3s ease",
          whiteSpace: "nowrap",
        }}>
          {toast.message}
        </div>
      )}
    </>
  );
}
