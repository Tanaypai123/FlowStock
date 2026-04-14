/**
 * bugs.js — Bug report routes
 * POST /api/bugs/upload-screenshot  — uploads a base64-encoded image to Supabase storage
 * POST /api/bugs/report             — saves a bug report to the bug_reports table
 *
 * Auth: accepts BOTH Supabase JWT (admin/customer) AND driver session token.
 * Images sent as base64 JSON — no multer or binary parsing needed.
 */
import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { supabaseAnon } from "../../lib/supabaseAnon.js";

export const bugsRouter = Router();

// ─── Dual-auth middleware ────────────────────────────────────────────────────
async function authenticateAny(req, res, next) {
  const authHeader = req.headers.authorization ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "Missing Authorization header" });
  }
  const token = authHeader.slice(7).trim();

  try {
    // 1. Try driver session token first
    const { data: session, error: sErr } = await supabaseAdmin
      .from("driver_sessions")
      .select("driver_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!sErr && session) {
      if (new Date(session.expires_at) < new Date()) {
        return res.status(401).json({ success: false, error: "Driver token expired" });
      }
      req.authType = "driver";
      req.authId   = session.driver_id;
      return next();
    }

    // 2. Fall back to Supabase JWT (validate with anon key client)
    const { data: authData, error: uErr } = await supabaseAnon.auth.getUser(token);
    if (!uErr && authData?.user) {
      req.authType = "supabase";
      req.authId   = authData.user.id;
      return next();
    }

    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  } catch (err) {
    console.error("[bugs/authenticateAny]", err);
    return res.status(500).json({ success: false, error: "Authentication error" });
  }
}

// ─── POST /api/bugs/upload-screenshot ────────────────────────────────────────
// Body: { base64: "data:image/png;base64,iVBOR...", fileName: "shot.png" }
// Returns: { url: "https://..." }
bugsRouter.post("/upload-screenshot", authenticateAny, async (req, res) => {
  try {
    const { base64, fileName } = req.body ?? {};
    if (!base64) {
      return res.status(400).json({ success: false, error: "Missing base64 image data" });
    }

    // Parse data URL: "data:<mime>;base64,<data>"
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ success: false, error: "Invalid base64 format — expected data:<mime>;base64,<data>" });
    }

    const mimeType = match[1];
    const rawData  = match[2];

    if (!mimeType.startsWith("image/")) {
      return res.status(400).json({ success: false, error: "Only image files are accepted" });
    }

    const fileBuffer = Buffer.from(rawData, "base64");
    const ext        = (fileName?.split(".").pop() ?? mimeType.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    const storagePath = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("bug-screenshots")
      .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

    if (uploadErr) {
      console.error("[POST /api/bugs/upload-screenshot] storage:", uploadErr.message);
      return res.status(500).json({ success: false, error: uploadErr.message });
    }

    const { data: pub } = supabaseAdmin.storage
      .from("bug-screenshots")
      .getPublicUrl(storagePath);

    return res.json({ success: true, url: pub.publicUrl });
  } catch (err) {
    console.error("[POST /api/bugs/upload-screenshot]", err);
    return res.status(500).json({ success: false, error: "Screenshot upload failed" });
  }
});

// ─── POST /api/bugs/report ───────────────────────────────────────────────────
bugsRouter.post("/report", authenticateAny, async (req, res) => {
  try {
    const {
      title,
      category,
      severity,
      description,
      image_urls,
      device_info,
      page_url,
      reported_by_type,
      business_id,
    } = req.body ?? {};

    if (!title || !category || !severity || !description) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: title, category, severity, description",
      });
    }

    const VALID_TYPES = ["admin", "customer", "driver"];
    if (!VALID_TYPES.includes(reported_by_type)) {
      return res.status(400).json({ success: false, error: "Invalid reported_by_type" });
    }

    const { data, error } = await supabaseAdmin
      .from("bug_reports")
      .insert({
        title:            title.trim(),
        category,
        severity,
        description:      description.trim(),
        image_urls:       Array.isArray(image_urls) ? image_urls : [],
        device_info:      device_info ?? {},
        page_url:         page_url ?? null,
        reported_by_type,
        reported_by_id:   req.authId,
        business_id:      business_id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/bugs/report] insert:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, bugId: data.id, message: "Bug reported successfully" });
  } catch (err) {
    console.error("[POST /api/bugs/report]", err);
    return res.status(500).json({ success: false, error: "Failed to submit bug report" });
  }
});
