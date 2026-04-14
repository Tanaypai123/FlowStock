import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireDriverAuth } from "../middleware/requireDriverAuth.js";
import { notifyOrderStatus } from "../services/notificationService.js";

export const driverRouter = Router();

// All routes require a valid driver session (phone+password token auth)
driverRouter.use(requireDriverAuth);

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id));
}

function requireDriver(req, res) {
  if (req.authProfile?.role !== "driver") {
    res.status(403).json({ success: false, error: "Driver access only" });
    return false;
  }
  return true;
}

// ─── GET /api/driver/businesses ───────────────────────────────────────────────
// Returns ALL businesses this driver belongs to (no LIMIT).
// No x-business-id required — this is a listing endpoint.
driverRouter.get("/businesses", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const driverId = req.authUser.id;

    const { data, error } = await supabaseAdmin
      .from("driver_business_links")
      .select(
        `business_id,
         business_profile:business_id (
           id, business_name, address, logo_url
         )`
      )
      .eq("driver_id", driverId);
      // NO .limit() — return ALL linked businesses

    if (error) {
      console.error("[GET /driver/businesses]", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }

    const businesses = (data ?? []).map((row) => ({
      id:           row.business_profile?.id   ?? row.business_id,
      businessName: row.business_profile?.business_name ?? "Unknown",
      address:      row.business_profile?.address  ?? null,
      logoUrl:      row.business_profile?.logo_url  ?? null,
    }));

    return res.json({ success: true, data: businesses });
  } catch (e) {
    console.error("[GET /driver/businesses]", e);
    return res.status(500).json({ success: false, error: "Failed to load businesses" });
  }
});

// ─── GET /api/driver/deliveries ───────────────────────────────────────────────
// Returns orders for this driver scoped to the selected business.
// req.businessId is already validated by requireDriverAuth middleware.
// Requires x-business-id header (validated upstream).
driverRouter.get("/deliveries", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;

    const driverId   = req.authUser.id;
    const businessId = req.businessId; // validated by requireDriverAuth
    const { status } = req.query;

    if (!businessId) {
      return res.status(400).json({
        success: false,
        error:   "x-business-id header is required to fetch deliveries",
      });
    }

    const ALLOWED = new Set(["confirmed", "dispatched", "out_for_delivery", "delivered"]);

    let query = supabaseAdmin
      .from("orders")
      .select(`
        id, status, region, customer_address,
        guest_customer_name, guest_customer_phone,
        delivery_lat, delivery_lng, delivery_notes,
        proof_url, verification_otp, verification_status,
        created_at, updated_at, customer_id, admin_id, business_id,
        order_line_items (
          id, quantity, unit_price, inventory_item_id,
          inventory_items ( name )
        )
      `)
      .eq("driver_id",   driverId)
      .order("created_at", { ascending: false });

    // ── Business isolation ─────────────────────────────────────────────────────
    // Resolve business_profile to get the admin_id that stamps orders for this business.
    // We always use admin_id as the primary scope (set on every order).
    const { data: bp } = await supabaseAdmin
      .from("business_profile")
      .select("id, admin_id")
      .eq("id", businessId)
      .maybeSingle();

    if (!bp?.admin_id) {
      // business not found — return empty safely
      return res.json({ success: true, data: [] });
    }

    // Filter by driver_id (already added) + admin_id for business scope
    query = query.eq("admin_id", bp.admin_id);

    if (status && ALLOWED.has(status)) {
      query = query.eq("status", status);
    } else {
      query = query.in("status", ["confirmed", "dispatched", "out_for_delivery", "delivered"]);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    // Enrich with customer profile names
    const customerIds = [...new Set((data ?? []).map((o) => o.customer_id).filter(Boolean))];
    let profileMap = {};
    if (customerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", customerIds);
      for (const p of profiles ?? []) profileMap[p.id] = p.display_name?.trim() ?? null;

      // Fallback to Supabase Auth metadata for registered customers without display_name
      const missing = customerIds.filter((id) => !profileMap[id]);
      for (const uid of missing) {
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(uid);
          const u = authUser?.user;
          const fallback =
            u?.user_metadata?.full_name?.trim() ||
            u?.user_metadata?.name?.trim()      ||
            (u?.phone ? u.phone.replace(/^\+91/, "") : null) ||
            u?.email?.split("@")[0]             ||
            null;
          if (fallback) profileMap[uid] = fallback;
        } catch { /* non-critical */ }
      }
    }

    const rows = (data ?? []).map((o) => {
      const customerName =
        (o.customer_id ? profileMap[o.customer_id] : null) ||
        o.guest_customer_name?.trim() ||
        "Guest";
      const shortId    = String(o.id).replace(/-/g, "").slice(0, 8).toUpperCase();
      const lineItems  = (o.order_line_items ?? []).map((li) => ({
        id:         li.id,
        name:       li.inventory_items?.name ?? "Unknown",
        quantity:   li.quantity,
        unit_price: li.unit_price,
      }));
      return {
        id:                  o.id,
        short_id:            shortId,
        status:              o.status,
        region:              o.region,
        customer_name:       customerName,
        customer_phone:      o.guest_customer_phone,
        customer_address:    o.customer_address,
        delivery_lat:        o.delivery_lat,
        delivery_lng:        o.delivery_lng,
        delivery_notes:      o.delivery_notes,
        proof_url:           o.proof_url,
        verification_otp:    o.verification_otp    ?? null,
        verification_status: o.verification_status ?? null,
        created_at:          o.created_at,
        updated_at:          o.updated_at,
        line_items:          lineItems,
      };
    });

    return res.json({ success: true, data: rows });
  } catch (e) {
    console.error("[GET /driver/deliveries]", e);
    return res.status(500).json({ success: false, error: "Failed to load deliveries" });
  }
});

