-- =====================================================================
-- Poultry360 · migration 001: switch sign-in from phone SMS to email code
-- For a project that already ran schema.sql. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================

-- Profiles keep the user's email
alter table public.profiles add column if not exists email text;
update public.profiles p set email = lower(u.email)
  from auth.users u where u.id = p.id and p.email is null and u.email is not null;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone, email) values (new.id, new.phone, lower(new.email)) on conflict do nothing;
  insert into wallets (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- Riders sign in by email; phone becomes an optional contact number
alter table public.riders add column if not exists email text;
alter table public.riders alter column phone drop not null;
do $$ begin
  alter table public.riders add constraint riders_email_key unique (email);
exception when duplicate_object or duplicate_table then null;
end $$;

create or replace function public.rider_claim() returns riders
language plpgsql security definer set search_path = public as $$
declare r riders; v_email text;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  update riders set user_id = auth.uid()
   where user_id is null and v_email is not null and lower(email) = v_email;
  select * into r from riders where user_id = auth.uid();
  return r;
end $$;

-- Give existing riders their sign-in email, e.g.:
-- update public.riders set email = 'tunde@example.com' where phone = '2348030000003';
