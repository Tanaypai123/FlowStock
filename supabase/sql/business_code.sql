-- ─── business_code.sql ───────────────────────────────────────────────────────
-- Adds a unique business_code column to business_profile for customer invite links.
-- Run in Supabase Dashboard → SQL Editor.

-- 1. Add the column (idempotent)
ALTER TABLE public.business_profile
  ADD COLUMN IF NOT EXISTS business_code text UNIQUE;

-- 2. Generate codes for existing rows that don't have one yet
--    Format: 6 uppercase alphanumeric chars (e.g. "KX7B2Q")
UPDATE public.business_profile
SET business_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6))
WHERE business_code IS NULL;

-- 3. Make it NOT NULL after backfill
ALTER TABLE public.business_profile
  ALTER COLUMN business_code SET NOT NULL;

-- 4. Ensure unique index exists
CREATE UNIQUE INDEX IF NOT EXISTS business_profile_code_idx
  ON public.business_profile (business_code);

SELECT 'business_code column added successfully' AS result;
