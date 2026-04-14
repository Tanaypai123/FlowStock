/**
 * complaints.js
 * ─────────────────────────────────────────────────────────────────────────────
 * POST   /api/complaints              — customer raises a complaint (requireAuth)
 * POST   /api/complaints/upload-image — upload proof image (requireAuth, raw binary)
 * GET    /api/complaints/mine         — customer views their own (requireAuth)
 * GET    /api/complaints/count        — admin gets open count    (requireAdmin)
 * GET    /api/complaints              — admin lists all           (requireAdmin)
 * PUT    /api/complaints/:id/status   — admin changes status     (requireAdmin)
 */

import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const complaintsRouter = Router();

/**
 * Look up the business_profile.id for the given admin user.
 * Returns null if the admin has no business profile yet.
 */
async function getBusinessIdForAdmin(adminUserId) {
  if (!adminUserId) return null;
  const { data } = await supabaseAdmin
    .from("business_profile")
    .select("id")
    .eq("admin_id", adminUserId)
    .maybeSingle();
  return data?.id ?? null;
}

// ─── Helper: send admin WhatsApp alert on new complaint ───────────────────────

async function notifyAdminNewComplaint(customerName, preview) {
  const adminPhone = process.env.ADMIN_PHONE?.trim();
  const WA_FROM    = process.env.TWILIO_WHATSAPP_FROM?.trim();
  const SID        = process.env.TWILIO_ACCOUNT_SID?.trim();
  const TOKEN      = process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!adminPhone || !WA_FROM || !SID || !TOKEN) {
    console.warn("[Complaints] Twilio env missing — admin alert skipped");
    return;
  }

  let phone = adminPhone.replace(/[\s\-().]/g, "");
  if (!phone.startsWith("+")) {
    phone = /^\d{10}$/.test(phone) ? `+91${phone}` : `+${phone}`;
  }

  const body =
    `📣 *New Complaint* — FlowStock\n\n` +
    `From: *${customerName}*\n` +
    `Message: "${preview.slice(0, 120)}${preview.length > 120 ? "…" : ""}"\n\n` +
    `Open the admin panel to review and respond.`;

  try {
    const mod    = await import("twilio");
    const client = (mod.default ?? mod)(SID, TOKEN);
    const msg    = await client.messages.create({
      from: WA_FROM,
      to:   `whatsapp:${phone}`,
      body,
    });
    console.log(`[Complaints] ✅ Admin alert sent (SID: ${msg.sid})`);
  } catch (err) {
    console.error(`[Complaints] ❌ Admin alert failed: ${err?.message}`);
  }
}

// ─── POST /api/complaints/upload-image — raw binary upload ───────────────────

