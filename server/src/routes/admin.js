import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

// ─── crypto helper (same algo as driverAuth.js) ──────────────────────────────
const scryptAsync = promisify(scrypt);
async function hashDriverPassword(password) {
  const salt    = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

const ROLES = new Set(["admin", "customer", "driver"]);

function normalizePhone(raw) {
  return String(raw ?? "").replace(/[\s\-().]/g, "").trim();
}

function isE164(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

export const adminRouter = Router();

adminRouter.use(requireAdmin);

adminRouter.get("/users", async (_req, res) => {
  try {
    const { data: listData, error: listError } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (listError) {
      return res.status(500).json({
        success: false,
        error: listError.message,
      });
    }

    const users = listData?.users ?? [];
    const ids = users.map((u) => u.id);

    let profileMap = new Map();
    if (ids.length > 0) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, role, updated_at")
        .in("id", ids);

      if (pErr) {
        return res.status(500).json({
          success: false,
          error: pErr.message,
        });
      }

      profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    }

    const data = users.map((u) => {
      const p = profileMap.get(u.id);
      return {
        id: u.id,
        phone: u.phone ?? "",
        role: p?.role ?? null,
        created_at: u.created_at ?? null,
      };
    });

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /admin/users]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to list users",
    });
  }
});

adminRouter.post("/create-user", async (req, res) => {
  try {
    const { phone: rawPhone, password, role } = req.body ?? {};

    if (rawPhone === undefined || password === undefined || role === undefined) {
      return res.status(400).json({
        success: false,
        error: "phone, password, and role are required",
      });
    }

    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "password must be a string with at least 6 characters",
      });
    }

    if (typeof role !== "string" || !ROLES.has(role)) {
      return res.status(400).json({
        success: false,
        error: "role must be one of: admin, customer, driver",
      });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone.startsWith("+") || !isE164(phone)) {
      return res.status(400).json({
        success: false,
        error: "phone must be a valid E.164 number (e.g. +919876543210)",
      });
    }

    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        phone,
        password,
        phone_confirm: true,
      });

    if (createError || !created?.user?.id) {
      return res.status(400).json({
        success: false,
        error: createError?.message ?? "Failed to create auth user",
      });
    }

    const userId = created.user.id;

    const { error: insertError } = await supabaseAdmin
  .from("profiles")
  .upsert(
    { id: userId, role },
    { onConflict: "id" }
  );

    if (insertError) {
      const { error: delError } = await supabaseAdmin.auth.admin.deleteUser(
        userId,
      );
      if (delError) {
        console.error("[create-user] rollback deleteUser failed", delError);
      }
      return res.status(500).json({
        success: false,
        error: insertError.message,
      });
    }

    return res.status(201).json({
      success: true,
      data: { id: userId, phone: created.user.phone ?? phone, role },
    });
  } catch (e) {
    console.error("[POST /admin/create-user]", e);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

function orderShortId(id) {
  return String(id).replace(/-/g, "").slice(0, 8).toUpperCase();
}

async function loadProfileNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .in("id", unique);

  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((p) => [
      p.id,
      p.display_name?.trim() ||
        `User ${String(p.id).replace(/-/g, "").slice(0, 8)}`,
    ]),
  );
}

// ─── Reports Route ────────────────────────────────────────────────────────────

