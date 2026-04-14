import { supabaseAdmin } from "../../lib/supabase.js";
import { supabaseAnon } from "../../lib/supabaseAnon.js";

/**
 * Requires a valid `Authorization: Bearer <access_token>`.
 * Attaches req.authUser and req.authProfile (with role).
 * Does NOT require admin — any authenticated user passes.
 */
export async function requireAuth(req, res, next) {
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
      console.error("[requireAuth] profiles", profileError);
      return res.status(500).json({
        success: false,
        error: "Could not verify permissions",
      });
    }

    req.authUser = user;
    req.authProfile = profile;
    next();
  } catch (e) {
    console.error("[requireAuth]", e);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
}
