-- Run in Supabase SQL Editor after orders_production_enhancements.sql (or alongside).
-- Per-line price column, optional inventory link, order-level discount.

alter table public.orders
  add column if not exists discount_type text not null default 'fixed'
    check (discount_type in ('fixed', 'percent')),
  add column if not exists discount_input numeric not null default 0 check (discount_input >= 0),
  add column if not exists discount_value numeric not null default 0 check (discount_value >= 0);

alter table public.order_line_items
  add column if not exists price numeric check (price is null or price >= 0);

update public.order_line_items
set price = unit_price
where price is null;

alter table public.order_line_items
  add column if not exists inventory_item_id uuid references public.inventory_items (id) on delete set null;