/** GET /api/admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD */
adminRouter.get("/reports", async (req, res) => {
  try {
    // ── Parse date range ──────────────────────────────────────────────────────
    const { from, to } = req.query;

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Default: last 7 days
    const fromDate = typeof from === "string" && from.match(/^\d{4}-\d{2}-\d{2}$/)
      ? from
      : (() => {
          const d = new Date(now);
          d.setUTCDate(d.getUTCDate() - 6);
          return d.toISOString().slice(0, 10);
        })();

    const toDate = typeof to === "string" && to.match(/^\d{4}-\d{2}-\d{2}$/)
      ? to
      : todayStr;

    const fromISO = `${fromDate}T00:00:00.000Z`;
    const toISO   = `${toDate}T23:59:59.999Z`;

    // ── Fetch orders in range — scoped to this admin's business ──────────────
    const adminId = req.adminUser?.id;
    let ordQuery = supabaseAdmin
      .from("orders")
      .select("id, status, created_at, discount_value, customer_id, guest_customer_name")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: true });
    if (adminId) ordQuery = ordQuery.eq("admin_id", adminId);
    const { data: orders, error: ordErr } = await ordQuery;

    if (ordErr) {
      return res.status(500).json({ success: false, error: ordErr.message });
    }

    const orderList = orders ?? [];
    const orderIds = orderList.map((o) => o.id);

    // ── Fetch line items for those orders ─────────────────────────────────────
    let lineItems = [];
    if (orderIds.length > 0) {
      const { data: lines, error: liErr } = await supabaseAdmin
        .from("order_line_items")
        .select("order_id, item_name, quantity, unit_price, price")
        .in("order_id", orderIds);

      if (liErr) {
        return res.status(500).json({ success: false, error: liErr.message });
      }
      lineItems = lines ?? [];
    }

    // ── Build per-order revenue map ───────────────────────────────────────────
    // Revenue = sum(quantity × price) per order
    const revenueByOrder = new Map();
    for (const li of lineItems) {
      const qty = Number(li.quantity) || 0;
      const price = Number(li.price ?? li.unit_price) || 0;
      const prev = revenueByOrder.get(li.order_id) ?? 0;
      revenueByOrder.set(li.order_id, prev + qty * price);
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const totalOrders = orderList.length;
    const deliveredOrders = orderList.filter((o) => o.status === "delivered");
    const delivered = deliveredOrders.length;
    const successRate = totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0;

    let totalRevenue = 0;
    let totalDiscount = 0;
    for (const o of deliveredOrders) {
      totalRevenue += revenueByOrder.get(o.id) ?? 0;
      totalDiscount += Number(o.discount_value) || 0;
    }
    // Net revenue after discount
    totalRevenue = Math.max(0, totalRevenue - totalDiscount);
    const avgOrderValue = delivered > 0 ? totalRevenue / delivered : 0;

    // ── Daily orders (all in range, not just delivered) ───────────────────────
    // Build calendar skeleton from fromDate → toDate
    const dailyMap = new Map();
    {
      const cur = new Date(`${fromDate}T12:00:00.000Z`);
      const end = new Date(`${toDate}T12:00:00.000Z`);
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10);
        dailyMap.set(key, { date: key, count: 0, revenue: 0 });
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }
    for (const o of orderList) {
      const key = new Date(o.created_at).toISOString().slice(0, 10);
      const entry = dailyMap.get(key);
      if (entry) {
        entry.count += 1;
        if (o.status === "delivered") {
          const gross = revenueByOrder.get(o.id) ?? 0;
          const disc = Number(o.discount_value) || 0;
          entry.revenue += Math.max(0, gross - disc);
        }
      }
    }
    const dailyOrders = [...dailyMap.values()].map((d) => ({
      ...d,
      revenue: Math.round(d.revenue * 100) / 100,
    }));

    // ── Status breakdown ──────────────────────────────────────────────────────
    const statusCount = new Map();
    for (const o of orderList) {
      statusCount.set(o.status, (statusCount.get(o.status) ?? 0) + 1);
    }
    const statusBreakdown = [...statusCount.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    // ── Top products by quantity ──────────────────────────────────────────────
    const productQty = new Map();
    for (const li of lineItems) {
      const name = li.item_name ?? "Unknown";
      productQty.set(name, (productQty.get(name) ?? 0) + (Number(li.quantity) || 0));
    }
    const topProducts = [...productQty.entries()]
      .map(([name, totalQty]) => ({ name, totalQty }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5);

    return res.json({
      success: true,
      data: {
        summary: {
          totalOrders,
          delivered,
          successRate,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalDiscount: Math.round(totalDiscount * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        },
        dailyOrders,
        statusBreakdown,
        topProducts,
      },
    });
  } catch (e) {
    console.error("[GET /admin/reports]", e);
    return res.status(500).json({ success: false, error: "Failed to generate report" });
  }
});

adminRouter.get("/dashboard-stats", async (req, res) => {

  try {
    const adminId = req.adminUser?.id;

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // Build base queries scoped to this admin's business
    const baseTodayQ = supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart.toISOString())
      .lt("created_at", dayEnd.toISOString());
    if (adminId) baseTodayQ.eq("admin_id", adminId);
    const { count: ordersToday, error: oTodayErr } = await baseTodayQ;

    if (oTodayErr) {
      return res.status(500).json({ success: false, error: oTodayErr.message });
    }

    const basePendQ = supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (adminId) basePendQ.eq("admin_id", adminId);
    const { count: pendingOrders, error: pendErr } = await basePendQ;

    if (pendErr) {
      return res.status(500).json({ success: false, error: pendErr.message });
    }

    const invQ = supabaseAdmin
      .from("inventory_items")
      .select("id, name, stage, quantity, low_stock_alert");
    if (adminId) invQ.eq("admin_id", adminId);
    const { data: invRows, error: invErr } = await invQ;

    if (invErr) {
      return res.status(500).json({ success: false, error: invErr.message });
    }

    const lowStockItems = (invRows ?? [])
      .filter(
        (r) =>
          Number(r.quantity) <= Number(r.low_stock_alert ?? 0),
      )
      .map((r) => ({
        id: r.id,
        name: r.name,
        stage: r.stage,
        quantity: Number(r.quantity),
        low_stock_alert: Number(r.low_stock_alert),
      }))
      .sort((a, b) => a.quantity - b.quantity);

    const drvQ = supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "driver");
    // Note: active drivers count is global for now (drivers are shared)
    const { count: activeDrivers, error: drvErr } = await drvQ;

    if (drvErr) {
      return res.status(500).json({ success: false, error: drvErr.message });
    }

    const recentQ = supabaseAdmin
      .from("orders")
      .select("id, customer_id, region, status, created_at")
      .order("created_at", { ascending: false })
      .limit(10);
    if (adminId) recentQ.eq("admin_id", adminId);
    const { data: recentRows, error: recentErr } = await recentQ;

    if (recentErr) {
      return res.status(500).json({ success: false, error: recentErr.message });
    }

    const recentProfileMap = await loadProfileNames(
      (recentRows ?? []).map((r) => r.customer_id),
    );
    const recentOrders = (recentRows ?? []).map((row) => ({
      id: row.id,
      short_id: orderShortId(row.id),
      customer_name: row.customer_id
        ? recentProfileMap.get(row.customer_id) ??
          `Customer ${String(row.customer_id).slice(0, 8)}…`
        : "Walk-in",
      region: row.region ?? "",
      status: row.status,
      created_at: row.created_at,
    }));

    const sevenDaysAgo = new Date(dayStart);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);

    const weekQ = supabaseAdmin
      .from("orders")
      .select("created_at")
      .gte("created_at", sevenDaysAgo.toISOString())
      .lt("created_at", dayEnd.toISOString());
    if (adminId) weekQ.eq("admin_id", adminId);
    const { data: weekOrders, error: weekErr } = await weekQ;

    if (weekErr) {
      return res.status(500).json({ success: false, error: weekErr.message });
    }

    const countsByDay = new Map();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(dayStart);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      countsByDay.set(key, 0);
    }

    for (const o of weekOrders ?? []) {
      const key = new Date(o.created_at).toISOString().slice(0, 10);
      if (countsByDay.has(key)) {
        countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1);
      }
    }

    const ordersByDay = [...countsByDay.entries()].map(([date, count]) => {
      const d = new Date(`${date}T12:00:00.000Z`);
      return {
        date,
        count,
        label: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      };
    });

    return res.json({
      success: true,
      data: {
        orders_today: ordersToday ?? 0,
        pending_orders: pendingOrders ?? 0,
        low_stock_count: lowStockItems.length,
        active_drivers: activeDrivers ?? 0,
        recent_orders: recentOrders,
        low_stock_items: lowStockItems,
        orders_by_day: ordersByDay,
      },
    });
  } catch (e) {
    console.error("[GET /admin/dashboard-stats]", e);
    return res.status(500).json({
      success: false,
      error: "Failed to load dashboard stats",
    });
  }
});

