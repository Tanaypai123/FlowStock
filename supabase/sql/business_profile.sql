-- ─── Business Profile Table ──────────────────────────────────────────────────
-- Run once in Supabase SQL Editor.
-- Stores per-admin business identity for white-label branding and alert routing.

CREATE TABLE IF NOT EXISTS business_profile (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name       text        NOT NULL,
  owner_name          text        NOT NULL,
  phone               text        NOT NULL,
  email               text,
  address             text,
  warehouse_location  text,
  business_type       text        CHECK (business_type IN ('Retail','Wholesale','Distributor','Manufacturer')),
  gst_number          text,
  logo_url            text,
  brand_color         text        DEFAULT '#6366f1',
  updates_phone       text        NOT NULL,   -- receives all WhatsApp system alerts
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(admin_id)
);

-- RLS: each admin can only see/edit their own profile
ALTER TABLE business_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_own_select" ON business_profile;
DROP POLICY IF EXISTS "admin_own_insert" ON business_profile;
DROP POLICY IF EXISTS "admin_own_update" ON business_profile;

CREATE POLICY "admin_own_select" ON business_profile
  FOR SELECT USING (admin_id = auth.uid());

CREATE POLICY "admin_own_insert" ON business_profile
  FOR INSERT WITH CHECK (admin_id = auth.uid());

CREATE POLICY "admin_own_update" ON business_profile
  FOR UPDATE USING (admin_id = auth.uid());
