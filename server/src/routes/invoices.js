/**
 * /api/invoices — Full invoice system
 *
 * GET    /api/invoices                     → list (pagination + date filter)
 * GET    /api/invoices/settings            → active tax/charge settings
 * PUT    /api/invoices/settings            → save new settings version
 * GET    /api/invoices/products            → search inventory items
 * GET    /api/invoices/:id/pdf             → single order invoice PDF
 * GET    /api/invoices/manual/:id/pdf      → single manual invoice PDF
 * POST   /api/invoices/manual              → create manual invoice
 * POST   /api/invoices/bulk-pdf            → multi-page PDF (order + manual ids)
 * POST   /api/invoices/range-pdf           → multi-page PDF for date range
 */

import PDFDocument from "pdfkit";
import { Router  } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireAdmin  } from "../middleware/requireAdmin.js";

export const invoicesRouter = Router();
invoicesRouter.use(requireAdmin);

const INVOICE_STATUSES = ["confirmed", "dispatched", "out_for_delivery", "delivered"];

/* ── Utilities ────────────────────────────────────────────────────────────── */
const isUuid = (id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id));

// Fix #5 — PDFKit Helvetica does NOT render the ₹ glyph; use "Rs." instead
const rupee = (n) => {
  const x = Number(n);
  return `Rs. ${Number.isFinite(x) ? x.toFixed(2) : "0.00"}`;
};
const money2 = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : "0.00";
};
const shortId = (id) => String(id).replace(/-/g, "").slice(0, 8).toUpperCase();

function subtotalFromLines(lines) {
  let s = 0;
  for (const li of lines ?? []) {
    const q = Number(li.quantity);
    const p = Number(li.unit_price ?? li.price);
    if (Number.isFinite(q) && Number.isFinite(p)) s += q * p;
  }
  return s;
}

function computeChargesTotal(charges, subtotal) {
  let t = 0;
  for (const c of charges ?? []) {
    const v = Number(c.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    t += c.type === "percent" ? (subtotal * v) / 100 : v;
  }
  return t;
}

function computeDiscount(subtotal, type, inputVal) {
  const inp = Number(inputVal);
  if (!Number.isFinite(inp) || inp <= 0) return 0;
  if (type === "percent") return Math.min(subtotal, (subtotal * Math.min(100, inp)) / 100);
  return Math.min(subtotal, inp);
}

/* ── Company / logo helpers ───────────────────────────────────────────────── */
async function fetchCompany(adminId) {
  try {
    const q = supabaseAdmin
      .from("business_profile")
      .select("business_name, phone, address, gst_number, logo_url");
    if (adminId) q.eq("admin_id", adminId); else q.limit(1);
    const { data: bp } = await q.maybeSingle();
    if (bp?.business_name?.trim())
      return {
        company_name:    bp.business_name.trim(),
        company_phone:   bp.phone?.trim()      || "",
        company_address: bp.address?.trim()    || "",
        gst_number:      bp.gst_number?.trim() || "",
        logo_url:        bp.logo_url?.trim()   || "",
      };
  } catch { /* fall through */ }
  const { data } = await supabaseAdmin
    .from("app_config")
    .select("company_name, company_phone, company_address")
    .eq("id", 1).maybeSingle();
  return {
    company_name:    data?.company_name?.trim()    || "FlowStock Pvt Ltd",
    company_phone:   data?.company_phone?.trim()   || "",
    company_address: data?.company_address?.trim() || "",
    gst_number: "", logo_url: "",
  };
}

async function fetchLogoBuffer(logoUrl) {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl.split("?")[0]);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch { return null; }
}

async function getActiveSettings(adminId) {
  const { data } = await supabaseAdmin
    .from("invoice_tax_settings")
    .select("id, charges, created_at")
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  return data ?? { id: null, charges: [], created_at: null };
}

