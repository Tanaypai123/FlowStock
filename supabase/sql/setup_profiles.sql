-- Run this in Supabase → SQL Editor (once per project).
-- Fixes: "Signed in, but your profile has no valid role" for new and existing users.

-- 1) Table
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'customer', 'driver')),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App roles; id matches auth.users.id';

-- 2) RLS
alter table public.profiles enable row level security;

-- Drop policies if re-running (ignore errors if first run)
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

-- No UPDATE for clients (would allow changing role to "admin"). Change roles in Supabase Table Editor or via service role API.

-- No INSERT policy for clients — rows come from trigger + SQL backfills.

-- 3) New signups → default role (adjust default if you prefer)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 4) Backfill users who already signed up before this script (replace email if needed)
-- insert into public.profiles (id, role)
-- select id, 'customer' from auth.users
-- where email = 'creativetanay1@gmail.com'
-- on conflict (id) do update set role = excluded.role;

-- Or backfill everyone missing a profile:
insert into public.profiles (id, role)
select u.id, 'customer'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
