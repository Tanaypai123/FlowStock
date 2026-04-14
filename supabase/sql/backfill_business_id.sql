-- ============================================================
-- backfill_business_id.sql
-- Run ONCE in Supabase SQL Editor to fix legacy orders that
-- were created before the business_id column was added.
-- ============================================================

-- 1. Add business_id column to orders if it doesn't exist yet
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES business_profile(id);

-- 2. Backfill orders: stamp business_id from business_profile via admin_id
UPDATE orders o
SET    business_id = bp.id
FROM   business_profile bp
WHERE  o.admin_id    = bp.admin_id
AND    o.business_id IS NULL;

-- 3. Verify — should return 0 if all orders are now stamped
SELECT COUNT(*) AS unstamped_orders
FROM   orders
WHERE  business_id IS NULL
AND    admin_id    IS NOT NULL;

-- 4. Optional: index for fast scoped queries
CREATE INDEX IF NOT EXISTS idx_orders_business_id
  ON orders (business_id);

CREATE INDEX IF NOT EXISTS idx_orders_driver_business
  ON orders (driver_id, business_id);

-- Note: inventory_items uses admin_id for business scoping (no business_id column needed).

-- ============================================================
-- DONE — verify with:
-- SELECT admin_id, business_id, COUNT(*) FROM orders GROUP BY 1, 2 ORDER BY 1;
-- ============================================================
