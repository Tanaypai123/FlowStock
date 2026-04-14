-- ─────────────────────────────────────────────────────────────────────────────
-- Add confirmed_at, dispatched_at, and final_total columns to orders table.
-- Used for SLA timer, order timeline, and revenue analytics.
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS confirmed_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS final_total   NUMERIC(12,2) DEFAULT NULL;

-- Backfill confirmed_at / dispatched_at from updated_at (best-effort)
UPDATE public.orders
  SET confirmed_at = updated_at
  WHERE status IN ('confirmed', 'dispatched', 'delivered')
    AND confirmed_at IS NULL;

UPDATE public.orders
  SET dispatched_at = updated_at
  WHERE status IN ('dispatched', 'delivered')
    AND dispatched_at IS NULL;

-- Backfill final_total from order_line_items minus discount_value
UPDATE public.orders o
  SET final_total = GREATEST(0,
    COALESCE((
      SELECT SUM(oli.quantity * oli.price)
      FROM order_line_items oli
      WHERE oli.order_id = o.id
    ), 0)
    - COALESCE(o.discount_value, 0)
  )
  WHERE o.final_total IS NULL
    AND o.status NOT IN ('cancelled', 'rejected');
