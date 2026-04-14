-- ─────────────────────────────────────────────────────────────────────────────
-- Complaints table
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.complaints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message    TEXT NOT NULL CHECK (char_length(message) >= 10),
  status     TEXT NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'in_review', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complaints_customer_idx ON public.complaints (customer_id);
CREATE INDEX IF NOT EXISTS complaints_status_idx   ON public.complaints (status);
CREATE INDEX IF NOT EXISTS complaints_created_idx  ON public.complaints (created_at DESC);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
-- Service role (Express) bypasses RLS. Add customer-facing policies if needed.
