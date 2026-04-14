-- ─── Supabase Storage: business-logos bucket ─────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor

-- Create the bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'business-logos',
  'business-logos',
  true,             -- public bucket (URLs are directly accessible without auth)
  2097152,          -- 2 MB limit
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152;

-- Allow anyone to view (GET) files (needed for logo_url in customer portal)
DROP POLICY IF EXISTS "Public logo read" ON storage.objects;
CREATE POLICY "Public logo read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'business-logos');

-- Allow authenticated admin users to upload/update their own logo
DROP POLICY IF EXISTS "Admin logo upload" ON storage.objects;
CREATE POLICY "Admin logo upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'business-logos'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Admin logo update" ON storage.objects;
CREATE POLICY "Admin logo update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'business-logos'
    AND auth.role() = 'authenticated'
  );
