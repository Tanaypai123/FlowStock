import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { resolveBusinessId, requireBusinessId } from "../middleware/resolveBusinessId.js";
import { notifyOrderStatus } from "../services/notificationService.js";

export const customerOrdersRouter = Router();

// All routes require a valid session (any role — customer enforced below)
customerOrdersRouter.use(requireAuth);
// Resolve business context from x-business-id header for all routes
customerOrdersRouter.use(resolveBusinessId);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(id),
  );
}

function orderShortId(id) {
  return String(id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase();
}

// ─── GET /api/customer/products ── Available products for the shop ───────────
// Uses supabaseAdmin so Supabase RLS cannot block the response.

customerOrdersRouter.get("/products", requireBusinessId, async (req, res) => {
  try {
    const adminId    = req.businessAdminId;
    const businessId = req.businessId;

    console.log("[GET /customer/products] Fetching products for business:", businessId, "| admin:", adminId);

    if (!adminId) {
      console.warn("[GET /customer/products] No adminId resolved — returning empty");
      return res.json({ success: true, data: [] });
    }

    // Filter by admin_id + quantity > 0.
    // Exclude only truly internal stages ('draft', 'archived').
    // 'ready', 'processing', any other stage = visible to customers.
    const { data, error } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, stage, quantity, unit_price, low_stock_alert, unit, image_url, image_urls, description")
      .eq("admin_id", adminId)
      .gt("quantity", 0)
      .not("stage", "in", '("draft","archived")')
      .order("name", { ascending: true });

    if (error) {
      console.error("[GET /customer/products] supabase error:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`[GET /customer/products] Returning ${(data ?? []).length} products for business ${businessId}`);
    return res.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error("[GET /customer/products]", e);
    return res.status(500).json({ success: false, error: "Failed to load products" });
  }
});

// ─── GET /api/customer/business-info ─ Public-safe business branding info ────

customerOrdersRouter.get("/business-info", requireBusinessId, async (req, res) => {
  try {
    const adminId = req.businessAdminId;
    console.log("[GET /customer/business-info] adminId:", adminId);

    const { data, error } = await supabaseAdmin
      .from("business_profile")
      .select("business_name, address, phone, logo_url, brand_color, business_type, gst_number")
      .eq("admin_id", adminId)
      .maybeSingle();

    if (error) {
      console.error("[GET /customer/business-info] supabase error:", error.message);
      return res.json({ success: true, data: null });
    }

    return res.json({ success: true, data: data ?? null });
  } catch (e) {
    console.error("[GET /customer/business-info]", e);
    return res.json({ success: true, data: null });
  }
});

// ─── POST /api/customer/orders ── Place a new order ──────────────────────────

customerOrdersRouter.post("/orders", async (req, res) => {
  try {
    const user = req.authUser;
    const profile = req.authProfile;

    // Only customers (or admins using this endpoint) can place orders this way
    if (profile?.role !== "customer" && profile?.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only customers can place orders via this endpoint",
      });
    }

    const body = req.body ?? {};

    // ── Validate items ────────────────────────────────────────────────────────
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one item is required",
      });
    }

    const validatedItems = [];
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      const item_id = it?.item_id;
      const quantity = Number(it?.quantity);

      if (!isUuid(item_id)) {
        return res.status(400).json({
          success: false,
          error: `items[${i}]: item_id must be a valid uuid`,
        });
      }
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
        return res.status(400).json({
          success: false,
          error: `items[${i}]: quantity must be a positive integer`,
        });
      }
      validatedItems.push({ item_id, quantity });
    }

    // ── Fetch inventory prices and validate stock ─────────────────────────────
    const itemIds = validatedItems.map((x) => x.item_id);
    const { data: invRows, error: invErr } = await supabaseAdmin
      .from("inventory_items")
      .select("id, name, unit_price, quantity, stage")
      .in("id", itemIds);

    if (invErr) {
      return res.status(500).json({ success: false, error: invErr.message });
    }

    const invMap = new Map((invRows ?? []).map((r) => [r.id, r]));

    for (const { item_id, quantity } of validatedItems) {
      const inv = invMap.get(item_id);
      if (!inv) {
        return res.status(400).json({
          success: false,
          error: `Item ${item_id} not found`,
        });
      }
      if (inv.stage !== "ready") {
        return res.status(400).json({
          success: false,
          error: `Item "${inv.name}" is not available for ordering`,
        });
      }
      if (Number(inv.quantity) < quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for "${inv.name}". Available: ${inv.quantity}`,
        });
      }
    }

    // ── Compute totals ────────────────────────────────────────────────────────
    let subtotal = 0;
    const lineRows = [];
    for (const { item_id, quantity } of validatedItems) {
      const inv = invMap.get(item_id);
      const unitPrice = Number(inv.unit_price) || 0;
      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      lineRows.push({
        inventory_item_id: item_id,
        item_name: inv.name,
        quantity,
        unit_price: unitPrice,
        price: unitPrice,   // 'price' is the column orders.js uses as effective price
      });
    }

    // ── Validate delivery fields ──────────────────────────────────────────────
    const region = typeof body.region === "string" ? body.region.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const preferredDate =
      typeof body.preferred_date === "string" ? body.preferred_date.trim() : null;

    // region is optional but helpful
    // address is optional, stored in customer_address

    // ── Create order ──────────────────────────────────────────────────────────
    // Stamp admin_id from the resolved business context so this order is
    // scoped to the correct business in the admin dashboard.
    const { data: newOrder, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: user.id,
        region: region || null,
        customer_address: address || null,
        status: "pending",
        admin_id:    req.businessAdminId ?? null,   // ← business isolation (admin_id)
        business_id: req.businessId      ?? null,   // ← direct business_id stamp
        discount_type: "fixed",
        discount_input: 0,
        discount_value: 0,
        updated_at: new Date().toISOString(),
        ...(preferredDate ? { delivery_notes: `Preferred date: ${preferredDate}` } : {}),
      })
      .select("id, status, created_at, region, customer_address")
      .maybeSingle();

    if (oErr) {
      return res.status(400).json({ success: false, error: oErr.message });
    }
    if (!newOrder) {
      return res.status(500).json({ success: false, error: "Order was not created" });
    }

    // ── Insert line items ─────────────────────────────────────────────────────
    const lineInsert = lineRows.map((lr) => ({ ...lr, order_id: newOrder.id }));
    const { error: liErr } = await supabaseAdmin
      .from("order_line_items")
      .insert(lineInsert);

    if (liErr) {
      // Rollback order
      await supabaseAdmin.from("orders").delete().eq("id", newOrder.id);
      return res.status(400).json({ success: false, error: liErr.message });
    }

    return res.status(201).json({
      success: true,
      data: {
        id: newOrder.id,
        short_id: orderShortId(newOrder.id),
        status: newOrder.status,
        created_at: newOrder.created_at,
        region: newOrder.region,
        address: newOrder.customer_address,
        subtotal,
        final_total: subtotal, // no discount for customers
        item_count: validatedItems.length,
      },
    });
  } catch (e) {
    console.error("[POST /customer/orders]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to place order",
    });
  }
});

// ─── GET /api/customer/orders ── My orders list ───────────────────────────────

customerOrdersRouter.get("/orders", async (req, res) => {
  try {
    const user = req.authUser;

    const { data: orders, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, region, customer_address, created_at, updated_at, discount_value, driver_id, proof_url, verification_otp, verification_status")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (oErr) {
      return res.status(500).json({ success: false, error: oErr.message });
    }

    const orderList = orders ?? [];
    const orderIds = orderList.map((o) => o.id);

    // Fetch line items for all orders
    let lineItems = [];
    if (orderIds.length > 0) {
      const { data: lines, error: liErr } = await supabaseAdmin
        .from("order_line_items")
        .select("order_id, item_name, quantity, unit_price, price")
        .in("order_id", orderIds);

      if (!liErr) lineItems = lines ?? [];
    }

    // Resolve driver names for orders that have a driver_id
    const driverIds = [...new Set(orderList.map((o) => o.driver_id).filter(Boolean))];
    const driverNameMap = new Map();
    if (driverIds.length > 0) {
      const { data: driverProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", driverIds);
      for (const dp of driverProfiles ?? []) {
        driverNameMap.set(dp.id, dp.display_name?.trim() || `Driver ${String(dp.id).slice(0, 8)}`);
      }
    }

    // Group line items by order
    const linesByOrder = new Map();
    for (const li of lineItems) {
      if (!linesByOrder.has(li.order_id)) linesByOrder.set(li.order_id, []);
      linesByOrder.get(li.order_id).push(li);
    }

    const result = orderList.map((o) => {
      const lines = linesByOrder.get(o.id) ?? [];
      const subtotal = lines.reduce((s, li) => {
        const q = Number(li.quantity);
        const p = Number(li.price ?? li.unit_price);
        return s + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0);
      }, 0);
      const disc = Number(o.discount_value) || 0;
      return {
        id: o.id,
        short_id: orderShortId(o.id),
        status: o.status,
        region: o.region,
        address: o.customer_address,
        created_at: o.created_at,
        updated_at: o.updated_at,
        item_count: lines.length,
        subtotal,
        final_total: Math.max(0, subtotal - disc),
        driver_name: o.driver_id ? (driverNameMap.get(o.driver_id) ?? null) : null,
        proof_url: o.proof_url ?? null,
        verification_otp:    o.verification_otp    ?? null,
        verification_status: o.verification_status ?? null,
        items: lines.map((li) => ({
          name: li.item_name,
          quantity: Number(li.quantity),
          unit_price: Number(li.price ?? li.unit_price),
        })),
      };
    });

    return res.json({ success: true, data: result });
  } catch (e) {
    console.error("[GET /customer/orders]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
    });
  }
});

// ─── GET /api/customer/orders/my-orders ── Alias (same as /orders) ────────────
// The client calls /api/orders/my-orders per the spec, but we register it under
// /api/customer so it's intercepted by requireAuth automatically.

customerOrdersRouter.get("/orders/my-orders", async (req, res) => {
  // Reuse: set req.url and call next — simplest is to duplicate the response.
  // We forward by re-calling Express internally; since this is an alias, we simply
  // delegate to the same supabase logic.
  try {
    const user = req.authUser;

    const { data: orders, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, region, customer_address, created_at, updated_at, discount_value, driver_id, proof_url, verification_otp, verification_status")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (oErr) return res.status(500).json({ success: false, error: oErr.message });

    const orderList = orders ?? [];
    const orderIds = orderList.map((o) => o.id);

    let lineItems = [];
    if (orderIds.length > 0) {
      const { data: lines, error: liErr } = await supabaseAdmin
        .from("order_line_items")
        .select("order_id, item_name, quantity, unit_price, price")
        .in("order_id", orderIds);
      if (!liErr) lineItems = lines ?? [];
    }

    const driverIds = [...new Set(orderList.map((o) => o.driver_id).filter(Boolean))];
    const driverNameMap = new Map();
    if (driverIds.length > 0) {
      const { data: driverProfiles } = await supabaseAdmin
        .from("profiles").select("id, display_name").in("id", driverIds);
      for (const dp of driverProfiles ?? []) {
        driverNameMap.set(dp.id, dp.display_name?.trim() || `Driver ${String(dp.id).slice(0, 8)}`);
      }
    }

    const linesByOrder = new Map();
    for (const li of lineItems) {
      if (!linesByOrder.has(li.order_id)) linesByOrder.set(li.order_id, []);
      linesByOrder.get(li.order_id).push(li);
    }

    const result = orderList.map((o) => {
      const lines = linesByOrder.get(o.id) ?? [];
      const subtotal = lines.reduce((s, li) => {
        const q = Number(li.quantity); const p = Number(li.price ?? li.unit_price);
        return s + (Number.isFinite(q) && Number.isFinite(p) ? q * p : 0);
      }, 0);
      const disc = Number(o.discount_value) || 0;
      return {
        id: o.id, short_id: orderShortId(o.id),
        status: o.status, region: o.region, address: o.customer_address,
        created_at: o.created_at, updated_at: o.updated_at,
        item_count: lines.length, subtotal,
        final_total: Math.max(0, subtotal - disc),
        driver_name: o.driver_id ? (driverNameMap.get(o.driver_id) ?? null) : null,
        proof_url: o.proof_url ?? null,
        items: lines.map((li) => ({ name: li.item_name, quantity: Number(li.quantity), unit_price: Number(li.price ?? li.unit_price) })),
      };
    });

    return res.json({ success: true, data: result });
  } catch (e) {
    console.error("[GET /customer/orders/my-orders]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch orders" });
  }
});

// ─── PUT /api/customer/orders/:id/cancel ── Cancel a pending order ────────────

customerOrdersRouter.put("/orders/:id/cancel", async (req, res) => {
  try {
    const user = req.authUser;
    const { id } = req.params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id))) {
      return res.status(400).json({ success: false, error: "Invalid order id" });
    }

    // Fetch the order — must belong to this customer
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, customer_id")
      .eq("id", id)
      .maybeSingle();

    if (oErr) {
      return res.status(500).json({ success: false, error: oErr.message });
    }
    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    if (order.customer_id !== user.id) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel an order with status "${order.status}". Only pending orders can be cancelled.`,
      });
    }

    const { data: updated, error: uErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status, updated_at")
      .maybeSingle();

    if (uErr) {
      return res.status(500).json({ success: false, error: uErr.message });
    }

    // Notify customer their cancellation went through
    try {
      // Fetch phone fields not in the ownership-check select
      const { data: orderFull } = await supabaseAdmin
        .from("orders")
        .select("customer_id, guest_customer_phone, guest_customer_name")
        .eq("id", id)
        .maybeSingle();

      const shortId = String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
      await notifyOrderStatus("cancelled", {
        id,
        short_id:             shortId,
        customer_id:          orderFull?.customer_id ?? user.id,
        guest_customer_phone: orderFull?.guest_customer_phone,
        customer_name:        orderFull?.guest_customer_name ?? "Customer",
        _source:              "customer cancel",
      });
    } catch (notifyErr) {
      console.error("[cancel] Notification error (non-fatal):", notifyErr.message);
    }

    return res.json({ success: true, data: updated });
  } catch (e) {
    console.error("[PUT /customer/orders/:id/cancel]", e);
    return res.status(500).json({ success: false, error: "Failed to cancel order" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER PROFILE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/customer/profile ────────────────────────────────────────────────
customerOrdersRouter.get("/profile", async (req, res) => {
  try {
    const user = req.authUser;
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("display_name, phone, business_name, email")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Merge with Supabase auth email/phone as fallbacks
    const profile = {
      display_name:  data?.display_name  ?? "",
      phone:         data?.phone         ?? user.phone ?? "",
      business_name: data?.business_name ?? "",
      email:         data?.email         ?? user.email ?? "",
    };
    return res.json({ success: true, data: profile });
  } catch (e) {
    console.error("[GET /customer/profile]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch profile" });
  }
});

// ─── PUT /api/customer/profile ────────────────────────────────────────────────
customerOrdersRouter.put("/profile", async (req, res) => {
  try {
    const user = req.authUser;
    const { display_name, phone, business_name, email } = req.body ?? {};

    const updates = {};
    if (display_name !== undefined) updates.display_name = String(display_name).trim().slice(0, 120);
    if (phone        !== undefined) updates.phone         = String(phone).trim().slice(0, 20);
    if (business_name!== undefined) updates.business_name= String(business_name).trim().slice(0, 120);
    if (email        !== undefined) updates.email         = String(email).trim().slice(0, 200);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", user.id)
      .select("display_name, phone, business_name, email")
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /customer/profile]", e);
    return res.status(500).json({ success: false, error: "Failed to update profile" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SAVED DELIVERY ADDRESSES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/customer/addresses ─────────────────────────────────────────────
customerOrdersRouter.get("/addresses", async (req, res) => {
  try {
    const user = req.authUser;
    const { data, error } = await supabaseAdmin
      .from("customer_addresses")
      .select("id, label, region, address, pincode, is_default, created_at")
      .eq("customer_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error("[GET /customer/addresses]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch addresses" });
  }
});

// ─── POST /api/customer/addresses ────────────────────────────────────────────
customerOrdersRouter.post("/addresses", async (req, res) => {
  try {
    const user = req.authUser;
    const { label, region, address, pincode, is_default } = req.body ?? {};

    if (!region?.trim()) return res.status(400).json({ success: false, error: "region is required" });
    if (!address?.trim()) return res.status(400).json({ success: false, error: "address is required" });

    // If setting as default, clear other defaults first
    if (is_default) {
      await supabaseAdmin
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", user.id);
    }

    const { data, error } = await supabaseAdmin
      .from("customer_addresses")
      .insert({
        customer_id: user.id,
        label:      String(label  ?? "Home").trim().slice(0, 40),
        region:     String(region).trim().slice(0, 120),
        address:    String(address).trim().slice(0, 500),
        pincode:    pincode ? String(pincode).trim().slice(0, 10) : null,
        is_default: Boolean(is_default),
      })
      .select("id, label, region, address, pincode, is_default, created_at")
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(201).json({ success: true, data });
  } catch (e) {
    console.error("[POST /customer/addresses]", e);
    return res.status(500).json({ success: false, error: "Failed to save address" });
  }
});

// ─── PUT /api/customer/addresses/:id ─────────────────────────────────────────
customerOrdersRouter.put("/addresses/:id", async (req, res) => {
  try {
    const user = req.authUser;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const { label, region, address, pincode, is_default } = req.body ?? {};
    if (!region?.trim()) return res.status(400).json({ success: false, error: "region is required" });
    if (!address?.trim()) return res.status(400).json({ success: false, error: "address is required" });

    // If setting as default, clear others first
    if (is_default) {
      await supabaseAdmin
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("customer_id", user.id);
    }

    const { data, error } = await supabaseAdmin
      .from("customer_addresses")
      .update({
        label:      String(label  ?? "Home").trim().slice(0, 40),
        region:     String(region).trim().slice(0, 120),
        address:    String(address).trim().slice(0, 500),
        pincode:    pincode ? String(pincode).trim().slice(0, 10) : null,
        is_default: Boolean(is_default),
      })
      .eq("id", id)
      .eq("customer_id", user.id) // security: can only edit own addresses
      .select("id, label, region, address, pincode, is_default, created_at")
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Address not found" });
    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /customer/addresses/:id]", e);
    return res.status(500).json({ success: false, error: "Failed to update address" });
  }
});

// ─── PUT /api/customer/addresses/:id/default ─────────────────────────────────

customerOrdersRouter.put("/addresses/:id/default", async (req, res) => {
  try {
    const user = req.authUser;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    await supabaseAdmin.from("customer_addresses").update({ is_default: false }).eq("customer_id", user.id);
    await supabaseAdmin.from("customer_addresses").update({ is_default: true }).eq("id", id).eq("customer_id", user.id);

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed to update default" });
  }
});

// ─── DELETE /api/customer/addresses/:id ──────────────────────────────────────
customerOrdersRouter.delete("/addresses/:id", async (req, res) => {
  try {
    const user = req.authUser;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const { error } = await supabaseAdmin
      .from("customer_addresses")
      .delete()
      .eq("id", id)
      .eq("customer_id", user.id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /customer/addresses/:id]", e);
    return res.status(500).json({ success: false, error: "Failed to delete address" });
  }
});

// ─── GET /api/customer/orders/:id/items ─ Line items for complaint form ────────

customerOrdersRouter.get("/orders/:id/items", async (req, res) => {
  try {
    const user = req.authUser;
    if (!user?.id) return res.status(401).json({ success: false, error: "Unauthenticated" });

    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid order id" });

    // Verify order belongs to this customer
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id")
      .eq("id", id)
      .maybeSingle();

    if (oErr) return res.status(500).json({ success: false, error: oErr.message });
    if (!order) return res.status(404).json({ success: false, error: "Order not found" });
    if (order.customer_id !== user.id)
      return res.status(403).json({ success: false, error: "Access denied" });

    const { data: items, error: iErr } = await supabaseAdmin
      .from("order_line_items")
      .select("id, item_name, quantity, unit_price")
      .eq("order_id", id)
      .order("id", { ascending: true });

    if (iErr) return res.status(500).json({ success: false, error: iErr.message });
    return res.json({ success: true, data: items ?? [] });
  } catch (e) {
    console.error("[GET /customer/orders/:id/items]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch order items" });
  }
});
