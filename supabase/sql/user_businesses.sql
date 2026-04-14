-- ─── user_businesses.sql ─────────────────────────────────────────────────────
-- Maps users to businesses with a role.
-- Run in Supabase Dashboard → SQL Editor.

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.user_businesses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  business_id uuid        NOT NULL REFERENCES business_profile(id)   ON DELETE CASCADE,
  role        text        NOT NULL CHECK (role IN ('admin', 'customer', 'driver')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id)
);

-- 2. Enable RLS
ALTER TABLE public.user_businesses ENABLE ROW LEVEL SECURITY;

-- 3. Policies
DROP POLICY IF EXISTS "ub_select_own" ON public.user_businesses;
DROP POLICY IF EXISTS "ub_insert_own" ON public.user_businesses;

-- Users can read their own mappings
CREATE POLICY "ub_select_own"
  ON public.user_businesses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own mappings (used during onboarding)
CREATE POLICY "ub_insert_own"
  ON public.user_businesses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

SELECT 'user_businesses table created successfully' AS result;
