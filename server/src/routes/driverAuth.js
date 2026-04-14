/**
 * driverAuth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fully separate driver authentication system.
 * Does NOT use Supabase auth — uses its own drivers + driver_sessions tables.
 * Password hashing: Node.js built-in crypto.scrypt (no external deps needed)
 *
 * POST  /api/driver/auth/login   — phone + password → token
 * PUT   /api/driver/auth/setup   — complete profile (name, password, vehicle)
 * GET   /api/driver/auth/me      — verify token → driver info + businesses
 * POST  /api/driver/auth/logout  — delete token
 */

import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

export const driverAuthRouter = Router();

const scryptAsync = promisify(scrypt);

// ─── Crypto helpers (bcrypt-compatible interface) ─────────────────────────────

const SALT_LEN  = 16;   // bytes
const KEY_LEN   = 64;   // bytes
const SEPARATOR = ":";

/**
 * Hash a plaintext password with scrypt.
 * Returns "salt:hash" as hex strings.
 */
async function hashPassword(password) {
  const salt = randomBytes(SALT_LEN);
  const derived = await scryptAsync(password, salt, KEY_LEN);
  return `${salt.toString("hex")}${SEPARATOR}${derived.toString("hex")}`;
}

/**
 * Compare a plaintext password against a stored "salt:hash".
 * Returns true if match.
 */
async function verifyPassword(password, storedHash) {
  try {
    const [saltHex, hashHex] = storedHash.split(SEPARATOR);
    const salt    = Buffer.from(saltHex, "hex");
    const stored  = Buffer.from(hashHex, "hex");
    const derived = await scryptAsync(password, salt, KEY_LEN);
    return timingSafeEqual(stored, derived);
  } catch {
    return false;
  }
}

/** Generate a secure random session token. */
function generateToken() {
  return randomBytes(32).toString("hex");
}

// ─── Middleware: verify driver token from Authorization header ────────────────

async function requireDriverToken(req, res, next) {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ success: false, error: "No driver token provided" });
  }

  const { data: session, error } = await supabaseAdmin
    .from("driver_sessions")
    .select("driver_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }

  if (new Date(session.expires_at) < new Date()) {
    // Clean up expired session
    await supabaseAdmin.from("driver_sessions").delete().eq("token", token);
    return res.status(401).json({ success: false, error: "Session expired — please login again" });
  }

  const { data: driver, error: dErr } = await supabaseAdmin
    .from("drivers")
    .select("id, phone, name, vehicle_details, license_number, is_profile_complete, is_active")
    .eq("id", session.driver_id)
    .maybeSingle();

  if (dErr || !driver) {
    return res.status(401).json({ success: false, error: "Driver not found" });
  }

  if (!driver.is_active) {
    return res.status(403).json({ success: false, error: "Driver account is inactive" });
  }

  req.driverSession = { token, driver_id: session.driver_id };
  req.driverUser    = driver;
  next();
}

// ─── Helper: fetch driver's linked businesses ─────────────────────────────────

async function getDriverBusinesses(driverId) {
  const { data, error } = await supabaseAdmin
    .from("driver_business_links")
    .select(`
      business_id,
      business_profile:business_id (
        id,
        business_name,
        logo_url,
        address
      )
    `)
    .eq("driver_id", driverId);

  if (error || !data) return [];

  return data.map((row) => ({
    id:           row.business_profile?.id ?? row.business_id,
    businessName: row.business_profile?.business_name ?? "Unknown",
    logoUrl:      row.business_profile?.logo_url ?? null,
    address:      row.business_profile?.address  ?? null,
  }));
}

// ─── POST /api/driver/auth/login ──────────────────────────────────────────────

driverAuthRouter.post("/login", async (req, res) => {
  try {
    const { phone: rawPhone, password } = req.body ?? {};

    if (!rawPhone || !password) {
      return res.status(400).json({ success: false, error: "phone and password are required" });
    }

    // Normalize phone — strip spaces and ensure E.164 format
    let phone = String(rawPhone).trim().replace(/\s+/g, "");
    if (!phone.startsWith("+")) phone = `+91${phone}`;

    // Look up driver
    const { data: driver, error: dbErr } = await supabaseAdmin
      .from("drivers")
      .select("id, phone, name, password_hash, is_profile_complete, is_active")
      .eq("phone", phone)
      .maybeSingle();

    if (dbErr) {
      console.error("[driver/login] DB error:", dbErr.message);
      return res.status(500).json({ success: false, error: "Database error" });
    }

    if (!driver) {
      return res.status(401).json({ success: false, error: "Invalid phone or password" });
    }

    if (!driver.is_active) {
      return res.status(403).json({ success: false, error: "Account is inactive. Contact admin." });
    }

    // Verify password
    const valid = await verifyPassword(String(password), driver.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Invalid phone or password" });
    }

    // Generate session token (30 days)
    const token = generateToken();
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { error: sessionErr } = await supabaseAdmin
      .from("driver_sessions")
      .insert({ driver_id: driver.id, token, expires_at });

    if (sessionErr) {
      console.error("[driver/login] session insert error:", sessionErr.message);
      return res.status(500).json({ success: false, error: "Failed to create session" });
    }

    const businesses = await getDriverBusinesses(driver.id);

    return res.json({
      success: true,
      token,
      driver: {
        id:                  driver.id,
        phone:               driver.phone,
        name:                driver.name ?? null,
        is_profile_complete: driver.is_profile_complete,
      },
      businesses,
    });
  } catch (e) {
    console.error("[POST /driver/auth/login]", e);
    return res.status(500).json({ success: false, error: "Login failed" });
  }
});

