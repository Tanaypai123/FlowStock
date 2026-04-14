import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "../../lib/adminApi.js";

function statusBadgeClass(status) {
  switch (status) {
    case "pending":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "confirmed":
      return "bg-sky-100 text-sky-900 ring-sky-200";
    case "dispatched":
      return "bg-violet-100 text-violet-900 ring-violet-200";
    case "delivered":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200";
    case "rejected":
      return "bg-red-100 text-red-900 ring-red-200";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-200";
  }
}

function formatCreated(iso) {
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

function SummaryCard({ title, value, hint }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminApi("/api/admin/dashboard-stats");
      setStats(json.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Overview of orders, stock, and drivers.
        </p>
      </div>

      {error ? (
        <div
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading dashboard…</p>
      ) : stats ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Orders today"
              value={stats.orders_today}
              hint="Created since midnight (UTC)"
            />
            <SummaryCard
              title="Pending orders"
              value={stats.pending_orders}
              hint="Awaiting confirmation"
            />
            <SummaryCard
              title="Low stock items"
              value={stats.low_stock_count}
              hint="Qty ≤ alert threshold"
            />
            <SummaryCard
              title="Active drivers"
              value={stats.active_drivers}
              hint="Profiles with driver role"
            />
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">
              Orders (last 7 days)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Count of orders created per day
            </p>
            <div className="mt-4 h-72 w-full min-h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.orders_by_day ?? []}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    axisLine={{ stroke: "#cbd5e1" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    axisLine={{ stroke: "#cbd5e1" }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      fontSize: "12px",
                    }}
                    formatter={(value) => [value, "Orders"]}
                    labelFormatter={(label, payload) =>
                      payload?.[0]?.payload?.date
                        ? String(payload[0].payload.date)
                        : label
                    }
                  />
                  <Bar
                    dataKey="count"
                    name="Orders"
                    fill="#0f172a"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Recent orders
                </h2>
                <Link
                  to="/admin/orders"
                  className="text-xs font-medium text-sky-700 hover:text-sky-800"
                >
                  View all
                </Link>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-3 font-medium text-slate-600">
                          Order
                        </th>
                        <th className="px-4 py-3 font-medium text-slate-600">
                          Customer
                        </th>
                        <th className="px-4 py-3 font-medium text-slate-600">
                          Status
                        </th>
                        <th className="px-4 py-3 font-medium text-slate-600">
                          Created
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(stats.recent_orders ?? []).length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-slate-500"
                          >
                            No orders yet.
                          </td>
                        </tr>
                      ) : (
                        (stats.recent_orders ?? []).map((o) => (
                          <tr key={o.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-mono text-xs text-slate-800">
                              {o.short_id}
                            </td>
                            <td className="px-4 py-3 text-slate-800">
                              {o.customer_name}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={[
                                  "inline-flex rounded-md px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
                                  statusBadgeClass(o.status),
                                ].join(" ")}
                              >
                                {o.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {formatCreated(o.created_at)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Low stock alerts
                </h2>
                <Link
                  to="/admin/inventory"
                  className="text-xs font-medium text-sky-700 hover:text-sky-800"
                >
                  Inventory
                </Link>
              </div>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
                {(stats.low_stock_items ?? []).length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-slate-500">
                    No items at or below alert level.
                  </li>
                ) : (
                  (stats.low_stock_items ?? []).map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="text-xs capitalize text-slate-500">
                          {item.stage}
                        </p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p className="font-medium text-amber-800">
                          Qty {item.quantity}
                        </p>
                        <p className="text-xs text-slate-500">
                          Alert ≤ {item.low_stock_alert}
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
