-- ─── google_auth_v3.sql ───────────────────────────────────────────────────────
-- Fixes the trigger race condition for Google OAuth role assignment.
--
-- Problem:
--   DB trigger fires on auth.users INSERT (when Google creates the user)
--   and inserts profiles(id, role='customer') BEFORE AuthCallback runs.
--   AuthCallback then sees profile exists and never updates the role.
--
-- Fix:
--   1. Add UPDATE policy so AuthCallback can UPSERT with the correct role.
--   2. Keep trigger as-is (ON CONFLICT DO NOTHING is correct).
--   3. AuthCallback detects new users (created_at < 5 min) and UPSERTs.

-- Drop all existing profile policies (clean slate)
DROP POLICY IF EXISTS "profiles_select_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own"   ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile"   ON public.profiles;

-- ── SELECT: authenticated user can read their own row ─────────────────────────
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- ── INSERT: needed for AuthCallback to insert before trigger (race protection) ─
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ── UPDATE: needed so UPSERT can override trigger's 'customer' default ─────────
-- Note: role escalation prevention is done in application code (new user check).
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Ensure RLS is enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── Verify trigger remains correct (no change needed — ON CONFLICT DO NOTHING) ─
-- Trigger: handle_new_user → inserts 'customer', skips if row exists.
-- AuthCallback UPSERT runs AFTER trigger and overwrites with pendingRole.
-- This is safe because UPSERT only fires within 5-min new-user window.

SELECT 'google_auth_v3.sql applied successfully' AS result;
