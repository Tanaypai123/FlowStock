import { supabaseAdmin } from "../../lib/supabase.js";
import { supabaseAnon } from "../../lib/supabaseAnon.js";

/**
 * Middleware: Allows access ONLY to users with role = 'super_admin' in profiles.
 * Returns 403 immediately with no extra info if access is denied.
 */
export async function superAdminOnly(req, res, next) {
  try {
    const header = req.headers.authorization;
    const token =
      typeof header === "string" && header.startsWith("Bearer ")
        ? header.slice(7).trim()
        : null;

    // No token → flat 403, no hint about what's missing
    if (!token) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Verify the JWT with Supabase
    const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);

    if (authError || !user) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Check role in profiles table
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || profile?.role !== "super_admin") {
      return res.status(403).json({ error: "Access denied" });
    }

    req.superAdmin = true;
    req.superAdminUser = user;
    next();
  } catch {
    // Never leak internal errors from the dev console guard
    return res.status(403).json({ error: "Access denied" });
  }
}
