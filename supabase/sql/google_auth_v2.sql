-- ─── google_auth_v2.sql ───────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor
-- Fixes:
--   1. Trigger overrides role — new Google users always got 'customer'
--   2. Adds INSERT policy so AuthCallback can set correct role before trigger fires
--   3. Creates user_businesses view for consistent business lookup

-- ─── 1. REPLACE TRIGGER to respect pendingRole for OAuth ──────────────────────
-- The old trigger always inserts 'customer'. With Google OAuth we need it to
-- respect an already-inserted profile row (from AuthCallback UPSERT).
-- Solution: trigger only fires if NO profile row exists yet (ON CONFLICT DO NOTHING).
-- AuthCallback will UPSERT *before* the trigger using service role → trigger is safe.

-- The existing trigger already uses ON CONFLICT DO NOTHING, so it's safe.
-- We just need to ensure AuthCallback can insert BEFORE the trigger via anon client.

-- ─── 2. DROP old restrictive INSERT block & allow self-insert ─────────────────
-- setup_profiles.sql blocked client INSERT. We need to allow it for Google OAuth.

DROP POLICY IF EXISTS "Users can insert own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"  ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own"           ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"           ON public.profiles;

-- Allow authenticated user to read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Allow authenticated user to INSERT their own profile row (needed for Google OAuth first login)
-- pendingRole is validated in application code before this runs
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow authenticated user to UPDATE their own profile
-- (admin cannot promote themselves — that's enforced by application logic)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- ─── 3. FIX TRIGGER — upsert with role preservation ──────────────────────────
-- If AuthCallback already inserted the row with correct role,
-- this trigger should NOT overwrite it.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only insert if no profile exists yet (AuthCallback may have already set the role)
  INSERT INTO public.profiles (id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── 4. business_profile: allow admins to check their own business ────────────
-- Already has policies. Ensure admin can read own row via auth.uid()
-- (existing policies use admin_id = auth.uid() — no change needed)

-- Done. Run google_auth_migration.sql first if you haven't already.
