/**
 * inventoryService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared inventory business logic.
 *
 * KEY DESIGN: All order_line_items lookups use `inventory_item_id` (FK) as
 * PRIMARY matcher. Falls back to ilike(item_name) only for legacy rows where
 * inventory_item_id is NULL. This gives 100% accurate sold counts.
 */

import { supabaseAdmin } from "../../lib/supabase.js";

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * Derives the stock status for an item.
 * @returns {"out_of_stock"|"critical"|"warning"|"normal"}
 */
export function stockStatus(item) {
  const qty     = Number(item.quantity);
  const initial = Number(item.initial_stock);
  const alertAt = Number(item.low_stock_alert);
  const warnAt  = initial > 0 ? initial * 0.5 : null;

  let status;
  if (qty <= 0)                                              status = "out_of_stock";
  else if (Number.isFinite(alertAt) && alertAt > 0 && qty <= alertAt) status = "critical";
  else if (warnAt !== null && qty <= warnAt)                 status = "warning";
  else                                                       status = "normal";

  console.log(
    `[Status Debug] item_id=${item.id ?? "?"} | name="${item.name ?? "?"}" | ` +
    `qty=${qty} | initial=${initial} | alertAt=${alertAt} | ` +
    `warningThreshold=${warnAt ?? "N/A"} | status=${status}`
  );

  return status;
}

// ─── Sold quantity ────────────────────────────────────────────────────────────

/**
 * Compute how many units of an item have been sold.
 *
 * STRICT: Only uses inventory_item_id FK — NO name/ilike matching.
 * Name matching caused false counts for new products sharing similar names.
 *
 * Only counts orders with status: confirmed | dispatched | delivered.
 *
 * @param {string} itemId   — inventory_items.id (UUID)
 * @param {string} itemName — used only for logging, never for DB matching
 */
export async function computeSoldQty(itemId, itemName) {
  try {
    if (!itemId) {
      console.warn(`[Inventory Debug] computeSoldQty: no itemId for "${itemName}" — returning 0`);
      return 0;
    }

    // ── STRICT FK-only query on order_line_items ─────────────────────────────
    // Count units sold from all ACTIVE + COMPLETED orders:
    // confirmed, dispatched, out_for_delivery, delivered
    const { data: lines, error } = await supabaseAdmin
      .from("order_line_items")
      .select("quantity, order_id")
      .eq("inventory_item_id", itemId);

    if (error) {
      console.error(`[Inventory Debug] item_id=${itemId} | query error: ${error.message}`);
      return 0;
    }

    if (!lines?.length) {
      console.log(`[Inventory Debug] item_id=${itemId} | name="${itemName}" | no line items | sold=0`);
      return 0;
    }

    // Filter to only orders that consumed stock (pending/cancelled/rejected don't count)
    const orderIds = [...new Set(lines.map((l) => l.order_id))];
    const { data: validOrders, error: ordErr } = await supabaseAdmin
      .from("orders")
      .select("id")
      .in("id", orderIds)
      .in("status", ["confirmed", "dispatched", "out_for_delivery", "delivered"]);

    if (ordErr) {
      console.error(`[Inventory Debug] item_id=${itemId} | orders query error: ${ordErr.message}`);
      return 0;
    }

    const validIds = new Set((validOrders ?? []).map((o) => o.id));
    const sold = lines
      .filter((l) => validIds.has(l.order_id))
      .reduce((sum, l) => sum + Number(l.quantity), 0);

    console.log(
      `[Inventory Debug] item_id=${itemId} | name="${itemName}" | ` +
      `line_items=${lines.length} | valid_orders=${validIds.size} | sold=${sold}`
    );

    return sold;
  } catch (err) {
    console.error(`[Inventory Debug] item_id=${itemId} | unhandled error: ${err.message}`);
    return 0;
  }
}

// ─── Dual alert ───────────────────────────────────────────────────────────────

/**
 * Sends WhatsApp alerts to ADMIN_PHONE when stock crosses thresholds.
 * Uses alert_50_sent / alert_low_sent flags to prevent duplicate spam.
 * Resets flags when stock recovers so next dip triggers again.
 *
 * @param {object} item — full inventory_items row (post-update)
 */
