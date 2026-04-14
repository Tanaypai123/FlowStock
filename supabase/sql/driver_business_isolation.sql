-- ─── driver_business_isolation.sql ──────────────────────────────────────────
-- Adds business_id to orders table for direct driver delivery scoping.
-- Run in Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Add business_id column to orders (if it doesn't exist already)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.business_profile(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_business_id_idx ON public.orders (business_id);

-- 2. Backfill business_id from admin_id → business_profile
--    (matches orders to the business that admin_id owns)
UPDATE public.orders o
SET    business_id = bp.id
FROM   public.business_profile bp
WHERE  bp.admin_id     = o.admin_id
  AND  o.business_id  IS NULL
  AND  o.admin_id     IS NOT NULL;

SELECT
  COUNT(*)                                        AS total_orders,
  COUNT(*) FILTER (WHERE business_id IS NOT NULL) AS orders_with_business_id,
  COUNT(*) FILTER (WHERE business_id IS NULL)     AS orders_still_null
FROM public.orders;

SELECT 'driver_business_isolation.sql applied ✅' AS result;
