-- ─── driver_auth.sql ─────────────────────────────────────────────────────────
-- Driver Authentication Tables
-- Run in Supabase Dashboard → SQL Editor
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. drivers table — stores driver credentials (completely separate from Supabase auth)
CREATE TABLE IF NOT EXISTS public.drivers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone               text        NOT NULL UNIQUE,
  password_hash       text        NOT NULL,
  name                text,
  vehicle_details     text,           -- e.g. "White Maruti Alto — RJ14 XX 1234"
  license_number      text,
  is_profile_complete boolean     NOT NULL DEFAULT false,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 2. driver_sessions table — token-based session management (30-day tokens)
CREATE TABLE IF NOT EXISTS public.driver_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  token       text        NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. driver_business_links — many-to-many: drivers ↔ businesses
CREATE TABLE IF NOT EXISTS public.driver_business_links (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid        NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  business_id uuid        NOT NULL REFERENCES public.business_profile(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, business_id)
);

-- 4. Indexes for fast lookup
CREATE INDEX IF NOT EXISTS drivers_phone_idx          ON public.drivers (phone);
CREATE INDEX IF NOT EXISTS driver_sessions_token_idx  ON public.driver_sessions (token);
CREATE INDEX IF NOT EXISTS driver_sessions_driver_idx ON public.driver_sessions (driver_id);
CREATE INDEX IF NOT EXISTS dbl_driver_idx             ON public.driver_business_links (driver_id);
CREATE INDEX IF NOT EXISTS dbl_business_idx           ON public.driver_business_links (business_id);

-- 5. RLS — service role bypasses, no public access
ALTER TABLE public.drivers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_business_links ENABLE ROW LEVEL SECURITY;

-- No policies required — all access goes through service role (supabaseAdmin)

SELECT 'driver_auth.sql applied ✅' AS result;