// ─── Driver Routes ────────────────────────────────────────────────────────────

/** GET /api/admin/drivers — drivers linked to this business via driver_business_links */
adminRouter.get("/drivers", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;

    // Resolve admin's business
    const { data: bp } = await supabaseAdmin
      .from("business_profile")
      .select("id")
      .eq("admin_id", adminId)
      .maybeSingle();

    const businessId = bp?.id ?? null;
    if (!businessId) return res.json({ success: true, data: [] });

    // 1. Fetch all drivers linked to this business
    const { data: links, error: linksErr } = await supabaseAdmin
      .from("driver_business_links")
      .select("driver_id")
      .eq("business_id", businessId);

    if (linksErr) return res.status(500).json({ success: false, error: linksErr.message });

    const driverIds = (links ?? []).map((l) => l.driver_id);
    if (driverIds.length === 0) return res.json({ success: true, data: [] });

    // 2. Fetch driver records
    const { data: drivers, error: drErr } = await supabaseAdmin
      .from("drivers")
      .select("id, name, phone, vehicle_details, license_number, is_profile_complete, is_active")
      .in("id", driverIds)
      .order("name", { ascending: true });

    if (drErr) return res.status(500).json({ success: false, error: drErr.message });

    // 3. Active deliveries (confirmed + dispatched + out_for_delivery, scoped to this business)
    const { data: activeRows } = await supabaseAdmin
      .from("orders")
      .select("driver_id")
      .in("driver_id", driverIds)
      .in("status", ["confirmed", "dispatched", "out_for_delivery"])
      .eq("admin_id", adminId);

    // 4. Total delivered (scoped to this business)
    const { data: deliveredRows } = await supabaseAdmin
      .from("orders")
      .select("driver_id")
      .in("driver_id", driverIds)
      .eq("status", "delivered")
      .eq("admin_id", adminId);

    const activeMap    = new Map();
    const deliveredMap = new Map();
    for (const r of activeRows    ?? []) activeMap.set(r.driver_id,    (activeMap.get(r.driver_id)    ?? 0) + 1);
    for (const r of deliveredRows ?? []) deliveredMap.set(r.driver_id, (deliveredMap.get(r.driver_id) ?? 0) + 1);

    const data = (drivers ?? []).map((d) => ({
      id:                  d.id,
      name:                d.name?.trim() || `Driver ${String(d.id).slice(0, 8)}`,
      phone:               d.phone ?? "—",
      vehicle_details:     d.vehicle_details ?? null,
      license_number:      d.license_number  ?? null,
      is_profile_complete: d.is_profile_complete ?? false,
      is_active:           d.is_active ?? true,
      active_deliveries:   activeMap.get(d.id)    ?? 0,
      total_delivered:     deliveredMap.get(d.id) ?? 0,
    }));

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /admin/drivers]", e);
    return res.status(500).json({ success: false, error: "Failed to load drivers" });
  }
});

