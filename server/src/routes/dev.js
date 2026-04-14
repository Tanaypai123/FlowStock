import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { superAdminOnly } from "../middleware/superAdminOnly.js";

export const devRouter = Router();

// ── Every /api/dev/* route requires super_admin ───────────────────────────────
devRouter.use(superAdminOnly);

// ─── Helper ───────────────────────────────────────────────────────────────────
function rupee(n) { return Math.round(Number(n) || 0); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/overview
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/overview", async (req, res) => {
  try {
    const today      = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [
      businessCount, customerCount, driverCount, orderCount,
      ordersTodayCount, revenueTodayResult, activeDeliveriesCount, newBusinessesThisMonth,
    ] = await Promise.all([
      supabaseAdmin.from("business_profile").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "customer"),
      supabaseAdmin.from("drivers").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true })
        .gte("created_at", `${today}T00:00:00.000Z`).lt("created_at", `${today}T23:59:59.999Z`),
      supabaseAdmin.from("orders").select("final_total")
        .gte("created_at", `${today}T00:00:00.000Z`).lt("created_at", `${today}T23:59:59.999Z`)
        .not("status", "in", '("cancelled","rejected")'),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true })
        .in("status", ["dispatched", "out_for_delivery"]),
      supabaseAdmin.from("business_profile").select("id", { count: "exact", head: true })
        .gte("created_at", monthStart),
    ]);

    const revenueToday = (revenueTodayResult.data ?? []).reduce((s, r) => s + (Number(r.final_total) || 0), 0);

    return res.json({
      success: true,
      data: {
        total_businesses:          businessCount.count          ?? 0,
        total_customers:           customerCount.count          ?? 0,
        total_drivers:             driverCount.count            ?? 0,
        total_orders:              orderCount.count             ?? 0,
        orders_today:              ordersTodayCount.count       ?? 0,
        revenue_today:             revenueToday,
        active_deliveries:         activeDeliveriesCount.count  ?? 0,
        new_businesses_this_month: newBusinessesThisMonth.count ?? 0,
      },
    });
  } catch (e) {
    console.error("[GET /api/dev/overview]", e);
    return res.status(500).json({ success: false, error: "Failed to load overview" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/businesses  — all businesses with enriched stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/businesses", async (req, res) => {
  try {
    const { data: businesses, error: bErr } = await supabaseAdmin
      .from("business_profile")
      .select("id, business_name, owner_name, email, phone, address, gst_number, business_type, business_code, admin_id, created_at")
      .order("created_at", { ascending: false });

    if (bErr) return res.status(500).json({ success: false, error: bErr.message });

    // Enrich each business in parallel
    const enriched = await Promise.all(
      (businesses ?? []).map(async (b) => {
        const [ordersRes, customersRes, driversRes, revenueRes] = await Promise.all([
          supabaseAdmin.from("orders").select("id", { count: "exact", head: true }).eq("admin_id", b.admin_id),
          supabaseAdmin.from("user_businesses").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("role", "customer"),
          supabaseAdmin.from("driver_business_links").select("id", { count: "exact", head: true }).eq("business_id", b.id),
          supabaseAdmin.from("orders").select("final_total").eq("admin_id", b.admin_id).not("status", "in", '("cancelled","rejected")'),
        ]);

        const total_revenue = (revenueRes.data ?? []).reduce((s, r) => s + (Number(r.final_total) || 0), 0);

        return {
          ...b,
          total_orders:    ordersRes.count    ?? 0,
          total_customers: customersRes.count ?? 0,
          total_drivers:   driversRes.count   ?? 0,
          total_revenue,
        };
      })
    );

    return res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/dev/businesses]", e);
    return res.status(500).json({ success: false, error: "Failed to load businesses" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/business/:id/detail  — detail panel for one business
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/business/:id/detail", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: biz, error: bErr } = await supabaseAdmin
      .from("business_profile")
      .select("id, business_name, owner_name, email, phone, address, gst_number, business_code, admin_id")
      .eq("id", id)
      .maybeSingle();

    if (bErr || !biz) return res.status(404).json({ success: false, error: "Business not found" });

    const [lastOrdersRes, driverLinksRes, customerCountRes] = await Promise.all([
      // Last 5 orders
      supabaseAdmin
        .from("orders")
        .select("id, status, final_total, customer_id, created_at")
        .eq("admin_id", biz.admin_id)
        .order("created_at", { ascending: false })
        .limit(5),

      // Driver names
      supabaseAdmin
        .from("driver_business_links")
        .select("driver_id, drivers(name, phone)")
        .eq("business_id", id),

      // Customer count
      supabaseAdmin
        .from("user_businesses")
        .select("id", { count: "exact", head: true })
        .eq("business_id", id)
        .eq("role", "customer"),
    ]);

    // Top 3 products by sales quantity for this business
    const { data: lineItems } = await supabaseAdmin
      .from("order_line_items")
      .select("item_name, quantity, order_id, orders!inner(admin_id)")
      .eq("orders.admin_id", biz.admin_id);

    const productTotals = {};
    for (const li of lineItems ?? []) {
      productTotals[li.item_name] = (productTotals[li.item_name] ?? 0) + Number(li.quantity);
    }
    const topProducts = Object.entries(productTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => ({ name, total_qty: qty }));

    const drivers = (driverLinksRes.data ?? []).map((r) => ({
      name:  r.drivers?.name  ?? "—",
      phone: r.drivers?.phone ?? "—",
    }));

    return res.json({
      success: true,
      data: {
        ...biz,
        last_orders:    lastOrdersRes.data   ?? [],
        top_products:   topProducts,
        drivers,
        customer_count: customerCountRes.count ?? 0,
        invite_link:    `/join/${biz.business_code}`,
      },
    });
  } catch (e) {
    console.error("[GET /api/dev/business/:id/detail]", e);
    return res.status(500).json({ success: false, error: "Failed to load business detail" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/customers  — all customers with enriched stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/customers", async (req, res) => {
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, role, created_at")
      .eq("role", "customer")
      .order("created_at", { ascending: false })
      .limit(300);

    if (pErr) return res.status(500).json({ success: false, error: pErr.message });

    // Pull all orders for customers at once (cheaper than one query per customer)
    const { data: allOrders } = await supabaseAdmin
      .from("orders")
      .select("customer_id, final_total, created_at, status")
      .not("status", "in", '("cancelled","rejected")');

    // Pull business memberships
    const { data: memberships } = await supabaseAdmin
      .from("user_businesses")
      .select("user_id, business_id")
      .eq("role", "customer");

    // Pull phone numbers via auth admin API (best-effort, limited)
    const ordersByCustomer = {};
    for (const o of allOrders ?? []) {
      if (!ordersByCustomer[o.customer_id]) ordersByCustomer[o.customer_id] = [];
      ordersByCustomer[o.customer_id].push(o);
    }

    const membershipCount = {};
    for (const m of memberships ?? []) {
      membershipCount[m.user_id] = (membershipCount[m.user_id] ?? 0) + 1;
    }

    // Platform stats
    const allCustomerOrders = Object.values(ordersByCustomer).flat();
    const totalRevenue      = allCustomerOrders.reduce((s, o) => s + (Number(o.final_total) || 0), 0);
    const totalOrderCount   = allCustomerOrders.length;

    const activeCount  = Object.values(ordersByCustomer).filter(
      (orders) => orders.some((o) => o.created_at >= since30)
    ).length;

    const repeatCount  = Object.values(ordersByCustomer).filter((orders) => orders.length > 1).length;
    const avgOrderVal  = totalOrderCount > 0 ? totalRevenue / totalOrderCount : 0;

    // Enrich each profile
    const enriched = (profiles ?? []).map((p) => {
      const orders       = ordersByCustomer[p.id] ?? [];
      const total_spent  = orders.reduce((s, o) => s + (Number(o.final_total) || 0), 0);
      const total_orders = orders.length;
      const last_order   = orders.sort((a, b) => b.created_at?.localeCompare(a.created_at))[0]?.created_at ?? null;
      const businesses   = membershipCount[p.id] ?? 0;

      // Priority badge
      let priority = "new";
      if (total_orders >= 10 || total_spent >= 5000) priority = "vip";
      else if (total_orders >= 3) priority = "regular";

      return { ...p, total_orders, total_spent, last_order, businesses, priority };
    });

    return res.json({
      success: true,
      stats: {
        total:          (profiles ?? []).length,
        active_30d:     activeCount,
        repeat:         repeatCount,
        avg_order_val:  Math.round(avgOrderVal),
      },
      data: enriched,
    });
  } catch (e) {
    console.error("[GET /api/dev/customers]", e);
    return res.status(500).json({ success: false, error: "Failed to load customers" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/products  — 3 sections: top selling, low stock, dead stock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/products", async (req, res) => {
  try {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [inventoryRes, lineItemsRes, recentItemIdsRes] = await Promise.all([
      // All inventory items with business info (via admin_id → business_profile)
      supabaseAdmin
        .from("inventory_items")
        .select("id, name, stage, quantity, unit_price, low_stock_alert, admin_id, created_at"),

      // All order line items with order date for cross-reference
      supabaseAdmin
        .from("order_line_items")
        .select("item_id, item_name, quantity, unit_price, order_id, orders!inner(created_at, admin_id, status)")
        .not("orders.status", "in", '("cancelled","rejected")'),

      // item_ids that have had an order in last 30 days
      supabaseAdmin
        .from("order_line_items")
        .select("item_id, orders!inner(created_at)")
        .gte("orders.created_at", since30),
    ]);

    // Build business_name lookup (admin_id → business_name)
    const { data: businessRows } = await supabaseAdmin
      .from("business_profile")
      .select("admin_id, business_name");

    const bizByAdmin = {};
    for (const b of businessRows ?? []) bizByAdmin[b.admin_id] = b.business_name;

    const inventory  = inventoryRes.data  ?? [];
    const lineItems  = lineItemsRes.data  ?? [];
    const recentIds  = new Set((recentItemIdsRes.data ?? []).map((r) => r.item_id));

    // ── Top selling: group line_items by item_id ──────────────────────────────
    const salesByItem = {};
    for (const li of lineItems) {
      if (!salesByItem[li.item_id]) salesByItem[li.item_id] = { item_name: li.item_name, qty: 0, revenue: 0, admin_id: li.orders?.admin_id };
      salesByItem[li.item_id].qty     += Number(li.quantity)   || 0;
      salesByItem[li.item_id].revenue += (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);
    }

    const topSelling = Object.entries(salesByItem)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([item_id, s]) => ({
        item_id,
        name:        s.item_name,
        business:    bizByAdmin[s.admin_id] ?? "—",
        total_qty:   s.qty,
        revenue:     Math.round(s.revenue),
      }));

    // ── Low stock ─────────────────────────────────────────────────────────────
    const lowStock = inventory
      .filter((i) => i.low_stock_alert > 0 && Number(i.quantity) <= Number(i.low_stock_alert))
      .map((i) => ({
        id:         i.id,
        name:       i.name,
        business:   bizByAdmin[i.admin_id] ?? "—",
        quantity:   Number(i.quantity),
        alert:      Number(i.low_stock_alert),
        out_of_stock: Number(i.quantity) === 0,
      }))
      .sort((a, b) => a.quantity - b.quantity);

    // ── Dead stock: qty > 0 AND no order in last 30 days ─────────────────────
    const deadStock = inventory
      .filter((i) => Number(i.quantity) > 0 && !recentIds.has(i.id))
      .map((i) => {
        const daysSinceAdded = Math.floor((Date.now() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id:            i.id,
          name:          i.name,
          business:      bizByAdmin[i.admin_id] ?? "—",
          quantity:      Number(i.quantity),
          days_idle:     daysSinceAdded,
        };
      })
      .sort((a, b) => b.days_idle - a.days_idle)
      .slice(0, 30);

    return res.json({ success: true, data: { topSelling, lowStock, deadStock } });
  } catch (e) {
    console.error("[GET /api/dev/products]", e);
    return res.status(500).json({ success: false, error: "Failed to load products" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/drivers  — all drivers with delivery stats
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/drivers", async (req, res) => {
  try {
    const [driversRes, linksRes, ordersRes] = await Promise.all([
      supabaseAdmin
        .from("drivers")
        .select("id, name, phone, is_active, is_profile_complete, created_at")
        .order("created_at", { ascending: false }),

      // Count business links per driver
      supabaseAdmin
        .from("driver_business_links")
        .select("driver_id, business_id"),

      // All driver-assigned orders with delivery timestamps
      supabaseAdmin
        .from("orders")
        .select("driver_id, status, dispatched_at, delivered_at, created_at")
        .not("driver_id", "is", null),
    ]);

    const drivers   = driversRes.data  ?? [];
    const links     = linksRes.data    ?? [];
    const orders    = ordersRes.data   ?? [];

    // Build business count per driver
    const bizCount = {};
    for (const l of links) bizCount[l.driver_id] = (bizCount[l.driver_id] ?? 0) + 1;

    // Build order stats per driver
    const driverOrders = {};
    for (const o of orders) {
      if (!o.driver_id) continue;
      if (!driverOrders[o.driver_id]) driverOrders[o.driver_id] = { total: 0, delivered: 0, failed: 0, times: [], last_active: null };
      const d = driverOrders[o.driver_id];
      d.total++;
      if (o.status === "delivered") {
        d.delivered++;
        // Calc delivery time (dispatched → delivered)
        if (o.dispatched_at && o.delivered_at) {
          const mins = (new Date(o.delivered_at) - new Date(o.dispatched_at)) / 60000;
          if (mins > 0 && mins < 1440) d.times.push(mins); // ignore >24h outliers
        }
      }
      if (["rejected", "cancelled"].includes(o.status)) d.failed++;
      // Track last active date
      const ts = o.delivered_at || o.created_at;
      if (!d.last_active || ts > d.last_active) d.last_active = ts;
    }

    const enriched = drivers.map((d) => {
      const stats = driverOrders[d.id] ?? { total: 0, delivered: 0, failed: 0, times: [], last_active: null };
      const success_rate = stats.total > 0 ? Math.round((stats.delivered / stats.total) * 100) : null;
      const avg_delivery_time = stats.times.length > 0
        ? Math.round(stats.times.reduce((s, t) => s + t, 0) / stats.times.length)
        : null;

      return {
        ...d,
        businesses:         bizCount[d.id]    ?? 0,
        total_deliveries:   stats.total,
        delivered_count:    stats.delivered,
        failed_count:       stats.failed,
        success_rate,
        avg_delivery_time,
        last_active:        stats.last_active,
      };
    });

    return res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/dev/drivers]", e);
    return res.status(500).json({ success: false, error: "Failed to load drivers" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/analytics  — 30-day platform chart data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/analytics", async (req, res) => {
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, final_total, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });

    const byDay = {};
    for (const o of data ?? []) {
      const day = (o.created_at ?? "").slice(0, 10);
      if (!byDay[day]) byDay[day] = { date: day, orders: 0, revenue: 0 };
      byDay[day].orders++;
      if (!["cancelled", "rejected"].includes(o.status))
        byDay[day].revenue += Number(o.final_total) || 0;
    }

    return res.json({
      success: true,
      data: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (e) {
    console.error("[GET /api/dev/analytics]", e);
    return res.status(500).json({ success: false, error: "Failed to load analytics" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/system-health
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/system-health", async (req, res) => {
  try {
    const checks = await Promise.allSettled([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("orders").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("drivers").select("id", { count: "exact", head: true }),
    ]);
    const ok = (i) => checks[i].status === "fulfilled" && !checks[i].value?.error;
    const healthy = [0, 1, 2].every(ok);
    return res.json({
      success: true,
      data: {
        status:     healthy ? "healthy" : "degraded",
        db:         ok(0) ? "ok" : "error",
        orders_db:  ok(1) ? "ok" : "error",
        drivers_db: ok(2) ? "ok" : "error",
        checked_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, data: { status: "down", checked_at: new Date().toISOString() } });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/analytics?days=N  (enriched — overrides the basic version above)
// Returns: daily orders+revenue, growth, per-biz daily, top5 names, status pie
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/analytics/rich", async (req, res) => {
  try {
    const days  = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [ordersRes, bizRes, profilesRes, bizListRes] = await Promise.all([
      supabaseAdmin.from("orders").select("id, status, final_total, created_at, admin_id").gte("created_at", since).order("created_at", { ascending: true }),
      supabaseAdmin.from("business_profile").select("id, created_at").order("created_at", { ascending: true }),
      supabaseAdmin.from("profiles").select("id, created_at").eq("role", "customer").order("created_at", { ascending: true }),
      supabaseAdmin.from("business_profile").select("id, admin_id, business_name"),
    ]);

    const orders  = ordersRes.data   ?? [];
    const bizAll  = bizRes.data      ?? [];
    const profAll = profilesRes.data ?? [];
    const bizList = bizListRes.data  ?? [];

    // Chart 1+2: daily orders + revenue
    const dailyMap = {};
    for (const o of orders) {
      const day = o.created_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { date: day, orders: 0, revenue: 0 };
      dailyMap[day].orders++;
      if (!["cancelled", "rejected"].includes(o.status))
        dailyMap[day].revenue += Number(o.final_total) || 0;
    }
    const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Chart 3: cumulative growth (all time)
    const growthByDay = {};
    for (const b of bizAll) {
      const d = b.created_at.slice(0, 10);
      if (!growthByDay[d]) growthByDay[d] = { date: d, businesses: 0, customers: 0 };
      growthByDay[d].businesses++;
    }
    for (const p of profAll) {
      const d = p.created_at.slice(0, 10);
      if (!growthByDay[d]) growthByDay[d] = { date: d, businesses: 0, customers: 0 };
      growthByDay[d].customers++;
    }
    let cumBiz = 0, cumCust = 0;
    const growth = Object.values(growthByDay).sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
      cumBiz += d.businesses; cumCust += d.customers;
      return { date: d.date, total_businesses: cumBiz, total_customers: cumCust };
    });

    // Chart 4: top 5 businesses per-day
    const adminToBiz = {};
    for (const b of bizList) adminToBiz[b.admin_id] = { id: b.id, name: b.business_name };
    const bizOrderCount = {};
    for (const o of orders) {
      const biz = adminToBiz[o.admin_id];
      if (!biz) continue;
      if (!bizOrderCount[biz.id]) bizOrderCount[biz.id] = { name: biz.name, count: 0 };
      bizOrderCount[biz.id].count++;
    }
    const top5      = Object.entries(bizOrderCount).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
    const top5Names = top5.map(([, v]) => v.name);
    const top5Set   = new Set(top5.map(([id]) => id));
    const bizDailyMap = {};
    for (const o of orders) {
      const biz = adminToBiz[o.admin_id];
      if (!biz || !top5Set.has(biz.id)) continue;
      const day = o.created_at.slice(0, 10);
      if (!bizDailyMap[day]) bizDailyMap[day] = { date: day };
      bizDailyMap[day][biz.name] = (bizDailyMap[day][biz.name] ?? 0) + 1;
    }
    const bizDaily = Object.values(bizDailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Chart 5: status breakdown (pie)
    const statusCount = {};
    for (const o of orders) statusCount[o.status] = (statusCount[o.status] ?? 0) + 1;
    const statusBreakdown = Object.entries(statusCount).map(([status, count]) => ({ status, count }));

    return res.json({ success: true, data: { daily, growth, bizDaily, top5Names, statusBreakdown } });
  } catch (e) {
    console.error("[GET /api/dev/analytics/rich]", e);
    return res.status(500).json({ success: false, error: "Failed to load analytics" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/system/stats  — today's api_logs summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/system/stats", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: logs } = await supabaseAdmin
      .from("api_logs")
      .select("status_code, response_time_ms, endpoint")
      .gte("created_at", `${today}T00:00:00.000Z`);

    const rows       = logs ?? [];
    const totalCalls = rows.length;
    const errorCount = rows.filter((r) => r.status_code >= 400).length;
    const errorRate  = totalCalls > 0 ? Math.round((errorCount / totalCalls) * 100) : 0;
    const avgMs      = totalCalls > 0
      ? Math.round(rows.reduce((s, r) => s + (Number(r.response_time_ms) || 0), 0) / totalCalls)
      : 0;

    const epMs = {}, epCt = {};
    for (const r of rows) {
      epMs[r.endpoint] = (epMs[r.endpoint] ?? 0) + (Number(r.response_time_ms) || 0);
      epCt[r.endpoint] = (epCt[r.endpoint] ?? 0) + 1;
    }
    let slowestEndpoint = "—", slowestMs = 0;
    for (const [ep, total] of Object.entries(epMs)) {
      const avg = total / epCt[ep];
      if (avg > slowestMs) { slowestMs = Math.round(avg); slowestEndpoint = ep; }
    }

    return res.json({ success: true, data: { totalCalls, errorRate, avgResponseTime: avgMs, slowestEndpoint, slowestMs } });
  } catch (e) {
    console.error("[GET /api/dev/system/stats]", e);
    return res.status(500).json({ success: false, error: "Failed to load stats" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/system/errors?page=1&filter=all
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/system/errors", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page) || 1);
    const filter   = req.query.filter ?? "all";
    const since    = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const PER_PAGE = 20;

    let query = supabaseAdmin
      .from("api_logs")
      .select("id, method, endpoint, status_code, response_time_ms, error_message, created_at", { count: "exact" })
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if      (filter === "4xx") query = query.gte("status_code", 400).lt("status_code", 500);
    else if (filter === "5xx") query = query.gte("status_code", 500);
    else                       query = query.gte("status_code", 400);

    const { data, count, error } = await query.range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({
      success: true,
      data: data ?? [],
      total: count ?? 0,
      pages: Math.ceil((count ?? 0) / PER_PAGE),
      page,
    });
  } catch (e) {
    console.error("[GET /api/dev/system/errors]", e);
    return res.status(500).json({ success: false, error: "Failed to load errors" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GET /api/dev/system/slow-endpoints  — last 24h grouped by endpoint avg ms
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
devRouter.get("/system/slow-endpoints", async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("api_logs")
      .select("endpoint, response_time_ms")
      .gte("created_at", since)
      .not("response_time_ms", "is", null);

    if (error) return res.status(500).json({ success: false, error: error.message });

    const byEp = {};
    for (const r of data ?? []) {
      if (!byEp[r.endpoint]) byEp[r.endpoint] = { total: 0, count: 0 };
      byEp[r.endpoint].total += Number(r.response_time_ms) || 0;
      byEp[r.endpoint].count++;
    }
    const result = Object.entries(byEp)
      .map(([endpoint, { total, count }]) => ({ endpoint, avg_ms: Math.round(total / count), calls: count }))
      .sort((a, b) => b.avg_ms - a.avg_ms)
      .slice(0, 20);

    return res.json({ success: true, data: result });
  } catch (e) {
    console.error("[GET /api/dev/system/slow-endpoints]", e);
    return res.status(500).json({ success: false, error: "Failed to load slow endpoints" });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BUG REPORTS — /api/dev/bugs/*
// superAdminOnly middleware already applied to entire devRouter
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── GET /api/dev/bugs/count ───────────────────────────────────────────────────
devRouter.get("/bugs/count", async (req, res) => {
  try {
    const { count, error } = await supabaseAdmin
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, openCount: count ?? 0 });
  } catch (e) {
    console.error("[GET /api/dev/bugs/count]", e);
    return res.status(500).json({ success: false, error: "Failed to count bugs" });
  }
});

// ── Helper: resolve reporter name ─────────────────────────────────────────────
async function resolveReporterName(reportedByType, reportedById) {
  try {
    if (reportedByType === "driver") {
      const { data } = await supabaseAdmin
        .from("drivers")
        .select("name, phone")
        .eq("id", reportedById)
        .maybeSingle();
      return data?.name || data?.phone || "Unknown Driver";
    }
    // admin or customer — use profiles table
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", reportedById)
      .maybeSingle();
    if (data?.display_name?.trim()) return data.display_name.trim();
    // fallback to auth metadata
    const { data: au } = await supabaseAdmin.auth.admin.getUserById(reportedById);
    const u = au?.user;
    return (
      u?.user_metadata?.full_name?.trim() ||
      u?.user_metadata?.name?.trim() ||
      u?.phone?.replace(/^\+91/, "") ||
      u?.email?.split("@")[0] ||
      "Unknown"
    );
  } catch {
    return "Unknown";
  }
}

// ── Helper: resolve business name ─────────────────────────────────────────────
async function resolveBusinessName(businessId) {
  if (!businessId) return null;
  try {
    const { data } = await supabaseAdmin
      .from("business_profile")
      .select("business_name")
      .eq("id", businessId)
      .maybeSingle();
    return data?.business_name ?? null;
  } catch {
    return null;
  }
}

// ── GET /api/dev/bugs — list with filters ─────────────────────────────────────
devRouter.get("/bugs", async (req, res) => {
  try {
    const { status, type, severity } = req.query;

    let query = supabaseAdmin
      .from("bug_reports")
      .select("id, title, category, severity, status, reported_by_type, reported_by_id, business_id, created_at, updated_at, resolved_at")
      .order("created_at", { ascending: false });

    if (status)   query = query.eq("status", status);
    if (type)     query = query.eq("reported_by_type", type);
    if (severity) query = query.eq("severity", severity);

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    const rows = data ?? [];

    // Resolve reporter names + business names in parallel batches
    const enriched = await Promise.all(
      rows.map(async (bug) => {
        const [reporterName, businessName] = await Promise.all([
          resolveReporterName(bug.reported_by_type, bug.reported_by_id),
          resolveBusinessName(bug.business_id),
        ]);
        return { ...bug, reporter_name: reporterName, business_name: businessName };
      })
    );

    // Sort: critical first, then by created_at desc
    const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    enriched.sort((a, b) => {
      const diff = (SEV_ORDER[a.severity] ?? 4) - (SEV_ORDER[b.severity] ?? 4);
      if (diff !== 0) return diff;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    return res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /api/dev/bugs]", e);
    return res.status(500).json({ success: false, error: "Failed to load bugs" });
  }
});

// ── GET /api/dev/bugs/:id — full detail ──────────────────────────────────────
devRouter.get("/bugs/:id", async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("bug_reports")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Bug not found" });

    const [reporterName, businessName] = await Promise.all([
      resolveReporterName(data.reported_by_type, data.reported_by_id),
      resolveBusinessName(data.business_id),
    ]);

    return res.json({ success: true, data: { ...data, reporter_name: reporterName, business_name: businessName } });
  } catch (e) {
    console.error("[GET /api/dev/bugs/:id]", e);
    return res.status(500).json({ success: false, error: "Failed to load bug" });
  }
});

// ── PUT /api/dev/bugs/:id — update status + super_admin_note ─────────────────
devRouter.put("/bugs/:id", async (req, res) => {
  try {
    const { status, super_admin_note } = req.body ?? {};
    const VALID_STATUSES = ["open", "in_review", "resolved", "wont_fix"];
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status value" });
    }

    const patch = { updated_at: new Date().toISOString() };
    if (status !== undefined) patch.status = status;
    if (super_admin_note !== undefined) patch.super_admin_note = super_admin_note;

    // resolved_at logic
    if (status === "resolved") {
      patch.resolved_at = new Date().toISOString();
    } else if (status === "open") {
      patch.resolved_at = null;
    }

    const { data, error } = await supabaseAdmin
      .from("bug_reports")
      .update(patch)
      .eq("id", req.params.id)
      .select("*")
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Bug not found" });

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /api/dev/bugs/:id]", e);
    return res.status(500).json({ success: false, error: "Failed to update bug" });
  }
});
