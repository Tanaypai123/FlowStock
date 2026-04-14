-- ─────────────────────────────────────────────────────────────────────────────
-- Delivery Verification System: adds OTP + verification tracking to orders.
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS verification_otp    VARCHAR(6)   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS verification_status TEXT         DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_method TEXT         DEFAULT NULL;

-- verification_status: 'pending' | 'verified'
-- verification_method: 'otp' | 'qr'

COMMENT ON COLUMN public.orders.verification_otp    IS '6-digit OTP for delivery verification';
COMMENT ON COLUMN public.orders.verification_status IS 'pending or verified';
COMMENT ON COLUMN public.orders.verification_method IS 'otp or qr – how it was verified';
