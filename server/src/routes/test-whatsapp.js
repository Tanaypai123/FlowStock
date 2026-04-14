/**
 * test-whatsapp.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Standalone test route for verifying Twilio WhatsApp.
 * Does NOT use notificationService.js — calls Twilio directly so there are
 * zero abstraction layers to debug.
 *
 * Usage:
 *   GET http://localhost:8000/api/test-whatsapp?to=+919876543210
 */

import { Router } from "express";

export const testWhatsAppRouter = Router();

testWhatsAppRouter.get("/", async (req, res) => {
  const to = (req.query.to || "").trim();

  // ── Step 1: Log all env vars ──────────────────────────────────────────────
  console.log("\n" + "═".repeat(55));
  console.log("  🧪 /api/test-whatsapp HIT");
  console.log("═".repeat(55));
  console.log("ENV CHECK:");
  console.log(
    "  TWILIO_ACCOUNT_SID   :",
    process.env.TWILIO_ACCOUNT_SID
      ? `✅  ${process.env.TWILIO_ACCOUNT_SID.slice(0, 12)}…`
      : "❌  NOT SET"
  );
  console.log(
    "  TWILIO_AUTH_TOKEN    :",
    process.env.TWILIO_AUTH_TOKEN ? "✅  (set)" : "❌  NOT SET"
  );
  console.log(
    "  TWILIO_WHATSAPP_FROM :",
    process.env.TWILIO_WHATSAPP_FROM || "❌  NOT SET"
  );
  console.log("  Recipient (to)       :", to || "❌  NOT PROVIDED");
  console.log("═".repeat(55));

  // ── Step 2: Validate params ───────────────────────────────────────────────
  if (!to) {
    return res.status(400).json({
      success: false,
      error: "Missing ?to= query param. Example: ?to=+919876543210",
    });
  }

  const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
  if (!from) {
    return res.status(500).json({
      success: false,
      error: "TWILIO_WHATSAPP_FROM not set in .env",
    });
  }

  const sid   = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) {
    return res.status(500).json({
      success: false,
      error: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing in .env",
    });
  }

  // ── Step 3: Load Twilio directly ─────────────────────────────────────────
  let twilio;
  try {
    const mod = await import("twilio");
    twilio = mod.default ?? mod;
    console.log("  Twilio package      : ✅  loaded");
  } catch (err) {
    console.error("  Twilio package      : ❌  NOT installed:", err.message);
    return res.status(500).json({
      success: false,
      error: "twilio package not installed. Run: npm install twilio",
    });
  }

  // ── Step 4: Create client ─────────────────────────────────────────────────
  const client = twilio(sid, token);
  console.log("  Twilio client       : ✅  created");

  // ── Step 5: Build message ─────────────────────────────────────────────────
  // Always prefix whatsapp: on recipient
  const recipient = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const body      = "Test message from FlowStock 🚀\n\nIf you received this, Twilio WhatsApp is working correctly ✅";

  console.log(`\n  Sending WhatsApp...`);
  console.log(`  from : ${from}`);
  console.log(`  to   : ${recipient}`);
  console.log(`  body : "${body.slice(0, 50)}…"`);

  // ── Step 6: Send message ──────────────────────────────────────────────────
  try {
    const message = await client.messages.create({
      from,
      to: recipient,
      body,
    });

    console.log(`\n  ✅ Message sent!`);
    console.log(`  SID    : ${message.sid}`);
    console.log(`  Status : ${message.status}`);
    console.log("═".repeat(55) + "\n");

    return res.json({
      success: true,
      message: "WhatsApp message sent successfully",
      sid:     message.sid,
      status:  message.status,
      to:      recipient,
      from,
    });

  } catch (err) {
    console.error(`\n  ❌ Twilio send FAILED:`);
    console.error(`  message : ${err.message}`);
    console.error(`  code    : ${err.code}`);
    console.error(`  status  : ${err.status}`);
    console.error(`  moreInfo: ${err.moreInfo}`);
    console.log("═".repeat(55) + "\n");

    return res.status(500).json({
      success:  false,
      error:    err.message,
      code:     err.code,
      moreInfo: err.moreInfo,
      hint:     err.code === 63007
        ? "Recipient has not joined the WhatsApp sandbox. Send 'join <code>' to +14155238886"
        : err.code === 20003
        ? "Authentication failed — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
        : "Check server logs for details",
    });
  }
});
