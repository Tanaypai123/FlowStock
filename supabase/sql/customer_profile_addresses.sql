-- ─── Customer Profile & Saved Addresses ──────────────────────────────────────
-- Run in Supabase SQL Editor

-- 1. Extend profiles with customer-specific fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone        text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS email        text;

-- 2. Saved delivery addresses per customer
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT 'Home',   -- e.g. Home, Office, Shop
  region      text NOT NULL,
  address     text NOT NULL,
  pincode     text,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by customer
CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx
  ON public.customer_addresses (customer_id);

-- Enable RLS (backend uses supabaseAdmin so RLS won't block server routes)
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
