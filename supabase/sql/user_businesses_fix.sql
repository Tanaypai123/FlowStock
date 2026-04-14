-- ─── user_businesses_fix.sql ──────────────────────────────────────────────────
-- Run AFTER user_businesses.sql if that has already been applied.
-- Fixes the unique constraint name so Supabase upsert can reference it.

-- Add named unique constraint (DROP first if unnamed one exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_businesses'::regclass
      AND conname = 'user_businesses_user_id_business_id_key'
  ) THEN
    ALTER TABLE public.user_businesses
      ADD CONSTRAINT user_businesses_user_id_business_id_key
      UNIQUE (user_id, business_id);
  END IF;
END $$;

SELECT 'user_businesses constraint confirmed' AS result;