/* ── PDF renderer ─────────────────────────────────────────────────────────── */
function renderInvoicePage(doc, {
  company, invoice, lineItems, charges,
  discountType, discountInput,
  logoBuffer, isFirstPage,
}) {
  if (!isFirstPage) doc.addPage();

  const m     = doc.page.margins.left;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const cW    = pageW - 2 * m;
  const LOGO  = 48;

  /* ── Header ── */
  let y = m;
  if (logoBuffer) {
    try { doc.image(logoBuffer, m, y, { width: LOGO, height: LOGO, fit: [LOGO, LOGO] }); }
    catch { /* ignore */ }
  }
  const nameX = logoBuffer ? m + LOGO + 10 : m;
  const nameW = logoBuffer ? cW * 0.55 - LOGO - 10 : cW * 0.58;
  doc.font("Helvetica-Bold").fontSize(17).fillColor("#0f172a");
  doc.text(company.company_name, nameX, y + (logoBuffer ? 8 : 0), { width: nameW });
  doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a");
  doc.text("INVOICE", m, y, { width: cW, align: "right" });
  y = Math.max(doc.y, m + (logoBuffer ? LOGO + 8 : 28));

  doc.font("Helvetica").fontSize(9).fillColor("#475569");
  if (company.company_address) { doc.text(company.company_address, m, y, { width: cW * 0.65 }); y = doc.y + 4; }
  if (company.company_phone)   { doc.text(`Phone: ${company.company_phone}`, m, y); y = doc.y + 4; }
  else { y += 4; }
  if (company.gst_number)      { doc.text(`GSTIN: ${company.gst_number}`, m, y); y = doc.y + 8; }
  else { y += 8; }
  doc.moveTo(m, y).lineTo(pageW - m, y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
  y += 14;

  /* ── Invoice meta ── */
  const invDate = new Date(invoice.date ?? invoice.created_at).toLocaleString(undefined, {
    dateStyle: "medium", timeStyle: "short",
  });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155");
  doc.text(`Invoice ID: ${invoice.short_id}`, m, y); y = doc.y + 2;
  if (invoice.order_id) {
    doc.font("Helvetica").fontSize(8).fillColor("#64748b");
    doc.text(`Order Ref: ${invoice.order_id}`, m, y, { width: cW }); y = doc.y + 6;
  }
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155");
  doc.text(`Date: ${invDate}`, m, y); y = doc.y + 16;

  /* ── Bill to ── */
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
  doc.text("Bill to", m, y); y = doc.y + 6;
  doc.font("Helvetica").fontSize(10).fillColor("#334155");
  doc.text(invoice.customer_name || "—", m, y); y = doc.y + 4;
  if (invoice.customer_phone) { doc.text(`Phone: ${invoice.customer_phone}`, m, y); y = doc.y + 4; }
  if (invoice.customer_address) { doc.text(`Address: ${invoice.customer_address}`, m, y, { width: cW }); y = doc.y + 4; }
  y += 16;

  /* ── Line items ── */
  const colProd  = m;
  const colQty   = m + 250;
  const colPrice = m + 300;
  const colTotal = m + 370;
  const rowH     = 18;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
  doc.text("Product", colProd, y, { width: 230 });
  doc.text("Qty",   colQty,   y, { width: 36,  align: "right" });
  doc.text("Price", colPrice, y, { width: 56,  align: "right" });
  doc.text("Total", colTotal, y, { width: 64,  align: "right" });
  y += rowH;
  doc.moveTo(m, y - 4).lineTo(pageW - m, y - 4).strokeColor("#cbd5e1").lineWidth(0.5).stroke();

  doc.font("Helvetica").fontSize(9).fillColor("#334155");
  for (const li of lineItems ?? []) {
    const q   = Number(li.quantity);
    const p   = Number(li.unit_price ?? li.price);
    const tot = Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
    if (y > pageH - m - 160) { doc.addPage(); y = m; }
    const top = y;
    doc.text(String(li.item_name ?? "—"), colProd, top, { width: 230 });
    doc.text(Number.isFinite(q) ? String(q) : "—", colQty, top, { width: 36, align: "right" });
    doc.text(rupee(p),   colPrice, top, { width: 56, align: "right" });
    doc.text(rupee(tot), colTotal, top, { width: 64, align: "right" });
    y = Math.max(doc.y, top + rowH);
  }

  /* ── Totals ── */
  const subtotal     = subtotalFromLines(lineItems);
  const chargesTotal = computeChargesTotal(charges, subtotal);
  const discountAmt  = computeDiscount(subtotal + chargesTotal, discountType || "fixed", discountInput || 0);
  const grand        = Math.max(0, subtotal + chargesTotal - discountAmt);

  y += 10;
  doc.moveTo(m, y).lineTo(pageW - m, y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
  y += 12;

  doc.font("Helvetica").fontSize(10).fillColor("#334155");
  doc.text(`Subtotal: ${rupee(subtotal)}`, m, y, { width: cW, align: "right" }); y = doc.y + 5;

  for (const c of charges ?? []) {
    const v = Number(c.value);
    if (!Number.isFinite(v) || v <= 0) continue;
    const amt = c.type === "percent" ? (subtotal * v) / 100 : v;
    const lbl = c.type === "percent" ? `${c.label} (${v}%): ${rupee(amt)}` : `${c.label}: ${rupee(amt)}`;
    doc.text(lbl, m, y, { width: cW, align: "right" }); y = doc.y + 4;
  }

  if (discountAmt > 0) {
    const dlbl = discountType === "percent"
      ? `Discount (${discountInput}%): -${rupee(discountAmt)}`
      : `Discount: -${rupee(discountAmt)}`;
    doc.fillColor("#16a34a");
    doc.text(dlbl, m, y, { width: cW, align: "right" });
    doc.fillColor("#334155");
    y = doc.y + 4;
  }

  y += 6;
  doc.moveTo(m, y).lineTo(pageW - m, y).strokeColor("#cbd5e1").lineWidth(0.3).stroke();
  y += 8;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a");
  doc.text(`Grand Total: ${rupee(grand)}`, m, y, { width: cW, align: "right" }); y = doc.y + 28;

  doc.font("Helvetica").fontSize(9).fillColor("#64748b");
  doc.text("Thank you for your business.", m, y, { width: cW, align: "center" }); y = doc.y + 10;
  doc.font("Helvetica").fontSize(7.5).fillColor("#94a3b8");
  doc.text("Powered by FlowStock.in - B2B Inventory & Logistics", m, y, { width: cW, align: "center" });
}

/* ── GET /api/invoices/settings ─────────────────────────────────────────── */
invoicesRouter.get("/settings", async (req, res) => {
  try {
    const s = await getActiveSettings(req.adminUser?.id);
    return res.json({ success: true, data: s });
  } catch (e) {
    console.error("[GET /invoices/settings]", e);
    return res.status(500).json({ success: false, error: "Failed to load settings" });
  }
});

/* ── PUT /api/invoices/settings ─────────────────────────────────────────── */
invoicesRouter.put("/settings", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { charges } = req.body ?? {};
    if (!Array.isArray(charges))
      return res.status(400).json({ success: false, error: "charges must be an array" });

    const clean = charges
      .map((c) => ({ label: String(c.label ?? "").trim(), type: c.type === "percent" ? "percent" : "fixed", value: Number(c.value) }))
      .filter((c) => c.label && Number.isFinite(c.value) && c.value >= 0);

    const { data, error } = await supabaseAdmin
      .from("invoice_tax_settings")
      .insert({ admin_id: adminId, charges: clean })
      .select("id, charges, created_at").single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /invoices/settings]", e);
    return res.status(500).json({ success: false, error: "Failed to save settings" });
  }
});

