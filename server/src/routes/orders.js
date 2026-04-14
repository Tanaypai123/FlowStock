import PDFDocument from "pdfkit";
import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { requireAuth }  from "../middleware/requireAuth.js";

import { notifyOrderStatus } from "../services/notificationService.js";
import {
  deductInventoryForOrder,
  restoreInventoryForOrder,
} from "../services/inventoryService.js";

const STATUSES = new Set([
  "pending",
  "confirmed",
  "dispatched",
  "out_for_delivery",
  "delivered",
  "rejected",
]);

const DEFAULT_COMPANY = {
  company_name: "FlowStock Pvt Ltd",
  company_phone: "",
  company_address: "",
};

const ORDER_COLUMNS =
  "id, customer_id, driver_id, region, status, created_at, updated_at, confirmed_at, dispatched_at, out_for_delivery_at, final_total, guest_customer_name, guest_customer_phone, customer_address, discount_type, discount_input, discount_value, delivery_lat, delivery_lng, delivery_notes, verification_otp, verification_status, verification_method";

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(id),
  );
}

async function loadProfileMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, role")
    .in("id", unique);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

/**
 * Looks up a user's phone number from Supabase Auth (needed for notifications).
 * Returns null if the user is not found or has no phone.
 * @param {string | null | undefined} userId
 * @returns {Promise<string | null>}
 */
async function getCustomerPhone(userId) {
  if (!userId) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    const phone = data?.user?.phone?.trim();
    if (error || !phone) return null;
    // Ensure E.164 format ("+91...")
    return phone.startsWith("+") ? phone : `+${phone}`;
  } catch {
    return null;
  }
}

async function fetchCompanyConfig(adminId) {
  // ── Priority 1: business_profile table (per-admin branding) ──────────────
  try {
    const query = supabaseAdmin
      .from("business_profile")
      .select("business_name, phone, address, gst_number, logo_url");

    // Scope to specific admin's business if provided; otherwise fall back to first row
    if (adminId) query.eq("admin_id", adminId);
    else         query.limit(1);

    const { data: bp } = await query.maybeSingle();

    if (bp?.business_name?.trim()) {
      return {
        company_name:    bp.business_name.trim(),
        company_phone:   bp.phone?.trim()   || "",
        company_address: bp.address?.trim() || "",
        gst_number:      bp.gst_number?.trim() || "",
        logo_url:        bp.logo_url?.trim() || "",
      };
    }
  } catch { /* fall through */ }

  // ── Priority 2: legacy app_config table ──────────────────────────────────
  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("company_name, company_phone, company_address")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return { ...DEFAULT_COMPANY, gst_number: "", logo_url: "" };
  }

  return {
    company_name:
      (typeof data.company_name === "string" && data.company_name.trim()) ||
      DEFAULT_COMPANY.company_name,
    company_phone:
      typeof data.company_phone === "string" ? data.company_phone.trim() : "",
    company_address:
      typeof data.company_address === "string"
        ? data.company_address.trim()
        : "",
    gst_number: "",
    logo_url:   "",
  };
}

function displayCustomerName(row, customer) {
  if (row.customer_id && customer?.display_name?.trim()) {
    return customer.display_name.trim();
  }
  if (row.customer_id) {
    return `Customer ${String(row.customer_id).slice(0, 8)}…`;
  }
  const g =
    typeof row.guest_customer_name === "string"
      ? row.guest_customer_name.trim()
      : "";
  return g.length > 0 ? g : "Guest";
}

function mapOrderRow(row, profileMap) {
  const customer = row.customer_id ? profileMap.get(row.customer_id) : null;
  const driver = row.driver_id ? profileMap.get(row.driver_id) : null;
  return {
    id: row.id,
    short_id: String(row.id).replace(/-/g, "").slice(0, 8).toUpperCase(),
    customer_id: row.customer_id,
    customer_name: displayCustomerName(row, customer),
    guest_customer_name: row.guest_customer_name ?? null,
    guest_customer_phone: row.guest_customer_phone ?? null,
    customer_address: row.customer_address ?? "",
    driver_id: row.driver_id,
    driver_name: driver
      ? driver.display_name?.trim() ||
        `Driver ${String(row.driver_id).slice(0, 8)}…`
      : null,
    region: row.region ?? "",
    status: row.status,
    created_at:           row.created_at,
    updated_at:           row.updated_at,
    confirmed_at:         row.confirmed_at         ?? null,
    dispatched_at:        row.dispatched_at        ?? null,
    out_for_delivery_at:  row.out_for_delivery_at  ?? null,
    delivered_at:         row.delivered_at         ?? null,
    final_total:   row.final_total   != null ? Number(row.final_total) : null,
    discount_type: row.discount_type === "percent" ? "percent" : "fixed",
    discount_input:
      row.discount_input != null && Number.isFinite(Number(row.discount_input))
        ? Number(row.discount_input)
        : 0,
    discount_value:
      row.discount_value != null && Number.isFinite(Number(row.discount_value))
        ? Number(row.discount_value)
        : 0,
    // Delivery location (set by admin, visible to driver)
    delivery_lat: row.delivery_lat != null ? Number(row.delivery_lat) : null,
    delivery_lng: row.delivery_lng != null ? Number(row.delivery_lng) : null,
    delivery_notes: row.delivery_notes ?? null,
    verification_otp:    row.verification_otp    ?? null,
    verification_status: row.verification_status ?? "pending",
    verification_method: row.verification_method ?? null,
  };
}

/** @returns {{ error: string } | { items: Array<{ item_id: string; quantity: number; price: number }> }} */
function normalizeOrderItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return { error: "items must be an array" };
  }
  if (rawItems.length === 0) {
    return { error: "At least one line item is required" };
  }
  const out = [];
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    const item_id = it?.item_id;
    const quantity = Number(it?.quantity);
    const priceRaw = it?.price ?? it?.unit_price;
    const price = Number(priceRaw);
    if (!isUuid(item_id)) {
      return { error: `items[${i}]: item_id must be a valid uuid` };
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: `items[${i}]: quantity must be greater than 0` };
    }
    if (!Number.isFinite(price) || price < 0) {
      return { error: `items[${i}]: price must be a number >= 0` };
    }
    out.push({ item_id, quantity, price });
  }
  return { items: out };
}

function subtotalFromLineItems(items) {
  let s = 0;
  for (const li of items) {
    const q = Number(li.quantity);
    const p = Number(li.price ?? li.unit_price);
    if (Number.isFinite(q) && Number.isFinite(p)) s += q * p;
  }
  return s;
}

function computeDiscountRupees(subtotal, discount_type, discount_input) {
  const inp = Number(discount_input);
  if (!Number.isFinite(subtotal) || subtotal < 0) return 0;
  if (!Number.isFinite(inp) || inp < 0) return 0;
  if (discount_type === "percent") {
    const pct = Math.min(100, inp);
    return Math.min(subtotal, (subtotal * pct) / 100);
  }
  return Math.min(subtotal, inp);
}

function parseDiscountFromBody(body) {
  const discount_type = body?.discount_type === "percent" ? "percent" : "fixed";
  const rawIn = body?.discount_input;
  const discount_input =
    rawIn === undefined || rawIn === null || rawIn === ""
      ? 0
      : Number(rawIn);
  const di = Number.isFinite(discount_input) && discount_input >= 0 ? discount_input : 0;
  return { discount_type, discount_input: di };
}

async function fetchInventoryMap(itemIds) {
  const unique = [...new Set(itemIds.filter(isUuid))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("id, name, unit_price")
    .in("id", unique);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.id, r]));
}

