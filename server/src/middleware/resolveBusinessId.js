import { supabaseAdmin } from "../../lib/supabase.js";

/**
 * resolveBusinessId middleware
 *
 * Reads the business context from incoming requests and attaches:
 *   req.businessId      — the business_profile UUID (= id column)
 *   req.businessAdminId — the admin_id (owner) of that business
 *
 * Priority:
 *   1. x-business-id header (set by customerApi / adminApi automatically)
 *   2. businessId query param (?businessId=xxx)
 *
 * Security:
 *   After resolving the business, verifies that the calling user belongs to
 *   it via user_businesses. Returns 403 if not a member.
 *   This prevents x-business-id spoofing attacks.
 *
 * If neither header nor query param is provided → leaves req.businessId = null.
 * If provided but not found in DB → responds 404.
 * If user is not a member → responds 403.
 */
export async function resolveBusinessId(req, res, next) {
  const rawId =
    req.headers["x-business-id"] ||
    req.query.businessId ||
    null;

  if (!rawId) {
    req.businessId      = null;
    req.businessAdminId = null;
    return next();
  }

  // ── 1. Validate the business exists ────────────────────────────────────────
  try {
    const { data, error } = await supabaseAdmin
      .from("business_profile")
      .select("id, admin_id")
      .eq("id", rawId)
      .maybeSingle();

    if (error) {
      console.error("[resolveBusinessId]", error.message);
      return res.status(500).json({ success: false, error: "Failed to resolve business" });
    }

    if (!data) {
      return res.status(404).json({ success: false, error: "Business not found" });
    }

    req.businessId      = data.id;
    req.businessAdminId = data.admin_id;

    // ── 2. Verify calling user is a member of this business ──────────────────
    // Skip membership check for unauthenticated requests — the downstream
    // requireAuth / requireAdmin middleware will handle auth enforcement.
    const userId = req.authUser?.id ?? req.adminUser?.id;
    if (userId) {
      // Fast path: if the calling user IS the business admin, always allow.
      if (data.admin_id === userId) {
        console.log("[resolveBusinessId] owner access — businessId:", req.businessId);
        return next();
      }

      // Otherwise check user_businesses membership
      const { data: membership, error: mbErr } = await supabaseAdmin
        .from("user_businesses")
        .select("id, role")
        .eq("user_id", userId)
        .eq("business_id", rawId)
        .maybeSingle();

      if (mbErr) {
        console.error("[resolveBusinessId] membership check error:", mbErr.message);
        return res.status(500).json({ success: false, error: "Failed to verify membership" });
      }

      if (!membership) {
        console.warn("[resolveBusinessId] 403 — user", userId, "not a member of business", rawId);
        return res.status(403).json({
          success: false,
          error: "You are not a member of this business",
        });
      }

      console.log("[resolveBusinessId] member access — role:", membership.role, "businessId:", req.businessId);
    } else {
      // No auth user resolved yet (auth middleware runs after this in some cases)
      // Log and continue — the auth middleware downstream will reject if needed
      console.log("[resolveBusinessId] businessId:", req.businessId, "adminId:", req.businessAdminId, "(pre-auth)");
    }

    next();
  } catch (e) {
    console.error("[resolveBusinessId] unexpected:", e);
    return res.status(500).json({ success: false, error: "Internal error resolving business" });
  }
}

/**
 * requireBusinessId — use after resolveBusinessId.
 * Returns 400 if no businessId was resolved.
 */
export function requireBusinessId(req, res, next) {
  if (!req.businessId) {
    return res.status(400).json({
      success: false,
      error: "x-business-id header (or businessId query param) is required",
    });
  }
  next();
}
