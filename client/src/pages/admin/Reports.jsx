import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adminApi } from "../../lib/adminApi.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  pending:   "#f59e0b",
  confirmed: "#38bdf8",
  dispatched:"#a78bfa",
  delivered: "#34d399",
  rejected:  "#f87171",
};

const PIE_FALLBACK = [
  "#6366f1", "#0ea5e9", "#f59e0b", "#10b981",
  "#ef4444", "#8b5cf6", "#ec4899",
];

function fmt(n) {
  return typeof n === "number" ? n.toLocaleString("en-IN") : "—";
}

function fmtRupee(n) {
  if (typeof n !== "number") return "—";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <div
      className={[
        "rounded-xl border bg-white p-5 shadow-sm",
        accent ? "border-l-4 border-slate-200" : "border-slate-200",
      ].join(" ")}
      style={accent ? { borderLeftColor: accent } : undefined}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

const CustomTooltipRupee = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {p.dataKey === "revenue" ? fmtRupee(p.value) : fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export function Reports() {
  // ── Filter state ─────────────────────────────────────────────────────────
  const [preset, setPreset]     = useState("week"); // "today" | "week" | "custom"
  const [fromDate, setFromDate] = useState(daysAgo(6));
  const [toDate, setToDate]     = useState(today());

  // ── Data state ───────────────────────────────────────────────────────────
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // ── Format picker modal ───────────────────────────────────────────────────
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  // ── Derived effective range ───────────────────────────────────────────────
  const effectiveFrom = preset === "today" ? today()    : preset === "week" ? daysAgo(6) : fromDate;
  const effectiveTo   = preset === "today" ? today()    : preset === "week" ? today()    : toDate;

  const load = useCallback(async (from, to) => {
    setLoading(true);
    setError(null);
    try {
      const json = await adminApi(
        `/api/admin/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      setData(json.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever effective range changes
  useEffect(() => {
    void load(effectiveFrom, effectiveTo);
  }, [load, effectiveFrom, effectiveTo]);

  function applyPreset(p) {
    setPreset(p);
    if (p === "today") { setFromDate(today()); setToDate(today()); }
    if (p === "week")  { setFromDate(daysAgo(6)); setToDate(today()); }
  }

  const hasData = data && data.summary.totalOrders > 0;

  // ── X-axis label formatter (shorten dates) ────────────────────────────────
  function fmtDayLabel(dateStr) {
    try {
      return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch { return dateStr; }
  }

  // ── CSV Download ──────────────────────────────────────────────────────────
  function downloadCSV() {
    if (!data) return;

    const APP_NAME = "FlowStock";
    const generatedAt = new Date().toLocaleString("en-IN");
    const period = `${effectiveFrom} to ${effectiveTo}`;
    const { summary, dailyOrders, statusBreakdown, topProducts } = data;

    // Helper: join a row and escape commas/quotes
    function row(...cells) {
      return cells
        .map((c) => {
          const s = c == null ? "" : String(c);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(",");
    }

    const lines = [];

    // ── Section 1: Report Metadata ──────────────────────────────────────────
    lines.push(row("FLOWSTOCK BUSINESS REPORT"));
    lines.push(row("Generated by", APP_NAME));
    lines.push(row("Generated at", generatedAt));
    lines.push(row("Period", period));
    lines.push(""); // blank line

    // ── Section 2: Executive Summary ────────────────────────────────────────
    lines.push(row("=== EXECUTIVE SUMMARY ==="));
    lines.push(row("Metric", "Value"));
    lines.push(row("Total Orders", summary.totalOrders));
    lines.push(row("Total Delivered", summary.delivered));
    lines.push(row("Delivery Success Rate (%)", summary.successRate));
    lines.push(row("Total Revenue (INR)", summary.totalRevenue));
    lines.push(row("Total Discount Given (INR)", summary.totalDiscount));
    lines.push(row("Average Order Value (INR)", summary.avgOrderValue));
    lines.push("");

    // ── Section 3: Daily Breakdown ───────────────────────────────────────────
    lines.push(row("=== DAILY ORDER & REVENUE BREAKDOWN ==="));
    lines.push(row("Date", "Orders Placed", "Net Revenue (INR)"));
    for (const d of dailyOrders) {
      lines.push(row(d.date, d.count, d.revenue));
    }
    lines.push("");

    // ── Section 4: Status Breakdown ──────────────────────────────────────────
    lines.push(row("=== ORDER STATUS BREAKDOWN ==="));
    lines.push(row("Status", "Count", "% of Total"));
    for (const s of statusBreakdown) {
      const pct = summary.totalOrders > 0
        ? ((s.count / summary.totalOrders) * 100).toFixed(1) + "%"
        : "0%";
      lines.push(row(s.status, s.count, pct));
    }
    lines.push("");

    // ── Section 5: Top Products ───────────────────────────────────────────────
    lines.push(row("=== TOP PRODUCTS BY QUANTITY ORDERED ==="));
    lines.push(row("Rank", "Product Name", "Units Ordered"));
    topProducts.forEach((p, i) => {
      lines.push(row(i + 1, p.name, p.totalQty));
    });

    // Trigger download
    const csv = lines.join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); // BOM for Excel
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FlowStock_Report_${effectiveFrom}_to_${effectiveTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowFormatPicker(false);
  }

  // ── JSON Download ─────────────────────────────────────────────────────────
  function downloadJSON() {
    if (!data) return;
    const payload = {
      meta: {
        app: "FlowStock",
        generatedAt: new Date().toISOString(),
        period: { from: effectiveFrom, to: effectiveTo },
      },
      summary: data.summary,
      dailyOrders: data.dailyOrders,
      statusBreakdown: data.statusBreakdown,
      topProducts: data.topProducts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FlowStock_Report_${effectiveFrom}_to_${effectiveTo}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowFormatPicker(false);
  }

  // ── PDF Download (print-ready HTML page) ──────────────────────────────────
  function downloadPDF() {
    if (!data) return;
    const { summary, dailyOrders, statusBreakdown, topProducts } = data;
    const generatedAt = new Date().toLocaleString("en-IN");
    const period = `${effectiveFrom}  →  ${effectiveTo}`;

    function rupee(n) { return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }); }
    function num(n)   { return Number(n).toLocaleString("en-IN"); }

    const dailyRows = dailyOrders
      .map((d) => `<tr><td>${d.date}</td><td>${num(d.count)}</td><td>${rupee(d.revenue)}</td></tr>`)
      .join("");

    const statusRows = statusBreakdown
      .map((s) => {
        const pct = summary.totalOrders > 0
          ? ((s.count / summary.totalOrders) * 100).toFixed(1) + "%"
          : "0%";
        return `<tr><td class="cap">${s.status}</td><td>${num(s.count)}</td><td>${pct}</td></tr>`;
      })
      .join("");

    const productRows = topProducts
      .map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}</td><td>${num(p.totalQty)}</td></tr>`)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>FlowStock Business Report — ${period}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 32px; }
    header { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 3px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
    header h1 { font-size: 24px; font-weight: 700; color: #0f172a; }
    header .sub { font-size: 12px; color: #64748b; margin-top: 4px; }
    .badge { display: inline-block; background: #f1f5f9; border-radius: 6px; padding: 2px 10px; font-size: 12px; color: #475569; }
    h2 { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin: 28px 0 10px; }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }
    .card .label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; }
    .card .val { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 4px; }
    .card .hint { font-size: 10px; color: #94a3b8; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding: 8px 10px; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; font-size: 12px; color: #334155; }
    tr:last-child td { border-bottom: none; }
    .cap { text-transform: capitalize; }
    footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 16px; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>FlowStock</h1>
      <div class="sub">Business Performance Report</div>
    </div>
    <div style="text-align: right">
      <div class="badge">${period}</div>
      <div class="sub" style="margin-top:6px">Generated ${generatedAt}</div>
    </div>
  </header>

  <h2>Executive Summary</h2>
  <div class="cards">
    <div class="card"><div class="label">Total Orders</div><div class="val">${num(summary.totalOrders)}</div><div class="hint">${period}</div></div>
    <div class="card"><div class="label">Total Revenue</div><div class="val">${rupee(summary.totalRevenue)}</div><div class="hint">Delivered, net of discount</div></div>
    <div class="card"><div class="label">Success Rate</div><div class="val">${summary.successRate}%</div><div class="hint">${num(summary.delivered)} of ${num(summary.totalOrders)} delivered</div></div>
    <div class="card"><div class="label">Total Discount</div><div class="val">${rupee(summary.totalDiscount)}</div><div class="hint">Sum over delivered orders</div></div>
    <div class="card"><div class="label">Avg Order Value</div><div class="val">${rupee(summary.avgOrderValue)}</div><div class="hint">Revenue ÷ delivered</div></div>
    <div class="card"><div class="label">Total Delivered</div><div class="val">${num(summary.delivered)}</div><div class="hint">Completed orders</div></div>
  </div>

  <h2>Daily Order &amp; Revenue Breakdown</h2>
  <table><thead><tr><th>Date</th><th>Orders</th><th>Net Revenue</th></tr></thead>
    <tbody>${dailyRows}</tbody>
  </table>

  <h2>Order Status Breakdown</h2>
  <table><thead><tr><th>Status</th><th>Count</th><th>% of Total</th></tr></thead>
    <tbody>${statusRows}</tbody>
  </table>

  <h2>Top Products by Quantity</h2>
  <table><thead><tr><th>#</th><th>Product</th><th>Units Ordered</th></tr></thead>
    <tbody>${productRows}</tbody>
  </table>

  <footer>
    <span>FlowStock — Confidential Business Report</span>
    <span>Generated ${generatedAt}</span>
  </footer>

  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
    setShowFormatPicker(false);
  }

  return (
    <div className="p-6 md:p-8">
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reports
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Revenue, order trends, and product insights for a date range.
          </p>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          {hasData && (
            <>
              {/* ── Download Button ── */}
              <button
                type="button"
                id="download-report-btn"
                onClick={() => setShowFormatPicker((v) => !v)}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 active:scale-95 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                  <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                </svg>
                Download Report
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 opacity-70">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {/* ── Format Picker Dropdown ── */}
              {showFormatPicker && (
                <>
                  {/* backdrop */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowFormatPicker(false)}
                  />
                  {/* menu */}
                  <div className="absolute right-16 top-full mt-2 z-50 w-72 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-xs font-semibold text-slate-900">Choose download format</p>
                      <p className="text-xs text-slate-500 mt-0.5">{effectiveFrom} → {effectiveTo}</p>
                    </div>

                    {/* CSV */}
                    <button
                      type="button"
                      onClick={downloadCSV}
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100"
                    >
                      <span className="mt-0.5 text-xl">📊</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">CSV Spreadsheet</p>
                        <p className="text-xs text-slate-500 mt-0.5">Open in Excel, Google Sheets, etc. Includes all sections.</p>
                        <p className="mt-1 text-xs font-medium text-emerald-600">.csv</p>
                      </div>
                    </button>

                    {/* PDF */}
                    <button
                      type="button"
                      onClick={downloadPDF}
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100"
                    >
                      <span className="mt-0.5 text-xl">📄</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">PDF Document</p>
                        <p className="text-xs text-slate-500 mt-0.5">Opens a print-ready page. Use <strong>Save as PDF</strong> in your browser's print dialog.</p>
                        <p className="mt-1 text-xs font-medium text-red-500">.pdf (via print)</p>
                      </div>
                    </button>

                    {/* JSON */}
                    <button
                      type="button"
                      onClick={downloadJSON}
                      className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="mt-0.5 text-xl">⚙️</span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">JSON (Raw Data)</p>
                        <p className="text-xs text-slate-500 mt-0.5">Structured data for developers or custom integrations.</p>
                        <p className="mt-1 text-xs font-medium text-violet-600">.json</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => void load(effectiveFrom, effectiveTo)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Period
        </span>
        <div className="flex gap-2">
          {[
            { id: "today", label: "Today" },
            { id: "week",  label: "Last 7 days" },
            { id: "custom",label: "Custom" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={[
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                preset === p.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              ].join(" ")}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
            <span className="text-slate-400 text-sm">→</span>
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={today()}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
          </div>
        )}

        <p className="ml-auto text-xs text-slate-400 tabular-nums">
          {effectiveFrom} → {effectiveTo}
        </p>
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error ? (
        <div
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {/* ── Loading ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : !hasData ? (
        /* ── Empty state ──────────────────────────────────────────────────── */
        <div className="rounded-xl border border-slate-200 bg-white p-16 text-center shadow-sm">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-sm font-medium text-slate-700">No orders in this period</p>
          <p className="mt-1 text-xs text-slate-500">
            Try widening the date range or select a different preset.
          </p>
        </div>
      ) : (
        <>
          {/* ── Stat cards ──────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              label="Total Orders"
              value={fmt(data.summary.totalOrders)}
              sub={`${effectiveFrom} → ${effectiveTo}`}
              accent="#0f172a"
            />
            <StatCard
              label="Total Revenue"
              value={fmtRupee(data.summary.totalRevenue)}
              sub="Delivered orders, after discount"
              accent="#34d399"
            />
            <StatCard
              label="Delivery Success Rate"
              value={`${data.summary.successRate}%`}
              sub={`${data.summary.delivered} of ${data.summary.totalOrders} delivered`}
              accent="#38bdf8"
            />
            <StatCard
              label="Total Discount Given"
              value={fmtRupee(data.summary.totalDiscount)}
              sub="Sum over delivered orders"
              accent="#f59e0b"
            />
            <StatCard
              label="Avg Order Value"
              value={fmtRupee(data.summary.avgOrderValue)}
              sub="Revenue ÷ delivered orders"
              accent="#a78bfa"
            />
            <StatCard
              label="Total Delivered"
              value={fmt(data.summary.delivered)}
              sub="Successfully completed"
              accent="#34d399"
            />
          </div>

          {/* ── Charts row 1: Orders per day + Revenue per day ─────────── */}
          <div className="mt-8 grid gap-6 xl:grid-cols-2">
            {/* Orders bar chart */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Orders Per Day"
                sub="All orders in selected range"
              />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.dailyOrders}
                    margin={{ top: 4, right: 8, left: -8, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtDayLabel}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltipRupee />} />
                    <Bar
                      dataKey="count"
                      name="Orders"
                      fill="#0f172a"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Revenue bar chart */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Revenue Per Day (₹)"
                sub="Net revenue from delivered orders"
              />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.dailyOrders}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={fmtDayLabel}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={{ stroke: "#cbd5e1" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 11, fill: "#64748b" }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <Tooltip content={<CustomTooltipRupee />} />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      fill="#34d399"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── Charts row 2: Status pie + Top products ─────────────────── */}
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            {/* Status pie chart */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Order Status Breakdown"
                sub="Count by status in selected period"
              />
              {data.statusBreakdown.length === 0 ? (
                <p className="pt-8 text-center text-sm text-slate-500">No data.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.statusBreakdown}
                        dataKey="count"
                        nameKey="status"
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        innerRadius={45}
                        paddingAngle={2}
                        label={({ status, percent }) =>
                          `${status} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {data.statusBreakdown.map((entry, index) => (
                          <Cell
                            key={entry.status}
                            fill={STATUS_COLORS[entry.status] ?? PIE_FALLBACK[index % PIE_FALLBACK.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [fmt(value), name]}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          fontSize: "12px",
                        }}
                      />
                      <Legend
                        formatter={(value) => (
                          <span className="capitalize text-xs text-slate-700">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Top products horizontal bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionHeader
                title="Top 5 Products by Quantity"
                sub="Most ordered products in range"
              />
              {data.topProducts.length === 0 ? (
                <p className="pt-8 text-center text-sm text-slate-500">
                  No product data for this range.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.topProducts}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "#64748b" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={110}
                        tick={{ fontSize: 11, fill: "#334155" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                          v.length > 14 ? v.slice(0, 13) + "…" : v
                        }
                      />
                      <Tooltip
                        formatter={(value) => [fmt(value), "Units"]}
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e2e8f0",
                          fontSize: "12px",
                        }}
                      />
                      <Bar
                        dataKey="totalQty"
                        name="Qty"
                        fill="#6366f1"
                        radius={[0, 4, 4, 0]}
                        maxBarSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