/* ── GET /api/invoices/products — search inventory for Create Invoice ─────── */
invoicesRouter.get("/products", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const q = String(req.query.q ?? "").trim();

    let query = supabaseAdmin
      .from("inventory_items")
      .select("id, name, unit_price, unit")
      .eq("admin_id", adminId)
      .order("name", { ascending: true })
      .limit(30);

    if (q.length > 0) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error("[GET /invoices/products]", e);
    return res.status(500).json({ success: false, error: "Failed to search products" });
  }
});

/* ── GET /api/invoices — paginated list ─────────────────────────────────── */
invoicesRouter.get("/", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const page    = Math.max(1, parseInt(req.query.page  ?? "1", 10));
    const limit   = Math.max(1, Math.min(100, parseInt(req.query.limit ?? "15", 10)));
    const from    = req.query.from ? String(req.query.from) : null;
    const to      = req.query.to   ? String(req.query.to)   : null;

    /* ── Order-based invoices ── */
    let oQuery = supabaseAdmin
      .from("orders")
      .select("id, customer_id, guest_customer_name, customer_address, status, created_at, confirmed_at, final_total")
      .eq("admin_id", adminId)
      .in("status", INVOICE_STATUSES);
    if (from) oQuery = oQuery.gte("confirmed_at", from);
    if (to)   oQuery = oQuery.lte("confirmed_at", to + "T23:59:59Z");
    const { data: orders, error: oErr } = await oQuery.order("confirmed_at", { ascending: false });
    if (oErr) return res.status(500).json({ success: false, error: oErr.message });

    const custIds = [...new Set((orders ?? []).map((r) => r.customer_id).filter(Boolean))];
    let profileMap = new Map();
    if (custIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", custIds);
      profileMap = new Map((profs ?? []).map((p) => [p.id, p]));
    }

    const orderInvoices = (orders ?? []).map((r) => ({
      id:            r.id,
      source:        "order",
      short_id:      shortId(r.id),
      customer_name: profileMap.get(r.customer_id)?.display_name?.trim() || r.guest_customer_name?.trim() || "Guest",
      amount:        Number(r.final_total ?? 0),
      date:          r.confirmed_at || r.created_at,
      created_at:    r.created_at,
    }));

    /* ── Manual invoices ── */
    let mQuery = supabaseAdmin
      .from("manual_invoices")
      .select("id, customer_name, grand_total, created_at")
      .eq("admin_id", adminId);
    if (from) mQuery = mQuery.gte("created_at", from);
    if (to)   mQuery = mQuery.lte("created_at", to + "T23:59:59Z");
    const { data: manuals, error: mErr } = await mQuery.order("created_at", { ascending: false });
    if (mErr) return res.status(500).json({ success: false, error: mErr.message });

    const manualInvoices = (manuals ?? []).map((m) => ({
      id:            m.id,
      source:        "manual",
      short_id:      shortId(m.id),
      customer_name: m.customer_name || "—",
      amount:        Number(m.grand_total ?? 0),
      date:          m.created_at,
      created_at:    m.created_at,
    }));

    /* ── Merge + paginate ── */
    const all   = [...orderInvoices, ...manualInvoices].sort((a, b) => new Date(b.date) - new Date(a.date));
    const total = all.length;
    const pages = Math.ceil(total / limit) || 1;
    const slice = all.slice((page - 1) * limit, page * limit);

    return res.json({ success: true, data: slice, meta: { total, page, pages, limit } });
  } catch (e) {
    console.error("[GET /invoices]", e);
    return res.status(500).json({ success: false, error: "Failed to load invoices" });
  }
});