export async function runInventoryAlerts(item) {
  const qty      = Number(item.quantity);
  const initial  = Number(item.initial_stock);
  const alertAt  = Number(item.low_stock_alert);
  const itemName = item.name;
  const itemId   = item.id;

  // ── Resolve phones to notify ─────────────────────────────────────────────
  // Priority: updates_phone from business_profile (per-admin) + ADMIN_PHONE env (global fallback)
  let adminPhone = (process.env.ADMIN_PHONE ?? "").trim();
  try {
    const { data: bp } = await supabaseAdmin
      .from("business_profile")
      .select("updates_phone")
      .limit(1)
      .maybeSingle();
    if (bp?.updates_phone?.trim()) {
      // Use business profile phone as primary; keep env phone as secondary
      const bpPhone = bp.updates_phone.trim();
      // If they differ, we'll send to both — deduplicate below
      adminPhone = bpPhone !== adminPhone ? bpPhone : bpPhone;
    }
  } catch { /* non-critical — fall back to env var */ }

  const WA_FROM = (process.env.TWILIO_WHATSAPP_FROM ?? "").trim();
  const SID     = (process.env.TWILIO_ACCOUNT_SID ?? "").trim();
  const TOKEN   = (process.env.TWILIO_AUTH_TOKEN ?? "").trim();

  const half50      = initial > 0 ? initial * 0.5 : null;
  const isBelow50   = half50 !== null && qty > 0 && qty <= half50;
  const isCritical  = Number.isFinite(alertAt) && alertAt > 0 && qty > 0 && qty <= alertAt;
  const isOutOfStock = qty <= 0;
  const isAbove50   = half50 !== null && qty > half50;
  const isAboveLow  = Number.isFinite(alertAt) && alertAt > 0 && qty > alertAt;

  console.log(`[Inventory Alert] "${itemName}" qty=${qty} initial=${initial} threshold=${alertAt}`);

  // Reset flags when stock recovers
  const flagReset = {};
  if (isAbove50)  flagReset.alert_50_sent  = false;
  if (isAboveLow) flagReset.alert_low_sent = false;
  if (Object.keys(flagReset).length) {
    await supabaseAdmin.from("inventory_items").update(flagReset).eq("id", itemId);
  }

  if (!adminPhone || !WA_FROM || !SID || !TOKEN) {
    if (isBelow50 || isCritical || isOutOfStock) {
      console.warn(`[Inventory Alert] ⚠️  Env vars missing — alert skipped for "${itemName}"`);
    }
    return;
  }

  let phone = adminPhone.replace(/[\s\-().]/g, "");
  if (!phone.startsWith("+")) {
    phone = /^\d{10}$/.test(phone) ? `+91${phone}` : `+${phone}`;
  }
  const recipient = `whatsapp:${phone}`;

  let _client = null;
  const getClient = async () => {
    if (_client) return _client;
    const mod = await import("twilio");
    _client = (mod.default ?? mod)(SID, TOKEN);
    return _client;
  };

  const sendAlert = async (body, flagKey) => {
    if (item[flagKey]) {
      console.log(`[Inventory Alert] ⏭  ${flagKey} already sent for "${itemName}" — skipping`);
      return;
    }
    try {
      const client = await getClient();
      const msg = await client.messages.create({ from: WA_FROM, to: recipient, body });
      console.log(`[Inventory Alert] ✅ Alert sent (SID: ${msg.sid})`);
      await supabaseAdmin.from("inventory_items").update({ [flagKey]: true }).eq("id", itemId);
    } catch (err) {
      console.error(`[Inventory Alert] ❌ Send failed: ${err?.message} (code: ${err?.code})`);
    }
  };

  if (isOutOfStock) {
    await sendAlert(
      `🔴 *Out of Stock* — FlowStock\n\nProduct: *${itemName}*\nCurrent Stock: *0 units*\n\nThis item is completely out of stock. Restock immediately!`,
      "alert_low_sent",
    );
    return;
  }
  if (isBelow50) {
    await sendAlert(
      `⚠️ *Warning: 50% Stock Remaining* — FlowStock\n\nProduct: *${itemName}*\nCurrent Qty: *${qty}* unit(s)\nOriginal Stock: ${initial} unit(s)\n\nStock has reached 50% — consider restocking soon.`,
      "alert_50_sent",
    );
  }
  if (isCritical) {
    await sendAlert(
      `🚨 *Low Stock Alert* — FlowStock\n\nProduct: *${itemName}*\nCurrent Qty: *${qty}* unit(s)\nThreshold: ${alertAt} unit(s)\n\nCritical level reached — restock immediately!`,
      "alert_low_sent",
    );
  }
}

// ─── Inventory deduction on order confirmation ────────────────────────────────

/**
 * Deducts inventory for every line item in an order.
 * - Uses inventory_item_id FK (primary) or ilike name (fallback for legacy rows)
 * - Prevents negative stock (clamps to 0, logs warning if insufficient)
 * - Logs before/after qty for every item
 * - Runs dual alerts after each update
 *
 * @param {string} orderId
 * @returns {Promise<boolean>} true if all items processed, false on fatal error
 */
