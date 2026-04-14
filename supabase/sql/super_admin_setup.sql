-- ============================================================
-- super_admin_setup.sql
-- Run ONCE in Supabase SQL Editor.
-- ============================================================

-- 1. api_logs table for the API logger middleware
CREATE TABLE IF NOT EXISTS public.api_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  method           text        NOT NULL,
  endpoint         text        NOT NULL,
  status_code      int         NOT NULL,
  response_time_ms int,
  business_id      uuid        REFERENCES public.business_profile(id) ON DELETE SET NULL,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for fast queries by endpoint and time
CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint    ON public.api_logs (endpoint);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at  ON public.api_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_status_code ON public.api_logs (status_code);
CREATE INDEX IF NOT EXISTS idx_api_logs_business    ON public.api_logs (business_id);

-- RLS: only service role can insert/read (Express uses service role)
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;

-- 2. Add 'super_admin' to the profiles role check (if there's a constraint)
-- If profiles.role has a CHECK constraint, run this to add super_admin.
-- Safe to run even if it already includes super_admin.
DO $$
BEGIN
  -- Drop old check if it exists
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
  -- Re-add with super_admin included
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'customer', 'driver', 'super_admin'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Could not update role CHECK constraint: %', SQLERRM;
END;
$$;

-- 3. SET your user as super_admin (replace with your actual Supabase user UUID)
-- Find your UUID: SELECT id FROM auth.users WHERE email = 'your@email.com';
--
-- UPDATE public.profiles
-- SET role = 'super_admin'
-- WHERE id = 'YOUR-UUID-HERE';

SELECT 'super_admin_setup.sql applied ✅' AS result;
