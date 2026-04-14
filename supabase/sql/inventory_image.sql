-- ─── inventory_image.sql ───────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor
-- Adds image_url column to inventory_items + creates product-images storage bucket

-- 1. Add image_url column
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Storage bucket for product images (public, max 5MB, jpg/png/webp)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

-- 3. Public read access
DROP POLICY IF EXISTS "Public read product image" ON storage.objects;
CREATE POLICY "Public read product image"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- 4. Admin upload access
DROP POLICY IF EXISTS "Admin upload product image" ON storage.objects;
CREATE POLICY "Admin upload product image"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images' AND auth.role() = 'authenticated');

-- 5. Admin update/overwrite
DROP POLICY IF EXISTS "Admin update product image" ON storage.objects;
CREATE POLICY "Admin update product image"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images' AND auth.role() = 'authenticated');