/* ── GET /api/invoices/:id/pdf — single order PDF ───────────────────────── */
invoicesRouter.get("/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const adminId = req.adminUser?.id;

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, guest_customer_name, guest_customer_phone, customer_address, status, created_at, confirmed_at, final_total, discount_value")
      .eq("id", id).eq("admin_id", adminId).maybeSingle();
    if (oErr) return res.status(500).json({ success: false, error: oErr.message });
    if (!order) return res.status(404).json({ success: false, error: "Invoice not found" });
    if (!INVOICE_STATUSES.includes(order.status))
      return res.status(400).json({ success: false, error: "Order not yet confirmed" });

    const { data: lineItems } = await supabaseAdmin
      .from("order_line_items").select("item_name, quantity, unit_price, price")
      .eq("order_id", id).order("id", { ascending: true });

    const confirmTime = order.confirmed_at || order.created_at;
    const { data: sr } = await supabaseAdmin
      .from("invoice_tax_settings").select("charges").eq("admin_id", adminId)
      .lte("created_at", confirmTime).order("created_at", { ascending: false }).limit(1).maybeSingle();

    let customerName  = order.guest_customer_name?.trim() || "Guest";
    let customerPhone = order.guest_customer_phone?.trim() || null;
    if (order.customer_id) {
      try {
        const { data: prof } = await supabaseAdmin.from("profiles").select("display_name").eq("id", order.customer_id).maybeSingle();
        if (prof?.display_name?.trim()) customerName = prof.display_name.trim();
        const { data: au } = await supabaseAdmin.auth.admin.getUserById(order.customer_id);
        if (au?.user?.phone) customerPhone = au.user.phone;
      } catch { /* optional */ }
    }

    const company    = await fetchCompany(adminId);
    const logoBuffer = await fetchLogoBuffer(company.logo_url);
    const sid = shortId(id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="FlowStock-invoice-${sid}.pdf"`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);
    renderInvoicePage(doc, {
      company,
      invoice:  { short_id: sid, order_id: id, date: confirmTime, customer_name: customerName, customer_phone: customerPhone, customer_address: order.customer_address ?? "" },
      lineItems: lineItems ?? [],
      charges:   sr?.charges ?? [],
      discountType:  "fixed",
      discountInput: Number(order.discount_value ?? 0),
      logoBuffer,
      isFirstPage: true,
    });
    doc.end();
  } catch (e) {
    console.error("[GET /invoices/:id/pdf]", e);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Failed to generate PDF" });
  }
});

/* ── GET /api/invoices/manual/:id/pdf ───────────────────────────────────── */
invoicesRouter.get("/manual/:id/pdf", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid ID" });
    const adminId = req.adminUser?.id;

    const { data: inv, error: iErr } = await supabaseAdmin
      .from("manual_invoices").select("*").eq("id", id).eq("admin_id", adminId).maybeSingle();
    if (iErr) return res.status(500).json({ success: false, error: iErr.message });
    if (!inv) return res.status(404).json({ success: false, error: "Invoice not found" });

    const company    = await fetchCompany(adminId);
    const logoBuffer = await fetchLogoBuffer(company.logo_url);
    const sid = shortId(id);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="FlowStock-invoice-${sid}.pdf"`);
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);
    renderInvoicePage(doc, {
      company,
      invoice: { short_id: sid, order_id: null, date: inv.created_at, customer_name: inv.customer_name, customer_phone: inv.customer_phone, customer_address: inv.customer_address },
      lineItems:     inv.line_items ?? [],
      charges:       inv.charges_snapshot ?? [],
      discountType:  inv.discount_type  || "fixed",
      discountInput: Number(inv.discount_input ?? 0),
      logoBuffer,
      isFirstPage: true,
    });
    doc.end();
  } catch (e) {
    console.error("[GET /invoices/manual/:id/pdf]", e);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Failed to generate PDF" });
  }
});