// ─── PUT /api/driver/deliveries/:id/start ─────────────────────────────────────
// Driver starts a delivery → status: "dispatched"
driverRouter.put("/deliveries/:id/start", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    // Fetch ownership + phone fields needed for notification
    const { data: existing } = await supabaseAdmin
      .from("orders")
      .select("driver_id, status, customer_id, guest_customer_phone, guest_customer_name, admin_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) return res.status(404).json({ success: false, error: "Delivery not found" });
    if (existing.driver_id !== req.authUser.id)
      return res.status(403).json({ success: false, error: "Not your delivery" });
    if (existing.status === "cancelled")
      return res.status(409).json({ success: false, error: "Order was cancelled" });
    if (existing.status === "delivered")
      return res.status(409).json({ success: false, error: "Already delivered" });

    // Guard cross-business access: confirm this order belongs to the selected business
    if (req.businessId && existing.admin_id) {
      const { data: bpCheck } = await supabaseAdmin
        .from("business_profile")
        .select("id")
        .eq("id", req.businessId)
        .eq("admin_id", existing.admin_id)
        .maybeSingle();
      if (!bpCheck) {
        return res.status(403).json({ success: false, error: "Delivery does not belong to your selected business" });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({ status: "dispatched", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status, updated_at")
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // ── WhatsApp: dispatched notification ──────────────────────────────────
    // Use driver name from req.driverUser (already loaded by requireDriverAuth)
    const driverNameStart = req.driverUser?.name ?? req.authProfile?.display_name ?? "our driver";
    console.log("[Driver] 🚚 Start delivery route triggered");
    await notifyOrderStatus("dispatched", {
      id,
      short_id:             String(id).replace(/-/g, "").slice(0, 8).toUpperCase(),
      customer_id:          existing.customer_id,
      guest_customer_phone: existing.guest_customer_phone,
      customer_name:        existing.guest_customer_name ?? "Customer",
      driver_name:          driverNameStart,
      _source:              "driver/start",
    });

    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /driver/deliveries/:id/start]", e);
    return res.status(500).json({ success: false, error: "Failed to start delivery" });
  }
});

// ─── PUT /api/driver/orders/:id/out-for-delivery ──────────────────────────────
// Driver marks an order as "out for delivery".
// Triggers WhatsApp notification to customer with OTP.
// Requires role=driver. Does NOT need admin.
driverRouter.put("/orders/:id/out-for-delivery", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid order id" });

    const driverId = req.authUser.id;

    // Fetch order (must be dispatched + assigned to this driver)
    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, driver_id, customer_id, guest_customer_name, guest_customer_phone, verification_otp")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ success: false, error: fetchErr.message });
    if (!order)   return res.status(404).json({ success: false, error: "Order not found" });

    if (order.driver_id !== driverId) {
      return res.status(403).json({ success: false, error: "Not your order" });
    }
    if (order.status !== "dispatched") {
      return res.status(409).json({
        success: false,
        error: `Order is "${order.status}" — must be "dispatched" to mark out for delivery`,
      });
    }

    const now = new Date().toISOString();
    const { data: updated, error: upErr } = await supabaseAdmin
      .from("orders")
      .update({ status: "out_for_delivery", out_for_delivery_at: now, updated_at: now })
      .eq("id", id)
      .select("id, status, customer_id, guest_customer_name, guest_customer_phone, verification_otp, updated_at")
      .maybeSingle();

    if (upErr) return res.status(500).json({ success: false, error: upErr.message });

    // Resolve driver name for notification log
    let driverName = "our driver";
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles").select("display_name").eq("id", driverId).maybeSingle();
      if (profile?.display_name?.trim()) driverName = profile.display_name.trim();
    } catch { /* non-critical */ }

    // ── Guarantee a real OTP exists ────────────────────────────────────────
    // If the order was created before OTP generation was deployed, verification_otp
    // is null. Generate one now and persist it so the customer + driver both get it.
    let finalOtp = order.verification_otp ?? updated.verification_otp;
    if (!finalOtp) {
      finalOtp = String(Math.floor(100000 + Math.random() * 900000));
      await supabaseAdmin
        .from("orders")
        .update({ verification_otp: finalOtp, verification_status: "pending" })
        .eq("id", id);
      console.log(`[driver/out-for-delivery] Generated fresh OTP ${finalOtp} for order ${id}`);
    }

    // Send WhatsApp OTP notification to customer
    await notifyOrderStatus("out_for_delivery", {
      customer_id:          updated.customer_id,
      guest_customer_phone: updated.guest_customer_phone,
      guest_customer_name:  updated.guest_customer_name,
      verification_otp:     finalOtp,
      driver_name:          driverName,
      id:                   updated.id,
      _source:              "driver out-for-delivery",
    });

    return res.json({
      success: true,
      data: { id: updated.id, status: updated.status, updated_at: updated.updated_at },
    });
  } catch (e) {
    console.error("[PUT /driver/orders/:id/out-for-delivery]", e);
    return res.status(500).json({ success: false, error: "Failed to update status" });
  }
});