function buildLineInsertRows(orderId, validatedItems, invMap) {
  const lineRows = [];
  for (const { item_id, quantity, price } of validatedItems) {
    const inv = invMap.get(item_id);
    if (!inv) {
      throw new Error(`Unknown inventory item: ${item_id}`);
    }
    const unitP = Number.isFinite(price) && price >= 0 ? price : 0;
    lineRows.push({
      order_id: orderId,
      inventory_item_id: item_id,
      item_name: inv.name,
      quantity,
      unit_price: unitP,
      price: unitP,
    });
  }
  return lineRows;
}

function money2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

function renderInvoiceDocument(doc, opts) {
  const {
    company,
    order,
    summary,
    lineItems,
    customerPhone,
    subtotal: subtotalIn,
    discountValue: discountIn,
    grandTotal: grandIn,
    logoBuffer,   // optional Buffer of logo image
  } = opts;
  const m = doc.page.margins.left;
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const contentW = pageW - 2 * m;

  const headerTop = m;
  const LOGO_SIZE = 48; // px square

  // Draw business logo if available
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, m, headerTop, { width: LOGO_SIZE, height: LOGO_SIZE, fit: [LOGO_SIZE, LOGO_SIZE] });
    } catch { /* ignore if unsupported format */ }
  }

  // Company name — shift right if logo present, vertically center within logo height
  const nameX = logoBuffer ? m + LOGO_SIZE + 10 : m;
  const nameW = logoBuffer ? contentW * 0.55 - LOGO_SIZE - 10 : contentW * 0.58;
  const nameY = logoBuffer ? headerTop + 8 : headerTop; // slight vertical nudge when logo present

  doc.font("Helvetica-Bold").fontSize(17).fillColor("#0f172a");
  doc.text(company.company_name, nameX, nameY, { width: nameW });

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a");
  doc.text("INVOICE", m, headerTop, {
    width: contentW,
    align: "right",
  });

  // y must clear BOTH the logo height AND any rendered text
  let y = Math.max(doc.y, headerTop + (logoBuffer ? LOGO_SIZE + 8 : 28));

  doc.font("Helvetica").fontSize(9).fillColor("#475569");
  if (company.company_address) {
    // Use full width since logo is already above, not side-by-side with address
    doc.text(company.company_address, m, y, { width: contentW * 0.65 });
    y = doc.y + 4;
  }
  if (company.company_phone) {
    doc.text(`Phone: ${company.company_phone}`, m, y);
    y = doc.y + 4;
  } else {
    y += 4;
  }
  if (company.gst_number) {
    doc.text(`GSTIN: ${company.gst_number}`, m, y);
    y = doc.y + 8;
  } else {
    y += 8;
  }

  doc.moveTo(m, y).lineTo(pageW - m, y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
  y += 14;

  const invDate = new Date(String(order.created_at)).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155");
  doc.text(`Order ID: ${summary.short_id}`, m, y);
  y = doc.y + 2;
  doc.font("Helvetica").fontSize(8).fillColor("#64748b");
  doc.text(`Full ID: ${order.id}`, m, y, { width: contentW });
  y = doc.y + 6;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155");
  doc.text(`Date: ${invDate}`, m, y);
  y = doc.y + 16;

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
  doc.text("Bill to", m, y);
  y = doc.y + 6;
  doc.font("Helvetica").fontSize(10).fillColor("#334155");
  doc.text(summary.customer_name, m, y);
  y = doc.y + 4;
  if (customerPhone) {
    doc.text(`Phone: ${customerPhone}`, m, y);
    y = doc.y + 4;
  }
  if (order.region) {
    doc.text(`Region: ${String(order.region)}`, m, y);
    y = doc.y + 4;
  }
  if (order.customer_address) {
    doc.text(`Address: ${String(order.customer_address)}`, m, y, {
      width: contentW,
    });
    y = doc.y + 4;
  }
  y += 10;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#334155");
  doc.text(
    `Driver: ${summary.driver_name ?? "Not assigned"}`,
    m,
    y,
    { width: contentW },
  );
  y = doc.y + 16;

  const colProduct = m;
  const colQty = m + 250;
  const colPrice = m + 300;
  const colTotal = m + 370;
  const rowH = 16;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");
  doc.text("Product name", colProduct, y, { width: 230 });
  doc.text("Qty", colQty, y, { width: 36, align: "right" });
  doc.text("Price", colPrice, y, { width: 56, align: "right" });
  doc.text("Total", colTotal, y, { width: 64, align: "right" });
  y += rowH;
  doc.moveTo(m, y - 4).lineTo(pageW - m, y - 4).strokeColor("#cbd5e1").lineWidth(0.5).stroke();

  doc.font("Helvetica").fontSize(9).fillColor("#334155");
  let lineSum = 0;
  for (const li of lineItems) {
    const q = Number(li.quantity);
    const p = Number(li.unit_price ?? li.price);
    const lineTot =
      Number.isFinite(q) && Number.isFinite(p) ? q * p : 0;
    lineSum += lineTot;

    if (y > pageH - m - 100) {
      doc.addPage();
      y = m;
    }

    const rowTop = y;
    doc.text(String(li.item_name ?? "—"), colProduct, rowTop, { width: 230 });
    doc.text(Number.isFinite(q) ? String(q) : "—", colQty, rowTop, {
      width: 36,
      align: "right",
    });
    doc.text(money2(p), colPrice, rowTop, { width: 56, align: "right" });
    doc.text(money2(lineTot), colTotal, rowTop, { width: 64, align: "right" });
    y = Math.max(doc.y, rowTop + rowH);
  }

  const subtotal =
    typeof subtotalIn === "number" && Number.isFinite(subtotalIn)
      ? subtotalIn
      : lineSum;
  const discountAmt =
    typeof discountIn === "number" && Number.isFinite(discountIn)
      ? Math.max(0, discountIn)
      : Number(order.discount_value ?? 0) || 0;
  const grand =
    typeof grandIn === "number" && Number.isFinite(grandIn)
      ? grandIn
      : Math.max(0, subtotal - discountAmt);

  y += 10;
  doc.moveTo(m, y).lineTo(pageW - m, y).strokeColor("#e2e8f0").lineWidth(0.5).stroke();
  y += 12;

  doc.font("Helvetica").fontSize(10).fillColor("#334155");
  doc.text(`Subtotal: ${money2(subtotal)}`, m, y, {
    width: contentW,
    align: "right",
  });
  y = doc.y + 6;
  doc.text(`Discount: ${money2(discountAmt)}`, m, y, {
    width: contentW,
    align: "right",
  });
  y = doc.y + 10;

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
  doc.text(`Final total: ${money2(grand)}`, m, y, {
    width: contentW,
    align: "right",
  });
  y = doc.y + 28;

  doc.font("Helvetica").fontSize(9).fillColor("#64748b");
  doc.text("Thank you for doing business with us.", m, y, {
    width: contentW,
    align: "center",
  });
  y = doc.y + 10;

  doc.font("Helvetica").fontSize(7.5).fillColor("#94a3b8");
  doc.text("Powered by FlowStock.in", m, y, { width: contentW, align: "center" });
  y = doc.y + 3;
  doc.text("A B2B logistics, delivery & inventory management software", m, y, {
    width: contentW,
    align: "center",
  });
}

export const ordersRouter = Router();

