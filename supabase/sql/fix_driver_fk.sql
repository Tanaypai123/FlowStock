-- ============================================================
-- fix_driver_fk.sql  (v2 — safe to re-run)
-- Fixes orders.driver_id FK to point to drivers(id).
-- Also clears stale driver_id values from old auth system.
-- ============================================================

-- STEP 1: Drop any existing driver_id FK (regardless of what it points to)
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_driver_id_fkey;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE  conrelid = 'public.orders'::regclass
    AND    contype  = 'f'
    AND    conname  LIKE '%driver_id%'
  LOOP
    EXECUTE 'ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    RAISE NOTICE 'Dropped FK: %', r.conname;
  END LOOP;
END;
$$;

-- STEP 2: NULL out stale driver_id values that reference old profiles UUIDs
-- (any driver_id that is NOT found in the new drivers table is invalid)
UPDATE public.orders
SET    driver_id = NULL
WHERE  driver_id IS NOT NULL
  AND  driver_id NOT IN (SELECT id FROM public.drivers);

-- Confirm how many stale values were cleared
DO $$
DECLARE cleared int;
BEGIN
  GET DIAGNOSTICS cleared = ROW_COUNT;
  RAISE NOTICE 'Cleared % stale driver_id values from orders', cleared;
END;
$$;

-- STEP 3: Add new FK pointing to drivers(id)
ALTER TABLE public.orders
  ADD CONSTRAINT orders_driver_id_fkey
  FOREIGN KEY (driver_id)
  REFERENCES public.drivers (id)
  ON DELETE SET NULL;

-- STEP 4: Verify
SELECT
  kcu.column_name,
  ccu.table_name AS references_table
FROM information_schema.table_constraints        AS tc
JOIN information_schema.key_column_usage         AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage  AS ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name      = 'orders'
  AND kcu.column_name    = 'driver_id'
  AND tc.constraint_type = 'FOREIGN KEY';

SELECT 'fix_driver_fk.sql applied ✅ — orders.driver_id now references drivers(id)' AS result;
