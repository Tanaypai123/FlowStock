-- ─── business_isolation.sql ────────────────────────────────────────────────────
-- Adds admin_id (business ownership) to inventory_items and orders.
-- admin_id references business_profile(admin_id) → ties items to a business owner.
-- Run in Supabase → SQL Editor.

-- 1. Add admin_id to inventory_items
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Add admin_id to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Backfill: assign existing rows to the FIRST admin found in business_profile.
--    (For single-business deployments this is always correct.)
DO $$
DECLARE
  v_admin_id uuid;
BEGIN
  SELECT admin_id INTO v_admin_id FROM public.business_profile LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    UPDATE public.inventory_items SET admin_id = v_admin_id WHERE admin_id IS NULL;
    UPDATE public.orders           SET admin_id = v_admin_id WHERE admin_id IS NULL;
  END IF;
END $$;

-- 4. Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS inventory_items_admin_id_idx ON public.inventory_items (admin_id);
CREATE INDEX IF NOT EXISTS orders_admin_id_idx          ON public.orders (admin_id);

SELECT 'business_isolation.sql applied' AS result;