// ── POST /:id/verify-delivery — accessible by drivers too (requireAuth only) ──
ordersRouter.post("/:id/verify-delivery", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid order ID" });

    const { otp, method } = req.body ?? {};
    if (!otp || typeof otp !== "string" || otp.trim() === "") {
      return res.status(400).json({ success: false, error: "OTP is required" });
    }

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, verification_otp, verification_status, driver_id, customer_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ success: false, error: fetchErr.message });
    if (!order)   return res.status(404).json({ success: false, error: "Order not found" });

    if (order.status !== "out_for_delivery") {
      return res.status(409).json({ success: false, error: "Order must be out for delivery to verify" });
    }
    if (order.verification_status === "verified") {
      return res.status(409).json({ success: false, error: "Delivery already verified" });
    }

    if (otp.trim() !== String(order.verification_otp ?? "").trim()) {
      return res.status(422).json({ success: false, error: "Incorrect OTP. Please try again." });
    }

    const now = new Date().toISOString();
    const verMethod = method === "qr" ? "qr" : "otp";

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("orders")
      .update({
        status: "delivered",
        verification_status: "verified",
        verification_method: verMethod,
        updated_at: now,
      })
      .eq("id", id)
      .select(ORDER_COLUMNS)
      .maybeSingle();

    if (upErr) return res.status(500).json({ success: false, error: upErr.message });

    await supabaseAdmin
      .from("deliveries")
      .update({ status: "completed", delivered_at: now })
      .eq("order_id", id);

    const profileMap = await loadProfileMap([updated?.customer_id, updated?.driver_id]);
    const row = mapOrderRow(updated, profileMap);

    // ── Send "delivered" WhatsApp notification ────────────────────────────
    // Fire-and-forget — don't block the response if it fails
    notifyOrderStatus("delivered", {
      ...row,
      guest_customer_phone: updated.guest_customer_phone,
      guest_customer_name:  updated.guest_customer_name,
      _source: "driver otp-verify",
    }).catch((e) => console.error("[verify-delivery] notify error (non-fatal):", e?.message));

    return res.json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /orders/:id/verify-delivery]", e);
    return res.status(500).json({ success: false, error: "Verification failed" });
  }
});

ordersRouter.use(requireAdmin);

/** Helper: resolve driver UUIDs that belong to this business */
async function getBusinessDriverIds(businessAdminId) {
  if (!businessAdminId) return null; // null = no filter
  // Find business_profile.id for this admin
  const { data: bp } = await supabaseAdmin
    .from("business_profile")
    .select("id")
    .eq("admin_id", businessAdminId)
    .maybeSingle();
  if (!bp?.id) return [];
  const { data: rows } = await supabaseAdmin
    .from("user_businesses")
    .select("user_id")
    .eq("business_id", bp.id)
    .eq("role", "driver");
  return (rows ?? []).map((r) => r.user_id);
}

/** Helper: resolve customer UUIDs that belong to this business */
async function getBusinessCustomerIds(businessAdminId) {
  if (!businessAdminId) return null;
  const { data: bp } = await supabaseAdmin
    .from("business_profile")
    .select("id")
    .eq("admin_id", businessAdminId)
    .maybeSingle();
  if (!bp?.id) return [];
  const { data: rows } = await supabaseAdmin
    .from("user_businesses")
    .select("user_id")
    .eq("business_id", bp.id)
    .eq("role", "customer");
  return (rows ?? []).map((r) => r.user_id);
}

// ─── GET /api/orders/drivers ──────────────────────────────────────────────────
// Returns drivers linked to this admin's business (for the assign-driver dropdown).
// Source: driver_business_links → drivers table (new system).

ordersRouter.get("/drivers", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;

    // Resolve this admin's business
    const { data: bp } = await supabaseAdmin
      .from("business_profile")
      .select("id")
      .eq("admin_id", adminId)
      .maybeSingle();

    const businessId = bp?.id ?? null;
    if (!businessId) return res.json({ success: true, data: [] });

    // Get driver IDs linked to this business
    const { data: links } = await supabaseAdmin
      .from("driver_business_links")
      .select("driver_id")
      .eq("business_id", businessId);

    const driverIds = (links ?? []).map((l) => l.driver_id);
    if (driverIds.length === 0) return res.json({ success: true, data: [] });

    // Fetch active driver records
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select("id, name, phone, vehicle_details")
      .in("id", driverIds)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });

    const drivers = (data ?? []).map((d) => ({
      id:              d.id,
      name:            d.name?.trim() || `Driver ${String(d.id).slice(0, 8)}`,
      phone:           d.phone,
      vehicle_details: d.vehicle_details,
    }));

    return res.json({ success: true, data: drivers });
  } catch (e) {
    console.error("[GET /orders/drivers]", e);
    return res.status(500).json({ success: false, error: "Failed to load drivers" });
  }
});



ordersRouter.get("/customers", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const customerIds = await getBusinessCustomerIds(adminId);

    let query = supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .eq("role", "customer")
      .order("display_name", { ascending: true });

    // Scope to this business's customers
    if (Array.isArray(customerIds)) {
      if (customerIds.length === 0) return res.json({ success: true, data: [] });
      query = query.in("id", customerIds);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const base = (data ?? []).map((p) => ({
      id: p.id,
      name:
        p.display_name?.trim() ||
        `Customer ${String(p.id).replace(/-/g, "").slice(0, 8)}`,
    }));

    const list = await Promise.all(
      base.map(async (p) => {
        let phone = "";
        try {
          const { data: au, error: auErr } =
            await supabaseAdmin.auth.admin.getUserById(p.id);
          if (!auErr && au?.user?.phone) phone = String(au.user.phone);
        } catch {
          /* optional */
        }
        return { ...p, phone };
      }),
    );

    return res.json({ success: true, data: list });
  } catch (e) {
    console.error("[GET /orders/customers]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to load customers",
    });
  }
});

