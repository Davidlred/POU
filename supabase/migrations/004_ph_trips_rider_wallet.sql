-- =====================================================================
-- Poultry360 · migration 004: Port Harcourt launch, multi-order rider trips,
-- instant dispatch, rider earnings / wallet / profile.
-- Requires 001–003. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================

-- ---------- Port Harcourt delivery areas (replaces the Lagos seed) ----------
delete from public.coverage_areas
 where name in ('Lekki','Ajah','Victoria Island','Ikoyi','Lagos Island','Yaba','Surulere','Ikeja','Ikorodu');
insert into public.coverage_areas (name) values
  ('GRA'), ('Old GRA'), ('D-Line'), ('Trans-Amadi'), ('Woji'), ('Rumuola'), ('Rumuokoro'), ('Eliozu'),
  ('Ada George'), ('Rumuibekwe'), ('Rumuomasi'), ('Peter Odili Road'), ('Choba'), ('Diobu'), ('Borokiri'), ('Elelenwo')
on conflict do nothing;

-- ---------- Rider earnings + payout account ----------
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('topup','payment','payout','refund','withdrawal','earning'));

alter table public.riders add column if not exists bank_name text;
alter table public.riders add column if not exists bank_account_last4 text;
alter table public.riders add column if not exists bank_verified boolean default false;

-- Farms and riders both save their payout account here.
create or replace function public.add_bank(p_bank text, p_account text) returns void
language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int;
begin
  if p_account !~ '^[0-9]{10}$' then raise exception 'INVALID_ACCOUNT'; end if;
  update vendor_profiles set bank_name = p_bank, bank_account_last4 = right(p_account, 4), bank_verified = true
  where user_id = auth.uid();
  get diagnostics n1 = row_count;
  update riders set bank_name = p_bank, bank_account_last4 = right(p_account, 4), bank_verified = true
  where user_id = auth.uid();
  get diagnostics n2 = row_count;
  if n1 + n2 = 0 then raise exception 'NOT_VENDOR'; end if;
end $$;

