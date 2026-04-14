-- Run in Supabase SQL Editor

-- 1. Create bug_reports table
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  severity text NOT NULL,
  description text NOT NULL,
  image_urls text[] DEFAULT '{}',
  device_info jsonb DEFAULT '{}'::jsonb,
  page_url text,
  reported_by_type text NOT NULL CHECK (reported_by_type IN ('admin', 'customer', 'driver')),
  reported_by_id uuid NOT NULL,
  business_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'wont_fix')),
  super_admin_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS for bug_reports (service role can do anything)
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- 2. Create bug-screenshots storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('bug-screenshots', 'bug-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage.objects (service role handles uploads, public can read)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'Public cross-bucket read'
  ) THEN
    CREATE POLICY "Public cross-bucket read"
      ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'bug-screenshots');
  END IF;
END $$;

-- ─── Patch for existing tables (safe to run multiple times) ──────────────────
-- Adds missing columns if table was already created with the old schema
ALTER TABLE public.bug_reports ADD COLUMN IF NOT EXISTS super_admin_note text;
ALTER TABLE public.bug_reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Fix status constraint to match backend values (in_review + wont_fix)
ALTER TABLE public.bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
ALTER TABLE public.bug_reports
  ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN ('open', 'in_review', 'resolved', 'wont_fix'));
