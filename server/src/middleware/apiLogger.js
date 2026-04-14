import { supabaseAdmin } from "../../lib/supabase.js";

/**
 * Fire-and-forget API request logger.
 * Inserts a row into api_logs after every response.
 * Never throws — logging must never break a response.
 *
 * Skips:
 *  - /api/dev/* routes (avoid logging loops)
 *  - /health, /api/health (polling noise)
 *  - Any static file routes
 */
export function apiLogger(req, res, next) {
  const startMs = Date.now();
  const path    = req.path ?? "";

  // Skip noisy / loopback routes
  if (
    path.startsWith("/dev") ||
    path.includes("/health") ||
    !path.startsWith("/api")
  ) {
    return next();
  }

  // Hook into the 'finish' event — fires after response is sent
  res.on("finish", () => {
    const responseTimeMs = Date.now() - startMs;
    const statusCode     = res.statusCode;

    const logRow = {
      method:           req.method,
      endpoint:         path,
      status_code:      statusCode,
      response_time_ms: responseTimeMs,
      business_id:      req.businessId ?? null,
      error_message:    statusCode >= 400 ? (res.locals?.errorMessage ?? null) : null,
      created_at:       new Date().toISOString(),
    };

    // Fire-and-forget — don't await, don't throw
    supabaseAdmin
      .from("api_logs")
      .insert(logRow)
      .then(({ error }) => {
        if (error) {
          // Only log if it's NOT a "relation does not exist" error (table not created yet)
          if (!error.message?.includes("relation") && !error.message?.includes("does not exist")) {
            console.error("[apiLogger] insert failed:", error.message);
          }
        }
      })
      .catch(() => { /* silently swallow */ });
  });

  next();
}
