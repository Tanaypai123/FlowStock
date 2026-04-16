-- ─── invoice_system.sql ──────────────────────────────────────────────────────
-- Creates two tables for the standalone Invoice system.
-- Run in Supabase → SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. invoice_tax_settings
--    Stores versioned tax/charge configurations per business admin.
--    Each UPDATE creates a new row so old invoices remain unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invoice_tax_settings (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- JSONB array of charge objects:
  --   [{ "label": "GST", "type": "percent"|"fixed", "value": 18 }, ...]
  charges     jsonb   NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Only one row per admin is the "active" setting — it's always the LATEST row.
-- Old rows are kept for historical reference (so old invoices can re-render correctly).

CREATE INDEX IF NOT EXISTS invoice_tax_settings_admin_id_idx
  ON public.invoice_tax_settings (admin_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. manual_invoices
--    Stores invoices created manually by the business owner (not from orders).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.manual_invoices (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name   text        NOT NULL DEFAULT '',
  customer_phone  text        NOT NULL DEFAULT '',
  customer_address text       NOT NULL DEFAULT '',
  -- JSONB array: [{ "item_name": "X", "quantity": 2, "unit_price": 100 }, ...]
  line_items      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Snapshot of the tax settings used at creation time
  charges_snapshot jsonb      NOT NULL DEFAULT '[]'::jsonb,
  subtotal        numeric(12,2) NOT NULL DEFAULT 0,
  charges_total   numeric(12,2) NOT NULL DEFAULT 0,
  grand_total     numeric(12,2) NOT NULL DEFAULT 0,
  notes           text        NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_invoices_admin_id_idx
  ON public.manual_invoices (admin_id, created_at DESC);

SELECT 'invoice_system.sql applied' AS result;
