-- Run in Supabase SQL Editor once.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stage text not null check (stage in ('raw', 'processing', 'packaged', 'ready')),
  quantity numeric not null default 0 check (quantity >= 0),
  low_stock_alert numeric not null default 0 check (low_stock_alert >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_stage_idx on public.inventory_items (stage);
create index if not exists inventory_items_updated_at_idx on public.inventory_items (updated_at desc);

alter table public.inventory_items enable row level security;

-- Adjust policies for your app; service role (Express) bypasses RLS.
-- Example: admins only via profiles check would need a policy function.
