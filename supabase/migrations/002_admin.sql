-- =====================================================================
-- Poultry360 · migration 002: ops admin dashboard (farm approvals)
-- For a project that already ran schema.sql. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================

-- Admins are added from the SQL editor only. RLS on + no policies = apps can't read or write it.
create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- All farm applications with owner details, newest first
create or replace function public.admin_vendors() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', v.user_id, 'business_name', v.business_name, 'categories', v.categories,
      'location', v.location, 'lat', v.lat, 'lng', v.lng, 'id_doc_path', v.id_doc_path,
      'verification_status', v.verification_status, 'rejection_reason', v.rejection_reason,
      'rating', v.rating, 'rating_count', v.rating_count, 'created_at', v.created_at,
      'owner_name', p.full_name, 'email', coalesce(p.email, u.email), 'phone', p.phone,
      'listings', (select count(*) from listings l where l.vendor_id = v.user_id)
    ) order by v.created_at desc)
    from vendor_profiles v
    join profiles p on p.id = v.user_id
    left join auth.users u on u.id = v.user_id
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_verification(p_user uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'INVALID_STATUS'; end if;
  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  update vendor_profiles
     set verification_status = p_status,
         rejection_reason = case when p_status = 'rejected' then trim(p_reason) end
   where user_id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Admins can view farm ID documents (private bucket)
drop policy if exists p360_admin_read_id_docs on storage.objects;
create policy p360_admin_read_id_docs on storage.objects for select to authenticated
  using (bucket_id = 'id-docs' and public.is_admin());

-- Make yourself an admin (use the email you sign in to the dashboard with):
-- insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
