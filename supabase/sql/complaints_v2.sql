-- ─── complaints_v2.sql ────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor
-- Adds structured fields to complaints table + creates complaint-images bucket

-- 1. Extend complaints table with structured fields
ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS order_id      uuid REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_name  text,
  ADD COLUMN IF NOT EXISTS issue_type    text,
  ADD COLUMN IF NOT EXISTS image_urls    text[] DEFAULT '{}';

-- 2. Storage bucket for complaint proof images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'complaint-images',
  'complaint-images',
  true,
  5242880,   -- 5 MB per file
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

-- 3. Allow authenticated users to upload to the bucket
DROP POLICY IF EXISTS "Customer upload complaint image" ON storage.objects;
CREATE POLICY "Customer upload complaint image"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'complaint-images' AND auth.role() = 'authenticated');

-- 4. Allow public reads (for image previews)
DROP POLICY IF EXISTS "Public read complaint image" ON storage.objects;
CREATE POLICY "Public read complaint image"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'complaint-images');

-- 5. Allow users to update (overwrite) their uploads
DROP POLICY IF EXISTS "Customer update complaint image" ON storage.objects;
CREATE POLICY "Customer update complaint image"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'complaint-images' AND auth.role() = 'authenticated');