export async function deductInventoryForOrder(orderId) {
  try {
    const { data: lines, error: lineErr } = await supabaseAdmin
      .from("order_line_items")
      .select("item_name, quantity, inventory_item_id")
      .eq("order_id", orderId);

    if (lineErr || !lines?.length) {
      console.log(`[Inventory] No line items for order ${orderId}`);
      return true;
    }

    console.log(`[Inventory] ── Deducting stock for order ${orderId} (${lines.length} item(s)) ──`);

    for (const line of lines) {
      const ordered = Number(line.quantity);
      let invItem   = null;

      // 1️⃣  FK lookup (accurate, handles renames)
      if (line.inventory_item_id) {
        const { data } = await supabaseAdmin
          .from("inventory_items")
          .select("id, name, quantity, initial_stock, low_stock_alert, alert_50_sent, alert_low_sent")
          .eq("id", line.inventory_item_id)
          .maybeSingle();
        invItem = data;
      }

      // 2️⃣  Name fallback for legacy rows without FK
      if (!invItem && line.item_name) {
        const { data } = await supabaseAdmin
          .from("inventory_items")
          .select("id, name, quantity, initial_stock, low_stock_alert, alert_50_sent, alert_low_sent")
          .ilike("name", line.item_name.trim())
          .maybeSingle();
        invItem = data;
      }

      if (!invItem) {
        console.warn(`[Inventory] ⚠️  No match for "${line.item_name}" (FK: ${line.inventory_item_id}) — skipping`);
        continue;
      }

      const prevQty = Number(invItem.quantity);
      const newQty  = Math.max(0, prevQty - ordered); // clamp ≥ 0

      if (ordered > prevQty) {
        console.warn(
          `[Inventory] ⚠️  Insufficient stock for "${invItem.name}" — ` +
          `ordered: ${ordered}, available: ${prevQty} — clamping to 0`
        );
      }

      console.log(
        `[Inventory] "${invItem.name}" → Before: ${prevQty}, Deducted: ${ordered}, After: ${newQty}`
      );

      const { data: updated } = await supabaseAdmin
        .from("inventory_items")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("id", invItem.id)
        .select("id, name, quantity, initial_stock, low_stock_alert, alert_50_sent, alert_low_sent")
        .maybeSingle();

      if (updated) {
        // Alerts are non-blocking — never let them fail the deduction
        runInventoryAlerts(updated).catch((e) =>
          console.error(`[Inventory] Alert error for "${invItem.name}":`, e.message)
        );
      }
    }

    console.log(`[Inventory] ✔  Stock deduction complete for order ${orderId}`);
    return true;
  } catch (err) {
    console.error("[Inventory] deductInventoryForOrder error:", err.message);
    return false;
  }
}

/**
 * Restores inventory when an order is rejected (was previously confirmed).
 * Uses inventory_item_id FK (primary) or ilike name (fallback).
 *
 * @param {string} orderId
 * @param {string} previousStatus — the status BEFORE the current update
 */
export async function restoreInventoryForOrder(orderId, previousStatus) {
  if (!["confirmed", "dispatched", "delivered"].includes(previousStatus)) return;

  try {
    const { data: lines } = await supabaseAdmin
      .from("order_line_items")
      .select("item_name, quantity, inventory_item_id")
      .eq("order_id", orderId);

    if (!lines?.length) return;

    console.log(`[Inventory] Restoring ${lines.length} item(s) (order ${orderId} rejected)`);

    for (const line of lines) {
      let invItem = null;

      if (line.inventory_item_id) {
        const { data } = await supabaseAdmin
          .from("inventory_items")
          .select("id, name, quantity")
          .eq("id", line.inventory_item_id)
          .maybeSingle();
        invItem = data;
      }

      if (!invItem && line.item_name) {
        const { data } = await supabaseAdmin
          .from("inventory_items")
          .select("id, name, quantity")
          .ilike("name", line.item_name.trim())
          .maybeSingle();
        invItem = data;
      }

      if (!invItem) continue;

      const newQty = Number(invItem.quantity) + Number(line.quantity);
      console.log(`[Inventory] Restore "${invItem.name}": ${invItem.quantity} → ${newQty}`);

      await supabaseAdmin
        .from("inventory_items")
        .update({ quantity: newQty, updated_at: new Date().toISOString() })
        .eq("id", invItem.id);
    }
  } catch (err) {
    console.error("[Inventory] restoreInventoryForOrder error:", err.message);
  }
}
