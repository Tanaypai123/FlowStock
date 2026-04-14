import { Router } from "express";
import { supabaseAdmin } from "../../lib/supabase.js";

export const testDbRouter = Router();

testDbRouter.get("/test-db", async (_req, res) => {
  try {
    const { data, error } = await supabaseAdmin.from("test_table").select("*");

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }

    return res.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    console.error("[GET /api/test-db]", err);
    return res.status(500).json({ success: false, error: message });
  }
});
