-- ─────────────────────────────────────────────────────────────────────────────
-- Add stock_deducted flag to orders
-- Ensures inventory deduction runs exactly once per order, regardless of how
-- many times an admin changes status.
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark existing confirmed/dispatched/delivered orders as already deducted
-- (prevents re-deducting historical orders on their next status change)
UPDATE public.orders
  SET stock_deducted = true
  WHERE status IN ('confirmed', 'dispatched', 'delivered');
