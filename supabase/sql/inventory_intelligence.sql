-- ─────────────────────────────────────────────────────────────────────────────
-- Smart Inventory Intelligence: new columns on inventory_items
-- Run once in Supabase SQL Editor.
-- All columns use DEFAULT values — existing rows are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

-- Original stock when item was first stocked / reset by admin
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS initial_stock NUMERIC NOT NULL DEFAULT 0
    CHECK (initial_stock >= 0);

-- Alert flag: set true when 50% warning is sent; reset when stock rises above 50%
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS alert_50_sent BOOLEAN NOT NULL DEFAULT false;

-- Alert flag: set true when critical alert is sent; reset when stock rises above threshold
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS alert_low_sent BOOLEAN NOT NULL DEFAULT false;

-- created_at (for avg-sales-per-day calculation)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill initial_stock = quantity for existing rows that haven't been set yet
-- (sets a reasonable baseline; admins can update via the Edit modal)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.inventory_items
  SET initial_stock = quantity
  WHERE initial_stock = 0 AND quantity > 0;
