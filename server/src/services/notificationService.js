/**
 * notificationService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared WhatsApp notification logic for all routes.
 *
 * Primary export: notifyOrderStatus(status, orderData)
 *   – resolves customer phone (registered or guest)
 *   – picks the right message template
 *   – sends via Twilio with full console logging
 *
 * ENV VARS:
 *   TWILIO_ACCOUNT_SID    — ACxxxxxxxx from console.twilio.com
 *   TWILIO_AUTH_TOKEN     — your auth token
 *   TWILIO_WHATSAPP_FROM  — e.g. "whatsapp:+14155238886"
 */

import { supabaseAdmin } from "../../lib/supabase.js";
import {
  orderConfirmed,
  orderDispatched,
  orderOutForDelivery,
  orderDelivered,
  orderCancelled,
} from "./notificationTemplates.js";

// ─── Phone normalisation ──────────────────────────────────────────────────────

/**
 * Normalise any phone string to E.164 (+91XXXXXXXXXX for 10-digit Indian numbers).
 */
function normalisePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/[\s\-().]/g, "").trim();
  if (!p) return null;
  if (p.startsWith("+")) return p;
  if (/^\d{10}$/.test(p)) return `+91${p}`;
  if (/^91\d{10}$/.test(p)) return `+${p}`;
  return `+${p}`;
}

// ─── Twilio client (lazy, cached on success) ──────────────────────────────────

let _client = null;

async function getTwilioClient() {
  if (_client) return _client;

  const sid   = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!sid || !token) {
    console.warn("[Notify] ⚠️  TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
    return null;
  }

  try {
    const mod     = await import("twilio");
    const factory = mod.default ?? mod;
    _client       = factory(sid, token);
    console.log("[Notify] ✅ Twilio client ready");
    return _client;
  } catch (err) {
    console.error("[Notify] ❌ twilio package not installed:", err.message);
    console.error("[Notify]    Run: npm install twilio  (in /server directory)");
    return null;
  }
}

// ─── Core send ────────────────────────────────────────────────────────────────

/**
 * Sends a WhatsApp message.
 * @param {string} to   — phone in any format; normalised automatically
 * @param {string} body — message body
 */
export async function sendWhatsApp(to, body) {
  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!from) {
    console.warn("[Notify] ⚠️  TWILIO_WHATSAPP_FROM not set — skipping");
    return null;
  }

  const phone = normalisePhone(to);
  if (!phone) {
    console.warn("[Notify] ⚠️  sendWhatsApp: no recipient — skipping");
    return null;
  }

  const recipient = phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
  console.log(`[Notify] 📤 WhatsApp → ${recipient}`);

  const client = await getTwilioClient();
  if (!client) return null;

  try {
    const msg = await client.messages.create({ from, to: recipient, body });
    console.log(`[Notify] ✅ Sent! SID: ${msg.sid} | status: ${msg.status}`);
    return { sid: msg.sid, status: msg.status };
  } catch (err) {
    console.error(`[Notify] ❌ WhatsApp FAILED → ${recipient}`);
    console.error(`         message  : ${err?.message}`);
    console.error(`         code     : ${err?.code}`);
    console.error(`         moreInfo : ${err?.moreInfo}`);
    return null;
  }
}

// ─── Resolve customer phone ───────────────────────────────────────────────────

/**
 * Resolves a customer's phone number.
 * For registered customers: fetches from Supabase Auth.
 * For guest orders: uses guest_customer_phone from the order row.
 *
 * @param {{ customer_id?: string|null, guest_customer_phone?: string|null }} orderData
 * @returns {Promise<string|null>} Normalised E.164 phone or null
 */
