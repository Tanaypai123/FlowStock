-- ─── complaints_v3.sql ────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → SQL Editor
-- Adds admin response fields to complaints table

ALTER TABLE complaints
  ADD COLUMN IF NOT EXISTS admin_comment      text,
  ADD COLUMN IF NOT EXISTS resolution_message text,
  ADD COLUMN IF NOT EXISTS resolved_at        timestamptz;