/* ── POST /api/invoices/manual — create ────────────────────────────────── */
invoicesRouter.post("/manual", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { customer_name, customer_phone, customer_address, line_items, notes, discount_type, discount_input } = req.body ?? {};
    if (!customer_name?.trim()) return res.status(400).json({ success: false, error: "customer_name is required" });
    if (!Array.isArray(line_items) || !line_items.length) return res.status(400).json({ success: false, error: "At least one line item required" });

    const cleanItems = line_items
      .map((li) => ({ item_name: String(li.item_name ?? "").trim(), quantity: Number(li.quantity), unit_price: Number(li.unit_price ?? li.price) }))
      .filter((li) => li.item_name && Number.isFinite(li.quantity) && li.quantity > 0 && Number.isFinite(li.unit_price));
    if (!cleanItems.length) return res.status(400).json({ success: false, error: "No valid line items" });

    const settings     = await getActiveSettings(adminId);
    const charges      = settings.charges ?? [];
    const subtotal     = subtotalFromLines(cleanItems);
    const chargesTotal = computeChargesTotal(charges, subtotal);
    const dType        = discount_type === "percent" ? "percent" : "fixed";
    const dInput       = Number(discount_input ?? 0);
    const discountAmt  = computeDiscount(subtotal + chargesTotal, dType, dInput);
    const grandTotal   = Math.max(0, subtotal + chargesTotal - discountAmt);

    const { data, error } = await supabaseAdmin
      .from("manual_invoices")
      .insert({
        admin_id:         adminId,
        customer_name:    customer_name.trim(),
        customer_phone:   customer_phone?.trim()   || "",
        customer_address: customer_address?.trim() || "",
        line_items:       cleanItems,
        charges_snapshot: charges,
        discount_type:    dType,
        discount_input:   dInput,
        discount_value:   discountAmt,
        subtotal:         subtotal.toFixed(2),
        charges_total:    chargesTotal.toFixed(2),
        grand_total:      grandTotal.toFixed(2),
        notes:            notes?.trim() || "",
      })
      .select("id, customer_name, grand_total, created_at").single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(201).json({ success: true, data: { ...data, short_id: shortId(data.id) } });
  } catch (e) {
    console.error("[POST /invoices/manual]", e);
    return res.status(500).json({ success: false, error: "Failed to create invoice" });
  }
});

