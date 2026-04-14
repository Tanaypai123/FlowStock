import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireAuth } from "../middleware/requireAuth.js";

/** Generates a random 6-char uppercase alphanumeric business join code.
 *  Excludes confusable chars: 0, O, I, L, 1 */
function generateBusinessCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

/**
 * Business onboarding / setup router.
 * Mounted at: /api/business
 *
 * Uses requireAuth (not requireAdmin) so that first-time Google OAuth admins
 * can create their business profile immediately after login — before the admin
 * dashboard is accessible.
 */
export const businessSetupRouter = Router();

// ─── PUBLIC ROUTES (no auth required) ────────────────────────────────────────

/** GET /api/business/info/:code — look up a business by its join code (public) */
businessSetupRouter.get("/info/:code", async (req, res) => {
  try {
    const { code } = req.params;
    if (!code?.trim()) {
      return res.status(400).json({ success: false, error: "Business code is required" });
    }

    const { data, error } = await supabaseAdmin
      .from("business_profile")
      .select("id, business_name, business_code, logo_url, business_type, address")
      .eq("business_code", code.trim().toUpperCase())
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!data) return res.status(404).json({ success: false, error: "Business not found" });

    return res.json({
      success:      true,
      businessId:   data.id,
      businessName: data.business_name,
      businessCode: data.business_code,
      logoUrl:      data.logo_url ?? null,
      businessType: data.business_type ?? null,
      address:      data.address ?? null,
    });
  } catch (e) {
    console.error("[GET /business/info/:code]", e);
    return res.status(500).json({ success: false, error: "Failed to look up business" });
  }
});

// ─── AUTHENTICATED ROUTES ─────────────────────────────────────────────────────
// All routes below require a valid session
businessSetupRouter.use(requireAuth);

const BP_COLS =
  "id, admin_id, business_name, owner_name, phone, email, address, " +
  "warehouse_location, business_type, gst_number, logo_url, brand_color, " +
  "updates_phone, created_at, updated_at";

// ─── POST /api/business/setup ─────────────────────────────────────────────────
// Creates or updates the business profile for the authenticated user.
// Accepts a simpler payload than the full admin PUT (owner_name + updates_phone
// are auto-derived from the session user when not provided).