create or replace function public.wallet_withdraw(p_amount numeric, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_bank text; v_last4 text; v numeric; t uuid;
begin
  select bank_name, bank_account_last4 into v_bank, v_last4 from vendor_profiles where user_id = auth.uid() and bank_verified;
  if v_bank is null then
    select bank_name, bank_account_last4 into v_bank, v_last4 from riders where user_id = auth.uid() and bank_verified;
  end if;
  if v_bank is null then raise exception 'NO_BANK'; end if;
  if not exists (select 1 from withdrawal_codes where user_id = auth.uid() and code = p_code
                 and created_at > now() - interval '5 minutes') then raise exception 'INVALID_CODE'; end if;
  delete from withdrawal_codes where user_id = auth.uid();
  update wallets set balance = balance - p_amount where user_id = auth.uid() and balance >= p_amount and p_amount > 0
    returning balance into v;
  if v is null then raise exception 'INSUFFICIENT_FUNDS'; end if;
  insert into transactions (user_id, type, amount, status, label)
  values (auth.uid(), 'withdrawal', -p_amount, 'processing', 'Withdrawal · ' || v_bank || ' ••' || v_last4)
  returning id into t;
  return t;
end $$;

-- ---------- Trips: one rider, up to 4 orders from the same farm ----------
create or replace function public.rider_trip_size(p_rider uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from delivery_assignments
   where rider_id = p_rider and status in ('offered','accepted','at_farm','picked_up','at_buyer');
$$;

-- Offer every waiting "ready" order to the nearest free rider, oldest first. Called the moment a rider frees up.
create or replace function public.dispatch_waiting() returns int
language plpgsql security definer set search_path = public as $$
declare x record; n int := 0;
begin
  for x in select s.id from sub_orders s
            where s.status = 'ready' and not exists (
              select 1 from delivery_assignments d where d.sub_order_id = s.id
                 and d.status in ('offered','accepted','at_farm','picked_up','at_buyer'))
            order by s.updated_at loop
    exit when not exists (select 1 from riders where status = 'available' and active and lat is not null);
    if assign_rider(x.id) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- When a rider has nothing left on their trip: make them available and hand them waiting work straight away.
create or replace function public.rider_after_job(p_rider uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if rider_trip_size(p_rider) = 0 then
    update riders set status = 'available' where id = p_rider and status = 'on_delivery';
    perform dispatch_waiting();
  end if;
end $$;

-- Farm marks an order ready. p_rider = add it to that rider's pickup (they must be heading to / at this farm).
drop function if exists public.vendor_mark_ready(uuid);
create or replace function public.vendor_mark_ready(p_sub uuid, p_rider uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_assign uuid; v_status text; r riders;
begin
  update sub_orders set status = 'ready', updated_at = now()
   where id = p_sub and vendor_id = auth.uid() and status = 'confirmed';
  if not found then raise exception 'NOT_CONFIRMED'; end if;
  if p_rider is not null then
    select * into r from riders where id = p_rider;
    -- The new order joins the rider's trip at the same stage (offered / accepted / at the farm).
    select case when bool_or(d.status = 'at_farm') then 'at_farm' when bool_or(d.status = 'accepted') then 'accepted'
                when bool_or(d.status = 'offered') then 'offered' end into v_status
      from delivery_assignments d join sub_orders s on s.id = d.sub_order_id
     where d.rider_id = p_rider and s.vendor_id = auth.uid() and d.status in ('offered','accepted','at_farm');
    if v_status is null or r.id is null or not r.active then raise exception 'RIDER_LEFT'; end if;
    if rider_trip_size(p_rider) >= 4 then raise exception 'TRIP_FULL'; end if;
    insert into delivery_assignments (sub_order_id, rider_id, status, accepted_at)
    values (p_sub, p_rider, v_status, case when v_status <> 'offered' then now() end) returning id into v_assign;
    return jsonb_build_object('assigned', true, 'joined', true, 'rider', r.name);
  end if;
  v_assign := assign_rider(p_sub);
  return jsonb_build_object('assigned', v_assign is not null);
end $$;

-- Riders a farm can add an order to (heading to / at this farm, trip not full) + how many riders are free now.
create or replace function public.vendor_pickup_riders() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'riders', coalesce((
      select jsonb_agg(t.x order by t.x->>'name') from (
        select jsonb_build_object('id', r.id, 'name', r.name, 'vehicle', r.vehicle, 'plate', r.plate,
                 'at_farm', bool_or(d.status = 'at_farm'), 'awaiting_accept', bool_and(d.status = 'offered'),
                 'orders', rider_trip_size(r.id), 'slots', 4 - rider_trip_size(r.id)) as x
          from delivery_assignments d
          join sub_orders s on s.id = d.sub_order_id
          join riders r on r.id = d.rider_id
         where s.vendor_id = auth.uid() and d.status in ('offered','accepted','at_farm') and r.active
         group by r.id
        having rider_trip_size(r.id) < 4) t), '[]'::jsonb),
    'available_now', (select count(*) from riders where status = 'available' and active and lat is not null));
$$;

create or replace function public.rider_set_status(p_available boolean, p_lat double precision default null, p_lng double precision default null)
returns riders language plpgsql security definer set search_path = public as $$
declare r riders;
begin
  if p_available and p_lat is null then raise exception 'LOCATION_REQUIRED'; end if;
  update riders set
    status = case when status = 'on_delivery' then status when p_available then 'available' else 'offline' end,
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
    location_updated_at = case when p_lat is not null then now() else location_updated_at end
  where user_id = auth.uid() and active returning * into r;
  if r.id is null then raise exception 'RIDER_INACTIVE'; end if;
  -- Going available picks up any order that's already waiting.
  if r.status = 'available' then perform dispatch_waiting(); end if;
  return r;
end $$;

create or replace function public.rider_advance(p_assignment uuid, p_step text, p_notes text default null,
  p_reasons text[] default null, p_proof text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a delivery_assignments; s sub_orders; o orders; net numeric; earn numeric; v_uid uuid;
begin
  select d.* into a from delivery_assignments d join riders r on r.id = d.rider_id
   where d.id = p_assignment and r.user_id = auth.uid() for update of d;
  if a.id is null then raise exception 'NOT_FOUND'; end if;
  select * into s from sub_orders where id = a.sub_order_id;

  if p_step = 'arrived_farm' and a.status = 'accepted' then
    -- One stop at the farm covers every order on the trip.
    update delivery_assignments d set status = 'at_farm'
      from sub_orders s2
     where s2.id = d.sub_order_id and s2.vendor_id = s.vendor_id and d.rider_id = a.rider_id and d.status = 'accepted';
  elsif p_step = 'qc_pass' and a.status = 'at_farm' then
    update delivery_assignments set status = 'picked_up', picked_up_at = now(), qc_notes = p_notes where id = a.id;
    update sub_orders set status = 'out_for_delivery', updated_at = now() where id = s.id;
  elsif p_step = 'qc_fail' and a.status = 'at_farm' then
    update delivery_assignments set status = 'flagged', qc_notes = p_notes, qc_reasons = p_reasons where id = a.id;
    perform refund_sub_order(s.id, 'Failed quality check at pickup');
    update sub_orders set status = 'flagged' where id = s.id;
    perform rider_after_job(a.rider_id);
  elsif p_step = 'release' and a.status in ('accepted','at_farm') then
    -- Rider can't carry an order the farm added: it goes back to dispatch.
    update delivery_assignments set status = 'declined' where id = a.id;
    perform assign_rider(a.sub_order_id);
    perform rider_after_job(a.rider_id);
  elsif p_step = 'arrived_buyer' and a.status = 'picked_up' then
    if exists (select 1 from delivery_assignments d where d.rider_id = a.rider_id and d.status in ('offered','accepted','at_farm')) then
      raise exception 'PICKUP_INCOMPLETE';
    end if;
    update delivery_assignments set status = 'at_buyer' where id = a.id;
  elsif p_step = 'delivered' and a.status = 'at_buyer' then
    if p_proof is null then raise exception 'PROOF_REQUIRED'; end if;
    update delivery_assignments set status = 'delivered', delivered_at = now(), proof_path = p_proof where id = a.id;
    update sub_orders set status = 'delivered', delivered_at = now(), updated_at = now() where id = s.id;
    select * into o from orders where id = s.order_id;
    net := round(s.items_total * 0.9, 2);   -- 10% platform commission
    update wallets set balance = balance + net where user_id = s.vendor_id;
    insert into transactions (user_id, type, amount, label, related_order_id)
    values (s.vendor_id, 'payout', net, 'Payout · ' || o.code, o.id);
    -- Rider earns 80% of the delivery fee for this drop.
    select user_id into v_uid from riders where id = a.rider_id;
    earn := round(coalesce(s.delivery_fee, 0) * 0.8, 2);
    if v_uid is not null and earn > 0 then
      update wallets set balance = balance + earn where user_id = v_uid;
      insert into transactions (user_id, type, amount, label, related_order_id)
      values (v_uid, 'earning', earn, 'Delivery · ' || o.code, o.id);
    end if;
    perform rider_after_job(a.rider_id);
  else
    raise exception 'INVALID_STEP';
  end if;
end $$;

create or replace function public.expire_overdue() returns void
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  for x in select id from sub_orders where status = 'placed' and sla_deadline < now() loop
    perform refund_sub_order(x.id, 'Farm did not confirm within 24 hours');
  end loop;
  for x in select * from delivery_assignments where status = 'offered' and offered_at < now() - interval '90 seconds' loop
    update delivery_assignments set status = 'expired' where id = x.id;
    perform assign_rider(x.sub_order_id);
  end loop;
  perform dispatch_waiting();
end $$;

-- ---------- Read models ----------
create or replace function public.vendor_orders() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'status', s.status, 'code', o.code, 'items_total', s.items_total,
    'net', round(s.items_total * 0.9, 2), 'commission', round(s.items_total * 0.1, 2),
    'sla_deadline', s.sla_deadline, 'created_at', s.created_at,
    'buyer', coalesce(split_part(p.full_name, ' ', 1), 'Buyer'), 'area', a.area,
    'items', (select jsonb_agg(jsonb_build_object('title', oi.title, 'qty', oi.quantity, 'price', oi.price)) from order_items oi where oi.sub_order_id = s.id),
    'rider', (select jsonb_build_object('name', r.name, 'vehicle', r.vehicle, 'plate', r.plate, 'status', d.status, 'phone', r.phone)
              from delivery_assignments d join riders r on r.id = d.rider_id
              where d.sub_order_id = s.id and d.status in ('offered','accepted','at_farm','picked_up','at_buyer','delivered') order by d.created_at desc limit 1)
  ) order by s.created_at desc), '[]'::jsonb)
  from sub_orders s join orders o on o.id = s.order_id join profiles p on p.id = o.buyer_id
  left join addresses a on a.id = o.address_id
  where s.vendor_id = auth.uid();
$$;

-- The rider's current trip: one pickup, 1–4 orders.
create or replace function public.rider_current() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'pickup', (array_agg(jsonb_build_object('name', vp.business_name, 'location', vp.location, 'lat', vp.lat, 'lng', vp.lng) order by d.created_at))[1],
    'orders', jsonb_agg(jsonb_build_object(
      'id', d.id, 'status', d.status, 'offered_at', d.offered_at, 'code', o.code,
      'earning', round(coalesce(s.delivery_fee, 0) * 0.8, 2),
      'dropoff', jsonb_build_object('name', coalesce(p.full_name, 'Buyer'), 'phone', p.phone, 'line', a.line, 'area', a.area, 'lat', a.lat, 'lng', a.lng),
      'items', (select jsonb_agg(jsonb_build_object('title', oi.title, 'qty', oi.quantity)) from order_items oi where oi.sub_order_id = s.id)
    ) order by d.created_at)) end
  from delivery_assignments d
  join riders r on r.id = d.rider_id and r.user_id = auth.uid()
  join sub_orders s on s.id = d.sub_order_id
  join orders o on o.id = s.order_id
  join profiles p on p.id = o.buyer_id
  join vendor_profiles vp on vp.user_id = s.vendor_id
  left join addresses a on a.id = o.address_id
  where d.status in ('offered','accepted','at_farm','picked_up','at_buyer');
