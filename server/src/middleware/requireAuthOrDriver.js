/**
 * requireAuthOrDriver.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dual-auth middleware — accepts EITHER:
 *   1. A Supabase JWT (customers, admins)  → same as requireAuth
 *   2. A driver custom session token       → same as requireDriverAuth
 *
 * Used on routes that must be callable by both authenticated app users AND
 * driver-portal users (e.g. POST /api/orders/:id/verify-delivery).
 *
 * Sets the same req.authUser / req.authProfile fields as requireAuth so
 * existing route handlers need no changes.
 */

import { supabaseAdmin } from "../../lib/supabase.js";
import { supabaseAnon  } from "../../lib/supabaseAnon.js";

export async function requireAuthOrDriver(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token  = header.startsWith("Bearer ") ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing or invalid Authorization header" });
  }

  try {
    // ── Attempt 1: Supabase JWT (customers, admins) ──────────────────────────
    const { data: { user }, error: jwtErr } = await supabaseAnon.auth.getUser(token);

    if (!jwtErr && user) {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("role").eq("id", user.id).maybeSingle();
      req.authUser    = user;
      req.authProfile = profile ?? null;
      return next();
    }

    // ── Attempt 2: Driver session token ─────────────────────────────────────
    const { data: session, error: sErr } = await supabaseAdmin
      .from("driver_sessions")
      .select("driver_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (sErr || !session) {
      return res.status(401).json({ success: false, error: "Invalid or expired session" });
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabaseAdmin.from("driver_sessions").delete().eq("token", token);
      return res.status(401).json({ success: false, error: "Session expired — please login again" });
    }

    const { data: driver, error: dErr } = await supabaseAdmin
      .from("drivers")
      .select("id, phone, name, is_active")
      .eq("id", session.driver_id)
      .maybeSingle();

    if (dErr || !driver) {
      return res.status(401).json({ success: false, error: "Driver not found" });
    }

    if (!driver.is_active) {
      return res.status(403).json({ success: false, error: "Driver account is inactive" });
    }

    // Mimic the shape that requireAuth sets so route handlers are unaffected
    req.authUser    = { id: driver.id, phone: driver.phone };
    req.authProfile = { role: "driver", display_name: driver.name };
    req.driverUser  = driver;
    return next();

  } catch (e) {
    console.error("[requireAuthOrDriver]", e);
    return res.status(500).json({ success: false, error: "Authentication failed" });
  }
}