// ─── POST /api/driver/deliveries/:id/complete ────────────────────────────────
// Complete delivery with optional photo proof (base64 JSON upload).
// Body: { file_b64?: string, file_type?: string, file_ext?: string }
// - file_b64:  pure base64 string (no data-URI prefix needed)
// - file_type: MIME type e.g. "image/jpeg"
// - file_ext:  extension e.g. "jpg"
// Uploads to Supabase Storage bucket "delivery-proofs", gets public URL,
// sets status="delivered", proof_url, delivered_at=now().
driverRouter.post("/deliveries/:id/complete", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const { file_b64, file_type, file_ext } = req.body ?? {};

    // ── Verify ownership + state ───────────────────────────────────────────
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("orders")
      .select("driver_id, status")
      .eq("id", id)
      .maybeSingle();

    if (exErr)     return res.status(500).json({ success: false, error: exErr.message });
    if (!existing) return res.status(404).json({ success: false, error: "Delivery not found" });
    if (existing.driver_id !== req.authUser.id)
      return res.status(403).json({ success: false, error: "Not your delivery" });
    if (existing.status === "cancelled")
      return res.status(409).json({ success: false, error: "Order was cancelled" });
    if (existing.status === "delivered")
      return res.status(409).json({ success: false, error: "Already delivered" });

    // ── Upload proof image to Supabase Storage ─────────────────────────────
    let proofUrl = null;

    if (file_b64 && typeof file_b64 === "string" && file_b64.length > 100) {
      try {
        const base64Data = file_b64.replace(/^data:[^;]+;base64,/, "");
        const buffer     = Buffer.from(base64Data, "base64");
        const ext        = String(file_ext ?? "jpg").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
        const mimeType   = String(file_type ?? "image/jpeg");
        const filePath   = `proofs/${id}/${Date.now()}.${ext}`;

        const { error: upErr } = await supabaseAdmin.storage
          .from("delivery-proofs")
          .upload(filePath, buffer, { contentType: mimeType, upsert: true });

        if (upErr) {
          console.error("[complete] Upload error:", upErr.message);
          // Non-fatal — still mark delivered without photo
        } else {
          const { data: urlData } = supabaseAdmin.storage
            .from("delivery-proofs")
            .getPublicUrl(filePath);
          proofUrl = urlData?.publicUrl ?? null;
        }
      } catch (ex) {
        console.error("[complete] Upload exception:", ex.message);
      }
    }

    // ── Update order ───────────────────────────────────────────────────────
    const now = new Date().toISOString();
    const { data, error: updErr } = await supabaseAdmin
      .from("orders")
      .update({
        status:       "delivered",
        delivered_at: now,
        updated_at:   now,
        ...(proofUrl ? { proof_url: proofUrl } : {}),
      })
      .eq("id", id)
      .select("id, status, proof_url, delivered_at, updated_at")
      .maybeSingle();

    if (updErr) return res.status(500).json({ success: false, error: updErr.message });

    // ── WhatsApp: delivered notification ─────────────────────────────────
    console.log("[Driver] 📦 Complete delivery route triggered");
    // Fetch full order row for notification (existing only had driver_id + status)
    const { data: orderForNotify } = await supabaseAdmin
      .from("orders")
      .select("customer_id, guest_customer_phone, guest_customer_name")
      .eq("id", id)
      .maybeSingle();

    await notifyOrderStatus("delivered", {
      id,
      short_id:             String(id).replace(/-/g, "").slice(0, 8).toUpperCase(),
      customer_id:          orderForNotify?.customer_id,
      guest_customer_phone: orderForNotify?.guest_customer_phone,
      customer_name:        orderForNotify?.guest_customer_name ?? "Customer",
      _source:              "driver/complete",
    });

    return res.json({
      success:   true,
      data,
      proof_url: proofUrl,
      message:   proofUrl ? "Delivered with proof ✅" : "Delivered (no photo) ✅",
    });
  } catch (e) {
    console.error("[POST /driver/deliveries/:id/complete]", e);
    return res.status(500).json({ success: false, error: "Failed to complete delivery" });
  }
});

// ─── PUT /api/driver/deliveries/:id/deliver (backward compat) ─────────────────
// Accepts optional proof_url directly (no file upload). Also sets delivered_at.
driverRouter.put("/deliveries/:id/deliver", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const { proof_url } = req.body ?? {};

    const { data: existing } = await supabaseAdmin
      .from("orders").select("driver_id, status").eq("id", id).maybeSingle();

    if (!existing) return res.status(404).json({ success: false, error: "Delivery not found" });
    if (existing.driver_id !== req.authUser.id) return res.status(403).json({ success: false, error: "Not your delivery" });
    if (existing.status === "cancelled") return res.status(409).json({ success: false, error: "Order was cancelled" });

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("orders")
      .update({
        status: "delivered",
        delivered_at: now,
        updated_at:   now,
        ...(proof_url ? { proof_url: String(proof_url) } : {}),
      })
      .eq("id", id)
      .select("id, status, proof_url, delivered_at, updated_at")
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /driver/deliveries/:id/deliver]", e);
    return res.status(500).json({ success: false, error: "Failed to mark delivered" });
  }
});


