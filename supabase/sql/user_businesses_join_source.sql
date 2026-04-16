-- ─── Migration: add join_source to user_businesses ───────────────────────────
-- Tracks how each customer joined a business.
-- Values: 'join_code' | 'join_link' | 'invite_upload' | 'manual_invite'

ALTER TABLE user_businesses
  ADD COLUMN IF NOT EXISTS join_source VARCHAR(20) DEFAULT 'join_code';

-- Backfill existing rows (all legacy joins assumed to be via code)
UPDATE user_businesses
SET join_source = 'join_code'
WHERE join_source IS NULL;

-- Ensure it can never be null going forward
ALTER TABLE user_businesses
  ALTER COLUMN join_source SET NOT NULL,
  ALTER COLUMN join_source SET DEFAULT 'join_code';
