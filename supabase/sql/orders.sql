-- Run in Supabase SQL Editor (after profiles exists).
alter table public.profiles
  add column if not exists display_name text;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  driver_id uuid references public.profiles (id),
  region text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'dispatched', 'delivered', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  item_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0)
);

create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists order_line_items_order_id_idx on public.order_line_items (order_id);

alter table public.orders enable row level security;
alter table public.order_line_items enable row level security;

-- Service role (Express) bypasses RLS. Add policies later for customers/drivers if needed.