/** GET /api/admin/drivers/search?phone=NUMBER — global phone lookup across all businesses */
adminRouter.get("/drivers/search", async (req, res) => {
  try {
    const rawPhone = String(req.query.phone ?? "").trim();
    if (!rawPhone) {
      return res.status(400).json({ success: false, error: "phone query param is required" });
    }

    const phone = normalizePhone(rawPhone);

    const { data: driver, error: drErr } = await supabaseAdmin
      .from("drivers")
      .select("id, name, phone, vehicle_details, license_number, is_profile_complete, is_active")
      .eq("phone", phone)
      .maybeSingle();

    if (drErr) return res.status(500).json({ success: false, error: drErr.message });
    if (!driver) return res.json({ success: true, data: null, found: false });

    // Count how many businesses this driver already belongs to
    const { count: bizCount } = await supabaseAdmin
      .from("driver_business_links")
      .select("id", { count: "exact", head: true })
      .eq("driver_id", driver.id);

    // Check if already linked to THIS admin's business
    const { data: bp } = await supabaseAdmin
      .from("business_profile").select("id").eq("admin_id", req.adminUser?.id).maybeSingle();

    let alreadyInThisBusiness = false;
    if (bp?.id) {
      const { data: link } = await supabaseAdmin
        .from("driver_business_links")
        .select("id")
        .eq("driver_id", driver.id)
        .eq("business_id", bp.id)
        .maybeSingle();
      alreadyInThisBusiness = !!link;
    }

    return res.json({
      success: true,
      found:   true,
      data: {
        id:                    driver.id,
        name:                  driver.name,
        phone:                 driver.phone,
        vehicle_details:       driver.vehicle_details ?? null,
        license_number:        driver.license_number  ?? null,
        is_profile_complete:   driver.is_profile_complete,
        is_active:             driver.is_active,
        businesses_count:      bizCount ?? 0,
        alreadyInThisBusiness,
      },
    });
  } catch (e) {
    console.error("[GET /admin/drivers/search]", e);
    return res.status(500).json({ success: false, error: "Search failed" });
  }
});

/** POST /api/admin/drivers/create — create new driver + link to this business (no password required) */
adminRouter.post("/drivers/create", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { name, phone: rawPhone } = req.body ?? {};

    if (!name?.trim() || !rawPhone) {
      return res.status(400).json({ success: false, error: "name and phone are required" });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone.startsWith("+") || !isE164(phone)) {
      return res.status(400).json({ success: false, error: "phone must be E.164 (e.g. +919876543210)" });
    }

    // Check duplicate
    const { data: exists } = await supabaseAdmin
      .from("drivers").select("id").eq("phone", phone).maybeSingle();
    if (exists) {
      return res.status(409).json({
        success: false,
        error: "A driver with this phone already exists. Use 'add-existing' to link them.",
        existingId: exists.id,
      });
    }

    // Create driver — no password_hash (driver sets password on first login via /driver/setup)
    const { data: newDriver, error: insertErr } = await supabaseAdmin
      .from("drivers")
      .insert({ phone, name: name.trim(), is_profile_complete: false, is_active: true })
      .select("id, name, phone, is_profile_complete")
      .maybeSingle();

    if (insertErr) {
      if (insertErr.code === "23505") {
        return res.status(409).json({ success: false, error: "Phone number already exists" });
      }
      return res.status(500).json({ success: false, error: insertErr.message });
    }

    // Link to admin's business
    const { data: bp } = await supabaseAdmin
      .from("business_profile").select("id").eq("admin_id", adminId).maybeSingle();

    if (bp?.id && newDriver?.id) {
      await supabaseAdmin
        .from("driver_business_links")
        .insert({ driver_id: newDriver.id, business_id: bp.id })
        .select("id").maybeSingle();
    }

    return res.status(201).json({
      success: true,
      data: {
        id:                  newDriver.id,
        name:                newDriver.name,
        phone:               newDriver.phone,
        is_profile_complete: false,
        login_url:           "/driver/login",
        note:                "Driver must set their password on first login at /driver/login",
      },
    });
  } catch (e) {
    console.error("[POST /admin/drivers/create]", e);
    return res.status(500).json({ success: false, error: "Failed to create driver" });
  }
});

/** POST /api/admin/drivers/add-existing — link existing driver to this business */
adminRouter.post("/drivers/add-existing", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { driverId } = req.body ?? {};

    if (!driverId) {
      return res.status(400).json({ success: false, error: "driverId is required" });
    }

    const { data: driver } = await supabaseAdmin
      .from("drivers").select("id, name, phone").eq("id", driverId).maybeSingle();

    if (!driver) return res.status(404).json({ success: false, error: "Driver not found" });

    const { data: bp } = await supabaseAdmin
      .from("business_profile").select("id, business_name").eq("admin_id", adminId).maybeSingle();

    if (!bp?.id) return res.status(400).json({ success: false, error: "No business found for this admin" });

    const { error: linkErr } = await supabaseAdmin
      .from("driver_business_links")
      .upsert(
        { driver_id: driverId, business_id: bp.id },
        { onConflict: "driver_id,business_id", ignoreDuplicates: true }
      );

    if (linkErr) return res.status(500).json({ success: false, error: linkErr.message });

    return res.json({
      success: true,
      message: `${driver.name} added to ${bp.business_name}`,
      data: { driver_id: driverId, business_id: bp.id },
    });
  } catch (e) {
    console.error("[POST /admin/drivers/add-existing]", e);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/** DELETE /api/admin/drivers/:id/remove — unlink driver from this business only */
adminRouter.delete("/drivers/:id/remove", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { id: driverId } = req.params;

    const { data: bp } = await supabaseAdmin
      .from("business_profile").select("id").eq("admin_id", adminId).maybeSingle();

    if (!bp?.id) return res.status(400).json({ success: false, error: "No business found" });

    const { error } = await supabaseAdmin
      .from("driver_business_links")
      .delete()
      .eq("driver_id", driverId)
      .eq("business_id", bp.id);

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, message: "Driver removed from this business" });
  } catch (e) {
    console.error("[DELETE /admin/drivers/:id/remove]", e);
    return res.status(500).json({ success: false, error: "Failed to remove driver" });
  }
});

