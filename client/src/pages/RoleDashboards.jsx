import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function statusColor(s) {
  switch (s) {
    case "confirmed":  return "bg-sky-400/20 text-sky-300 ring-sky-400/30";
    case "dispatched": return "bg-violet-400/20 text-violet-300 ring-violet-400/30";
    case "delivered":  return "bg-emerald-400/20 text-emerald-300 ring-emerald-400/30";
    case "pending":    return "bg-amber-400/20 text-amber-300 ring-amber-400/30";
    default:           return "bg-slate-400/20 text-slate-300 ring-slate-400/30";
  }
}

// ─── Customer Dashboard ───────────────────────────────────────────────────────

export function CustomerDashboard() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <h1 className="text-xl font-semibold">Customer dashboard</h1>
      <p className="text-sm text-slate-400 mt-2">Placeholder — customer portal.</p>
    </div>
  );
}

// ─── Driver Dashboard ─────────────────────────────────────────────────────────

export function DriverDashboard() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  // Driver's own GPS
  const [myLat, setMyLat] = useState(null);
  const [myLng, setMyLng] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  const [driverName, setDriverName] = useState("");

  // Load driver profile + active orders directly via Supabase client
  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("Not signed in");

      const uid = session.user.id;

      // Get driver profile for name
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", uid)
        .maybeSingle();
      setDriverName(profile?.display_name ?? "Driver");

      // Get active orders assigned to this driver
      const { data, error: oErr } = await supabase
        .from("orders")
        .select("id, region, status, created_at, updated_at, customer_address, guest_customer_name, guest_customer_phone, delivery_lat, delivery_lng, delivery_notes")
        .eq("driver_id", uid)
        .in("status", ["confirmed", "dispatched"])
        .order("created_at", { ascending: false });

      if (oErr) throw new Error(oErr.message);
      setOrders(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  function captureMyLocation() {
    if (!navigator.geolocation) {
      setGpsError("Geolocation not supported by this browser.");
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLat(pos.coords.latitude);
        setMyLng(pos.coords.longitude);
        setGpsLoading(false);
      },
      (err) => {
        setGpsError("Could not get location: " + err.message);
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const hasActiveOrders = orders.length > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top bar */}
      <div className="border-b border-slate-800 bg-slate-900 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Driver Portal</p>
          <h1 className="text-lg font-semibold text-white">{driverName || "Driver"}</h1>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-6 space-y-5">

        {/* My Location Card */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">📍 My Current Location</h2>
            <button
              type="button"
              onClick={captureMyLocation}
              disabled={gpsLoading}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {gpsLoading ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent inline-block" />
              ) : null}
              {gpsLoading ? "Locating…" : "Pin My Location"}
            </button>
          </div>

          {gpsError ? (
            <p className="rounded-md border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-400">
              {gpsError}
            </p>
          ) : null}

          {myLat != null && myLng != null ? (
            <div className="space-y-2">
              <p className="font-mono text-sm text-emerald-400">
                {myLat.toFixed(5)}, {myLng.toFixed(5)}
              </p>
              <div className="flex gap-2 flex-wrap">
                <a
                  href={`https://www.google.com/maps?q=${myLat},${myLng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-600"
                >
                  View on Maps ↗
                </a>
                <button
                  type="button"
                  onClick={() => { setMyLat(null); setMyLng(null); }}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Tap "Pin My Location" to capture your GPS coordinates.
            </p>
          )}
        </div>

        {/* Active Orders */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3 uppercase tracking-wide">
            Active Deliveries
            {!loading && (
              <span className="ml-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">
                {orders.length}
              </span>
            )}
          </h2>

          {error ? (
            <div className="rounded-xl border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          ) : loading ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-8 text-center text-sm text-slate-500">
              Loading your deliveries…
            </div>
          ) : !hasActiveOrders ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-8 text-center">
              <p className="text-3xl mb-2">🚚</p>
              <p className="text-sm text-slate-400">No active deliveries assigned to you.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const shortId = String(order.id).replace(/-/g, "").slice(0, 8).toUpperCase();
                const customerName = order.guest_customer_name || "Customer";
                const hasDeliveryPin = order.delivery_lat != null && order.delivery_lng != null;
                const isOpen = expanded === order.id;

                return (
                  <div
                    key={order.id}
                    className="rounded-xl border border-slate-700 bg-slate-800/60 overflow-hidden"
                  >
                    {/* Order header — always visible */}
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-slate-700/30 transition-colors"
                      onClick={() => setExpanded(isOpen ? null : order.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono text-xs font-bold text-slate-400 shrink-0">
                          #{shortId}
                        </span>
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {customerName}
                        </span>
                        {order.region ? (
                          <span className="text-xs text-slate-500 hidden sm:block">
                            {order.region}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={[
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
                            statusColor(order.status),
                          ].join(" ")}
                        >
                          {order.status}
                        </span>
                        <span className="text-slate-500 text-sm">{isOpen ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {/* Expanded details */}
                    {isOpen && (
                      <div className="border-t border-slate-700 px-4 py-4 space-y-4">

                        {/* Customer info */}
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                          <p className="text-sm text-slate-200">{customerName}</p>
                          {order.guest_customer_phone ? (
                            <a
                              href={`tel:${order.guest_customer_phone}`}
                              className="inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300"
                            >
                              📞 {order.guest_customer_phone}
                            </a>
                          ) : null}
                          {order.customer_address ? (
                            <p className="text-sm text-slate-400">📮 {order.customer_address}</p>
                          ) : null}
                        </div>

                        {/* Delivery Location */}
                        <div className="rounded-lg border border-violet-700/50 bg-violet-900/20 p-3 space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet-400">
                            📍 Delivery Location
                          </p>
                          {hasDeliveryPin ? (
                            <>
                              <p className="font-mono text-sm text-violet-300">
                                {Number(order.delivery_lat).toFixed(5)}, {Number(order.delivery_lng).toFixed(5)}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${order.delivery_lat},${order.delivery_lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                                >
                                  🗺 Navigate with Google Maps
                                </a>
                                {myLat != null && myLng != null ? (
                                  <a
                                    href={`https://www.google.com/maps/dir/${myLat},${myLng}/${order.delivery_lat},${order.delivery_lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded-md border border-violet-600 px-3 py-1.5 text-xs font-medium text-violet-300 hover:bg-violet-900/40"
                                  >
                                    📍 From my location
                                  </a>
                                ) : null}
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-500">
                              No GPS pin set for this order. Check address above.
                            </p>
                          )}
                          {order.delivery_notes ? (
                            <div className="rounded-md border border-violet-700/40 bg-violet-900/30 px-3 py-2">
                              <p className="text-xs font-medium text-violet-400 mb-0.5">Driver Notes</p>
                              <p className="text-sm text-violet-200">{order.delivery_notes}</p>
                            </div>
                          ) : null}
                        </div>

                        {/* Timestamps */}
                        <p className="text-xs text-slate-600">
                          Created {fmtDate(order.created_at)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
