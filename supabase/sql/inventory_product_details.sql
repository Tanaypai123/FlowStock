-- ─── inventory_product_details.sql ───────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor
-- Adds description and image_urls array to inventory_items

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_urls  text[] DEFAULT '{}';

-- Backfill: if existing image_url is set, copy into image_urls array
UPDATE inventory_items
  SET image_urls = ARRAY[image_url]
  WHERE image_url IS NOT NULL AND image_url != ''
    AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);