ordersRouter.get("/", async (req, res) => {
  try {
    const adminId   = req.adminUser?.id;
    const rawStatus = req.query.status;
    let query = supabaseAdmin
      .from("orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false });

    // ── Business isolation: only return orders for this admin's business ──
    if (adminId) query = query.eq("admin_id", adminId);

    if (typeof rawStatus === "string" && rawStatus.length > 0 && STATUSES.has(rawStatus)) {
      query = query.eq("status", rawStatus);
    }

    const { data: rows, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    const list = rows ?? [];

    // ── Join deliveries for delivered_at ─────────────────────────────────
    let deliveryMap = new Map();
    if (list.length > 0) {
      const orderIds = list.map((r) => r.id);
      const { data: dels } = await supabaseAdmin
        .from("deliveries")
        .select("order_id, delivered_at")
        .in("order_id", orderIds);
      for (const d of dels ?? []) {
        deliveryMap.set(d.order_id, d.delivered_at);
      }
    }

    // ── Priority calculation per order (based on phone's order history) ──
    // Batch: fetch all phones first, then count their historical orders
    const phoneSet = new Set(
      list.map((r) => r.guest_customer_phone).filter(Boolean)
    );
    // For registered customers, look up their phone from auth
    const custIds = [...new Set(list.map((r) => r.customer_id).filter(Boolean))];
    const phoneByCustomerId = new Map();
    await Promise.all(
      custIds.map(async (cid) => {
        try {
          const { data: au } = await supabaseAdmin.auth.admin.getUserById(cid);
          const ph = au?.user?.phone?.trim();
          if (ph) {
            const normalized = ph.startsWith("+") ? ph : `+${ph}`;
            phoneByCustomerId.set(cid, normalized);
            phoneSet.add(normalized);
          }
        } catch { /* skip */ }
      })
    );

    // Count total orders and spend per phone
    const priorityByPhone = new Map();
    await Promise.all(
      [...phoneSet].map(async (phone) => {
        try {
          const { data: hist } = await supabaseAdmin
            .from("orders")
            .select("id, final_total, status")
            .eq("guest_customer_phone", phone);
          const all = hist ?? [];
          const totalOrders = all.length;
          const totalSpend = all
            .filter((o) => !["cancelled", "rejected"].includes(o.status))
            .reduce((s, o) => s + (Number(o.final_total) || 0), 0);
          const priority =
            totalOrders >= 10 || totalSpend >= 5000 ? "vip" :
            totalOrders >= 3 ? "regular" : "new";
          priorityByPhone.set(phone, priority);
        } catch { priorityByPhone.set(phone, "new"); }
      })
    );

    // ── Build profile map and map rows ───────────────────────────────────
    const ids = [
      ...list.map((r) => r.customer_id),
      ...list.map((r) => r.driver_id),
    ];
    const profileMap = await loadProfileMap(ids);

    const data = list.map((row) => {
      const phone =
        phoneByCustomerId.get(row.customer_id) ??
        row.guest_customer_phone ??
        null;
      const priority = phone ? (priorityByPhone.get(phone) ?? "new") : "new";
      return {
        ...mapOrderRow(row, profileMap),
        delivered_at: deliveryMap.get(row.id) ?? null,
        priority,
      };
    });

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /orders]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/orders/auto-confirm-preview  — READ ONLY, no DB writes
// ══════════════════════════════════════════════════════════════════════════════
ordersRouter.get("/auto-confirm-preview", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;

    // 1. Fetch pending orders scoped to this admin's business
    let pendQ = supabaseAdmin
      .from("orders")
      .select("id, guest_customer_name, guest_customer_phone, customer_id")
      .eq("status", "pending");
    if (adminId) pendQ = pendQ.eq("admin_id", adminId);
    const { data: pendingOrders, error: oErr } = await pendQ;

    if (oErr) return res.status(500).json({ success: false, error: oErr.message });
    if (!pendingOrders || pendingOrders.length === 0) {
      return res.json({ success: true, toConfirm: [], toReject: [] });
    }

    const orderIds = pendingOrders.map((o) => o.id);

    // 2. Fetch line items for all pending orders
    const { data: lineItems, error: liErr } = await supabaseAdmin
      .from("order_line_items")
      .select("order_id, inventory_item_id, item_name, quantity")
      .in("order_id", orderIds);

    if (liErr) return res.status(500).json({ success: false, error: liErr.message });

    // 3. Fetch current inventory for all referenced items
    const invIds = [...new Set((lineItems ?? []).map((l) => l.inventory_item_id).filter(Boolean))];
    let invMap = new Map();
    if (invIds.length > 0) {
      const { data: invRows, error: invErr } = await supabaseAdmin
        .from("inventory_items")
        .select("id, name, quantity")
        .in("id", invIds);
      if (!invErr) {
        for (const r of invRows ?? []) invMap.set(r.id, r);
      }
    }

    // 4. Build customer name map
    const custIds = [...new Set(pendingOrders.map((o) => o.customer_id).filter(Boolean))];
    const profileMap = await loadProfileMap(custIds);

    // 5. Categorise
    const itemsByOrder = new Map();
    for (const li of lineItems ?? []) {
      if (!itemsByOrder.has(li.order_id)) itemsByOrder.set(li.order_id, []);
      itemsByOrder.get(li.order_id).push(li);
    }

    const toConfirm = [];
    const toReject  = [];

    for (const order of pendingOrders) {
      const customerName = order.customer_id
        ? (profileMap.get(order.customer_id)?.display_name ?? `#${String(order.customer_id).slice(0, 8)}`)
        : (order.guest_customer_name ?? "Guest");

      const lines = itemsByOrder.get(order.id) ?? [];
      let failReason = null;

      for (const line of lines) {
        const inv = invMap.get(line.inventory_item_id);
        if (!inv) { failReason = `${line.item_name ?? "Unknown"}: item not found`; break; }
        if (inv.quantity < Number(line.quantity)) {
          failReason = `${inv.name}: need ${line.quantity}, have ${inv.quantity}`;
          break;
        }
      }

      if (failReason) {
        toReject.push({ orderId: order.id, customerName, reason: failReason });
      } else {
        toConfirm.push({ orderId: order.id, customerName });
      }
    }

    return res.json({ success: true, toConfirm, toReject });
  } catch (e) {
    console.error("[GET /orders/auto-confirm-preview]", e);
    return res.status(500).json({ success: false, error: "Preview failed" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/orders/auto-confirm  — writes to orders + inventory_items
// ══════════════════════════════════════════════════════════════════════════════
ordersRouter.post("/auto-confirm", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const now = new Date().toISOString();

    // Re-run preview logic to get current state (race-condition safe)
    let pendQ = supabaseAdmin
      .from("orders")
      .select("id, guest_customer_name, guest_customer_phone, customer_id")
      .eq("status", "pending");
    if (adminId) pendQ = pendQ.eq("admin_id", adminId);
    const { data: pendingOrders, error: oErr } = await pendQ;

    if (oErr) return res.status(500).json({ success: false, error: oErr.message });
    if (!pendingOrders || pendingOrders.length === 0) {
      return res.json({ success: true, confirmed: 0, rejected: 0, rejectedOrders: [] });
    }

    const orderIds = pendingOrders.map((o) => o.id);

    const { data: lineItems, error: liErr } = await supabaseAdmin
      .from("order_line_items")
      .select("order_id, inventory_item_id, item_name, quantity")
      .in("order_id", orderIds);

    if (liErr) return res.status(500).json({ success: false, error: liErr.message });

    const invIds = [...new Set((lineItems ?? []).map((l) => l.inventory_item_id).filter(Boolean))];
    let invMap = new Map();
    if (invIds.length > 0) {
      const { data: invRows } = await supabaseAdmin
        .from("inventory_items")
        .select("id, name, quantity")
        .in("id", invIds);
      for (const r of invRows ?? []) invMap.set(r.id, { ...r }); // clone for mutation tracking
    }

    const custIds = [...new Set(pendingOrders.map((o) => o.customer_id).filter(Boolean))];
    const profileMap = await loadProfileMap(custIds);

    const itemsByOrder = new Map();
    for (const li of lineItems ?? []) {
      if (!itemsByOrder.has(li.order_id)) itemsByOrder.set(li.order_id, []);
      itemsByOrder.get(li.order_id).push(li);
    }

    const confirmIds   = [];
    const rejectIds    = [];
    const rejectedOrders = [];
    // Pending inventory deltas: itemId → totalDeduction
    const deductions   = new Map();

    for (const order of pendingOrders) {
      const customerName = order.customer_id
        ? (profileMap.get(order.customer_id)?.display_name ?? `#${String(order.customer_id).slice(0, 8)}`)
        : (order.guest_customer_name ?? "Guest");

      const lines = itemsByOrder.get(order.id) ?? [];
      let failReason = null;

      // Check against current invMap (already includes previous deductions from this batch)
      for (const line of lines) {
        const inv = invMap.get(line.inventory_item_id);
        if (!inv) { failReason = `${line.item_name ?? "Unknown"}: item not found`; break; }
        const remaining = inv.quantity - (deductions.get(inv.id) ?? 0);
        if (remaining < Number(line.quantity)) {
          failReason = `${inv.name}: need ${line.quantity}, have ${remaining}`;
          break;
        }
      }

      if (failReason) {
        rejectIds.push(order.id);
        rejectedOrders.push({ orderId: order.id, customerName, reason: failReason });
      } else {
        confirmIds.push(order.id);
        // Reserve stock in-memory so subsequent orders in same batch see correct remaining
        for (const line of lines) {
          const prev = deductions.get(line.inventory_item_id) ?? 0;
          deductions.set(line.inventory_item_id, prev + Number(line.quantity));
        }
      }
    }

    // ── Write confirmed orders ────────────────────────────────────────────
    if (confirmIds.length > 0) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "confirmed", confirmed_at: now, updated_at: now })
        .in("id", confirmIds)
        .eq("status", "pending");

      // Deduct inventory
      for (const [itemId, delta] of deductions) {
        await supabaseAdmin.rpc("decrement_inventory", { item_id: itemId, delta })
          .catch(async () => {
            // Fallback if RPC doesn't exist: direct update with floor 0
            const inv = invMap.get(itemId);
            if (inv) {
              await supabaseAdmin
                .from("inventory_items")
                .update({ quantity: Math.max(0, inv.quantity - delta) })
                .eq("id", itemId);
            }
          });
      }
    }

    // ── Write rejected orders ─────────────────────────────────────────────
    if (rejectIds.length > 0) {
      await supabaseAdmin
        .from("orders")
        .update({ status: "rejected", updated_at: now })
        .in("id", rejectIds)
        .eq("status", "pending");
    }

    return res.json({
      success: true,
      confirmed: confirmIds.length,
      rejected: rejectIds.length,
      rejectedOrders,
    });
  } catch (e) {
    console.error("[POST /orders/auto-confirm]", e);
    return res.status(500).json({ success: false, error: "Auto-confirm failed" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/orders/bulk-action
// Body: { orderIds, action: 'confirm'|'dispatch'|'assign-driver', driverId? }
// ══════════════════════════════════════════════════════════════════════════════
ordersRouter.post("/bulk-action", async (req, res) => {
  try {
    const { orderIds, action, driverId } = req.body ?? {};

    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, error: "orderIds must be a non-empty array" });
    }
    const validIds = orderIds.filter(isUuid);
    if (validIds.length === 0) {
      return res.status(400).json({ success: false, error: "No valid UUIDs in orderIds" });
    }

    const now = new Date().toISOString();

    // ── CONFIRM ───────────────────────────────────────────────────────────────
    if (action === "confirm") {
      const { data, error } = await supabaseAdmin
        .from("orders")
        .update({ status: "confirmed", confirmed_at: now, updated_at: now })
        .in("id", validIds)
        .eq("status", "pending")
        .select("id");

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, count: (data ?? []).length });
    }

    // ── DISPATCH ──────────────────────────────────────────────────────────────
    if (action === "dispatch") {
      // Only confirmed orders with a driver can be dispatched
      const { data: eligible, error: fetchErr } = await supabaseAdmin
        .from("orders")
        .select("id, driver_id")
        .in("id", validIds)
        .eq("status", "confirmed")
        .not("driver_id", "is", null);

      if (fetchErr) return res.status(500).json({ success: false, error: fetchErr.message });

      const eligibleIds = (eligible ?? []).map((r) => r.id);
      const failedIds   = validIds.filter((id) => !eligibleIds.includes(id));

      if (eligibleIds.length > 0) {
        const { error: updErr } = await supabaseAdmin
          .from("orders")
          .update({ status: "dispatched", dispatched_at: now, updated_at: now })
          .in("id", eligibleIds);

        if (updErr) return res.status(500).json({ success: false, error: updErr.message });

        // Create delivery rows
        const deliveryRows = (eligible ?? []).map((r) => ({
          order_id: r.id,
          driver_id: r.driver_id,
          status: "assigned",
        }));
        await supabaseAdmin.from("deliveries").upsert(deliveryRows, { onConflict: "order_id" });
      }

      return res.json({ success: true, count: eligibleIds.length, failed: failedIds });
    }

    // ── ASSIGN DRIVER ─────────────────────────────────────────────────────────
    if (action === "assign-driver") {
      if (!isUuid(driverId)) {
        return res.status(400).json({ success: false, error: "driverId must be a valid UUID" });
      }

      // Validate driver belongs to this admin's business via driver_business_links
      const adminIdForBulk = req.adminUser?.id;
      let businessIdForBulk = null;
      if (adminIdForBulk) {
        const { data: bpBulk } = await supabaseAdmin
          .from("business_profile").select("id").eq("admin_id", adminIdForBulk).maybeSingle();
        businessIdForBulk = bpBulk?.id ?? null;
      }

      if (!businessIdForBulk) {
        return res.status(400).json({ success: false, error: "No business found for this admin" });
      }

      // Check driver is linked to this business
      const { data: driverLink } = await supabaseAdmin
        .from("driver_business_links")
        .select("driver_id")
        .eq("driver_id", driverId)
        .eq("business_id", businessIdForBulk)
        .maybeSingle();

      if (!driverLink) {
        return res.status(403).json({
          success: false,
          error: "This driver does not belong to your business. Add them first.",
        });
      }

      // Only update orders that belong to this admin's business
      const { data, error } = await supabaseAdmin
        .from("orders")
        .update({ driver_id: driverId, updated_at: now })
        .in("id", validIds)
        .eq("admin_id", adminIdForBulk)
        .select("id");

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.json({ success: true, count: (data ?? []).length });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("[POST /orders/bulk-action]", e);
    return res.status(500).json({ success: false, error: "Bulk action failed" });
  }
});

ordersRouter.post("/", async (req, res) => {
  try {
    const body = req.body ?? {};
    const { customer_id, region } = body;

    const legacyCreate =
      isUuid(customer_id) &&
      typeof body.customer_phone === "undefined" &&
      !("items" in body) &&
      typeof body.customer_name === "undefined" &&
      typeof body.address === "undefined";

    const regionStr =
      typeof region === "string"
        ? region.trim()
        : region == null
          ? ""
          : String(region);

    if (legacyCreate) {
      const { data: prof, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", customer_id)
        .maybeSingle();

      if (pErr) {
        return res.status(500).json({ success: false, error: pErr.message });
      }

      if (!prof) {
        return res.status(400).json({
          success: false,
          error: "customer_id must reference an existing profile",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_id,
          region: regionStr,
          status: "pending",
          admin_id: req.adminUser?.id ?? null,   // ← business isolation stamp
          updated_at: new Date().toISOString(),
        })
        .select(ORDER_COLUMNS)
        .maybeSingle();

      if (error) {
        return res.status(400).json({ success: false, error: error.message });
      }

      if (!data) {
        return res.status(500).json({
          success: false,
          error: "Order was not created",
        });
      }

      const profileMap = await loadProfileMap([
        data.customer_id,
        data.driver_id,
      ]);
      const row = mapOrderRow(data, profileMap);

      // Notify customer — order placed (pending, awaiting admin confirmation)
      try {
        await notifyOrderStatus("confirmed", {
          ...row,
          guest_customer_phone: data.guest_customer_phone,
          _source: "POST /orders (legacy)",
        });
      } catch (notifyErr) {
        console.error("[POST /orders] Notification error (non-fatal):", notifyErr.message);
      }

      return res.status(201).json({ success: true, data: row });
    }

    const customerPhoneRaw = body.customer_phone;
    const customerPhone =
      typeof customerPhoneRaw === "string" ? customerPhoneRaw.trim() : "";
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        error: "customer_phone is required",
      });
    }

    const addressStr =
      typeof body.address === "string"
        ? body.address.trim()
        : body.address == null
          ? ""
          : String(body.address);

    const customerNameRaw = body.customer_name;
    const customerName =
      typeof customerNameRaw === "string" ? customerNameRaw.trim() : "";

    let resolvedCustomerId = null;
    if (body.customer_id != null && String(body.customer_id).trim() !== "") {
      if (!isUuid(body.customer_id)) {
        return res.status(400).json({
          success: false,
          error: "customer_id must be a valid uuid when provided",
        });
      }
      const { data: prof, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", body.customer_id)
        .maybeSingle();

      if (pErr) {
        return res.status(500).json({ success: false, error: pErr.message });
      }
      if (!prof) {
        return res.status(400).json({
          success: false,
          error: "customer_id must reference an existing profile",
        });
      }
      resolvedCustomerId = body.customer_id;
    }

    if (!resolvedCustomerId && !customerName) {
      return res.status(400).json({
        success: false,
        error: "customer_name is required for walk-in orders",
      });
    }

    const parsed = normalizeOrderItems(body.items);
    if ("error" in parsed) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const { discount_type, discount_input } = parseDiscountFromBody(body);
    const subtotalPre = parsed.items.reduce(
      (acc, it) => acc + it.quantity * it.price,
      0,
    );
    const discount_value = computeDiscountRupees(
      subtotalPre,
      discount_type,
      discount_input,
    );

    // Parse optional delivery location from body
    const deliveryLat =
      body.delivery_lat != null && body.delivery_lat !== ""
        ? Number(body.delivery_lat)
        : null;
    const deliveryLng =
      body.delivery_lng != null && body.delivery_lng !== ""
        ? Number(body.delivery_lng)
        : null;
    const deliveryNotes =
      typeof body.delivery_notes === "string" ? body.delivery_notes.trim() : null;

    const finalTotal = Math.max(0, subtotalPre - discount_value);

    // Generate 6-digit OTP for delivery verification
    const verificationOtp = String(Math.floor(100000 + Math.random() * 900000));

    const insertPayload = {
      customer_id: resolvedCustomerId,
      region: regionStr,
      customer_address: addressStr,
      guest_customer_name: resolvedCustomerId ? null : customerName,
      guest_customer_phone: resolvedCustomerId ? null : customerPhone,
      status: "pending",
      updated_at: new Date().toISOString(),
      admin_id: req.adminUser?.id ?? null,       // ← business isolation stamp
      discount_type,
      discount_input,
      discount_value,
      final_total: finalTotal,
      verification_otp: verificationOtp,
      verification_status: "pending",
      ...(Number.isFinite(deliveryLat) && Number.isFinite(deliveryLng)
        ? { delivery_lat: deliveryLat, delivery_lng: deliveryLng }
        : {}),
      ...(deliveryNotes ? { delivery_notes: deliveryNotes } : {}),
    };

    const { data: newOrder, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert(insertPayload)
      .select(ORDER_COLUMNS)
      .maybeSingle();

    if (oErr) {
      return res.status(400).json({ success: false, error: oErr.message });
    }

    if (!newOrder) {
      return res.status(500).json({
        success: false,
        error: "Order was not created",
      });
    }

    try {
      const invMap = await fetchInventoryMap(parsed.items.map((x) => x.item_id));
      const lineRows = buildLineInsertRows(newOrder.id, parsed.items, invMap);

      const { error: liErr } = await supabaseAdmin
        .from("order_line_items")
        .insert(lineRows);

      if (liErr) {
        await supabaseAdmin.from("orders").delete().eq("id", newOrder.id);
        return res.status(400).json({ success: false, error: liErr.message });
      }
    } catch (err) {
      await supabaseAdmin.from("orders").delete().eq("id", newOrder.id);
      const msg = err instanceof Error ? err.message : "Failed to add line items";
      return res.status(400).json({ success: false, error: msg });
    }

    const profileMap = await loadProfileMap([
      newOrder.customer_id,
      newOrder.driver_id,
    ]);
    const row = mapOrderRow(newOrder, profileMap);

    // Notify customer — order received
    try {
      await notifyOrderStatus("confirmed", {
        ...row,
        guest_customer_phone: newOrder.guest_customer_phone,
        _source: "POST /orders",
      });
    } catch (notifyErr) {
      console.error("[POST /orders] Notification error (non-fatal):", notifyErr.message);
    }

    return res.status(201).json({ success: true, data: row });
  } catch (e) {
    console.error("[POST /orders]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to create order",
    });
  }
});

ordersRouter.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ success: false, error: "Invalid order id" });
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (exErr) {
      return res.status(500).json({ success: false, error: exErr.message });
    }

    if (!existing) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const body = req.body ?? {};

    const customerPhoneRaw = body.customer_phone;
    const customerPhone =
      typeof customerPhoneRaw === "string" ? customerPhoneRaw.trim() : "";
    if (!customerPhone) {
      return res.status(400).json({
        success: false,
        error: "customer_phone is required",
      });
    }

    const regionStr =
      typeof body.region === "string"
        ? body.region.trim()
        : body.region == null
          ? ""
          : String(body.region);

    const addressStr =
      typeof body.address === "string"
        ? body.address.trim()
        : body.address == null
          ? ""
          : String(body.address);

    const customerNameRaw = body.customer_name;
    const customerName =
      typeof customerNameRaw === "string" ? customerNameRaw.trim() : "";

    let resolvedCustomerId = null;
    if (body.customer_id != null && String(body.customer_id).trim() !== "") {
      if (!isUuid(body.customer_id)) {
        return res.status(400).json({
          success: false,
          error: "customer_id must be a valid uuid when provided",
        });
      }
      const { data: prof, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", body.customer_id)
        .maybeSingle();

      if (pErr) {
        return res.status(500).json({ success: false, error: pErr.message });
      }
      if (!prof) {
        return res.status(400).json({
          success: false,
          error: "customer_id must reference an existing profile",
        });
      }
      resolvedCustomerId = body.customer_id;
    }

    if (!resolvedCustomerId && !customerName) {
      return res.status(400).json({
        success: false,
        error: "customer_name is required for walk-in orders",
      });
    }

    const parsed = normalizeOrderItems(body.items);
    if ("error" in parsed) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const { discount_type, discount_input } = parseDiscountFromBody(body);
    const subtotalPre = parsed.items.reduce(
      (acc, it) => acc + it.quantity * it.price,
      0,
    );
    const discount_value = computeDiscountRupees(
      subtotalPre,
      discount_type,
      discount_input,
    );

    // Parse optional delivery location from body
    const updDeliveryLat =
      body.delivery_lat != null && body.delivery_lat !== ""
        ? Number(body.delivery_lat)
        : null;
    const updDeliveryLng =
      body.delivery_lng != null && body.delivery_lng !== ""
        ? Number(body.delivery_lng)
        : null;
    const updDeliveryNotes =
      typeof body.delivery_notes === "string" ? body.delivery_notes.trim() : null;

    const finalTotal = Math.max(0, subtotalPre - discount_value);

    const updatePayload = {
      customer_id: resolvedCustomerId,
      region: regionStr,
      customer_address: addressStr,
      guest_customer_name: resolvedCustomerId ? null : customerName,
      guest_customer_phone: resolvedCustomerId ? null : customerPhone,
      discount_type,
      discount_input,
      discount_value,
      final_total: finalTotal,
      updated_at: new Date().toISOString(),
      delivery_lat: Number.isFinite(updDeliveryLat) ? updDeliveryLat : null,
      delivery_lng: Number.isFinite(updDeliveryLng) ? updDeliveryLng : null,
      delivery_notes: updDeliveryNotes ?? null,
    };

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("orders")
      .update(updatePayload)
      .eq("id", id)
      .select(ORDER_COLUMNS)
      .maybeSingle();

    if (uErr) {
      return res.status(400).json({ success: false, error: uErr.message });
    }

    if (!updated) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const { error: delErr } = await supabaseAdmin
      .from("order_line_items")
      .delete()
      .eq("order_id", id);

    if (delErr) {
      return res.status(500).json({ success: false, error: delErr.message });
    }

    try {
      const invMap = await fetchInventoryMap(parsed.items.map((x) => x.item_id));
      const lineRows = buildLineInsertRows(id, parsed.items, invMap);
      const { error: liErr } = await supabaseAdmin
        .from("order_line_items")
        .insert(lineRows);

      if (liErr) {
        return res.status(400).json({ success: false, error: liErr.message });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update line items";
      return res.status(400).json({ success: false, error: msg });
    }

    const profileMap = await loadProfileMap([
      updated.customer_id,
      updated.driver_id,
    ]);
    const row = mapOrderRow(updated, profileMap);

    return res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PUT /orders/:id]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to update order",
    });
  }
});

