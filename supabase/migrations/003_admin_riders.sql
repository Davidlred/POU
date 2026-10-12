-- =====================================================================
-- Poultry360 · migration 003: ops dashboard manages riders
-- Requires 001 (rider email) and 002 (admins / is_admin). Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================

-- Admins can read every rider row (also lets the dashboard receive realtime status changes)
drop policy if exists riders_admin_r on public.riders;
create policy riders_admin_r on public.riders for select using (public.is_admin());

-- All riders with delivery stats, newest first
create or replace function public.admin_riders() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'email', r.email, 'phone', r.phone, 'name', r.name, 'vehicle', r.vehicle, 'plate', r.plate, 'zone', r.zone,
      'status', r.status, 'active', r.active, 'signed_in', r.user_id is not null,
      'location_updated_at', r.location_updated_at, 'created_at', r.created_at,
      'delivered', (select count(*) from delivery_assignments d where d.rider_id = r.id and d.status = 'delivered'),
      'on_job', exists (select 1 from delivery_assignments d where d.rider_id = r.id and d.status in ('accepted','at_farm','picked_up','at_buyer'))
    ) order by r.created_at desc)
    from riders r
  ), '[]'::jsonb);
end $$;

-- Create (p_id null) or update a rider. The rider signs in to the rider app with p_email.
create or replace function public.admin_save_rider(p_id uuid, p_email text, p_name text, p_phone text default null,
  p_vehicle text default 'Bike', p_plate text default null, p_zone text default null) returns riders
language plpgsql security definer set search_path = public as $$
declare r riders; v_email text := lower(trim(p_email)); v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'INVALID_EMAIL'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
  -- Nigerian numbers: 0803… or 803… → 234803…
  if v_phone is not null then
    if v_phone ~ '^0\d{10}$' then v_phone := '234' || substr(v_phone, 2);
    elsif v_phone ~ '^\d{10}$' then v_phone := '234' || v_phone; end if;
    if v_phone !~ '^234\d{10}$' then raise exception 'INVALID_PHONE'; end if;
  end if;
  begin
    if p_id is null then
      insert into riders (email, name, phone, vehicle, plate, zone)
      values (v_email, trim(p_name), v_phone, coalesce(nullif(trim(p_vehicle), ''), 'Bike'), nullif(trim(p_plate), ''), nullif(trim(p_zone), ''))
      returning * into r;
    else
      update riders set
        -- A new sign-in email unlinks the old login; the rider re-links by signing in with the new email.
        user_id = case when lower(email) is distinct from v_email then null else user_id end,
        email = v_email, name = trim(p_name), phone = v_phone,
        vehicle = coalesce(nullif(trim(p_vehicle), ''), 'Bike'), plate = nullif(trim(p_plate), ''), zone = nullif(trim(p_zone), '')
      where id = p_id returning * into r;
      if r.id is null then raise exception 'NOT_FOUND'; end if;
    end if;
  exception when unique_violation then
    if sqlerrm like '%email%' then raise exception 'EMAIL_TAKEN'; end if;
    if sqlerrm like '%phone%' then raise exception 'PHONE_TAKEN'; end if;
    raise;
  end;
  -- If this person already has an account, link it now (rider_claim also does this at sign-in).
  update riders set user_id = u.id from auth.users u
   where riders.id = r.id and riders.user_id is null and lower(u.email) = v_email
     and not exists (select 1 from riders x where x.user_id = u.id);
  select * into r from riders where id = r.id;
  return r;
end $$;

-- Deactivated riders get no new jobs (assign_rider checks active) and go offline unless mid-delivery.
create or replace function public.admin_set_rider_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  update riders set active = p_active,
    status = case when not p_active and status = 'available' then 'offline' else status end
  where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
