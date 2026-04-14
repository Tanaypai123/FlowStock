-- ─────────────────────────────────────────────────────────────────────────────
-- Adds "out_for_delivery" status to the orders table.
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- If you have a CHECK constraint on status, update it:
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','confirmed','dispatched','out_for_delivery','delivered','rejected','cancelled'));

-- Track when order went out for delivery
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ DEFAULT NULL;
