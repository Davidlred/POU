-- =====================================================================
-- 020 · Admins by email
-- Put an email on the admin list before that person has an account. They then sign up straight
-- from the ops dashboard (email → code → password) and are let in. The list survives wipe_data.sql.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- Add an admin:     insert into public.admin_emails (email) values ('you@example.com') on conflict do nothing;
-- Remove an admin:  delete from public.admin_emails where lower(email) = lower('you@example.com');
--                   (and delete their row in public.admins, if they were added the old way)
-- =====================================================================

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz default now()
);
alter table public.admin_emails enable row level security;   -- no policies: SQL editor only

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
      or exists (select 1 from admin_emails e join auth.users u on lower(u.email) = lower(e.email) where u.id = auth.uid());
$$;