// ─── POST /api/driver/deliveries/:id/verify-otp ───────────────────────────────
// Step 1 of 2 in the delivery completion flow.
// Verifies the customer-provided OTP before allowing proof upload.
driverRouter.post("/deliveries/:id/verify-otp", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const { id }  = req.params;
    const { otp } = req.body ?? {};

    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });
    if (!otp || String(otp).trim() === "") {
      return res.status(400).json({ success: false, error: "OTP is required" });
    }

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("orders")
      .select("id, driver_id, status, verification_otp, verification_status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) return res.status(500).json({ success: false, error: fetchErr.message });
    if (!order)   return res.status(404).json({ success: false, error: "Delivery not found" });
    if (order.driver_id !== req.authUser.id)
      return res.status(403).json({ success: false, error: "Not your delivery" });
    if (order.status === "delivered")
      return res.status(409).json({ success: false, error: "Already delivered" });

    const storedOtp = String(order.verification_otp ?? "").trim();
    const givenOtp  = String(otp).trim();

    if (!storedOtp) {
      return res.status(422).json({
        success: false,
        error: "No OTP has been generated for this order yet. Ask the customer to request one.",
      });
    }

    if (storedOtp !== givenOtp) {
      return res.status(400).json({ success: false, error: "Incorrect OTP. Please try again." });
    }

    // Mark OTP as verified (does NOT mark delivered yet — photo upload comes next)
    await supabaseAdmin
      .from("orders")
      .update({ verification_status: "verified", updated_at: new Date().toISOString() })
      .eq("id", id);

    return res.json({ success: true, message: "OTP verified ✅. Proceed to upload proof." });
  } catch (e) {
    console.error("[POST /driver/deliveries/:id/verify-otp]", e);
    return res.status(500).json({ success: false, error: "OTP verification failed" });
  }
});

// ─── GET /api/driver/history ──────────────────────────────────────────────────
// Returns all delivered orders for this driver in the selected business,
// ordered by delivered_at DESC.
driverRouter.get("/history", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;

    const driverId   = req.authUser.id;
    const businessId = req.businessId;

    if (!businessId) {
      return res.status(400).json({ success: false, error: "x-business-id header required" });
    }

    // Resolve admin_id for business
    const { data: bp } = await supabaseAdmin
      .from("business_profile")
      .select("admin_id")
      .eq("id", businessId)
      .maybeSingle();

    let query = supabaseAdmin
      .from("orders")
      .select(`
        id, status, region, customer_address,
        guest_customer_name, guest_customer_phone,
        proof_url, delivered_at, created_at, customer_id
      `)
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .order("delivered_at", { ascending: false });

    if (bp?.admin_id) query = query.eq("admin_id", bp.admin_id);

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    // Enrich customer names
    const customerIds = [...new Set((data ?? []).map((o) => o.customer_id).filter(Boolean))];
    let profileMap = {};
    if (customerIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles").select("id, display_name").in("id", customerIds);
      for (const p of profiles ?? []) profileMap[p.id] = p.display_name?.trim() ?? null;
    }

    const rows = (data ?? []).map((o) => ({
      id:             o.id,
      short_id:       String(o.id).replace(/-/g, "").slice(0, 8).toUpperCase(),
      customer_name:  (o.customer_id ? profileMap[o.customer_id] : null) || o.guest_customer_name?.trim() || "Guest",
      customer_phone: o.guest_customer_phone ?? null,
      region:         o.region  ?? null,
      address:        o.customer_address ?? null,
      proof_url:      o.proof_url ?? null,
      delivered_at:   o.delivered_at ?? null,
      created_at:     o.created_at,
    }));

    return res.json({ success: true, data: rows, total: rows.length });
  } catch (e) {
    console.error("[GET /driver/history]", e);
    return res.status(500).json({ success: false, error: "Failed to load history" });
  }
});

// ─── PUT /api/driver/profile ──────────────────────────────────────────────────
// Update driver profile fields (name, vehicle_details, license_number).
driverRouter.put("/profile", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const driverId = req.authUser.id;
    const { name, vehicle_details, license_number } = req.body ?? {};

    const patch = { updated_at: new Date().toISOString() };
    if (name && typeof name === "string" && name.trim().length >= 2)
      patch.name = name.trim();
    if (vehicle_details && typeof vehicle_details === "string")
      patch.vehicle_details = vehicle_details.trim();
    if (license_number && typeof license_number === "string")
      patch.license_number = license_number.trim();

    const { data, error } = await supabaseAdmin
      .from("drivers")
      .update(patch)
      .eq("id", driverId)
      .select("id, name, phone, vehicle_details, license_number, is_profile_complete")
      .maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, data });
  } catch (e) {
    console.error("[PUT /driver/profile]", e);
    return res.status(500).json({ success: false, error: "Failed to update profile" });
  }
});

