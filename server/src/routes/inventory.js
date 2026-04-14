import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { resolveBusinessId } from "../middleware/resolveBusinessId.js";
import {
  stockStatus,
  computeSoldQty,
  runInventoryAlerts,
} from "../services/inventoryService.js";

const STAGES = new Set(["raw", "processing", "packaged", "ready"]);

const INV_SELECT =
  "id, name, stage, quantity, initial_stock, low_stock_alert, unit_price, unit, image_url, image_urls, description, " +
  "alert_50_sent, alert_low_sent, created_at, updated_at";

function parseNonNegativeNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { error: `${fieldName} must be a non-negative number` };
  }
  return { value: n };
}

function isUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(id),
  );
}

/** Enrich a raw inventory row with live sold_quantity + derived status */
async function enrichItem(item) {
  const sold = await computeSoldQty(item.id, item.name);
  return { ...item, sold_quantity: sold, status: stockStatus(item) };
}

async function enrichItems(rows) {
  return Promise.all(rows.map(enrichItem));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const inventoryRouter = Router();
inventoryRouter.use(resolveBusinessId);
inventoryRouter.use(requireAdmin);

// ─── GET /api/inventory ───────────────────────────────────────────────────────

inventoryRouter.get("/", async (req, res) => {
  try {
    const adminId = req.adminUser?.id;
    console.log("[GET /inventory] adminId:", adminId);

    const query = supabaseAdmin
      .from("inventory_items")
      .select(INV_SELECT)
      .order("name", { ascending: true });

    // Filter by admin_id if column exists (after business_isolation.sql migration)
    if (adminId) query.eq("admin_id", adminId);

    const { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    const enriched = await enrichItems(data ?? []);
    return res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[GET /inventory]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch inventory" });
  }
});

// ─── GET /api/inventory/:id/insights ─────────────────────────────────────────

inventoryRouter.get("/:id/insights", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const adminId = req.adminUser?.id;

    const query = supabaseAdmin
      .from("inventory_items")
      .select(INV_SELECT)
      .eq("id", id);

    // Scope to this admin's business
    if (adminId) query.eq("admin_id", adminId);

    const { data: item, error } = await query.maybeSingle();

    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!item)  return res.status(404).json({ success: false, error: "Item not found" });

    const sold     = await computeSoldQty(item.id, item.name);
    const qty      = Number(item.quantity);
    const initial  = Number(item.initial_stock);

    const createdAt  = item.created_at ? new Date(item.created_at) : new Date();
    const daysSince  = Math.max(1, (Date.now() - createdAt.getTime()) / 86_400_000);
    const avgPerDay  = sold > 0 ? +(sold / daysSince).toFixed(2) : 0;
    const daysLeft   = avgPerDay > 0 ? Math.round(qty / avgPerDay) : null;

    return res.json({
      success: true,
      data: {
        name:                item.name,
        stage:               item.stage,
        initial_stock:       initial,
        sold_quantity:       sold,
        quantity:            qty,
        low_stock_alert:     item.low_stock_alert,
        avg_sales_per_day:   avgPerDay,
        estimated_days_left: daysLeft,
        days_tracked:        Math.floor(daysSince),
        status:              stockStatus(item),
      },
    });
  } catch (e) {
    console.error("[GET /inventory/:id/insights]", e);
    return res.status(500).json({ success: false, error: "Failed to fetch insights" });
  }
});

// ─── POST /api/inventory ──────────────────────────────────────────────────────

inventoryRouter.post("/", async (req, res) => {
  try {
    const { name, stage, quantity, initial_stock, low_stock_alert, unit_price, unit, description, image_urls } = req.body ?? {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, error: "name is required" });
    }
    if (typeof stage !== "string" || !STAGES.has(stage)) {
      return res.status(400).json({
        success: false,
        error: "stage must be raw, processing, packaged, or ready",
      });
    }

    const q = parseNonNegativeNumber(quantity, "quantity");
    if (q.error) return res.status(400).json({ success: false, error: q.error });

    const low = parseNonNegativeNumber(low_stock_alert ?? 0, "low_stock_alert");
    if (low.error) return res.status(400).json({ success: false, error: low.error });

    const initRaw = initial_stock !== undefined ? initial_stock : quantity;
    const init    = parseNonNegativeNumber(initRaw, "initial_stock");
    if (init.error) return res.status(400).json({ success: false, error: init.error });

    let priceVal = 0;
    if (unit_price !== undefined) {
      const up = parseNonNegativeNumber(unit_price, "unit_price");
      if (up.error) return res.status(400).json({ success: false, error: up.error });
      priceVal = up.value;
    }

    const adminId = req.adminUser?.id;
    console.log("[POST /inventory] adminId:", adminId);

    const { data, error } = await supabaseAdmin
      .from("inventory_items")
      .insert({
        name:            name.trim(),
        stage,
        quantity:        q.value,
        initial_stock:   init.value,
        low_stock_alert: low.value,
        unit_price:      priceVal,
        unit:            typeof unit === "string" && unit.trim() ? unit.trim() : "piece",
        description:     typeof description === "string" ? description.trim() : null,
        image_urls:      Array.isArray(image_urls) ? image_urls.filter(Boolean) : [],
        alert_50_sent:   false,
        alert_low_sent:  false,
        admin_id:        adminId ?? null,
        business_id:     req.businessId ?? null,
        updated_at:      new Date().toISOString(),
      })
      .select(INV_SELECT)
      .single();

    if (error) return res.status(400).json({ success: false, error: error.message });

    const enriched = await enrichItem(data);
    return res.status(201).json({ success: true, data: enriched });
  } catch (e) {
    console.error("[POST /inventory]", e);
    return res.status(500).json({ success: false, error: "Failed to create item" });
  }
});

