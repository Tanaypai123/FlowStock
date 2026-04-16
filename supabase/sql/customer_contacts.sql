-- ─── customer_contacts table for Customer Boost feature ──────────────────────
CREATE TABLE IF NOT EXISTS customer_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  business_name VARCHAR(150),
  source VARCHAR(20) DEFAULT 'manual',
  invite_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, phone)
);

-- Add business_name to existing tables (safe if already exists)
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS business_name VARCHAR(150);

-- Index for fast lookups by business
CREATE INDEX IF NOT EXISTS idx_customer_contacts_business_id
  ON customer_contacts (business_id);