// ─── PUT /api/driver/auth/setup ───────────────────────────────────────────────

driverAuthRouter.put("/setup", requireDriverToken, async (req, res) => {
  try {
    const driver = req.driverUser;

    const { name, password, vehicle_details, license_number } = req.body ?? {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({ success: false, error: "name is required (min 2 chars)" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ success: false, error: "password is required (min 6 chars)" });
    }

    const password_hash = await hashPassword(password);

    const patch = {
      name:                name.trim(),
      password_hash,
      is_profile_complete: true,
      updated_at:          new Date().toISOString(),
    };

    if (vehicle_details && typeof vehicle_details === "string") {
      patch.vehicle_details = vehicle_details.trim();
    }
    if (license_number && typeof license_number === "string") {
      patch.license_number = license_number.trim();
    }

    const { data: updated, error } = await supabaseAdmin
      .from("drivers")
      .update(patch)
      .eq("id", driver.id)
      .select("id, phone, name, vehicle_details, license_number, is_profile_complete")
      .maybeSingle();

    if (error || !updated) {
      console.error("[driver/setup]", error?.message);
      return res.status(500).json({ success: false, error: "Failed to update profile" });
    }

    return res.json({
      success: true,
      driver: {
        id:                  updated.id,
        phone:               updated.phone,
        name:                updated.name,
        vehicle_details:     updated.vehicle_details,
        license_number:      updated.license_number,
        is_profile_complete: updated.is_profile_complete,
      },
    });
  } catch (e) {
    console.error("[PUT /driver/auth/setup]", e);
    return res.status(500).json({ success: false, error: "Setup failed" });
  }
});

// ─── GET /api/driver/auth/me ──────────────────────────────────────────────────

driverAuthRouter.get("/me", requireDriverToken, async (req, res) => {
  try {
    const driver     = req.driverUser;
    const businesses = await getDriverBusinesses(driver.id);

    return res.json({
      success: true,
      driver: {
        id:                  driver.id,
        phone:               driver.phone,
        name:                driver.name ?? null,
        vehicle_details:     driver.vehicle_details ?? null,
        license_number:      driver.license_number  ?? null,
        is_profile_complete: driver.is_profile_complete,
      },
      businesses,
    });
  } catch (e) {
    console.error("[GET /driver/auth/me]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch profile" });
  }
});

// ─── POST /api/driver/auth/logout ─────────────────────────────────────────────

driverAuthRouter.post("/logout", requireDriverToken, async (req, res) => {
  try {
    await supabaseAdmin
      .from("driver_sessions")
      .delete()
      .eq("token", req.driverSession.token);

    return res.json({ success: true });
  } catch (e) {
    console.error("[POST /driver/auth/logout]", e);
    return res.status(500).json({ success: false, error: "Logout failed" });
  }
});

// ─── PUT /api/driver/auth/change-password ─────────────────────────────────────

driverAuthRouter.put("/change-password", requireDriverToken, async (req, res) => {
  try {
    const driver = req.driverUser;
    const { old_password, new_password } = req.body ?? {};

    if (!old_password || !new_password) {
      return res.status(400).json({ success: false, error: "old_password and new_password are required" });
    }
    if (typeof new_password !== "string" || new_password.length < 6) {
      return res.status(400).json({ success: false, error: "new_password must be at least 6 characters" });
    }

    // Verify current password
    const valid = await verifyPassword(String(old_password), driver.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: "Current password is incorrect" });
    }

    const new_hash = await hashPassword(new_password);

    const { error } = await supabaseAdmin
      .from("drivers")
      .update({ password_hash: new_hash, updated_at: new Date().toISOString() })
      .eq("id", driver.id);

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, message: "Password changed successfully" });
  } catch (e) {
    console.error("[PUT /driver/auth/change-password]", e);
    return res.status(500).json({ success: false, error: "Failed to change password" });
  }
});
