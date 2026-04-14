-- ─── inventory_unit.sql ───────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor
-- Adds 'unit' column to inventory_items (kg, litre, piece, box, dozen)

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS unit text DEFAULT 'piece';

-- Backfill existing rows to 'piece'
UPDATE inventory_items SET unit = 'piece' WHERE unit IS NULL;