async function resolvePhone(orderData) {
  // ── Priority 1: explicit phone stored on the order row ─────────────────────
  // Covers: walk-in / guest orders, and registered users whose order was
  // created with a phone attached (admin-created bulk orders, etc.)
  const guestRaw = orderData.guest_customer_phone?.trim() || orderData.guest_phone?.trim();
  if (guestRaw) {
    const phone = normalisePhone(guestRaw);
    if (phone) {
      console.log(`[Notify] Using order-stored phone: ${phone}`);
      return phone;
    }
  }

  // ── Priority 2: Supabase Auth phone for registered users ───────────────────
  if (orderData.customer_id) {
    try {
      const { data: authUser, error: authErr } =
        await supabaseAdmin.auth.admin.getUserById(orderData.customer_id);

      console.log("[Notify] Supabase auth lookup:");
      console.log("  user.phone :", authUser?.user?.phone ?? "(null)");
      console.log("  user.email :", authUser?.user?.email ?? "(null)");
      if (authErr) console.log("  authErr    :", authErr.message);

      const raw =
        authUser?.user?.phone?.trim() ||
        authUser?.user?.identities?.find((i) => i.provider === "phone")
          ?.identity_data?.phone?.trim() ||
        // last-resort: try user_metadata (some providers store phone here)
        authUser?.user?.user_metadata?.phone?.trim() ||
        null;

      const phone = normalisePhone(raw);
      console.log("  resolved   :", phone ?? "(NOT FOUND)");
      return phone;
    } catch (err) {
      console.error("[Notify] ❌ Supabase auth lookup threw:", err.message);
      return null;
    }
  }

  console.log("[Notify] ⚠️  No phone source available for this order");
  return null;
}

// ─── Main export: notifyOrderStatus ──────────────────────────────────────────

/**
 * Sends the appropriate WhatsApp message when an order status changes.
 *
 * @param {string} status    — "confirmed" | "dispatched" | "delivered" | "rejected"
 * @param {object} orderData — must include: { customer_id, guest_customer_phone,
 *                             customer_name|guest_customer_name, short_id, driver_name }
 */
export async function notifyOrderStatus(status, orderData) {
  const NOTIFIABLE = new Set(["confirmed", "dispatched", "out_for_delivery", "delivered", "rejected", "cancelled"]);

  console.log("\n" + "─".repeat(55));
  console.log(`[Notify] Order ${orderData.short_id ?? orderData.id} → "${status}"`);
  console.log(`[Notify] Source: ${orderData._source ?? "unknown route"}`);

  if (!NOTIFIABLE.has(status)) {
    console.log(`[Notify] ⏭  No template for status "${status}"`);
    console.log("─".repeat(55));
    return;
  }

  // 1. Resolve phone
  const phone = await resolvePhone(orderData);
  if (!phone) {
    console.log("[Notify] ⏭  No phone resolved — message not sent");
    console.log("─".repeat(55));
    return;
  }

  // 2. Pick template
  const name     = orderData.customer_name ?? orderData.guest_customer_name ?? "Customer";
  const shortId  = orderData.short_id ?? String(orderData.id ?? "").replace(/-/g, "").slice(0, 8).toUpperCase();
  const driver   = orderData.driver_name ?? "our driver";
  let   msgBody  = null;

  if (status === "confirmed")         msgBody = orderConfirmed(name, shortId);
  if (status === "dispatched")         msgBody = orderDispatched(name, driver);
  if (status === "out_for_delivery")   msgBody = orderOutForDelivery(name, orderData.verification_otp ?? "---");
  if (status === "delivered")          msgBody = orderDelivered(name);
  if (status === "rejected")           msgBody = orderCancelled(name, shortId);
  if (status === "cancelled")          msgBody = orderCancelled(name, shortId);

  // 3. Send
  console.log(`[Notify] 📨 Sending "${status}" notification to ${phone}`);
  await sendWhatsApp(phone, msgBody);
  console.log("─".repeat(55));
}

// ─── sendSMS ─────────────────────────────────────────────────────────────────

/**
 * Sends an SMS via Twilio (used for admin alerts like low stock).
 * @param {string} to   — E.164 phone number
 * @param {string} body — plain text (no markdown)
 * @returns {Promise<{ sid: string } | null>}
 */
export async function sendSMS(to, body) {
  const from = process.env.TWILIO_SMS_FROM?.trim();

  if (!from) {
    console.warn("[Notify] ⚠️  TWILIO_SMS_FROM not set — skipping SMS");
    return null;
  }

  let phone = to?.trim();
  if (!phone) {
    console.warn("[Notify] ⚠️  sendSMS: no recipient — skipping");
    return null;
  }
  if (!phone.startsWith("+")) {
    phone = /^\d{10}$/.test(phone) ? `+91${phone}` : `+${phone}`;
  }

  console.log(`[Notify] 📤 SMS → ${phone}`);

  const client = await getTwilioClient();
  if (!client) return null;

  try {
    const msg = await client.messages.create({ from, to: phone, body });
    console.log(`[Notify] ✅ SMS sent! SID: ${msg.sid}`);
    return { sid: msg.sid, status: msg.status };
  } catch (err) {
    console.error(`[Notify] ❌ SMS FAILED → ${phone}: ${err?.message}`);
    return null;
  }
}