/* ── Helper: build invoice doc structs for bulk renders ─────────────────── */
async function buildOrderDocs(adminId, orderIds, charges) {
  const { data: orders } = await supabaseAdmin
    .from("orders")
    .select("id, customer_id, guest_customer_name, guest_customer_phone, customer_address, status, created_at, confirmed_at, final_total, discount_value")
    .eq("admin_id", adminId).in("id", orderIds).in("status", INVOICE_STATUSES);

  const { data: allLines } = await supabaseAdmin
    .from("order_line_items").select("order_id, item_name, quantity, unit_price, price")
    .in("order_id", orderIds).order("id", { ascending: true });
  const linesByOrder = new Map();
  for (const li of allLines ?? []) {
    if (!linesByOrder.has(li.order_id)) linesByOrder.set(li.order_id, []);
    linesByOrder.get(li.order_id).push(li);
  }
  const custIds = [...new Set((orders ?? []).map((o) => o.customer_id).filter(Boolean))];
  const nameMap = new Map();
  if (custIds.length) {
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", custIds);
    for (const p of profs ?? []) nameMap.set(p.id, p.display_name?.trim() || null);
  }

  const docs = [];
  for (const o of orders ?? []) {
    const confirmTime = o.confirmed_at || o.created_at;
    const { data: sr } = await supabaseAdmin
      .from("invoice_tax_settings").select("charges").eq("admin_id", adminId)
      .lte("created_at", confirmTime).order("created_at", { ascending: false }).limit(1).maybeSingle();
    docs.push({
      invoice: { short_id: shortId(o.id), order_id: o.id, date: confirmTime, customer_name: nameMap.get(o.customer_id) || o.guest_customer_name?.trim() || "Guest", customer_phone: o.guest_customer_phone?.trim() || null, customer_address: o.customer_address ?? "" },
      lineItems:     linesByOrder.get(o.id) ?? [],
      charges:       sr?.charges ?? [],
      discountType:  "fixed",
      discountInput: Number(o.discount_value ?? 0),
    });
  }
  return docs;
}

