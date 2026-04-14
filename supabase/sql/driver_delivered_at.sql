-- Migration: Add delivered_at timestamp to orders
-- Run in Supabase SQL Editor

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Create the delivery-proofs storage bucket (run once)
-- Note: Do this in Supabase Dashboard > Storage > New Bucket
-- Name: delivery-proofs
-- Public: true (so public URLs work without signed URLs)
-- File size limit: 10MB
-- Allowed MIME types: image/jpeg, image/png, image/webp, image/heic