/** POST /api/admin/drivers — create a new driver */
adminRouter.post("/drivers", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { name, phone: rawPhone, password } = req.body ?? {};

    if (!rawPhone) {
      return res.status(400).json({ success: false, error: "phone is required" });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone.startsWith("+") || !isE164(phone)) {
      return res.status(400).json({
        success: false,
        error: "phone must be a valid E.164 number (e.g. +919876543210)",
      });
    }

    // ── Find admin's business ────────────────────────────────────────────────
    let businessId = null;
    if (adminId) {
      const { data: bp } = await supabaseAdmin
        .from("business_profile")
        .select("id")
        .eq("admin_id", adminId)
        .maybeSingle();
      businessId = bp?.id ?? null;
    }

    // ── Check if driver already exists by phone ──────────────────────────────
    const { data: existingDriver } = await supabaseAdmin
      .from("drivers")
      .select("id, phone, name, is_profile_complete, is_active")
      .eq("phone", phone)
      .maybeSingle();

    if (existingDriver) {
      // Driver exists — check if already linked to this business
      let alreadyLinked = false;
      if (businessId) {
        const { data: existingLink } = await supabaseAdmin
          .from("driver_business_links")
          .select("id")
          .eq("driver_id", existingDriver.id)
          .eq("business_id", businessId)
          .maybeSingle();
        alreadyLinked = !!existingLink;
      }

      return res.status(200).json({
        success: true,
        alreadyExists: true,
        alreadyLinked,
        data: {
          id:                  existingDriver.id,
          name:                existingDriver.name,
          phone:               existingDriver.phone,
          role:                "driver",
          is_profile_complete: existingDriver.is_profile_complete,
          is_active:           existingDriver.is_active,
          login_url:           "/driver/login",
        },
      });
    }

    // ── New driver — require name + password ─────────────────────────────────
    if (!name || !password) {
      return res.status(400).json({
        success: false,
        error: "name and password are required for new drivers",
      });
    }
    if (typeof password !== "string" || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: "password must be at least 6 characters",
      });
    }

    // ── 1. Create driver in drivers table ────────────────────────────────────
    const password_hash = await hashDriverPassword(password);

    const { data: newDriver, error: driverInsertErr } = await supabaseAdmin
      .from("drivers")
      .insert({
        phone,
        name:                name.trim(),
        password_hash,
        is_profile_complete: false,
        is_active:           true,
      })
      .select("id, phone, name, is_profile_complete")
      .maybeSingle();

    if (driverInsertErr) {
      if (driverInsertErr.code === "23505") {
        return res.status(400).json({ success: false, error: "A driver with this phone number already exists" });
      }
      console.error("[POST /admin/drivers] insert error:", driverInsertErr.message);
      return res.status(500).json({ success: false, error: driverInsertErr.message });
    }

    // ── 2. Link to admin's business ──────────────────────────────────────────
    if (businessId && newDriver?.id) {
      await supabaseAdmin
        .from("driver_business_links")
        .insert({ driver_id: newDriver.id, business_id: businessId })
        .select("id")
        .maybeSingle();
    }

    // ── 3. Supabase auth user (legacy compat, non-fatal) ─────────────────────
    try {
      const { data: created, error: createError } =
        await supabaseAdmin.auth.admin.createUser({ phone, password, phone_confirm: true });
      if (!createError && created?.user?.id) {
        await supabaseAdmin.from("profiles").upsert(
          { id: created.user.id, role: "driver", display_name: name.trim() },
          { onConflict: "id" }
        );
      }
    } catch (legacyErr) {
      console.warn("[POST /admin/drivers] Supabase auth creation failed (non-fatal):", legacyErr?.message);
    }

    return res.status(201).json({
      success: true,
      alreadyExists: false,
      data: {
        id:                  newDriver?.id,
        name:                name.trim(),
        phone,
        role:                "driver",
        is_profile_complete: false,
        login_url:           "/driver/login",
        temp_password:       password,
      },
    });
  } catch (e) {
    console.error("[POST /admin/drivers]", e);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/** POST /api/admin/drivers/link — add an existing driver to this admin's business */
adminRouter.post("/drivers/link", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    const { driverId } = req.body ?? {};

    if (!driverId) {
      return res.status(400).json({ success: false, error: "driverId is required" });
    }

    // Verify driver exists
    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("id, name, phone")
      .eq("id", driverId)
      .maybeSingle();

    if (!driver) {
      return res.status(404).json({ success: false, error: "Driver not found" });
    }

    // Get this admin's business
    const { data: bp } = await supabaseAdmin
      .from("business_profile")
      .select("id, business_name")
      .eq("admin_id", adminId)
      .maybeSingle();

    if (!bp?.id) {
      return res.status(400).json({ success: false, error: "No business found for this admin" });
    }

    // Upsert link (onConflict: ignore duplicates)
    const { error: linkErr } = await supabaseAdmin
      .from("driver_business_links")
      .upsert(
        { driver_id: driverId, business_id: bp.id },
        { onConflict: "driver_id,business_id", ignoreDuplicates: true }
      );

    if (linkErr) {
      console.error("[POST /admin/drivers/link] link error:", linkErr.message);
      return res.status(500).json({ success: false, error: linkErr.message });
    }

    return res.json({
      success: true,
      message: `${driver.name} added to ${bp.business_name}`,
      data: { driver_id: driverId, business_id: bp.id },
    });
  } catch (e) {
    console.error("[POST /admin/drivers/link]", e);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});