async function buildManualDocs(adminId, manualIds) {
  const { data: manuals } = await supabaseAdmin
    .from("manual_invoices").select("*").eq("admin_id", adminId).in("id", manualIds);
  return (manuals ?? []).map((m) => ({
    invoice: { short_id: shortId(m.id), order_id: null, date: m.created_at, customer_name: m.customer_name, customer_phone: m.customer_phone, customer_address: m.customer_address },
    lineItems:     m.line_items ?? [],
    charges:       m.charges_snapshot ?? [],
    discountType:  m.discount_type  || "fixed",
    discountInput: Number(m.discount_input ?? 0),
  }));
}

function streamPdf(res, docs, company, logoBuffer, filename) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ margin: 50, size: "A4", autoFirstPage: true });
  doc.pipe(res);
  for (let i = 0; i < docs.length; i++) {
    const { invoice, lineItems, charges, discountType, discountInput } = docs[i];
    renderInvoicePage(doc, { company, invoice, lineItems, charges, discountType, discountInput, logoBuffer, isFirstPage: i === 0 });
  }
  doc.end();
}

/* ── POST /api/invoices/bulk-pdf ────────────────────────────────────────── */
invoicesRouter.post("/bulk-pdf", async (req, res) => {
  try {
    const adminId    = req.adminUser?.id;
    const { orderIds = [], manualIds = [] } = req.body ?? {};
    const vOids = (orderIds  ?? []).filter(isUuid);
    const vMids = (manualIds ?? []).filter(isUuid);
    if (!vOids.length && !vMids.length)
      return res.status(400).json({ success: false, error: "No valid IDs provided" });

    const [orderDocs, manualDocs, company] = await Promise.all([
      vOids.length ? buildOrderDocs(adminId, vOids)   : Promise.resolve([]),
      vMids.length ? buildManualDocs(adminId, vMids)  : Promise.resolve([]),
      fetchCompany(adminId),
    ]);
    const allDocs = [...orderDocs, ...manualDocs];
    if (!allDocs.length) return res.status(404).json({ success: false, error: "No invoices found" });
    const logoBuffer = await fetchLogoBuffer(company.logo_url);
    streamPdf(res, allDocs, company, logoBuffer, `FlowStock-invoices-${Date.now()}.pdf`);
  } catch (e) {
    console.error("[POST /invoices/bulk-pdf]", e);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Failed to generate bulk PDF" });
  }
});

/* ── POST /api/invoices/range-pdf — date-range PDF ─────────────────────── */
invoicesRouter.post("/range-pdf", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { from, to } = req.body ?? {};
    if (!from || !to) return res.status(400).json({ success: false, error: "from and to dates required" });

    const fromStr = String(from);
    const toStr   = String(to) + "T23:59:59Z";

    const [ordersRes, manualsRes] = await Promise.all([
      supabaseAdmin.from("orders")
        .select("id").eq("admin_id", adminId)
        .in("status", INVOICE_STATUSES)
        .gte("confirmed_at", fromStr).lte("confirmed_at", toStr),
      supabaseAdmin.from("manual_invoices")
        .select("id").eq("admin_id", adminId)
        .gte("created_at", fromStr).lte("created_at", toStr),
    ]);

    const vOids = (ordersRes.data ?? []).map((o) => o.id);
    const vMids = (manualsRes.data ?? []).map((m) => m.id);
    if (!vOids.length && !vMids.length)
      return res.status(404).json({ success: false, error: "No invoices in this date range" });

    const [orderDocs, manualDocs, company] = await Promise.all([
      vOids.length ? buildOrderDocs(adminId, vOids)  : Promise.resolve([]),
      vMids.length ? buildManualDocs(adminId, vMids) : Promise.resolve([]),
      fetchCompany(adminId),
    ]);
    const allDocs = [...orderDocs, ...manualDocs];
    const logoBuffer = await fetchLogoBuffer(company.logo_url);
    streamPdf(res, allDocs, company, logoBuffer, `FlowStock-invoices-${from}-to-${to}.pdf`);
  } catch (e) {
    console.error("[POST /invoices/range-pdf]", e);
    if (!res.headersSent) res.status(500).json({ success: false, error: "Failed to generate range PDF" });
  }
});
