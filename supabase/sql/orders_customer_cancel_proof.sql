-- Migration: Add 'cancelled' status + proof_url column to orders
-- Run in Supabase SQL Editor

-- 1. Drop the old status check constraint and add 'cancelled'
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
    check (status in ('pending', 'confirmed', 'dispatched', 'delivered', 'rejected', 'cancelled'));

-- 2. Add proof_url (populated by driver when delivering)
alter table public.orders
  add column if not exists proof_url text;
