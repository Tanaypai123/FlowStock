import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../../lib/adminApi.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
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

function deliveryStatusBadgeClass(status) {
  switch (status) {
    case "delivered":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200";
    case "in_transit":
    case "dispatched":
      return "bg-violet-100 text-violet-900 ring-violet-200";
    case "assigned":
    case "confirmed":
      return "bg-sky-100 text-sky-900 ring-sky-200";
    case "pending":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "rejected":
    case "cancelled":
      return "bg-red-100 text-red-900 ring-red-200";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-200";
  }
}

// ─── Add Driver Modal ─────────────────────────────────────────────────────────

function AddDriverModal({ onClose, onCreated }) {
  // Steps: "search" → "new" | "existing" → "success"
  const [step,       setStep]       = useState("search");
  const [phone,      setPhone]      = useState("");
  const [name,       setName]       = useState("");
  const [searching,  setSearching]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);
  const [found,      setFound]      = useState(null);   // existing driver data or null
  const [successData, setSuccessData] = useState(null);

  // ── Step 1: Search by phone ──────────────────────────────────────────────
  async function handleSearch(e) {
    e.preventDefault();
    setError(null);
    if (!phone.trim()) { setError("Enter a phone number."); return; }
    setSearching(true);
    try {
      const json = await adminApi(`/api/admin/drivers/search?phone=${encodeURIComponent(phone.trim())}`);
      if (json.found) {
        setFound(json.data);
        setStep("existing");
      } else {
        setFound(null);
        setStep("new");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  // ── Step 2a: Create new driver ───────────────────────────────────────────
  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError("Name is required."); return; }
    setSubmitting(true);
    try {
      const json = await adminApi("/api/admin/drivers/create", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      setSuccessData(json.data);
      setStep("success");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create driver.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 2b: Link existing driver ────────────────────────────────────────
  async function handleAddExisting() {
    setError(null);
    setSubmitting(true);
    try {
      await adminApi("/api/admin/drivers/add-existing", {
        method: "POST",
        body: JSON.stringify({ driverId: found.id }),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link driver.");
    } finally {
      setSubmitting(false);
    }
  }

  const stepTitle = {
    search:   "Add Driver",
    new:      "New Driver Details",
    existing: "Driver Found",
    success:  "Driver Added ✓",
  }[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog" aria-modal="true" aria-labelledby="add-driver-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 id="add-driver-title" className="text-lg font-semibold text-slate-900">
            {stepTitle}
          </h2>
          <button type="button" onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          {/* ── STEP: search ──────────────────────────────────────────────── */}
          {step === "search" && (
            <form onSubmit={handleSearch} className="space-y-4">
              <div>
                <label htmlFor="driver-phone-search" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Phone Number
                  <span className="ml-1 text-xs font-normal text-slate-500">(E.164 e.g. +919876543210)</span>
                </label>
                <input id="driver-phone-search" type="tel" value={phone} autoFocus
                  onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                💡 If this driver already exists in the system, you can add them to your business instantly.
              </p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" id="search-driver-btn" disabled={searching}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {searching ? "Searching…" : "Search Driver"}
                </button>
              </div>
            </form>
          )}

          {/* ── STEP: new ─────────────────────────────────────────────────── */}
          {step === "new" && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                ✅ No driver found with <span className="font-mono">{phone}</span>. Fill in their name to create.
              </div>
              <div>
                <label htmlFor="driver-phone-ro" className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
                <input id="driver-phone-ro" type="tel" value={phone} readOnly
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 cursor-not-allowed" />
              </div>
              <div>
                <label htmlFor="driver-name-new" className="mb-1.5 block text-sm font-medium text-slate-700">Full Name <span className="text-red-500">*</span></label>
                <input id="driver-name-new" type="text" value={name} autoFocus
                  onChange={(e) => setName(e.target.value)} placeholder="e.g. Ravi Kumar"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                🔑 The driver will set their own password on first login at <span className="font-mono">/driver/login</span>
              </p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => { setStep("search"); setError(null); }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  ← Back
                </button>
                <button type="submit" id="create-driver-btn" disabled={submitting}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
                  {submitting ? "Creating…" : "Create & Add to Business"}
                </button>
              </div>
            </form>
          )}

          {/* ── STEP: existing ────────────────────────────────────────────── */}
          {step === "existing" && found && (
            <div className="space-y-4">
              {/* Driver card */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {(found.name ?? "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{found.name ?? "—"}</p>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">{found.phone}</p>
                  {found.vehicle_details && (
                    <p className="text-xs text-slate-400 mt-0.5">🚗 {found.vehicle_details}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">
                    Works with {found.businesses_count ?? 0} business{(found.businesses_count ?? 0) !== 1 ? "es" : ""}
                    {" · "}Profile: {found.is_profile_complete ? "✅ Set up" : "⏳ Pending"}
                  </p>
                </div>
              </div>

              {found.alreadyInThisBusiness ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  ⚠️ This driver is already added to your business.
                </div>
              ) : (
                <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                  This driver is registered in the system. Click below to add them to your business.
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => { setStep("search"); setError(null); }}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  ← Back
                </button>
                {!found.alreadyInThisBusiness && (
                  <button id="add-existing-driver-btn" type="button" onClick={handleAddExisting} disabled={submitting}
                    className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                    {submitting ? "Adding…" : "Add to This Business"}
                  </button>
                )}
                {found.alreadyInThisBusiness && (
                  <button type="button" onClick={onClose}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                    Close
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── STEP: success ─────────────────────────────────────────────── */}
          {step === "success" && successData && (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                <p className="font-semibold text-emerald-800 mb-2">✅ Driver created and added!</p>
                <div className="space-y-1 text-sm text-emerald-700">
                  <p>Name: <span className="font-medium">{successData.name}</span></p>
                  <p>Phone: <span className="font-mono">{successData.phone}</span></p>
                </div>
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
                {successData.note ?? "Share the phone number – driver sets their password on first login at /driver/login"}
              </p>
              <div className="flex justify-end">
                <button type="button" onClick={onClose}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Deliveries Modal ─────────────────────────────────────────────────────────

function DeliveriesModal({ driver, onClose }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const json = await adminApi(`/api/admin/drivers/${driver.id}/deliveries`);
        if (!cancelled) {
          setDeliveries(Array.isArray(json.data) ? json.data : []);
        }
      } catch (/** @type {any} */ err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load deliveries.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [driver.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deliveries-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id="deliveries-modal-title"
              className="text-lg font-semibold text-slate-900"
            >
              Delivery History
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">{driver.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-8 text-center text-sm text-slate-500">
              Loading deliveries…
            </p>
          ) : error ? (
            <p
              className="m-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              {error}
            </p>
          ) : deliveries.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              No deliveries found for this driver.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Order ID
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Customer
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Region
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium text-slate-600">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deliveries.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs text-slate-800">
                        {d.short_id ?? String(d.id ?? "").slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3 text-slate-800">
                        {d.customer_name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {d.region || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={[
                            "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
                            deliveryStatusBadgeClass(d.status),
                          ].join(" ")}
                        >
                          {d.status ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {d.status === "delivered" && d.delivered_at ? (
                          <span title="Delivered at">{formatDate(d.delivered_at)}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">
                            Placed {formatDate(d.created_at)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function Drivers() {
  const [drivers,    setDrivers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [addOpen,    setAddOpen]    = useState(false);
  const [viewDriver, setViewDriver] = useState(null);
  const [search,     setSearch]     = useState("");
  const [removing,   setRemoving]   = useState(null); // driverId being removed

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminApi("/api/admin/drivers");
      setDrivers(Array.isArray(json.data) ? json.data : []);
    } catch (/** @type {any} */ err) {
      setError(err instanceof Error ? err.message : "Failed to load drivers.");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleRemove(driverId) {
    if (!window.confirm("Remove this driver from your business? They can still work with other businesses.")) return;
    setRemoving(driverId);
    try {
      await adminApi(`/api/admin/drivers/${driverId}/remove`, { method: "DELETE" });
      setDrivers((prev) => prev.filter((d) => d.id !== driverId));
    } catch (/** @type {any} */ err) {
      alert(err instanceof Error ? err.message : "Failed to remove driver.");
    } finally {
      setRemoving(null);
    }
  }

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

  const filtered = drivers.filter(
    (d) =>
      !search ||
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.includes(search),
  );

  return (
    <div className="p-6 md:p-8">
      {/* Page Header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Drivers
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage your delivery drivers and view their history.
          </p>
        </div>
        <button
          id="open-add-driver-btn"
          type="button"
          onClick={() => setAddOpen(true)}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + Add Driver
        </button>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Drivers
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {loading ? "—" : drivers.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Active Deliveries
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {loading
              ? "—"
              : drivers.reduce((s, d) => s + (d.active_deliveries ?? 0), 0)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Delivered
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {loading
              ? "—"
              : drivers.reduce((s, d) => s + (d.total_delivered ?? 0), 0)}
          </p>
        </div>
      </div>

      {/* Search + Refresh toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          id="driver-search-input"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 sm:max-w-xs"
        />
        <button
          type="button"
          onClick={() => void loadDrivers()}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error ? (
        <div
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-12 text-center text-sm text-slate-500">
            Loading drivers…
          </p>
        ) : filtered.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">
            {search
              ? "No drivers match your search."
              : 'No drivers yet. Click \u201cAdd Driver\u201d to get started.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Name
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Phone
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Active Deliveries
                  </th>
                  <th className="px-4 py-3 font-medium text-slate-600">
                    Total Delivered
                  </th>
                  <th className="px-4 py-3 w-36 font-medium text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((driver) => (
                  <tr key={driver.id} className="hover:bg-slate-50/80">
                    {/* Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white"
                        >
                          {(driver.name ?? "?")[0].toUpperCase()}
                        </span>
                        <span className="font-medium text-slate-900">
                          {driver.name}
                        </span>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {driver.phone ?? "—"}
                    </td>

                    {/* Active deliveries */}
                    <td className="px-4 py-3">
                      {driver.active_deliveries > 0 ? (
                        <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-200">
                          {driver.active_deliveries}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>

                    {/* Total delivered */}
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-inset ring-emerald-200">
                        {driver.total_delivered ?? 0}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewDriver(driver)}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View Deliveries
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(driver.id)}
                          disabled={removing === driver.id}
                          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                        >
                          {removing === driver.id ? "…" : "Remove"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {addOpen ? (
        <AddDriverModal
          onClose={() => setAddOpen(false)}
          onCreated={() => void loadDrivers()}
        />
      ) : null}

      {viewDriver ? (
        <DeliveriesModal
          driver={viewDriver}
          onClose={() => setViewDriver(null)}
        />
      ) : null}
    </div>
  );
}
