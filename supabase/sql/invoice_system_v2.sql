-- ─── invoice_system_v2.sql ───────────────────────────────────────────────────
-- Adds discount support to manual_invoices.
-- Run in Supabase → SQL Editor AFTER invoice_system.sql.

ALTER TABLE public.manual_invoices
  ADD COLUMN IF NOT EXISTS discount_type  text    NOT NULL DEFAULT 'fixed'
    CHECK (discount_type IN ('percent', 'fixed')),
  ADD COLUMN IF NOT EXISTS discount_input numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_value numeric(12,2) NOT NULL DEFAULT 0;

SELECT 'invoice_system_v2.sql applied' AS result;
