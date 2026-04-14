-- Run in Supabase SQL Editor after orders.sql / inventory_items.sql.
-- Company branding for invoices + walk-in orders + optional catalog pricing.

-- 1) Singleton app config (edit row in Table Editor to customize)
create table if not exists public.app_config (
  id smallint primary key default 1 check (id = 1),
  company_name text not null default 'FlowStock Pvt Ltd',
  company_phone text not null default '',
  company_address text not null default ''
);

insert into public.app_config (id, company_name, company_phone, company_address)
values (
  1,
  'FlowStock Pvt Ltd',
  '',
  ''
)
on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- 2) Orders: allow walk-in (no linked profile) + guest fields + delivery address
alter table public.orders
  alter column customer_id drop not null;

alter table public.orders
  add column if not exists guest_customer_name text,
  add column if not exists guest_customer_phone text,
  add column if not exists customer_address text;

-- 3) Optional selling price on inventory (used when adding items to orders)
alter table public.inventory_items
  add column if not exists unit_price numeric not null default 0 check (unit_price >= 0);