ordersRouter.get("/:id/invoice", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ success: false, error: "Invalid order id" });
    }

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (oErr) {
      return res.status(500).json({ success: false, error: oErr.message });
    }

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const { data: lineItems, error: iErr } = await supabaseAdmin
      .from("order_line_items")
      .select("item_name, quantity, unit_price, price")
      .eq("order_id", id)
      .order("id", { ascending: true });

    if (iErr) {
      return res.status(500).json({ success: false, error: iErr.message });
    }

    const company = await fetchCompanyConfig(req.adminUser?.id);

    // ── Fetch logo image buffer (if logo_url is set) ──────────────────────
    let logoBuffer = null;
    if (company.logo_url) {
      try {
        // Strip cache-buster for clean URL
        const cleanUrl = company.logo_url.split("?")[0];
        const logoRes = await fetch(cleanUrl);
        if (logoRes.ok) {
          const arrayBuf = await logoRes.arrayBuffer();
          logoBuffer = Buffer.from(arrayBuf);
        }
      } catch (e) {
        console.warn("[invoice] Could not fetch logo:", e.message);
      }
    }

    const profileMap = await loadProfileMap([
      order.customer_id,
      order.driver_id,
    ]);
    const summary = mapOrderRow(order, profileMap);

    let customerPhone = null;
    if (order.customer_id) {
      try {
        const { data: authUser, error: authErr } =
          await supabaseAdmin.auth.admin.getUserById(order.customer_id);
        if (!authErr && authUser?.user?.phone) {
          customerPhone = authUser.user.phone;
        }
      } catch {
        /* optional */
      }
    } else if (order.guest_customer_phone) {
      const g = String(order.guest_customer_phone).trim();
      customerPhone = g.length > 0 ? g : null;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="FlowStock-invoice-${summary.short_id}.pdf"`,
    );

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    doc.pipe(res);

    const subtotal = subtotalFromLineItems(lineItems ?? []);
    const dv = Number(order.discount_value ?? 0);
    const discountAmt = Number.isFinite(dv) ? Math.max(0, dv) : 0;
    const grand = Math.max(0, subtotal - discountAmt);

    renderInvoiceDocument(doc, {
      company,
      order,
      summary,
      lineItems: lineItems ?? [],
      customerPhone,
      subtotal,
      discountValue: discountAmt,
      grandTotal: grand,
      logoBuffer,
    });
    doc.end();
  } catch (e) {
    console.error("[GET /orders/:id/invoice]", e);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: "Failed to generate invoice",
      });
    }
  }
});

ordersRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ success: false, error: "Invalid order id" });
    }

    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", id)
      .maybeSingle();

    if (oErr) {
      return res.status(500).json({ success: false, error: oErr.message });
    }

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const { data: items, error: iErr } = await supabaseAdmin
      .from("order_line_items")
      .select("id, item_name, quantity, unit_price, price, inventory_item_id")
      .eq("order_id", id)
      .order("id", { ascending: true });

    if (iErr) {
      return res.status(500).json({ success: false, error: iErr.message });
    }

    const profileMap = await loadProfileMap([
      order.customer_id,
      order.driver_id,
    ]);
    const summary = mapOrderRow(order, profileMap);

    const customer = order.customer_id
      ? profileMap.get(order.customer_id)
      : null;
    const driver = order.driver_id ? profileMap.get(order.driver_id) : null;

    let customerPhone = null;
    if (order.customer_id) {
      try {
        const { data: authUser, error: authErr } =
          await supabaseAdmin.auth.admin.getUserById(order.customer_id);
        if (!authErr && authUser?.user) {
          customerPhone = authUser.user.phone ?? null;
        }
      } catch {
        /* optional field */
      }
    } else if (order.guest_customer_phone) {
      const g = String(order.guest_customer_phone).trim();
      customerPhone = g.length > 0 ? g : null;
    }

    const rawLines = items ?? [];
    const subtotal = subtotalFromLineItems(rawLines);
    const dv = Number(order.discount_value ?? 0);
    const discountAmt = Number.isFinite(dv) ? Math.max(0, dv) : 0;
    const grand_total = Math.max(0, subtotal - discountAmt);

    const line_items = rawLines.map((li) => ({
      ...li,
      price:
        li.price != null && Number.isFinite(Number(li.price))
          ? Number(li.price)
          : Number(li.unit_price),
    }));

    return res.json({
      success: true,
      data: {
        ...summary,
        totals: {
          subtotal,
          discount_value: discountAmt,
          grand_total,
        },
        customer: {
          id: order.customer_id,
          name: summary.customer_name,
          role: customer?.role ?? null,
          phone: customerPhone,
          address: order.customer_address ?? "",
        },
        driver: order.driver_id
          ? {
              id: order.driver_id,
              name: summary.driver_name,
              role: driver?.role ?? null,
            }
          : null,
        line_items,
      },
    });
  } catch (e) {
    console.error("[GET /orders/:id]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch order",
    });
  }
});

ordersRouter.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ success: false, error: "Invalid order id" });
    }

    const { status } = req.body ?? {};
    if (typeof status !== "string" || !STATUSES.has(status)) {
      return res.status(400).json({
        success: false,
        error: "status must be one of: pending, confirmed, dispatched, out_for_delivery, delivered, or rejected",
      });
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("orders")
      .select("driver_id, status, stock_deducted, verification_otp")
      .eq("id", id)
      .maybeSingle();

    if (exErr) {
      return res.status(500).json({ success: false, error: exErr.message });
    }

    if (!existing) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // ❌ Cancelled orders are immutable — no admin action allowed
    if (existing.status === "cancelled") {
      return res.status(409).json({
        success: false,
        error: "This order was cancelled by the customer and cannot be modified.",
      });
    }

    if (status === "dispatched" && !existing.driver_id) {
      return res.status(400).json({
        success: false,
        error: "Assign driver before dispatch",
      });
    }

    const now = new Date().toISOString();
    const statusTimestamps = {};
    if (status === "confirmed"       && !existing.confirmed_at)        statusTimestamps.confirmed_at        = now;
    if (status === "dispatched"      && !existing.dispatched_at)       statusTimestamps.dispatched_at       = now;
    if (status === "out_for_delivery")                                  statusTimestamps.out_for_delivery_at = now;

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({
        status,
        updated_at: now,
        ...statusTimestamps,
      })
      .eq("id", id)
      .select(ORDER_COLUMNS)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!data) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    // ── Event-based inventory update ──────────────────────────────────────
    // Deduct stock on the first transition into the fulfilment pipeline
    // (confirmed OR dispatched — whichever happens first).
    // The stock_deducted flag ensures this runs exactly once per order.
    const shouldDeduct =
      (status === "confirmed" || status === "dispatched") &&
      !existing.stock_deducted;

    if (shouldDeduct) {
      console.log(`[Orders] Deducting inventory for order ${id} (status: ${status})`);
      const ok = await deductInventoryForOrder(id);
      if (ok) {
        // Mark flag so future status changes don’t re-deduct
        await supabaseAdmin
          .from("orders")
          .update({ stock_deducted: true })
          .eq("id", id);
        console.log(`[Orders] stock_deducted=true set for order ${id}`);
      } else {
        console.error(`[Orders] Inventory deduction failed for order ${id} — stock_deducted NOT set`);
      }
    }

    // Restore stock if rejected before fulfilment
    if (status === "rejected" && existing.stock_deducted) {
      restoreInventoryForOrder(id, existing.status).catch((e) =>
        console.error("[Status] Inventory restore error (non-fatal):", e.message)
      );
      // Reset the flag so a re-confirmation would deduct again if needed
      await supabaseAdmin.from("orders").update({ stock_deducted: false }).eq("id", id);
    }

    const profileMap = await loadProfileMap([
      data.customer_id,
      data.driver_id,
    ]);
    const row = mapOrderRow(data, profileMap);

    // ── WhatsApp notification (shared helper) ────────────────────────────
    // For out_for_delivery: guarantee a real OTP exists before notifying.
    let notifyOtp = data.verification_otp ?? existing.verification_otp ?? null;
    if (status === "out_for_delivery" && !notifyOtp) {
      notifyOtp = String(Math.floor(100000 + Math.random() * 900000));
      await supabaseAdmin
        .from("orders")
        .update({ verification_otp: notifyOtp, verification_status: "pending" })
        .eq("id", id);
      console.log(`[PUT /orders/:id/status] Generated fresh OTP ${notifyOtp} for order ${id}`);
    }
    await notifyOrderStatus(status, {
      ...row,
      guest_customer_phone: data.guest_customer_phone,
      guest_customer_name:  data.guest_customer_name,
      verification_otp:     notifyOtp,
      _source: "admin status update",
    });

    return res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PUT /orders/:id/status]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to update status",
    });
  }
});

// ─── PUT /api/orders/:id/assign-driver ────────────────────────────────────────
// Assigns (or clears) a driver on an order.
// Security: driver MUST be linked to this admin's business via driver_business_links.
// The order MUST also belong to this admin's business (admin_id check).

ordersRouter.put("/:id/assign-driver", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return res.status(400).json({ success: false, error: "Invalid order id" });
    }

    const { driver_id } = req.body ?? {};
    const adminId = req.adminUser?.id;

    // ── Resolve this admin's business ──────────────────────────────────────────
    const { data: bp } = await supabaseAdmin
      .from("business_profile")
      .select("id")
      .eq("admin_id", adminId)
      .maybeSingle();

    const businessId = bp?.id ?? null;
    if (!businessId) {
      return res.status(400).json({ success: false, error: "No business found for this admin" });
    }

    // ── Resolve nextDriverId ────────────────────────────────────────────────────
    const nextDriverId =
      driver_id === null || driver_id === undefined || driver_id === ""
        ? null
        : driver_id;

    // ── Validate driver belongs to this business ───────────────────────────────
    if (nextDriverId !== null) {
      if (!isUuid(nextDriverId)) {
        return res.status(400).json({
          success: false,
          error: "driver_id must be a valid UUID or null",
        });
      }

      const { data: driverLink } = await supabaseAdmin
        .from("driver_business_links")
        .select("driver_id")
        .eq("driver_id", nextDriverId)
        .eq("business_id", businessId)
        .maybeSingle();

      if (!driverLink) {
        return res.status(403).json({
          success: false,
          error: "This driver does not belong to your business. Add them first in the Drivers page.",
        });
      }
    }

    // ── Verify order exists and belongs to this business ───────────────────────
    const { data: existingOrder, error: exErr } = await supabaseAdmin
      .from("orders")
      .select("status, admin_id")
      .eq("id", id)
      .maybeSingle();

    if (exErr)          return res.status(500).json({ success: false, error: exErr.message });
    if (!existingOrder) return res.status(404).json({ success: false, error: "Order not found" });

    if (existingOrder.admin_id && existingOrder.admin_id !== adminId) {
      return res.status(403).json({ success: false, error: "This order does not belong to your business" });
    }

    if (existingOrder.status === "cancelled") {
      return res.status(409).json({
        success: false,
        error: "This order was cancelled. Driver cannot be assigned.",
      });
    }

    // ── Update order ────────────────────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({
        driver_id:  nextDriverId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("admin_id", adminId)    // business-isolation guard
      .select(ORDER_COLUMNS)
      .maybeSingle();

    if (error) return res.status(400).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Order not found or not in your business" });

    const profileMap = await loadProfileMap([data.customer_id, data.driver_id]);
    const row = mapOrderRow(data, profileMap);

    return res.json({ success: true, data: row });
  } catch (e) {
    console.error("[PUT /orders/:id/assign-driver]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to assign driver",
    });
  }
});




// ─── GET /api/test-whatsapp?to=+91XXXXXXXXXX ─────────────────────────────────
// Temporary test route — sends a WhatsApp message to verify Twilio is working.
// Usage: GET http://localhost:8000/api/test-whatsapp?to=+919876543210
// Or set TWILIO_TEST_TO in .env and hit without query param.

ordersRouter.get("/test-whatsapp", async (req, res) => {
  const to = (req.query.to || process.env.TWILIO_TEST_TO || "").trim();

  console.log("─".repeat(50));
  console.log("[test-whatsapp] 🧪 Test route triggered");
  console.log("[test-whatsapp] TWILIO_ACCOUNT_SID :", process.env.TWILIO_ACCOUNT_SID ? "✅ set (" + process.env.TWILIO_ACCOUNT_SID.slice(0,10) + "…)" : "❌ MISSING");
  console.log("[test-whatsapp] TWILIO_AUTH_TOKEN  :", process.env.TWILIO_AUTH_TOKEN  ? "✅ set" : "❌ MISSING");
  console.log("[test-whatsapp] TWILIO_WHATSAPP_FROM:", process.env.TWILIO_WHATSAPP_FROM || "❌ MISSING");
  console.log("[test-whatsapp] Recipient (to)     :", to || "❌ MISSING — pass ?to=+91XXXXXXXXXX");
  console.log("─".repeat(50));

  if (!to) {
    return res.status(400).json({
      success: false,
      error: "Pass ?to=+91XXXXXXXXXX in the query, or set TWILIO_TEST_TO in .env",
    });
  }

  const result = await sendWhatsApp(to, "🧪 FlowStock test message — Twilio WhatsApp is working! ✅");

  if (result) {
    return res.json({ success: true, sid: result.sid, status: result.status });
  } else {
    return res.status(500).json({
      success: false,
      error: "Message not sent — check server logs for details",
      hint: "Look for [Notification] lines in your terminal",
    });
  }
});