/** GET /api/admin/drivers/:id/deliveries — delivery history for one driver */
adminRouter.get("/drivers/:id/deliveries", async (req, res) => {
  try {
    const { id } = req.params;

    // Note: orders table has no 'delivered_at' — use 'updated_at' which reflects
    // the last status change (effectively the delivery time when status = 'delivered')
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from("orders")
      .select("id, customer_id, region, status, updated_at, created_at")
      .eq("driver_id", id)
      .order("created_at", { ascending: false });

    if (ordersError) {
      return res.status(500).json({ success: false, error: ordersError.message });
    }

    const orderList = orders ?? [];

    // Resolve customer names
    const customerIds = [...new Set(orderList.map((o) => o.customer_id).filter(Boolean))];
    const customerMap = await loadProfileNames(customerIds);

    const data = orderList.map((o) => ({
      id: o.id,
      short_id: orderShortId(o.id),
      customer_name: o.customer_id
        ? (customerMap.get(o.customer_id) ?? `Customer ${String(o.customer_id).slice(0, 8)}…`)
        : "Walk-in",
      region: o.region ?? "—",
      status: o.status,
      // Expose as delivered_at: only meaningful when status is 'delivered'
      delivered_at: o.status === "delivered" ? (o.updated_at ?? null) : null,
      created_at: o.created_at,
    }));

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[GET /admin/drivers/:id/deliveries]", e);
    return res.status(500).json({ success: false, error: "Failed to load deliveries" });
  }
});

// ─── Shared geo utilities (admin-side) ───────────────────────────────────────

function adminHaversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function adminGeocodeText(text) {
  try {
    const params = new URLSearchParams({ q: `${text.trim()}, India`, format: "json", limit: "1" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "FlowStock-Admin/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json();
    if (Array.isArray(json) && json.length > 0) {
      return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
    }
  } catch { /* ignore */ }
  return null;
}

async function adminGetRouteInfo(destLat, destLng, destText) {
  const warehouseLat = parseFloat(process.env.WAREHOUSE_LAT ?? "26.9124");
  const warehouseLng = parseFloat(process.env.WAREHOUSE_LNG ?? "75.7873");
  const GOOGLE_KEY   = process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
  const ORS_KEY      = process.env.ORS_API_KEY?.trim()         || "";

  const hasGPS = destLat != null && destLng != null;

  if (GOOGLE_KEY) {
    try {
      const destination = hasGPS ? `${destLat},${destLng}` : destText?.trim();
      const params = new URLSearchParams({
        origins: `${warehouseLat},${warehouseLng}`,
        destinations: destination,
        mode: "driving", units: "metric", key: GOOGLE_KEY,
      });
      const r = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`, {
        signal: AbortSignal.timeout(6000),
      });
      const json = await r.json();
      const el = json?.rows?.[0]?.elements?.[0];
      if (el?.status === "OK") {
        return {
          distance_km:  Math.round(el.distance.value / 100) / 10,
          duration_min: Math.round(el.duration.value / 60),
          source: "google",
        };
      }
    } catch { /* fall through */ }
  }

  // Resolve coords for haversine fallback if needed
  let lat = hasGPS ? destLat : null;
  let lng = hasGPS ? destLng : null;
  if (!hasGPS && destText) {
    const c = await adminGeocodeText(destText);
    if (c) { lat = c.lat; lng = c.lng; }
  }
  if (lat != null && lng != null) {
    const straight    = adminHaversineKm(warehouseLat, warehouseLng, lat, lng);
    const distance_km = Math.round(straight * 1.35 * 10) / 10;
    return {
      distance_km,
      duration_min: Math.round((distance_km / 35) * 60),
      source: "estimate",
    };
  }
  return null;
}

// ─── POST /api/admin/auto-assign-driver ──────────────────────────────────────
// Automatically assigns the best available driver to an order.
// Drivers are scoped to this admin's business via driver_business_links.
// Scoring: lower is better = (active_orders × 15) — least-loaded driver wins.

adminRouter.post("/auto-assign-driver", async (req, res) => {
  try {
    const { order_id } = req.body ?? {};
    if (!order_id) return res.status(400).json({ success: false, error: "order_id required" });

    const adminId      = req.adminUser?.id;
    const warehouseLat = parseFloat(process.env.WAREHOUSE_LAT ?? "26.9124");
    const warehouseLng = parseFloat(process.env.WAREHOUSE_LNG ?? "75.7873");

    // Fetch the order (must belong to this admin)
    const { data: order, error: ordErr } = await supabaseAdmin
      .from("orders")
      .select("id, region, delivery_lat, delivery_lng, admin_id")
      .eq("id", order_id)
      .maybeSingle();

    if (ordErr || !order) return res.status(404).json({ success: false, error: "Order not found" });
    if (order.admin_id && order.admin_id !== adminId) {
      return res.status(403).json({ success: false, error: "This order does not belong to your business" });
    }

    // Resolve admin's business
    const { data: bp } = await supabaseAdmin
      .from("business_profile").select("id").eq("admin_id", adminId).maybeSingle();
    const businessId = bp?.id ?? null;
    if (!businessId) return res.status(400).json({ success: false, error: "No business found" });

    // Fetch all drivers linked to this business
    const { data: links, error: linksErr } = await supabaseAdmin
      .from("driver_business_links")
      .select("driver_id")
      .eq("business_id", businessId);

    if (linksErr || !links?.length) {
      return res.status(404).json({ success: false, error: "No drivers available in this business" });
    }

    const driverIds = links.map((l) => l.driver_id);

    // Fetch driver records (active only)
    const { data: driverRecords } = await supabaseAdmin
      .from("drivers")
      .select("id, name")
      .in("id", driverIds)
      .eq("is_active", true);

    if (!driverRecords?.length) {
      return res.status(404).json({ success: false, error: "No active drivers available" });
    }

    // Fetch active order counts per driver (scoped to this business)
    const { data: activeCounts } = await supabaseAdmin
      .from("orders")
      .select("driver_id")
      .in("status", ["confirmed", "dispatched", "out_for_delivery"])
      .in("driver_id", driverRecords.map((d) => d.id))
      .eq("admin_id", adminId);

    const loadMap = new Map();
    for (const r of activeCounts ?? []) {
      loadMap.set(r.driver_id, (loadMap.get(r.driver_id) ?? 0) + 1);
    }

    // Resolve delivery coords for interest (future: use driver GPS)
    let destLat = order.delivery_lat != null ? parseFloat(order.delivery_lat) : null;
    let destLng = order.delivery_lng != null ? parseFloat(order.delivery_lng) : null;
    if ((destLat == null || destLng == null) && order.region) {
      const c = await adminGeocodeText(order.region);
      if (c) { destLat = c.lat; destLng = c.lng; }
    }
    const refLat = destLat ?? warehouseLat;
    const refLng = destLng ?? warehouseLng;

    // Score each driver — least active wins
    let best = null, bestScore = Infinity;
    for (const d of driverRecords) {
      const activeOrders = loadMap.get(d.id) ?? 0;
      const distKm = adminHaversineKm(warehouseLat, warehouseLng, refLat, refLng);
      const score  = distKm * 1 + activeOrders * 15;
      if (score < bestScore) { bestScore = score; best = d; }
    }

    if (!best) return res.status(404).json({ success: false, error: "No suitable driver found" });

    // Assign driver to order (scoped to this admin's business)
    const { error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ driver_id: best.id, updated_at: new Date().toISOString() })
      .eq("id", order_id)
      .eq("admin_id", adminId);

    if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });

    return res.json({
      success: true,
      data: {
        driver_id:     best.id,
        driver_name:   best.name ?? "Driver",
        active_orders: loadMap.get(best.id) ?? 0,
        score_reason: `${loadMap.get(best.id) ?? 0} active orders (least loaded in this business)`,
      },
    });

  } catch (e) {
    console.error("[POST /admin/auto-assign-driver]", e);
    return res.status(500).json({ success: false, error: "Auto-assign failed" });
  }
});

// ─── GET /api/admin/dispatch-eta?order_id=X ──────────────────────────────────
// Returns travel time estimate + dispatch suggestion for an order.
// Used by admin to show "Dispatch now → arrive by 6:30 PM" before dispatching.

adminRouter.get("/dispatch-eta", async (req, res) => {
  try {
    const { order_id } = req.query;
    if (!order_id) return res.status(400).json({ success: false, error: "order_id required" });

    const { data: order, error: ordErr } = await supabaseAdmin
      .from("orders")
      .select("id, region, delivery_lat, delivery_lng, driver_id")
      .eq("id", order_id)
      .maybeSingle();
    if (ordErr || !order) return res.status(404).json({ success: false, error: "Order not found" });

    const destLat = order.delivery_lat != null ? parseFloat(order.delivery_lat) : null;
    const destLng = order.delivery_lng != null ? parseFloat(order.delivery_lng) : null;

    const routeInfo = await adminGetRouteInfo(destLat, destLng, order.region);
    if (!routeInfo) {
      return res.json({ success: true, available: false, reason: "Cannot resolve destination coordinates" });
    }

    const now               = new Date();
    const arriveMs          = now.getTime() + routeInfo.duration_min * 60 * 1000;
    const arriveBy          = new Date(arriveMs);
    const arriveHour        = arriveBy.getHours();
    // "On time" if estimated arrival is before 8 PM (20:00)
    const on_time           = arriveHour < 20;

    const fmtTime = (d) =>
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

    return res.json({
      success:      true,
      available:    true,
      distance_km:  routeInfo.distance_km,
      duration_min: routeInfo.duration_min,
      source:       routeInfo.source,
      dispatch_now: fmtTime(now),
      arrive_by:    fmtTime(arriveBy),
      arrive_by_iso: arriveBy.toISOString(),
      on_time,
      suggestion:   `Dispatch now to deliver by ${fmtTime(arriveBy)}`,
    });

  } catch (e) {
    console.error("[GET /admin/dispatch-eta]", e);
    return res.status(500).json({ success: false, error: "Failed to calculate ETA" });
  }
});

// ─── Business Profile ─────────────────────────────────────────────────────────

const BP_COLS = "id, admin_id, business_name, owner_name, phone, email, address, " +
  "warehouse_location, business_type, gst_number, logo_url, brand_color, updates_phone, " +
  "business_code, created_at, updated_at";

/** GET /api/admin/business-profile — fetch current admin's profile (null if not set) */
adminRouter.get("/business-profile", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    if (!adminId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { data, error } = await supabaseAdmin
      .from("business_profile")
      .select(BP_COLS)
      .eq("admin_id", adminId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, data: data ?? null });
  } catch (e) {
    console.error("[GET /admin/business-profile]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch business profile" });
  }
});

/** GET /api/admin/my-businesses — all businesses this admin user belongs to */
adminRouter.get("/my-businesses", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    if (!adminId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { data, error } = await supabaseAdmin
      .from("user_businesses")
      .select("id, role, business_id, business_profile(id, business_name, logo_url, business_code)")
      .eq("user_id", adminId)
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });

    const businesses = (data ?? []).map((row) => ({
      mappingId:    row.id,
      role:         row.role,
      businessId:   row.business_profile?.id   ?? row.business_id,
      businessName: row.business_profile?.business_name ?? "Unknown",
      logoUrl:      row.business_profile?.logo_url ?? null,
      businessCode: row.business_profile?.business_code ?? null,
    }));

    return res.json({ success: true, data: businesses });
  } catch (e) {
    console.error("[GET /admin/my-businesses]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch businesses" });
  }
});

/** PUT /api/admin/business-profile — create or update the admin's business profile */
adminRouter.put("/business-profile", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    if (!adminId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const {
      business_name, owner_name, phone, email, address,
      warehouse_location, business_type, gst_number, logo_url,
      brand_color, updates_phone,
    } = req.body ?? {};

    // Validate required fields
    if (!business_name?.trim()) return res.status(400).json({ success: false, error: "business_name is required" });
    if (!owner_name?.trim())   return res.status(400).json({ success: false, error: "owner_name is required" });
    if (!phone?.trim())        return res.status(400).json({ success: false, error: "phone is required" });
    if (!updates_phone?.trim()) return res.status(400).json({ success: false, error: "updates_phone is required" });

    const VALID_TYPES = new Set(["Retail", "Wholesale", "Distributor", "Manufacturer"]);
    if (business_type && !VALID_TYPES.has(business_type)) {
      return res.status(400).json({ success: false, error: "Invalid business_type" });
    }

    const payload = {
      admin_id:           adminId,
      business_name:      business_name.trim(),
      owner_name:         owner_name.trim(),
      phone:              phone.trim(),
      email:              email?.trim()              || null,
      address:            address?.trim()            || null,
      warehouse_location: warehouse_location?.trim() || null,
      business_type:      business_type             || null,
      gst_number:         gst_number?.trim()         || null,
      logo_url:           logo_url?.trim()           || null,
      brand_color:        brand_color?.trim()        || "#6366f1",
      updates_phone:      updates_phone.trim(),
      updated_at:         new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("business_profile")
      .upsert(payload, { onConflict: "admin_id" })
      .select(BP_COLS)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /admin/business-profile]", e);
    return res.status(500).json({ success: false, error: "Failed to save business profile" });
  }
});

// ─── POST /api/admin/business-profile/logo ── Upload business logo ───────────
// Accepts raw binary body. Stores in Supabase Storage bucket "business-logos".

adminRouter.post("/business-profile/logo", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    if (!adminId) return res.status(401).json({ success: false, error: "Unauthorized" });

    // Read raw body into a buffer
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const fileBuffer = Buffer.concat(chunks);

    if (!fileBuffer.length)
      return res.status(400).json({ success: false, error: "No file data received" });

    const contentType = req.headers["content-type"] ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png"
               : contentType.includes("webp") ? "webp"
               : "jpg";
    const storagePath = `${adminId}/logo.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("business-logos")
      .upload(storagePath, fileBuffer, { contentType, upsert: true });

    if (uploadError) {
      console.error("[POST logo] storage:", uploadError.message);
      return res.status(500).json({ success: false, error: uploadError.message });
    }

    const { data: publicData } = supabaseAdmin.storage
      .from("business-logos")
      .getPublicUrl(storagePath);

    const logo_url = `${publicData?.publicUrl}?t=${Date.now()}`;

    await supabaseAdmin
      .from("business_profile")
      .update({ logo_url, updated_at: new Date().toISOString() })
      .eq("admin_id", adminId);

    return res.json({ success: true, logo_url });
  } catch (e) {
    console.error("[POST /admin/business-profile/logo]", e);
    return res.status(500).json({ success: false, error: "Logo upload failed" });
  }
});