// ─── PUT /api/inventory/:id ───────────────────────────────────────────────────

inventoryRouter.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const { name, stage, quantity, initial_stock, low_stock_alert, unit_price, unit, image_url, description, image_urls } = req.body ?? {};
    const patch = { updated_at: new Date().toISOString() };

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ success: false, error: "name must be a non-empty string" });
      }
      patch.name = name.trim();
    }
    if (stage !== undefined) {
      if (typeof stage !== "string" || !STAGES.has(stage)) {
        return res.status(400).json({
          success: false,
          error: "stage must be raw, processing, packaged, or ready",
        });
      }
      patch.stage = stage;
    }
    if (quantity !== undefined) {
      const q = parseNonNegativeNumber(quantity, "quantity");
      if (q.error) return res.status(400).json({ success: false, error: q.error });
      patch.quantity = q.value;
    }
    if (initial_stock !== undefined) {
      const init = parseNonNegativeNumber(initial_stock, "initial_stock");
      if (init.error) return res.status(400).json({ success: false, error: init.error });
      patch.initial_stock = init.value;
    }
    if (low_stock_alert !== undefined) {
      const low = parseNonNegativeNumber(low_stock_alert, "low_stock_alert");
      if (low.error) return res.status(400).json({ success: false, error: low.error });
      patch.low_stock_alert = low.value;
    }
    if (unit_price !== undefined) {
      const up = parseNonNegativeNumber(unit_price, "unit_price");
      if (up.error) return res.status(400).json({ success: false, error: up.error });
      patch.unit_price = up.value;
    }
    if (unit !== undefined && typeof unit === "string" && unit.trim()) {
      patch.unit = unit.trim();
    }
    if (image_url !== undefined) {
      patch.image_url = typeof image_url === "string" && image_url.trim() ? image_url.trim() : null;
    }
    if (description !== undefined) {
      patch.description = typeof description === "string" ? description.trim() : null;
    }
    if (image_urls !== undefined) {
      patch.image_urls = Array.isArray(image_urls) ? image_urls.filter(Boolean) : [];
    }

    if (Object.keys(patch).length <= 1) {
      return res.status(400).json({ success: false, error: "No valid fields to update" });
    }

    const adminId = req.adminUser?.id;

    const query = supabaseAdmin
      .from("inventory_items")
      .update(patch)
      .eq("id", id);

    // Ownership check — only update if this admin owns the item
    if (adminId) query.eq("admin_id", adminId);

    const { data, error } = await query
      .select(INV_SELECT)
      .maybeSingle();

    if (error) return res.status(400).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Item not found" });

    const enriched = await enrichItem(data);

    // Alerts fire non-blocking so they never delay the API response
    runInventoryAlerts(data).catch((e) =>
      console.error("[PUT /inventory] Alert error (non-fatal):", e.message),
    );

    return res.json({ success: true, data: enriched });
  } catch (e) {
    console.error("[PUT /inventory/:id]", e);
    return res.status(500).json({ success: false, error: "Failed to update item" });
  }
});

// ─── DELETE /api/inventory/:id ────────────────────────────────────────────────

inventoryRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, error: "Invalid id" });

    const adminId = req.adminUser?.id;

    const query = supabaseAdmin
      .from("inventory_items")
      .delete()
      .eq("id", id);

    // Ownership check — only delete if this admin owns the item
    if (adminId) query.eq("admin_id", adminId);

    const { data, error } = await query
      .select("id")
      .maybeSingle();

    if (error) return res.status(400).json({ success: false, error: error.message });
    if (!data)  return res.status(404).json({ success: false, error: "Item not found" });

    return res.json({ success: true, data: { id } });
  } catch (e) {
    console.error("[DELETE /inventory/:id]", e);
    return res.status(500).json({ success: false, error: "Failed to delete item" });
  }
});

// ─── POST /api/inventory/upload-image ── raw binary product image upload ────────

inventoryRouter.post("/upload-image", async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const fileBuffer = Buffer.concat(chunks);

    if (!fileBuffer.length)
      return res.status(400).json({ success: false, error: "No file data received" });

    const contentType = req.headers["content-type"] ?? "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const storagePath = `products/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("product-images")
      .upload(storagePath, fileBuffer, { contentType, upsert: false });

    if (uploadError) {
      console.error("[POST /inventory/upload-image]", uploadError.message);
      return res.status(500).json({ success: false, error: uploadError.message });
    }

    const { data: publicData } = supabaseAdmin.storage
      .from("product-images")
      .getPublicUrl(storagePath);

    return res.json({ success: true, url: publicData?.publicUrl ?? null });
  } catch (e) {
    console.error("[POST /inventory/upload-image]", e);
    return res.status(500).json({ success: false, error: "Image upload failed" });
  }
});