// ─── GET /api/driver/profile ──────────────────────────────────────────────────
driverRouter.get("/profile", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    // New auth: driver data comes from the drivers table via requireDriverAuth
    const driver = req.driverUser;
    if (driver) {
      return res.json({
        success: true,
        data: {
          id:           driver.id,
          display_name: driver.name ?? null,
          role:         "driver",
          phone:        driver.phone,
        },
      });
    }
    // Fallback: query drivers table directly
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select("id, name, phone")
      .eq("id", req.authUser.id)
      .maybeSingle();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({
      success: true,
      data: { id: data?.id, display_name: data?.name ?? null, role: "driver", phone: data?.phone },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

// ─── GET /api/driver/route ────────────────────────────────────────────────────
// Returns distance + duration estimate from warehouse to delivery destination.
//
// Query params (at least one destination required):
//   dest_lat, dest_lng  — GPS coords of delivery (preferred)
//   dest_text           — region / address text (used if no GPS)
//
// Strategy:
//   1. Google Maps Distance Matrix API (GOOGLE_MAPS_API_KEY)
//      — works with both GPS coords and text addresses
//   2. OpenRouteService matrix (ORS_API_KEY, GPS only)
//      — if text-only, first geocodes via Nominatim to get GPS
//   3. Haversine estimate (GPS only, or after Nominatim geocode)
//   4. Link-only fallback (text-only, no API keys, no geocode)

driverRouter.get("/route", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;

    const warehouseLat  = parseFloat(process.env.WAREHOUSE_LAT  ?? "26.9124");
    const warehouseLng  = parseFloat(process.env.WAREHOUSE_LNG  ?? "75.7873");
    const warehouseName = process.env.WAREHOUSE_NAME ?? "Warehouse";
    const GOOGLE_KEY    = process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
    const ORS_KEY       = process.env.ORS_API_KEY?.trim()         || "";

    const { dest_lat, dest_lng, dest_text } = req.query;
    let hasGPS  = dest_lat && dest_lng && !isNaN(parseFloat(dest_lat)) && !isNaN(parseFloat(dest_lng));
    const hasText = typeof dest_text === "string" && dest_text.trim().length > 0;

    if (!hasGPS && !hasText) {
      return res.status(400).json({ success: false, error: "Provide dest_lat+dest_lng or dest_text" });
    }

    // Resolved coordinates (may be filled in later by geocoding)
    let resolvedLat = hasGPS ? parseFloat(dest_lat) : null;
    let resolvedLng = hasGPS ? parseFloat(dest_lng) : null;

    // ── Google Maps navigation URL (always generated, no API key needed) ──
    const mapsOrigin = `${warehouseLat},${warehouseLng}`;
    const mapsUrl = hasGPS
      ? `https://www.google.com/maps/dir/?api=1&origin=${mapsOrigin}&destination=${dest_lat},${dest_lng}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&origin=${mapsOrigin}&destination=${encodeURIComponent(dest_text.trim())}&travelmode=driving`;

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 1: Google Maps Distance Matrix
    // Works with GPS coords AND text addresses natively.
    // ─────────────────────────────────────────────────────────────────────────
    if (GOOGLE_KEY) {
      try {
        // Use raw text for the destination parameter (not double-encoded)
        const destination = hasGPS
          ? `${dest_lat},${dest_lng}`
          : dest_text.trim();

        const params = new URLSearchParams({
          origins:      `${warehouseLat},${warehouseLng}`,
          destinations: destination,
          mode:         "driving",
          units:        "metric",
          key:          GOOGLE_KEY,
        });
        const apiUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;

        console.log("[route] Calling Google Maps:", apiUrl.replace(GOOGLE_KEY, "REDACTED"));
        const r    = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
        const json = await r.json();
        console.log("[route] Google Maps response status:", json?.status, "| element:", json?.rows?.[0]?.elements?.[0]?.status);

        if (json?.status !== "OK") {
          console.warn("[route] Google API-level error:", json?.status, json?.error_message ?? "");
        } else {
          const element = json?.rows?.[0]?.elements?.[0];
          if (element?.status === "OK") {
            return res.json({
              success:      true,
              distance_km:  Math.round(element.distance.value / 100) / 10,
              duration_min: Math.round(element.duration.value / 60),
              maps_url:     mapsUrl,
              source:       "google",
              warehouse:    { name: warehouseName, lat: warehouseLat, lng: warehouseLng },
            });
          }
          console.warn("[route] Google element status:", element?.status);
        }
      } catch (gErr) {
        console.warn("[route] Google Maps exception:", gErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // If text-only, try to geocode via Nominatim to get lat/lng for ORS/haversine
    // ─────────────────────────────────────────────────────────────────────────
    if (!hasGPS && hasText) {
      try {
        const geoParams = new URLSearchParams({ q: `${dest_text.trim()}, India`, format: "json", limit: "1" });
        const geoUrl = `https://nominatim.openstreetmap.org/search?${geoParams}`;
        const geoRes = await fetch(geoUrl, {
          headers: { "User-Agent": "FlowStock-Driver-App/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        const geoJson = await geoRes.json();
        if (Array.isArray(geoJson) && geoJson.length > 0) {
          resolvedLat = parseFloat(geoJson[0].lat);
          resolvedLng = parseFloat(geoJson[0].lon);
          hasGPS = !isNaN(resolvedLat) && !isNaN(resolvedLng);
          console.log("[route] Nominatim geocoded:", dest_text, "→", resolvedLat, resolvedLng);
        }
      } catch (geoErr) {
        console.warn("[route] Nominatim geocode failed:", geoErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 2: OpenRouteService (GPS required — now may have coords from Nominatim)
    // ORS JWT keys must be sent as "Bearer <token>"
    // ─────────────────────────────────────────────────────────────────────────
    if (ORS_KEY && hasGPS && resolvedLat != null && resolvedLng != null) {
      try {
        const orsBody = {
          locations: [
            [warehouseLng, warehouseLat],   // ORS uses [lng, lat] order
            [resolvedLng,  resolvedLat],
          ],
          metrics: ["distance", "duration"],
        };

        // ORS JWT keys use "Bearer" prefix; plain API keys are sent raw
        const authHeader = ORS_KEY.startsWith("ey") ? `Bearer ${ORS_KEY}` : ORS_KEY;

        console.log("[route] Calling ORS matrix...");
        const r = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "Content-Type":  "application/json",
            "Accept":        "application/json",
          },
          body:   JSON.stringify(orsBody),
          signal: AbortSignal.timeout(8000),
        });

        const json = await r.json();
        console.log("[route] ORS response HTTP:", r.status, "| keys:", Object.keys(json ?? {}).join(","));

        const durationSec = json?.durations?.[0]?.[1];
        const distanceMtr = json?.distances?.[0]?.[1];

        if (durationSec != null && distanceMtr != null) {
          return res.json({
            success:      true,
            distance_km:  Math.round(distanceMtr / 100) / 10,
            duration_min: Math.round(durationSec / 60),
            maps_url:     mapsUrl,
            source:       "ors",
            warehouse:    { name: warehouseName, lat: warehouseLat, lng: warehouseLng },
          });
        }
        console.warn("[route] ORS bad response:", JSON.stringify(json).slice(0, 300));
      } catch (orsErr) {
        console.warn("[route] ORS exception:", orsErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 3: Haversine straight-line estimate (GPS or Nominatim coords)
    // ─────────────────────────────────────────────────────────────────────────
    if (hasGPS && resolvedLat != null && resolvedLng != null) {
      const R    = 6371;
      const dLat = ((resolvedLat - warehouseLat) * Math.PI) / 180;
      const dLon = ((resolvedLng - warehouseLng) * Math.PI) / 180;
      const a    =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((warehouseLat * Math.PI) / 180) *
        Math.cos((resolvedLat * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
      const straight    = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance_km = Math.round(straight * 1.35 * 10) / 10; // road factor 1.35
      const duration_min = Math.round((distance_km / 35) * 60);  // avg 35 km/h

      return res.json({
        success:      true,
        distance_km,
        duration_min,
        maps_url:     mapsUrl,
        source:       "estimate",
        geocoded:     !dest_lat, // true if coords came from Nominatim
        warehouse:    { name: warehouseName, lat: warehouseLat, lng: warehouseLng },
        note:         "Estimated distance — add API keys for real-time routing",
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 4: Maps link only (no GPS, no geocode, no API keys)
    // ─────────────────────────────────────────────────────────────────────────
    return res.json({
      success:   true,
      maps_url:  mapsUrl,
      source:    "link_only",
      warehouse: { name: warehouseName, lat: warehouseLat, lng: warehouseLng },
    });

  } catch (e) {
    console.error("[GET /driver/route]", e);
    return res.status(500).json({ success: false, error: "Failed to get route" });
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// SHARED GEO UTILITIES (used by optimize-route and auto-assign)
// ═══════════════════════════════════════════════════════════════════════════════

/** Haversine distance in km between two lat/lng points */
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Geocode a text address/region using Nominatim (free, no key needed) */
async function geocodeText(text) {
  try {
    const params = new URLSearchParams({ q: `${text.trim()}, India`, format: "json", limit: "1" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "FlowStock-Driver-App/1.0" },
      signal: AbortSignal.timeout(4000),
    });
    const json = await res.json();
    if (Array.isArray(json) && json.length > 0) {
      return { lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) };
    }
  } catch (e) {
    console.warn("[geocodeText] failed for:", text, e.message);
  }
  return null;
}

/**
 * Nearest-neighbour TSP heuristic.
 * @param {{ lat: number, lng: number }} origin  Starting point (warehouse)
 * @param {Array<{ lat: number, lng: number, [key: string]: any }>} stops
 * @returns {typeof stops} Stops in visit order
 */
function nearestNeighbor(origin, stops) {
  const remaining = [...stops];
  const ordered = [];
  let current = origin;
  while (remaining.length > 0) {
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (d < minDist) { minDist = d; closest = i; }
    }
    ordered.push(remaining.splice(closest, 1)[0]);
    current = ordered[ordered.length - 1];
  }
  return ordered;
}

/** km/h average to convert distance → minutes */
const AVG_SPEED_KPH = 35;
/** Road-distance inflation factor from straight-line */
const ROAD_FACTOR = 1.35;

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/driver/optimize-route
// ═══════════════════════════════════════════════════════════════════════════════
// Returns optimised delivery sequence for the logged-in driver's active orders.
// Strategy (falls through):
//   1. Google Directions API  (GOOGLE_MAPS_API_KEY, supports waypoint optimization)
//   2. ORS Optimization       (ORS_API_KEY)
//   3. Nearest-neighbour      (always available, haversine estimate)

driverRouter.post("/optimize-route", async (req, res) => {
  try {
    if (!requireDriver(req, res)) return;
    const driverId = req.authUser.id;

    const mileageKpl = parseFloat(process.env.VEHICLE_MILEAGE_KPL ?? "40");
    const warehouseLat = parseFloat(process.env.WAREHOUSE_LAT ?? "26.9124");
    const warehouseLng = parseFloat(process.env.WAREHOUSE_LNG ?? "75.7873");
    const warehouseName = process.env.WAREHOUSE_NAME ?? "Warehouse";
    const GOOGLE_KEY = process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
    const ORS_KEY    = process.env.ORS_API_KEY?.trim()         || "";

    // ── Fetch all active orders for this driver ──────────────────────────────
    const { data: orders, error: ordErr } = await supabaseAdmin
      .from("orders")
      .select("id, region, delivery_lat, delivery_lng, customer_id, guest_customer_name, status")
      .eq("driver_id", driverId)
      .in("status", ["confirmed", "dispatched"])
      .order("created_at", { ascending: true });

    if (ordErr) return res.status(500).json({ success: false, error: ordErr.message });
    if (!orders || orders.length === 0) {
      return res.json({ success: true, stops: [], total_km: 0, total_min: 0, maps_url: null, source: "empty" });
    }

    // Resolve customer names
    const custIds = [...new Set(orders.map((o) => o.customer_id).filter(Boolean))];
    let nameMap = new Map();
    if (custIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name")
        .in("id", custIds);
      nameMap = new Map(
        await Promise.all(
          (profiles ?? []).map(async (p) => {
            let name = p.display_name?.trim() ?? null;
            if (!name) {
              // Auth fallback for registered users with no display_name
              try {
                const { data: au } = await supabaseAdmin.auth.admin.getUserById(p.id);
                const u = au?.user;
                name =
                  u?.user_metadata?.full_name?.trim() ||
                  u?.user_metadata?.name?.trim() ||
                  (u?.phone ? u.phone.replace(/^\+91/, "") : null) ||
                  u?.email?.split("@")[0] ||
                  null;
              } catch { /* skip */ }
            }
            return [p.id, name];
          })
        )
      );
    }

    // ── Resolve coordinates for each order ───────────────────────────────────
    // Geocode text-only orders in parallel (Nominatim)
    const stops = await Promise.all(
      orders.map(async (o) => {
        let lat = o.delivery_lat != null ? parseFloat(o.delivery_lat) : null;
        let lng = o.delivery_lng != null ? parseFloat(o.delivery_lng) : null;
        const hasGPS = lat != null && lng != null && !isNaN(lat) && !isNaN(lng);
        if (!hasGPS && o.region) {
          const coords = await geocodeText(o.region);
          if (coords) { lat = coords.lat; lng = coords.lng; }
        }
        return {
          order_id:      o.id,
          short_id:      String(o.id).replace(/-/g, "").slice(0, 8).toUpperCase(),
          customer_name: nameMap.get(o.customer_id) ?? o.guest_customer_name?.trim() ?? "Guest",
          region:        o.region ?? "—",
          status:        o.status,
          lat,
          lng,
          has_coords:    lat != null && lng != null,
        };
      })
    );

    const stopsWithCoords = stops.filter((s) => s.has_coords);
    const stopsNoCoords   = stops.filter((s) => !s.has_coords);
    if (stopsWithCoords.length === 0) {
      // No coordinates resolvable — return unordered with no distances
      return res.json({
        success: true, stops: stops.map((s, i) => ({ ...s, sequence: i + 1 })),
        total_km: null, total_min: null, maps_url: null, source: "no_coords",
        fuel_liters: null,
      });
    }

    // ── TIER 1: Google Directions API with waypoint optimization ─────────────
    if (GOOGLE_KEY && stopsWithCoords.length >= 1) {
      try {
        const origin      = `${warehouseLat},${warehouseLng}`;
        const destination = `${stopsWithCoords[stopsWithCoords.length - 1].lat},${stopsWithCoords[stopsWithCoords.length - 1].lng}`;
        const waypoints   = stopsWithCoords.slice(0, -1)
          .map((s) => `${s.lat},${s.lng}`)
          .join("|");

        const params = new URLSearchParams({
          origin,
          destination,
          ...(waypoints && { waypoints: `optimize:true|${waypoints}` }),
          mode: "driving",
          key:  GOOGLE_KEY,
        });
        const apiUrl = `https://maps.googleapis.com/maps/api/directions/json?${params}`;
        console.log("[optimize-route] Google Directions:", apiUrl.replace(GOOGLE_KEY, "REDACTED"));

        const r    = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
        const json = await r.json();
        console.log("[optimize-route] Google status:", json.status);

        if (json.status === "OK") {
          const order = json.routes?.[0]?.waypoint_order ?? [];
          // Re-order stops by Google's optimized waypoint order
          const middle  = stopsWithCoords.slice(0, -1);
          const reordered = [
            ...order.map((i) => middle[i]),
            stopsWithCoords[stopsWithCoords.length - 1],
          ].filter(Boolean);

          const legs   = json.routes[0].legs ?? [];
          let totalM = 0, totalS = 0;
          legs.forEach((leg) => { totalM += leg.distance.value; totalS += leg.duration.value; });
          const total_km  = Math.round(totalM / 100) / 10;
          const total_min = Math.round(totalS / 60);

          const orderedStops = [
            ...reordered.map((s, i) => ({ ...s, sequence: i + 1 })),
            ...stopsNoCoords.map((s, i) => ({ ...s, sequence: reordered.length + i + 1 })),
          ];

          return res.json({
            success: true,
            stops: orderedStops,
            total_km, total_min,
            maps_url: buildMultiStopMapsUrl(warehouseLat, warehouseLng, orderedStops.filter((s) => s.has_coords)),
            fuel_liters: Math.round((total_km / mileageKpl) * 10) / 10,
            source: "google",
            warehouse: { name: warehouseName, lat: warehouseLat, lng: warehouseLng },
          });
        }
        console.warn("[optimize-route] Google error:", json.status, json.error_message);
      } catch (gErr) {
        console.warn("[optimize-route] Google exception:", gErr.message);
      }
    }

    // ── TIER 2: ORS Optimization endpoint ────────────────────────────────────
    if (ORS_KEY && stopsWithCoords.length >= 1) {
      try {
        const authHeader = ORS_KEY.startsWith("ey") ? `Bearer ${ORS_KEY}` : ORS_KEY;
        const vehicles = [{
          id: 1,
          profile: "driving-car",
          start: [warehouseLng, warehouseLat],
          end:   [warehouseLng, warehouseLat],
          capacity: [stopsWithCoords.length + 1],
        }];
        const jobs = stopsWithCoords.map((s, i) => ({
          id: i + 1,
          location: [s.lng, s.lat],
          amount: [1],
        }));

        const r = await fetch("https://api.openrouteservice.org/optimization", {
          method: "POST",
          headers: { "Authorization": authHeader, "Content-Type": "application/json" },
          body:   JSON.stringify({ vehicles, jobs }),
          signal: AbortSignal.timeout(10000),
        });
        const json = await r.json();
        console.log("[optimize-route] ORS status:", r.status, "routes:", json?.routes?.length);

        const route = json?.routes?.[0];
        if (route) {
          const stepOrder = (route.steps ?? [])
            .filter((s) => s.type === "job")
            .map((s) => s.job - 1); // 0-indexed into stopsWithCoords
          const reordered = stepOrder.map((i) => stopsWithCoords[i]).filter(Boolean);
          const total_km  = Math.round((json.summary?.distance ?? 0) / 100) / 10;
          const total_min = Math.round((json.summary?.duration ?? 0) / 60);

          const orderedStops = [
            ...reordered.map((s, i) => ({ ...s, sequence: i + 1 })),
            ...stopsNoCoords.map((s, i) => ({ ...s, sequence: reordered.length + i + 1 })),
          ];

          return res.json({
            success: true,
            stops: orderedStops,
            total_km, total_min,
            maps_url: buildMultiStopMapsUrl(warehouseLat, warehouseLng, orderedStops.filter((s) => s.has_coords)),
            fuel_liters: Math.round((total_km / mileageKpl) * 10) / 10,
            source: "ors",
            warehouse: { name: warehouseName, lat: warehouseLat, lng: warehouseLng },
          });
        }
        console.warn("[optimize-route] ORS bad response:", JSON.stringify(json).slice(0, 200));
      } catch (orsErr) {
        console.warn("[optimize-route] ORS exception:", orsErr.message);
      }
    }

    // ── TIER 3: Nearest-Neighbour heuristic (always available) ───────────────
    const warehouse = { lat: warehouseLat, lng: warehouseLng };
    const ordered   = nearestNeighbor(warehouse, stopsWithCoords);

    // Estimate total distance + duration
    let totalKm = 0;
    let prev = warehouse;
    for (const s of ordered) {
      totalKm += haversineKm(prev.lat, prev.lng, s.lat, s.lng) * ROAD_FACTOR;
      prev = s;
    }
    // Add return to warehouse distance (optional, not shown to driver)
    totalKm = Math.round(totalKm * 10) / 10;
    const total_min = Math.round((totalKm / AVG_SPEED_KPH) * 60);

    const orderedStops = [
      ...ordered.map((s, i) => ({ ...s, sequence: i + 1 })),
      ...stopsNoCoords.map((s, i) => ({ ...s, sequence: ordered.length + i + 1 })),
    ];

    return res.json({
      success: true,
      stops: orderedStops,
      total_km: totalKm,
      total_min,
      maps_url: buildMultiStopMapsUrl(warehouseLat, warehouseLng, orderedStops.filter((s) => s.has_coords)),
      fuel_liters: Math.round((totalKm / mileageKpl) * 10) / 10,
      source: "estimate",
      warehouse: { name: warehouseName, lat: warehouseLat, lng: warehouseLng },
    });

  } catch (e) {
    console.error("[POST /driver/optimize-route]", e);
    return res.status(500).json({ success: false, error: "Failed to optimize route" });
  }
});

/** Build a Google Maps multi-stop directions URL */
function buildMultiStopMapsUrl(warehouseLat, warehouseLng, stops) {
  if (!stops || stops.length === 0) return null;
  const origin      = `${warehouseLat},${warehouseLng}`;
  const destination = `${stops[stops.length - 1].lat},${stops[stops.length - 1].lng}`;
  const waypoints   = stops.slice(0, -1).map((s) => `${s.lat},${s.lng}`).join("|");
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ""}&travelmode=driving`;
}