complaintsRouter.post("/upload-image", requireAuth, async (req, res) => {
  try {
    const user = req.authUser;
    if (!user?.id) return res.status(401).json({ success: false, error: "Unauthenticated" });

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const fileBuffer = Buffer.concat(chunks);

    if (!fileBuffer.length)
      return res.status(400).json({ success: false, error: "No file data received" });

    const contentType = req.headers["content-type"] ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const storagePath = `${user.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("complaint-images")
      .upload(storagePath, fileBuffer, { contentType, upsert: false });

    if (uploadError) {
      console.error("[POST /complaints/upload-image]", uploadError.message);
      return res.status(500).json({ success: false, error: uploadError.message });
    }

    const { data: publicData } = supabaseAdmin.storage
      .from("complaint-images")
      .getPublicUrl(storagePath);

    return res.json({ success: true, url: publicData?.publicUrl ?? null });
  } catch (e) {
    console.error("[POST /complaints/upload-image]", e);
    return res.status(500).json({ success: false, error: "Image upload failed" });
  }
});

// ─── POST /api/complaints — customer raises a complaint (with business stamp) ───

complaintsRouter.post("/", requireAuth, async (req, res) => {
  try {
    const user = req.authUser;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Unauthenticated" });
    }

    const {
      message,
      order_id,
      product_name,
      issue_type,
      image_urls,
      business_id,   // optional: passed from client via x-business-id resolution
    } = req.body ?? {};

    if (typeof message !== "string" || message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: "message must be at least 10 characters",
      });
    }

    const insertPayload = {
      customer_id:  user.id,
      message:      message.trim(),
      status:       "open",
      updated_at:   new Date().toISOString(),
    };

    // Optional structured fields
    if (order_id && typeof order_id === "string") insertPayload.order_id = order_id;
    if (product_name && typeof product_name === "string") insertPayload.product_name = product_name.trim();
    if (issue_type && typeof issue_type === "string") insertPayload.issue_type = issue_type.trim();
    if (Array.isArray(image_urls) && image_urls.length > 0) {
      insertPayload.image_urls = image_urls.filter((u) => typeof u === "string").slice(0, 3);
    }

    // Stamp business_id — derive from order_id if possible, else use body value
    let resolvedBusinessId = (business_id && typeof business_id === "string") ? business_id : null;
    if (!resolvedBusinessId && order_id && typeof order_id === "string") {
      try {
        const { data: orderRow } = await supabaseAdmin
          .from("orders")
          .select("admin_id")
          .eq("id", order_id)
          .maybeSingle();
        if (orderRow?.admin_id) {
          const { data: bp } = await supabaseAdmin
            .from("business_profile")
            .select("id")
            .eq("admin_id", orderRow.admin_id)
            .maybeSingle();
          resolvedBusinessId = bp?.id ?? null;
        }
      } catch { /* non-fatal */ }
    }
    if (resolvedBusinessId) insertPayload.business_id = resolvedBusinessId;

    const { data, error } = await supabaseAdmin
      .from("complaints")
      .insert(insertPayload)
      .select("id, message, status, order_id, product_name, issue_type, image_urls, created_at")
      .single();

    if (error) return res.status(400).json({ success: false, error: error.message });

    // Resolve customer display name for the alert
    let customerName = "Customer";
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.display_name?.trim()) customerName = profile.display_name.trim();
      else {
        const { data: au } = await supabaseAdmin.auth.admin.getUserById(user.id);
        customerName =
          au?.user?.user_metadata?.full_name?.trim() ||
          au?.user?.user_metadata?.name?.trim() ||
          au?.user?.phone?.replace(/^\+91/, "") ||
          au?.user?.email?.split("@")[0] ||
          "Customer";
      }
    } catch { /* non-critical */ }

    const alertPreview = `[${issue_type ?? "Issue"}] ${product_name ? `${product_name}: ` : ""}${message.trim()}`;
    notifyAdminNewComplaint(customerName, alertPreview).catch(console.error);

    return res.status(201).json({ success: true, data });
  } catch (e) {
    console.error("[POST /complaints]", e);
    return res.status(500).json({ success: false, error: "Failed to submit complaint" });
  }
});

// ─── GET /api/complaints/mine — customer views their own complaints ────────────

complaintsRouter.get("/mine", requireAuth, async (req, res) => {
  try {
    const user = req.authUser;
    if (!user?.id) return res.status(401).json({ success: false, error: "Unauthenticated" });

    const { data, error } = await supabaseAdmin
      .from("complaints")
      .select("id, message, status, order_id, product_name, issue_type, image_urls, admin_comment, resolution_message, resolved_at, created_at, updated_at")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: data ?? [] });
  } catch (e) {
    console.error("[GET /complaints/mine]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch complaints" });
  }
});

// ─── GET /api/complaints/count — admin: open complaint count scoped to business

complaintsRouter.get("/count", requireAdmin, async (req, res) => {
  try {
    const businessId = await getBusinessIdForAdmin(req.adminUser?.id);

    let query = supabaseAdmin
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .eq("status", "open");

    if (businessId) query = query.eq("business_id", businessId);

    const { count, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data: { open: count ?? 0 } });
  } catch (e) {
    console.error("[GET /complaints/count]", e);
    return res.status(500).json({ success: false, error: "Failed to count complaints" });
  }
});

// ─── GET /api/complaints — admin: complaints scoped to business ───────────────

complaintsRouter.get("/", requireAdmin, async (req, res) => {
  try {
    const businessId = await getBusinessIdForAdmin(req.adminUser?.id);

    let query = supabaseAdmin
      .from("complaints")
      .select("id, customer_id, message, status, order_id, product_name, issue_type, image_urls, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (businessId) query = query.eq("business_id", businessId);

    const { data: rows, error } = await query;

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Resolve customer names from profiles
    const custIds = [...new Set((rows ?? []).map((r) => r.customer_id).filter(Boolean))];
    const nameMap = new Map();
    if (custIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", custIds);

      for (const p of profiles ?? []) {
        nameMap.set(p.id, p.display_name?.trim() || null);
      }

      for (const uid of custIds) {
        if (!nameMap.get(uid)) {
          try {
            const { data: au } = await supabaseAdmin.auth.admin.getUserById(uid);
            const u = au?.user;
            const n =
              u?.user_metadata?.full_name?.trim() ||
              u?.user_metadata?.name?.trim() ||
              (u?.phone ? u.phone.replace(/^\+91/, "") : null) ||
              u?.email?.split("@")[0] ||
              null;
            if (n) nameMap.set(uid, n);
          } catch { /* skip */ }
        }
      }
    }

    const enriched = (rows ?? []).map((r) => ({
      ...r,
      customer_name: nameMap.get(r.customer_id) ?? "Customer",
    }));

    return res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /complaints]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch complaints" });
  }
});

// ─── PUT /api/complaints/:id/status — admin changes status ────────────────────

complaintsRouter.put("/:id/status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body ?? {};

    const VALID = new Set(["open", "in_review", "resolved"]);
    if (!VALID.has(status)) {
      return res.status(400).json({
        success: false,
        error: "status must be open, in_review, or resolved",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("complaints")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, customer_id, message, status, order_id, product_name, issue_type, image_urls, admin_comment, resolution_message, resolved_at, created_at, updated_at")
      .maybeSingle();

    if (error) return res.status(400).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Complaint not found" });

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /complaints/:id/status]", e);
    return res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

// ─── PUT /api/complaints/:id/resolve — admin resolves with comment ────────────

complaintsRouter.put("/:id/resolve", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_comment, resolution_message } = req.body ?? {};

    const patch = {
      status:             "resolved",
      updated_at:         new Date().toISOString(),
      resolved_at:        new Date().toISOString(),
    };

    if (typeof admin_comment === "string") patch.admin_comment = admin_comment.trim();
    if (typeof resolution_message === "string") patch.resolution_message = resolution_message.trim();

    const { data, error } = await supabaseAdmin
      .from("complaints")
      .update(patch)
      .eq("id", id)
      .select("id, customer_id, status, admin_comment, resolution_message, resolved_at, updated_at")
      .maybeSingle();

    if (error) return res.status(400).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Complaint not found" });

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /complaints/:id/resolve]", e);
    return res.status(500).json({ success: false, error: "Failed to resolve complaint" });
  }
});
