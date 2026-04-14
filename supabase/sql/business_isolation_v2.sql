-- ─── business_isolation_v2.sql ──────────────────────────────────────────────────
-- Business Data Isolation — Phase 2 Migration
-- Run in Supabase Dashboard → SQL Editor AFTER business_isolation.sql
--
-- What this does:
--   1. Backfills admin_id on orders that were placed by customers (no admin_id today)
--      by tracing: order → order_line_items → inventory_items → admin_id
--   2. Adds business_id column to complaints table for scoped complaint counts
--   3. Ensures indexes exist for all isolation queries
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Backfill admin_id on customer-placed orders ──────────────────────
-- Customer orders were inserted without admin_id; trace it via line items.
UPDATE public.orders o
SET admin_id = (
  SELECT i.admin_id
  FROM public.order_line_items li
  JOIN public.inventory_items i ON i.id = li.inventory_item_id
  WHERE li.order_id = o.id
    AND i.admin_id IS NOT NULL
  LIMIT 1
)
WHERE o.admin_id IS NULL;

SELECT
  COUNT(*) FILTER (WHERE admin_id IS NOT NULL) AS orders_with_admin_id,
  COUNT(*) FILTER (WHERE admin_id IS NULL)     AS orders_still_null,
  COUNT(*)                                      AS total_orders
FROM public.orders;

-- ── Step 2: Add business_id to complaints (for per-business scoping) ─────────
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.business_profile(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS complaints_business_id_idx ON public.complaints (business_id);

-- ── Step 3: Backfill complaints.business_id via order → admin_id → business ──
-- complaints.order_id → orders.admin_id → business_profile.admin_id → business_profile.id
UPDATE public.complaints c
SET business_id = (
  SELECT bp.id
  FROM public.orders o
  JOIN public.business_profile bp ON bp.admin_id = o.admin_id
  WHERE o.id = c.order_id
  LIMIT 1
)
WHERE c.business_id IS NULL AND c.order_id IS NOT NULL;

-- ── Step 4: Ensure all necessary indexes exist ────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_admin_id_idx          ON public.orders (admin_id);
CREATE INDEX IF NOT EXISTS inventory_items_admin_id_idx ON public.inventory_items (admin_id);

SELECT 'business_isolation_v2.sql applied ✅' AS result;