$$;

create or replace function public.rider_history() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'status', d.status, 'code', o.code,
      'from', vp.business_name, 'to', a.area, 'at', coalesce(d.delivered_at, d.picked_up_at, d.created_at),
      'earning', case when d.status = 'delivered' then round(coalesce(s.delivery_fee, 0) * 0.8, 2) else 0 end) order by d.created_at desc), '[]'::jsonb)
  from delivery_assignments d
  join riders r on r.id = d.rider_id and r.user_id = auth.uid()
  join sub_orders s on s.id = d.sub_order_id join orders o on o.id = s.order_id
  join vendor_profiles vp on vp.user_id = s.vendor_id left join addresses a on a.id = o.address_id
  where d.status in ('delivered','flagged');
$$;

-- Rider profile: details, wallet, earnings, delivery rating and recent feedback.
create or replace function public.rider_profile() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r riders; v_today timestamptz := date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
  v_week timestamptz := date_trunc('week', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
begin
  select * into r from riders where user_id = auth.uid();
  if r.id is null then raise exception 'NOT_RIDER'; end if;
  return jsonb_build_object(
    'rider', jsonb_build_object('name', r.name, 'email', r.email, 'phone', r.phone, 'vehicle', r.vehicle, 'plate', r.plate,
      'zone', r.zone, 'active', r.active, 'since', r.created_at,
      'bank_name', r.bank_name, 'bank_account_last4', r.bank_account_last4, 'bank_verified', coalesce(r.bank_verified, false)),
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'earned_today', coalesce((select sum(amount) from transactions where user_id = auth.uid() and type = 'earning' and created_at >= v_today), 0),
    'earned_week', coalesce((select sum(amount) from transactions where user_id = auth.uid() and type = 'earning' and created_at >= v_week), 0),
    'earned_total', coalesce((select sum(amount) from transactions where user_id = auth.uid() and type = 'earning'), 0),
    'deliveries', (select count(*) from delivery_assignments where rider_id = r.id and status = 'delivered'),
    'rating', (select round(avg(rv.delivery_rating)::numeric, 1) from reviews rv
                 join delivery_assignments d on d.sub_order_id = rv.sub_order_id and d.status = 'delivered'
                where d.rider_id = r.id and rv.delivery_rating is not null),
    'rating_count', (select count(*) from reviews rv
                 join delivery_assignments d on d.sub_order_id = rv.sub_order_id and d.status = 'delivered'
                where d.rider_id = r.id and rv.delivery_rating is not null),
    'reviews', coalesce((select jsonb_agg(t.x order by t.at desc) from (
        select jsonb_build_object('rating', rv.delivery_rating, 'tags', rv.tags, 'comment', rv.comment, 'at', rv.created_at,
                 'buyer', split_part(coalesce(p.full_name, 'Buyer'), ' ', 1)) as x, rv.created_at as at
          from reviews rv
          join delivery_assignments d on d.sub_order_id = rv.sub_order_id and d.status = 'delivered'
          join profiles p on p.id = rv.buyer_id
         where d.rider_id = r.id and rv.delivery_rating is not null
         order by rv.created_at desc limit 10) t), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(t.x order by t.at desc) from (
        select jsonb_build_object('id', id, 'type', type, 'amount', amount, 'status', status, 'label', label, 'at', created_at) as x, created_at as at
          from transactions where user_id = auth.uid() order by created_at desc limit 30) t), '[]'::jsonb)
  );
end $$;

-- Internal helpers: only callable from other functions
revoke execute on function public.dispatch_waiting() from public, anon, authenticated;
revoke execute on function public.rider_after_job(uuid) from public, anon, authenticated;
