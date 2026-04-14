/**
 * requireDriverAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Middleware for ALL /api/driver/* routes (except /api/driver/auth/*).
 * 1. Verifies Bearer token → driver_sessions → loads driver record.
 * 2. Reads x-business-id header → validates driver_business_links membership.
 *    If header present and driver is NOT a member → 403.
 *    If header absent → req.businessId = null (caller decides whether to care).
 *
 * Sets on request:
 *   req.authUser    = { id, phone }
 *   req.authProfile = { role: "driver", display_name }
 *   req.driverUser  = full driver row
 *   req.driverToken = token string
 *   req.businessId  = validated business UUID | null
 */

import { supabaseAdmin } from "../../lib/supabase.js";

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(id ?? ""),
  );
}

export async function requireDriverAuth(req, res, next) {
  // ── 1. Verify Bearer token ──────────────────────────────────────────────────
  const auth  = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Driver token required" });
  }

  try {
    // Look up session
    const { data: session, error: sErr } = await supabaseAdmin
      .from("driver_sessions")
      .select("driver_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (sErr || !session) {
      return res.status(401).json({ success: false, error: "Invalid or expired driver token" });
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabaseAdmin.from("driver_sessions").delete().eq("token", token);
      return res.status(401).json({ success: false, error: "Session expired — please login again" });
    }

    // Load driver
    const { data: driver, error: dErr } = await supabaseAdmin
      .from("drivers")
      .select("id, phone, name, is_profile_complete, is_active")
      .eq("id", session.driver_id)
      .maybeSingle();

    if (dErr || !driver) {
      return res.status(401).json({ success: false, error: "Driver not found" });
    }

    if (!driver.is_active) {
      return res.status(403).json({ success: false, error: "Driver account is inactive" });
    }

    // Attach driver to request
    req.authUser    = { id: driver.id, phone: driver.phone };
    req.authProfile = { role: "driver", display_name: driver.name };
    req.driverUser  = driver;
    req.driverToken = token;

    // ── 2. Validate x-business-id if provided ──────────────────────────────
    const rawBusinessId = req.headers["x-business-id"] ?? null;

    if (rawBusinessId) {
      if (!isUuid(rawBusinessId)) {
        return res.status(400).json({ success: false, error: "Invalid x-business-id format" });
      }

      // Confirm this driver belongs to this business
      const { data: link, error: linkErr } = await supabaseAdmin
        .from("driver_business_links")
        .select("business_id")
        .eq("driver_id", driver.id)
        .eq("business_id", rawBusinessId)
        .maybeSingle();

      if (linkErr || !link) {
        return res.status(403).json({
          success: false,
          error:   "Unauthorized business access",
        });
      }

      req.businessId = rawBusinessId;
    } else {
      req.businessId = null;
    }

    next();
  } catch (e) {
    console.error("[requireDriverAuth]", e);
    return res.status(500).json({ success: false, error: "Authentication failed" });
  }
}