businessSetupRouter.post("/setup", async (req, res) => {
  try {
    const userId = req.authUser?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const {
      business_name,
      address,
      phone,
      gst_number,
      warehouse_lat,
      warehouse_lng,
      // Optional extras
      owner_name: rawOwnerName,
      business_type,
    } = req.body ?? {};

    // ── Validation ────────────────────────────────────────────────────────────
    if (!business_name?.trim()) {
      return res.status(400).json({ success: false, error: "business_name is required" });
    }
    if (!address?.trim()) {
      return res.status(400).json({ success: false, error: "address is required" });
    }
    if (!phone?.trim()) {
      return res.status(400).json({ success: false, error: "phone is required" });
    }

    // Build warehouse_location string from lat/lng if provided
    let warehouseLocation = null;
    const lat = parseFloat(warehouse_lat);
    const lng = parseFloat(warehouse_lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      warehouseLocation = `${lat},${lng}`;
    }

    // Derive owner_name from Google user metadata if not provided
    const userMeta    = req.authUser.user_metadata ?? {};
    const ownerName   = rawOwnerName?.trim() ||
                        userMeta.full_name?.trim() ||
                        userMeta.name?.trim() ||
                        "Business Owner";

    const updatesPhone = phone.trim(); // same as contact phone for onboarding

    const VALID_TYPES = new Set(["Retail", "Wholesale", "Distributor", "Manufacturer"]);

    const payload = {
      admin_id:           userId,
      business_name:      business_name.trim(),
      owner_name:         ownerName,
      phone:              phone.trim(),
      email:              req.authUser.email || null,
      address:            address.trim(),
      warehouse_location: warehouseLocation,
      business_type:      business_type && VALID_TYPES.has(business_type) ? business_type : null,
      gst_number:         gst_number?.trim() || null,
      brand_color:        "#6366f1",
      updates_phone:      updatesPhone,
      updated_at:         new Date().toISOString(),
      // Auto-generate a 6-char join code on new creation.
      // On conflict (update) the existing code is preserved via ignoreDuplicates.
      business_code:      generateBusinessCode(),
    };

    // UPSERT — safe to call on re-onboarding or if admin re-visits.
    // ignoreDuplicates: false → merges columns on conflict.
    // We exclude business_code from update so existing codes are never overwritten.
    const { data, error } = await supabaseAdmin
      .from("business_profile")
      .upsert(payload, { onConflict: "admin_id", ignoreDuplicates: false })
      .select(BP_COLS + ", business_code")
      .maybeSingle();

    if (error) {
      console.error("[POST /business/setup] upsert:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    const businessId = data?.id ?? null;

    // ── Map user → business in user_businesses ────────────────────────────────
    console.log("[business/setup] USER ID:", userId);
    console.log("[business/setup] BUSINESS ID:", businessId);

    if (!businessId) {
      console.error("[business/setup] No businessId returned from upsert — cannot create mapping");
      return res.status(500).json({ success: false, error: "Business ID missing after insert" });
    }

    // Use plain INSERT (not upsert) so we can distinguish real errors from duplicates.
    // supabaseAdmin bypasses RLS — no permission issues.
    const { error: mappingError } = await supabaseAdmin
      .from("user_businesses")
      .insert({ user_id: userId, business_id: businessId, role: "admin" });

    if (mappingError) {
      const isDuplicate =
        mappingError.code === "23505" ||                        // Postgres unique violation
        mappingError.message.includes("duplicate") ||
        mappingError.message.includes("unique") ||
        mappingError.message.includes("already exists");

      if (isDuplicate) {
        // Already mapped — not an error, safe to continue
        console.log("[business/setup] user_businesses: already mapped, skipping");
      } else {
        console.error("[business/setup] user_businesses insert FAILED:", mappingError.message, mappingError.code);
        return res.status(500).json({
          success: false,
          error: `Business created but user mapping failed: ${mappingError.message}`,
        });
      }
    } else {
      console.log("[business/setup] user_businesses row inserted ✅ userId:", userId, "businessId:", businessId);
    }

    return res.status(201).json({
      success:      true,
      businessId,
      businessCode: null, // reserved for future business code feature
      data,
    });

  } catch (e) {
    console.error("[POST /business/setup]", e);
    return res.status(500).json({ success: false, error: "Failed to create business" });
  }
});

// ─── GET /api/business/me ─────────────────────────────────────────────────────
// Returns the current user's business profile (if any).
// Useful for AuthCallback to check if a business exists without requireAdmin.

businessSetupRouter.get("/me", async (req, res) => {
  try {
    const userId = req.authUser?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { data, error } = await supabaseAdmin
      .from("business_profile")
      .select(BP_COLS + ", business_code")
      .eq("admin_id", userId)
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.json({ success: true, data: data ?? null });
  } catch (e) {
    console.error("[GET /business/me]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch business" });
  }
});

// ─── POST /api/business/join ──────────────────────────────────────────────────
// Customer joins a business using its businessCode.
// Handles duplicates silently — just returns existing mapping.

businessSetupRouter.post("/join", async (req, res) => {
  try {
    const userId = req.authUser?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { businessCode } = req.body ?? {};
    if (!businessCode?.trim()) {
      return res.status(400).json({ success: false, error: "businessCode is required" });
    }

    // 1. Find the business by code
    const { data: biz, error: bizErr } = await supabaseAdmin
      .from("business_profile")
      .select("id, business_name")
      .eq("business_code", businessCode.trim().toUpperCase())
      .maybeSingle();

    if (bizErr) return res.status(500).json({ success: false, error: bizErr.message });
    if (!biz)   return res.status(404).json({ success: false, error: "Business not found" });

    const businessId = biz.id;

    // 2. Check if already joined
    const { data: existing } = await supabaseAdmin
      .from("user_businesses")
      .select("id, role")
      .eq("user_id", userId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (existing) {
      // Already a member — silently return success
      console.log("[business/join] Already mapped:", userId, "→", businessId);
      return res.json({
        success:      true,
        businessId,
        businessName: biz.business_name,
        alreadyJoined: true,
      });
    }

    // 3. Insert new membership as customer
    const { error: insertErr } = await supabaseAdmin
      .from("user_businesses")
      .insert({ user_id: userId, business_id: businessId, role: "customer" });

    if (insertErr) {
      // Handle race-condition duplicate
      const isDup = insertErr.code === "23505" || insertErr.message.includes("duplicate");
      if (!isDup) {
        console.error("[business/join] insert failed:", insertErr.message);
        return res.status(500).json({ success: false, error: insertErr.message });
      }
    }

    console.log("[business/join] ✅ Joined:", userId, "→", businessId);
    return res.json({
      success:      true,
      businessId,
      businessName: biz.business_name,
    });

  } catch (e) {
    console.error("[POST /business/join]", e);
    return res.status(500).json({ success: false, error: "Failed to join business" });
  }
});

// ─── GET /api/business/my-businesses ─────────────────────────────────────────
// Returns all businesses the authenticated user belongs to, with their role.

businessSetupRouter.get("/my-businesses", async (req, res) => {
  try {
    const userId = req.authUser?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { data, error } = await supabaseAdmin
      .from("user_businesses")
      .select("id, role, business_id, business_profile(id, business_name, logo_url, address)")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) return res.status(500).json({ success: false, error: error.message });

    const businesses = (data ?? []).map((row) => ({
      mappingId:    row.id,
      role:         row.role,
      businessId:   row.business_profile?.id   ?? row.business_id,
      businessName: row.business_profile?.business_name ?? "Unknown",
      logoUrl:      row.business_profile?.logo_url      ?? null,
      address:      row.business_profile?.address       ?? null,
    }));

    return res.json({ success: true, data: businesses });
  } catch (e) {
    console.error("[GET /business/my-businesses]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch businesses" });
  }
});
