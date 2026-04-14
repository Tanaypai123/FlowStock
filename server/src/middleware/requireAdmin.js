import { supabaseAdmin } from "../../lib/supabase.js";
import { supabaseAnon } from "../../lib/supabaseAnon.js";

/**
 * Requires `Authorization: Bearer <access_token>` and profiles.role = admin.
 */
export async function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization;
    const token =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice(7).trim()
        : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: "Missing or invalid Authorization header",
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session",
      });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[requireAdmin] profiles", profileError);
      return res.status(500).json({
        success: false,
        error: "Could not verify permissions",
      });
    }

    if (profile?.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Admin access required",
      });
    }

    req.adminUser = user;
    next();
  } catch (e) {
    console.error("[requireAdmin]", e);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
