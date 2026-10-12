-- =====================================================================
-- Poultry360 MVP · Supabase schema, RLS, RPCs and seed
-- Run in the Supabase SQL editor (or: supabase db push) on a fresh project.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Core identity ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  phone text,
  email text,
  full_name text,
  roles text[] not null default '{}',
  active_role text,
  created_at timestamptz default now()
);

create table public.vendor_profiles (
  user_id uuid primary key references public.profiles on delete cascade,
  business_name text not null,
  categories text[] default '{}',
  location text,
  lat double precision,
  lng double precision,
  id_doc_path text,
  verification_status text not null default 'pending' check (verification_status in ('pending','approved','rejected')),
  rejection_reason text,
  rating numeric default 0,
  rating_count int default 0,
  bank_name text,
  bank_account_last4 text,
  bank_verified boolean default false,
  created_at timestamptz default now()
);

create table public.wallets (
  user_id uuid primary key references public.profiles on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  type text not null check (type in ('topup','payment','payout','refund','withdrawal','earning')),
  amount numeric(14,2) not null,
  status text not null default 'completed',
  label text,
  related_order_id uuid,
  created_at timestamptz default now()
);

create table public.withdrawal_codes (
  user_id uuid primary key references public.profiles on delete cascade,
  code text not null,
  created_at timestamptz default now()
);

-- ---------- Marketplace ----------
create table public.coverage_areas (name text primary key);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  label text not null,
  line text not null,
  area text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  category text not null,
  is_waste boolean not null default false,
  title text not null,
  description text,
  price numeric(12,2) not null check (price > 0),
  unit text not null default 'unit',
  quantity int not null check (quantity >= 0),
  attributes jsonb default '{}',
  photos text[] default '{}',
  status text not null default 'draft' check (status in ('draft','live','unpublished')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index on public.listings (category) where status = 'live';

create sequence public.order_seq start 2100;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('P360-' || nextval('public.order_seq')),
  buyer_id uuid not null references public.profiles,
  address_id uuid references public.addresses,
  items_total numeric(14,2),
  delivery_fee numeric(14,2),
  total numeric(14,2),
  payment_method text,
  payment_ref text,
  created_at timestamptz default now()
);

create table public.sub_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(user_id),
  status text not null default 'placed' check (status in ('placed','confirmed','ready','picked_up','out_for_delivery','delivered','cancelled','refunded','flagged')),
  via_search boolean default false,
  items_total numeric(14,2),
  delivery_fee numeric(14,2),
  sla_deadline timestamptz,
  decline_reason text,
  delivered_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  sub_order_id uuid not null references public.sub_orders on delete cascade,
  listing_id uuid references public.listings on delete set null,
  title text,
  quantity int not null,
  price numeric(12,2) not null
);

-- ---------- Logistics ----------
create table public.riders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  email text unique,                     -- lowercase; matches auth.users.email (riders sign in by email)
  phone text unique,                     -- contact number, digits only, e.g. 2348031234567
  name text not null,
  vehicle text default 'Bike',
  plate text,
  zone text,
  status text not null default 'offline' check (status in ('offline','available','on_delivery')),
  active boolean default true,
  lat double precision,
  lng double precision,
  location_updated_at timestamptz,
  bank_name text,
  bank_account_last4 text,
  bank_verified boolean default false,
  created_at timestamptz default now()
);

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  sub_order_id uuid not null references public.sub_orders on delete cascade,
  rider_id uuid not null references public.riders,
  status text not null default 'offered' check (status in ('offered','accepted','at_farm','picked_up','at_buyer','delivered','declined','expired','flagged')),
  offered_at timestamptz default now(),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  qc_notes text,
  qc_reasons text[],
  proof_path text,
  created_at timestamptz default now()
);
-- Hard server-side lock: only one live assignment per sub-order (PRD §9.4)
create unique index one_active_assignment on public.delivery_assignments (sub_order_id)
  where status in ('offered','accepted','at_farm','picked_up','at_buyer');

create table public.reviews (
  sub_order_id uuid primary key references public.sub_orders on delete cascade,
  buyer_id uuid not null references public.profiles default auth.uid(),
  product_rating int check (product_rating between 1 and 5),
  delivery_rating int check (delivery_rating between 1 and 5),
  tags text[],
  comment text,
  created_at timestamptz default now()
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  sub_order_id uuid not null references public.sub_orders on delete cascade,
  buyer_id uuid not null references public.profiles default auth.uid(),
  reason text not null,
  details text,
  photo_path text,
  status text not null default 'open' check (status in ('open','resolved')),
  resolution_note text,
  created_at timestamptz default now()
);

-- ---------- Farm Hub (offline-first: client generates ids) ----------
create table public.flocks (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  code text,
  type text not null,
  breed text,
  size int not null check (size > 0),
  start_date date not null check (start_date <= current_date + 1),   -- +1: server clock is UTC, an hour behind Nigeria
  status text not null default 'active' check (status in ('active','inactive')),
  updated_at timestamptz default now(),
  updated_by text
);

create table public.farm_logs (
  id uuid primary key,
  flock_id uuid not null references public.flocks on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles,
  kind text not null check (kind in ('feed','mortality','production','expense')),
  quantity numeric not null check (quantity >= 0),
  cost numeric default 0,
  cause text,
  unit text,
  log_date date not null default current_date,
  updated_at timestamptz default now(),
  updated_by text
);

create table public.vaccinations (
  id uuid primary key,
  flock_id uuid not null references public.flocks on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles,
  vaccine text not null,
  scheduled_date date not null,
  administered_date date,
  updated_at timestamptz default now(),
  updated_by text
);

-- ---------- Veterinary ----------
create table public.vets (
  id uuid primary key default gen_random_uuid(),
  name text not null, initials text, specialty text, years int,
  fee numeric not null, rating numeric, reviews int, bio text,
  onsite boolean default true, verified boolean default true
);

create table public.vet_slots (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid not null references public.vets on delete cascade,
  starts_at timestamptz not null,
  booked boolean default false
);

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  vet_id uuid references public.vets,
  farmer_id uuid not null default auth.uid() references public.profiles,
  slot_id uuid references public.vet_slots,
  flock_id uuid references public.flocks on delete set null,
  type text not null check (type in ('video','onsite')),
  status text not null default 'requested' check (status in ('requested','proposed','confirmed','completed','cancelled')),
  requested_date date,
  proposed_at timestamptz,
  location text,
  notes text,
  summary text,
  meeting_url text,
  fee numeric,
  created_at timestamptz default now()
);

create table public.health_records (
  id uuid primary key default gen_random_uuid(),
  flock_id uuid not null references public.flocks on delete cascade,
  owner_id uuid not null default auth.uid() references public.profiles,
  source text not null check (source in ('self','vet','triage','vaccination')),
  author text,
  title text not null,
  notes text,
  created_at timestamptz default now()
);

create table public.symptom_checks (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null default auth.uid() references public.profiles,
  flock_id uuid references public.flocks on delete set null,
  signs text[],
  photo_paths text[],
  result jsonb,
  confidence text,
  created_at timestamptz default now()
);

-- =====================================================================
-- Triggers
-- =====================================================================
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, phone, email) values (new.id, new.phone, lower(new.email)) on conflict do nothing;
  insert into wallets (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Vendors can never self-approve
create or replace function public.vendor_insert_guard() returns trigger language plpgsql as $$
begin
  new.verification_status := 'pending'; new.rejection_reason := null; new.bank_verified := false;
  return new;
end $$;
create trigger vendor_insert_guard before insert on public.vendor_profiles
  for each row when (current_user = 'authenticated') execute function public.vendor_insert_guard();

-- Listings: only verified vendors can publish (PRD §6.3 DECISION)
create or replace function public.guard_listing() returns trigger language plpgsql as $$
begin
  if new.status = 'live' and not exists (
    select 1 from vendor_profiles where user_id = new.vendor_id and verification_status = 'approved'
  ) then raise exception 'VENDOR_NOT_VERIFIED'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger guard_listing before insert or update on public.listings
  for each row execute function public.guard_listing();

-- Farm Hub: mortality can't exceed flock size; last-write-wins on sync
create or replace function public.guard_farm_log() returns trigger language plpgsql as $$
declare v_size int; v_dead numeric;
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then return old; end if;
  if new.kind = 'mortality' then
    select size into v_size from flocks where id = new.flock_id;
    select coalesce(sum(quantity), 0) into v_dead from farm_logs
      where flock_id = new.flock_id and kind = 'mortality' and id <> new.id;
    if v_dead + new.quantity > v_size then raise exception 'MORTALITY_EXCEEDS_FLOCK'; end if;
  end if;
  return new;
end $$;
create trigger guard_farm_log before insert or update on public.farm_logs
  for each row execute function public.guard_farm_log();

create or replace function public.lww() returns trigger language plpgsql as $$
begin
  if new.updated_at < old.updated_at then return old; end if;
  return new;
end $$;
create trigger lww_flocks before update on public.flocks for each row execute function public.lww();
create trigger lww_vacc before update on public.vaccinations for each row execute function public.lww();

-- =====================================================================
-- Row level security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.vendor_profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.withdrawal_codes enable row level security;
alter table public.coverage_areas enable row level security;
alter table public.addresses enable row level security;
alter table public.listings enable row level security;
alter table public.orders enable row level security;
alter table public.sub_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.riders enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.reviews enable row level security;
alter table public.disputes enable row level security;
alter table public.flocks enable row level security;
alter table public.farm_logs enable row level security;
alter table public.vaccinations enable row level security;
alter table public.vets enable row level security;
alter table public.vet_slots enable row level security;
alter table public.consultations enable row level security;
alter table public.health_records enable row level security;
alter table public.symptom_checks enable row level security;

create policy own_profile_r on public.profiles for select using (id = auth.uid());
create policy own_profile_u on public.profiles for update using (id = auth.uid());

create policy vendors_public_r on public.vendor_profiles for select using (true);
create policy own_vendor_i on public.vendor_profiles for insert with check (user_id = auth.uid());
create policy own_vendor_u on public.vendor_profiles for update using (user_id = auth.uid());
revoke update (verification_status, rejection_reason, bank_verified, rating, rating_count) on public.vendor_profiles from authenticated;

create policy own_wallet_r on public.wallets for select using (user_id = auth.uid());
create policy own_tx_r on public.transactions for select using (user_id = auth.uid());
create policy coverage_r on public.coverage_areas for select using (true);
create policy own_addr on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy listings_r on public.listings for select using (status = 'live' or vendor_id = auth.uid());
create policy listings_i on public.listings for insert with check (vendor_id = auth.uid());
create policy listings_u on public.listings for update using (vendor_id = auth.uid());
create policy listings_d on public.listings for delete using (vendor_id = auth.uid());

create or replace function public.rider_self() returns uuid language sql stable security definer set search_path = public as $$
  select id from riders where user_id = auth.uid()
$$;
create or replace function public.sub_order_party(p_sub uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sub_orders s join orders o on o.id = s.order_id
    where s.id = p_sub and (o.buyer_id = auth.uid() or s.vendor_id = auth.uid()
      or exists (select 1 from delivery_assignments d where d.sub_order_id = s.id and d.rider_id = public.rider_self()))
  )
$$;
create or replace function public.can_see_rider(p_rider uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from delivery_assignments d join sub_orders s on s.id = d.sub_order_id join orders o on o.id = s.order_id
    where d.rider_id = p_rider and d.status in ('accepted','at_farm','picked_up','at_buyer')
      and (o.buyer_id = auth.uid() or s.vendor_id = auth.uid())
  )
$$;

create policy orders_r on public.orders for select using (buyer_id = auth.uid());
create policy subs_r on public.sub_orders for select using (public.sub_order_party(id));
create policy items_r on public.order_items for select using (public.sub_order_party(sub_order_id));
create policy riders_r on public.riders for select using (user_id = auth.uid() or public.can_see_rider(id));
create policy assign_r on public.delivery_assignments for select using (rider_id = public.rider_self() or public.sub_order_party(sub_order_id));

create policy reviews_r on public.reviews for select using (true);
create policy reviews_i on public.reviews for insert with check (
  buyer_id = auth.uid() and exists (
    select 1 from sub_orders s join orders o on o.id = s.order_id
    where s.id = sub_order_id and o.buyer_id = auth.uid() and s.status = 'delivered'));
create policy disputes_own on public.disputes for all using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());

create policy own_flocks on public.flocks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_logs on public.farm_logs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_vacc on public.vaccinations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy vets_r on public.vets for select using (verified);
create policy slots_r on public.vet_slots for select using (true);
create policy own_consult on public.consultations for all using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());
create policy own_health on public.health_records for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy own_symptom on public.symptom_checks for all using (farmer_id = auth.uid()) with check (farmer_id = auth.uid());

-- =====================================================================
-- RPCs (all business rules live here, never in the client)
-- =====================================================================

-- Onboarding ----------------------------------------------------------
create or replace function public.set_roles(p_roles text[], p_name text default null) returns profiles
language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  if array_length(p_roles, 1) is null then raise exception 'ROLE_REQUIRED'; end if;
  update profiles set roles = (select array_agg(distinct r) from unnest(roles || p_roles) r),
    active_role = coalesce(active_role, p_roles[1]), full_name = coalesce(p_name, full_name)
  where id = auth.uid() returning * into p;
  return p;
end $$;

create or replace function public.set_active_role(p_role text) returns void
language sql security definer set search_path = public as $$
  update profiles set active_role = p_role where id = auth.uid() and p_role = any(roles);
$$;

create or replace function public.submit_vendor_application(
  p_business_name text, p_categories text[], p_location text, p_id_doc_path text,
  p_lat double precision default null, p_lng double precision default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into vendor_profiles (user_id, business_name, categories, location, id_doc_path, lat, lng)
  values (auth.uid(), p_business_name, p_categories, p_location, p_id_doc_path, p_lat, p_lng)
  on conflict (user_id) do update set business_name = excluded.business_name, categories = excluded.categories,
    location = excluded.location, id_doc_path = excluded.id_doc_path, lat = excluded.lat, lng = excluded.lng,
    verification_status = 'pending', rejection_reason = null;
  update profiles set roles = (select array_agg(distinct r) from unnest(roles || array['vendor']) r) where id = auth.uid();
end $$;

-- DEV ONLY: lets a tester approve/reject themselves. Drop before launch.
create or replace function public.dev_set_verification(p_status text, p_reason text default null) returns void
language sql security definer set search_path = public as $$
  update vendor_profiles set verification_status = p_status, rejection_reason = p_reason where user_id = auth.uid();
$$;

-- Wallet --------------------------------------------------------------
-- SIMULATED PAYMENTS: in production, credit only from a Paystack webhook Edge Function.
create or replace function public.wallet_topup(p_amount numeric, p_ref text) returns numeric
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  if p_amount <= 0 or p_amount > 5000000 then raise exception 'INVALID_AMOUNT'; end if;
  update wallets set balance = balance + p_amount where user_id = auth.uid() returning balance into v;
  insert into transactions (user_id, type, amount, label) values (auth.uid(), 'topup', p_amount, 'Top-up · Paystack');
  return v;
end $$;

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

-- DEV: returns the code so you can test. In production send it by SMS from an Edge Function and return null.
create or replace function public.request_withdrawal_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text := lpad((floor(random() * 1000000))::int::text, 6, '0');
begin
  insert into withdrawal_codes (user_id, code) values (auth.uid(), c)
  on conflict (user_id) do update set code = excluded.code, created_at = now();
  return c;
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

-- Orders --------------------------------------------------------------
create or replace function public.place_order(p_address_id uuid, p_items jsonb, p_method text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_area text; v_bad text[] := '{}'; it jsonb; l listings;
  v_order uuid; v_code text; v_sub uuid; v_vendor uuid; v_items numeric; v_fee numeric; v_total numeric; v_bal numeric;
begin
  select area into v_area from addresses where id = p_address_id and user_id = v_uid;
  if v_area is null then raise exception 'ADDRESS_NOT_FOUND'; end if;
  if not exists (select 1 from coverage_areas where name = v_area) then raise exception 'OUT_OF_COVERAGE'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into l from listings where id = (it->>'listing_id')::uuid for update;
    if l.id is null or l.status <> 'live' or l.quantity < (it->>'qty')::int then
      v_bad := v_bad || (it->>'listing_id');
    end if;
  end loop;
  if array_length(v_bad, 1) > 0 then raise exception 'ITEM_UNAVAILABLE:%', array_to_string(v_bad, ','); end if;

  select coalesce(sum(l2.price * (x->>'qty')::int), 0), count(distinct l2.vendor_id) * 1250
    into v_items, v_fee
    from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid;
  v_total := v_items + v_fee;

  if p_method = 'wallet' then
    update wallets set balance = balance - v_total where user_id = v_uid and balance >= v_total returning balance into v_bal;
    if v_bal is null then raise exception 'INSUFFICIENT_WALLET'; end if;
  end if;

  insert into orders (buyer_id, address_id, items_total, delivery_fee, total, payment_method, payment_ref)
  values (v_uid, p_address_id, v_items, v_fee, v_total, p_method, p_ref) returning id, code into v_order, v_code;
  insert into transactions (user_id, type, amount, label, related_order_id)
  values (v_uid, 'payment', -v_total, 'Payment · ' || v_code || case when p_method = 'wallet' then ' · wallet' else ' · card' end, v_order);

  for v_vendor in select distinct l2.vendor_id from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid loop
    insert into sub_orders (order_id, vendor_id, via_search, delivery_fee, sla_deadline, items_total)
      select v_order, v_vendor, bool_or(coalesce((x->>'via_search')::boolean, false)), 1250,
             now() + interval '24 hours', sum(l2.price * (x->>'qty')::int)
      from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid
      where l2.vendor_id = v_vendor
      returning id into v_sub;
    insert into order_items (sub_order_id, listing_id, title, quantity, price)
      select v_sub, l2.id, l2.title, (x->>'qty')::int, l2.price
      from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid
      where l2.vendor_id = v_vendor;
    update listings l2 set quantity = l2.quantity - (x->>'qty')::int
      from jsonb_array_elements(p_items) x
      where l2.id = (x->>'listing_id')::uuid and l2.vendor_id = v_vendor;
  end loop;

  return jsonb_build_object('order_id', v_order, 'code', v_code, 'total', v_total);
end $$;

create or replace function public.refund_sub_order(p_sub uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s sub_orders; o orders; amt numeric;
begin
  select * into s from sub_orders where id = p_sub for update;
  if s.status in ('refunded','delivered') then return; end if;
  select * into o from orders where id = s.order_id;
  amt := s.items_total + s.delivery_fee;
  update sub_orders set status = 'refunded', decline_reason = p_reason, updated_at = now() where id = p_sub;
  update wallets set balance = balance + amt where user_id = o.buyer_id;
  insert into transactions (user_id, type, amount, label, related_order_id)
  values (o.buyer_id, 'refund', amt, 'Refund · ' || o.code, o.id);
  update listings l set quantity = l.quantity + oi.quantity
    from order_items oi where oi.sub_order_id = p_sub and l.id = oi.listing_id;
end $$;

create or replace function public.vendor_respond(p_sub uuid, p_accept boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s sub_orders;
begin
  select * into s from sub_orders where id = p_sub and vendor_id = auth.uid() for update;
  if s.id is null then raise exception 'NOT_FOUND'; end if;
  if s.status <> 'placed' then raise exception 'ALREADY_ACTIONED'; end if;
  if p_accept then
    update sub_orders set status = 'confirmed', updated_at = now() where id = p_sub;
  else
    perform refund_sub_order(p_sub, coalesce(p_reason, 'Declined by farm'));
  end if;
end $$;

create or replace function public.assign_rider(p_sub uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare vp vendor_profiles; r riders; v_id uuid;
begin
  select vp2.* into vp from vendor_profiles vp2 join sub_orders s on s.vendor_id = vp2.user_id where s.id = p_sub;
  select * into r from riders rr
   where rr.status = 'available' and rr.active and rr.lat is not null
     and not exists (select 1 from delivery_assignments d where d.sub_order_id = p_sub and d.rider_id = rr.id)
     and not exists (select 1 from delivery_assignments d2 where d2.rider_id = rr.id and d2.status = 'offered')
   order by case when vp.lat is null then 0 else (rr.lat - vp.lat)^2 + (rr.lng - vp.lng)^2 end,
            rr.location_updated_at desc nulls last
   limit 1 for update skip locked;
  if r.id is null then return null; end if;
  insert into delivery_assignments (sub_order_id, rider_id) values (p_sub, r.id) returning id into v_id;
  return v_id;
exception when unique_violation then return null;
end $$;

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

-- Rider ---------------------------------------------------------------
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

create or replace function public.rider_ping(p_lat double precision, p_lng double precision) returns void
language sql security definer set search_path = public as $$
  update riders set lat = p_lat, lng = p_lng, location_updated_at = now() where user_id = auth.uid();
$$;

create or replace function public.rider_respond(p_assignment uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a delivery_assignments;
begin
  select d.* into a from delivery_assignments d join riders r on r.id = d.rider_id
   where d.id = p_assignment and r.user_id = auth.uid() for update of d;
  if a.id is null or a.status <> 'offered' then raise exception 'NOT_OFFERED'; end if;
  if p_accept then
    update delivery_assignments set status = 'accepted', accepted_at = now() where id = a.id;
    update riders set status = 'on_delivery' where id = a.rider_id;
  else
    update delivery_assignments set status = 'declined' where id = a.id;
    perform assign_rider(a.sub_order_id);
  end if;
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

-- Read models ---------------------------------------------------------
create or replace function public.order_detail(p_order uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'total', o.total, 'delivery_fee', o.delivery_fee, 'created_at', o.created_at,
    'address', (select jsonb_build_object('label', a.label, 'line', a.line, 'area', a.area, 'lat', a.lat, 'lng', a.lng) from addresses a where a.id = o.address_id),
    'subs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status, 'via_search', s.via_search, 'items_total', s.items_total,
        'decline_reason', s.decline_reason, 'delivered_at', s.delivered_at, 'updated_at', s.updated_at,
        'vendor', jsonb_build_object('name', vp.business_name, 'rating', vp.rating, 'location', vp.location, 'lat', vp.lat, 'lng', vp.lng),
        'items', (select jsonb_agg(jsonb_build_object('title', oi.title, 'qty', oi.quantity, 'price', oi.price)) from order_items oi where oi.sub_order_id = s.id),
        'reviewed', exists (select 1 from reviews rv where rv.sub_order_id = s.id),
        'assignment', (select jsonb_build_object('id', d.id, 'status', d.status, 'proof_path', d.proof_path, 'delivered_at', d.delivered_at,
            'rider', jsonb_build_object('id', r.id, 'name', r.name, 'vehicle', r.vehicle, 'plate', r.plate, 'phone', r.phone,
                                        'lat', r.lat, 'lng', r.lng, 'updated_at', r.location_updated_at))
          from delivery_assignments d join riders r on r.id = d.rider_id
          where d.sub_order_id = s.id and d.status not in ('declined','expired')
          order by d.created_at desc limit 1)
      ) order by s.created_at)
      from sub_orders s join vendor_profiles vp on vp.user_id = s.vendor_id where s.order_id = o.id), '[]'::jsonb))
  from orders o where o.id = p_order and o.buyer_id = auth.uid();
$$;

create or replace function public.buyer_orders() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'code', o.code, 'total', o.total, 'created_at', o.created_at,
    'subs', (select jsonb_agg(jsonb_build_object('id', s.id, 'status', s.status, 'vendor', vp.business_name,
               'reviewed', exists (select 1 from reviews rv where rv.sub_order_id = s.id),
               'items', (select string_agg(oi.title || ' × ' || oi.quantity, ', ') from order_items oi where oi.sub_order_id = s.id)))
             from sub_orders s join vendor_profiles vp on vp.user_id = s.vendor_id where s.order_id = o.id)
  ) order by o.created_at desc), '[]'::jsonb)
  from orders o where o.buyer_id = auth.uid();
$$;

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

-- Veterinary ----------------------------------------------------------
create or replace function public.book_consultation(p_slot uuid, p_flock uuid, p_method text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sl vet_slots; v vets; b numeric; c uuid;
begin
  select * into sl from vet_slots where id = p_slot for update;
  if sl.id is null or sl.booked or sl.starts_at < now() then raise exception 'SLOT_TAKEN'; end if;
  select * into v from vets where id = sl.vet_id;
  if p_method = 'wallet' then
    update wallets set balance = balance - v.fee where user_id = auth.uid() and balance >= v.fee returning balance into b;
    if b is null then raise exception 'INSUFFICIENT_WALLET'; end if;
  end if;
  update vet_slots set booked = true where id = p_slot;
  insert into consultations (vet_id, farmer_id, slot_id, flock_id, type, status, fee, meeting_url, proposed_at)
  values (v.id, auth.uid(), p_slot, p_flock, 'video', 'confirmed', v.fee,
          'https://meet.jit.si/poultry360-' || substr(md5(random()::text), 1, 12), sl.starts_at)
  returning id into c;
  insert into transactions (user_id, type, amount, label) values (auth.uid(), 'payment', -v.fee, 'Vet consult · ' || v.name);
  return c;
end $$;

create or replace function public.request_onsite(p_vet uuid, p_date date, p_location text, p_notes text, p_flock uuid) returns uuid
language sql security definer set search_path = public as $$
  insert into consultations (vet_id, farmer_id, flock_id, type, status, requested_date, location, notes)
  values (p_vet, auth.uid(), p_flock, 'onsite', 'requested', p_date, p_location, p_notes) returning id;
$$;

-- Product-quality rating rolls up per vendor (delivery rating stays platform-wide)
create or replace function public.rollup_vendor_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select vendor_id into v from sub_orders where id = new.sub_order_id;
  update vendor_profiles set
    rating = (select avg(r.product_rating) from reviews r join sub_orders s on s.id = r.sub_order_id where s.vendor_id = v),
    rating_count = (select count(*) from reviews r join sub_orders s on s.id = r.sub_order_id where s.vendor_id = v)
  where user_id = v;
  return new;
end $$;
create trigger rollup_vendor_rating after insert on public.reviews for each row execute function public.rollup_vendor_rating();

-- Ops admin (web dashboard in apps/admin) -----------------------------
-- Admins are added from the SQL editor only. RLS on + no policies = apps can't read or write it.
create table public.admins (
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

-- Ops admin: riders ---------------------------------------------------
-- Admins can read every rider row (also lets the dashboard receive realtime status changes)
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

-- Lock down internal helpers
revoke execute on function public.refund_sub_order(uuid, text) from public, anon, authenticated;
revoke execute on function public.assign_rider(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_waiting() from public, anon, authenticated;
revoke execute on function public.rider_after_job(uuid) from public, anon, authenticated;

-- =====================================================================
-- Realtime, storage, cron
-- =====================================================================
alter publication supabase_realtime add table public.sub_orders, public.delivery_assignments, public.riders, public.vendor_profiles;

insert into storage.buckets (id, name, public) values
  ('listing-photos', 'listing-photos', true),
  ('proofs', 'proofs', true),
  ('id-docs', 'id-docs', false),
  ('symptom-photos', 'symptom-photos', false)
on conflict do nothing;

create policy p360_upload_own on storage.objects for insert to authenticated
  with check (bucket_id in ('listing-photos','proofs','id-docs','symptom-photos')
              and (storage.foldername(name))[1] = auth.uid()::text);
create policy p360_read_private_own on storage.objects for select to authenticated
  using (bucket_id in ('id-docs','symptom-photos') and (storage.foldername(name))[1] = auth.uid()::text);
create policy p360_admin_read_id_docs on storage.objects for select to authenticated
  using (bucket_id = 'id-docs' and public.is_admin());

-- Enable pg_cron in Database → Extensions, then:
-- select cron.schedule('p360-expire', '* * * * *', $$select public.expire_overdue()$$);

-- =====================================================================
-- Seed
-- =====================================================================
insert into public.coverage_areas (name) values
  ('GRA'), ('Old GRA'), ('D-Line'), ('Trans-Amadi'), ('Woji'), ('Rumuola'), ('Rumuokoro'), ('Eliozu'),
  ('Ada George'), ('Rumuibekwe'), ('Rumuomasi'), ('Peter Odili Road'), ('Choba'), ('Diobu'), ('Borokiri'), ('Elelenwo')
on conflict do nothing;

insert into public.vets (name, initials, specialty, years, fee, rating, reviews, bio) values
  ('Dr. Funmilayo Adeyemi', 'FA', 'Layer & broiler health', 11, 8000, 4.9, 128, 'Layer productivity, respiratory disease and vaccination programmes for farms of 500–20,000 birds.'),
  ('Dr. Kelechi Obi', 'KO', 'Biosecurity & nutrition', 7, 6500, 4.7, 84, 'Farm biosecurity audits, feed formulation and growth problems in broilers.'),
  ('Dr. Aisha Musa', 'AM', 'Turkey & waterfowl', 9, 9000, 4.8, 61, 'Turkey, duck and guinea fowl health, including poult brooding.');

insert into public.vet_slots (vet_id, starts_at)
select v.id, (d::date + t)::timestamp at time zone 'Africa/Lagos'
from public.vets v,
     generate_series(current_date, current_date + 7, interval '1 day') d,
     unnest(array['10:00'::time, '11:30', '14:00', '16:30', '18:00']) t
where (d::date + t)::timestamp at time zone 'Africa/Lagos' > now();

-- Riders are created by ops (no public signup). They sign in with this email; phone is their contact number:
-- insert into public.riders (email, phone, name, vehicle, plate, zone) values ('tunde@example.com', '2348031234567', 'Tunde A.', 'Bike', 'PHC 482 KJ', 'GRA & D-Line');

-- =====================================================================
-- Investment module (PRD §12). TEST-ONLY: simulated money, pending product + legal sign-off.
-- =====================================================================
-- ---------- Wallet tx types (keeps 'earning' for rider payouts) ----------
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check check (type in (
  'topup','payment','payout','refund','withdrawal','earning',
  'investment','investment_return','investment_refund','investment_funding'));
alter table public.transactions add column if not exists related_investment_id uuid;

-- ---------- Farm investment badge (separate from marketplace verification) ----------
alter table public.vendor_profiles
  add column if not exists investment_badge text not null default 'none'
    check (investment_badge in ('none','pending','approved','rejected')),
  add column if not exists investment_badge_reason text,
  add column if not exists investment_docs text[] default '{}';

-- App users can never change their own verification or badge; only RPCs (which run as the owner) can.
-- (A column-level REVOKE has no effect while the table-level UPDATE grant exists, so this is a trigger.)
create or replace function public.vendor_guard_columns() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.rejection_reason := old.rejection_reason;
    new.investment_badge := old.investment_badge;
    new.investment_badge_reason := old.investment_badge_reason;
  end if;
  return new;
end $$;
drop trigger if exists vendor_guard_columns on public.vendor_profiles;
create trigger vendor_guard_columns before update on public.vendor_profiles
  for each row execute function public.vendor_guard_columns();

-- ---------- Tables ----------
create table if not exists public.kyc_records (
  user_id uuid primary key references public.profiles on delete cascade,
  full_name text not null,
  date_of_birth date not null,
  address text not null,
  bvn_last4 text check (bvn_last4 ~ '^[0-9]{4}$'),
  id_doc_path text not null,
  address_doc_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  submitted_at timestamptz default now(),
  reviewed_at timestamptz
);

-- Offerings (single farm)
create table if not exists public.investment_offerings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  title text not null,
  summary text,
  use_of_funds text,
  photos text[] default '{}',
  target_amount numeric(14,2) not null check (target_amount > 0),
  raised_amount numeric(14,2) not null default 0,
  min_ticket numeric(14,2) not null default 10000 check (min_ticket > 0),
  projected_roi_pct numeric(6,2) not null check (projected_roi_pct >= 0 and projected_roi_pct <= 100),
  duration_months int not null check (duration_months between 1 and 36),
  payout_schedule text not null default 'end_of_term' check (payout_schedule in ('end_of_term','monthly')),
  closes_at timestamptz,
  started_at timestamptz,
  status text not null default 'draft' check (status in ('draft','pending_review','open','funded','active','matured','refunded','suspended','rejected')),
  review_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Pools (multi-farm, created by ops)
create table if not exists public.investment_pools (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  target_amount numeric(14,2) not null check (target_amount > 0),
  raised_amount numeric(14,2) not null default 0,
  min_ticket numeric(14,2) not null default 10000,
  projected_roi_pct numeric(6,2) not null,
  duration_months int not null,
  closes_at timestamptz not null,
  started_at timestamptz,
  status text not null default 'open' check (status in ('open','funded','active','matured','refunded','suspended')),
  created_at timestamptz default now()
);
create table if not exists public.pool_farms (
  pool_id uuid references public.investment_pools on delete cascade,
  vendor_id uuid references public.vendor_profiles(user_id),
  allocation_pct numeric(5,2) not null check (allocation_pct > 0 and allocation_pct <= 100),
  primary key (pool_id, vendor_id)
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.profiles default auth.uid(),
  offering_id uuid references public.investment_offerings,
  pool_id uuid references public.investment_pools,
  amount numeric(14,2) not null check (amount > 0),
  projected_roi_pct numeric(6,2) not null,         -- snapshot at time of investing
  duration_months int not null,
  projected_return numeric(14,2) not null,          -- profit, not incl. principal
  returns_paid numeric(14,2) not null default 0,
  status text not null default 'active' check (status in ('active','matured','refunded')),
  created_at timestamptz default now(),
  check ((offering_id is null) <> (pool_id is null))
);
create index if not exists investments_investor_id_idx on public.investments (investor_id);

-- ROI snapshots (PRD: ROICalculation)
create table if not exists public.roi_calculations (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments on delete cascade,
  projected_return numeric(14,2) not null,   -- projected profit accrued to date
  actual_return numeric(14,2) not null,      -- profit actually paid to date
  computed_date date not null default current_date,
  unique (investment_id, computed_date)
);

-- ---------- RLS (all writes go through the RPCs below) ----------
alter table public.kyc_records enable row level security;
alter table public.investment_offerings enable row level security;
alter table public.investment_pools enable row level security;
alter table public.pool_farms enable row level security;
alter table public.investments enable row level security;
alter table public.roi_calculations enable row level security;

drop policy if exists kyc_own_r on public.kyc_records;
create policy kyc_own_r on public.kyc_records for select using (user_id = auth.uid());
drop policy if exists off_r on public.investment_offerings;
create policy off_r on public.investment_offerings for select
  using (status in ('open','funded','active','matured','suspended') or vendor_id = auth.uid());
drop policy if exists pools_r on public.investment_pools;
create policy pools_r on public.investment_pools for select using (true);
drop policy if exists pool_farms_r on public.pool_farms;
create policy pool_farms_r on public.pool_farms for select using (true);
drop policy if exists inv_own_r on public.investments;
create policy inv_own_r on public.investments for select using (investor_id = auth.uid());
drop policy if exists roi_own_r on public.roi_calculations;
create policy roi_own_r on public.roi_calculations for select
  using (exists (select 1 from investments i where i.id = investment_id and i.investor_id = auth.uid()));

-- ---------- KYC ----------
create or replace function public.submit_kyc(p_full_name text, p_dob date, p_address text, p_bvn_last4 text,
  p_id_doc text, p_address_doc text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_dob > current_date - interval '18 years' then raise exception 'KYC_UNDERAGE'; end if;
  insert into kyc_records (user_id, full_name, date_of_birth, address, bvn_last4, id_doc_path, address_doc_path)
  values (auth.uid(), p_full_name, p_dob, p_address, nullif(p_bvn_last4, ''), p_id_doc, p_address_doc)
  on conflict (user_id) do update set full_name = excluded.full_name, date_of_birth = excluded.date_of_birth,
    address = excluded.address, bvn_last4 = excluded.bvn_last4, id_doc_path = excluded.id_doc_path,
    address_doc_path = excluded.address_doc_path, status = 'pending', rejection_reason = null, submitted_at = now();
  update profiles set roles = (select array_agg(distinct r) from unnest(roles || array['investor']) r) where id = auth.uid();
end $$;

-- DEV ONLY. Drop before launch.
create or replace function public.dev_set_kyc(p_status text, p_reason text default null) returns void
language sql security definer set search_path = public as $$
  update kyc_records set status = p_status, rejection_reason = p_reason, reviewed_at = now() where user_id = auth.uid();
$$;

-- ---------- Farm badge + offerings ----------
create or replace function public.apply_investment_badge(p_docs text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_profiles where user_id = auth.uid() and verification_status = 'approved')
    then raise exception 'VENDOR_NOT_VERIFIED'; end if;
  if coalesce(array_length(p_docs, 1), 0) = 0 then raise exception 'DOCS_REQUIRED'; end if;
  update vendor_profiles set investment_badge = 'pending', investment_badge_reason = null, investment_docs = p_docs
  where user_id = auth.uid();
end $$;

-- DEV ONLY. Drop before launch.
create or replace function public.dev_set_badge(p_status text, p_reason text default null) returns void
language sql security definer set search_path = public as $$
  update vendor_profiles set investment_badge = p_status, investment_badge_reason = p_reason where user_id = auth.uid();
$$;

create or replace function public.save_offering(p_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_id is null then
    insert into investment_offerings (vendor_id, title, summary, use_of_funds, photos, target_amount, min_ticket,
      projected_roi_pct, duration_months, payout_schedule, closes_at)
    values (auth.uid(), p->>'title', p->>'summary', p->>'use_of_funds',
      coalesce(array(select jsonb_array_elements_text(p->'photos')), '{}'),
      (p->>'target_amount')::numeric, coalesce((p->>'min_ticket')::numeric, 10000),
      (p->>'projected_roi_pct')::numeric, (p->>'duration_months')::int,
      coalesce(p->>'payout_schedule', 'end_of_term'), (p->>'closes_at')::timestamptz)
    returning id into v_id;
  else
    update investment_offerings set title = p->>'title', summary = p->>'summary', use_of_funds = p->>'use_of_funds',
      photos = coalesce(array(select jsonb_array_elements_text(p->'photos')), photos),
      target_amount = (p->>'target_amount')::numeric, min_ticket = coalesce((p->>'min_ticket')::numeric, min_ticket),
      projected_roi_pct = (p->>'projected_roi_pct')::numeric, duration_months = (p->>'duration_months')::int,
      payout_schedule = coalesce(p->>'payout_schedule', payout_schedule), closes_at = (p->>'closes_at')::timestamptz,
      updated_at = now()
    where id = p_id and vendor_id = auth.uid() and status in ('draft','rejected')
    returning id into v_id;
    if v_id is null then raise exception 'OFFERING_LOCKED'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.submit_offering(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_profiles where user_id = auth.uid() and verification_status = 'approved' and investment_badge = 'approved')
    then raise exception 'BADGE_REQUIRED'; end if;
  update investment_offerings set status = 'pending_review', updated_at = now()
  where id = p_id and vendor_id = auth.uid() and status in ('draft','rejected')
    and closes_at > now() + interval '3 days';
  if not found then raise exception 'OFFERING_INVALID'; end if;
end $$;

-- DEV ONLY (ops review). Drop before launch.
create or replace function public.dev_review_offering(p_id uuid, p_approve boolean, p_note text default null) returns void
language sql security definer set search_path = public as $$
  update investment_offerings set status = case when p_approve then 'open' else 'rejected' end, review_note = p_note, updated_at = now()
  where id = p_id and vendor_id = auth.uid() and status = 'pending_review';
$$;

-- ---------- Invest ----------
create or replace function public.invest(p_kind text, p_target uuid, p_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); o investment_offerings; pl investment_pools;
  v_target numeric; v_raised numeric; v_min numeric; v_roi numeric; v_months int; v_close timestamptz; v_status text; v_title text;
  v_bal numeric; v_id uuid;
begin
  if not exists (select 1 from kyc_records where user_id = v_uid and status = 'approved') then raise exception 'KYC_REQUIRED'; end if;

  if p_kind = 'offering' then
    select * into o from investment_offerings where id = p_target for update;
    if o.id is null then raise exception 'NOT_FOUND'; end if;
    if o.vendor_id = v_uid then raise exception 'OWN_OFFERING'; end if;
    if not exists (select 1 from vendor_profiles where user_id = o.vendor_id and verification_status = 'approved' and investment_badge = 'approved')
      then raise exception 'FARM_NOT_VERIFIED'; end if;
    v_target := o.target_amount; v_raised := o.raised_amount; v_min := o.min_ticket; v_roi := o.projected_roi_pct;
    v_months := o.duration_months; v_close := o.closes_at; v_status := o.status; v_title := o.title;
  elsif p_kind = 'pool' then
    select * into pl from investment_pools where id = p_target for update;
    if pl.id is null then raise exception 'NOT_FOUND'; end if;
    v_target := pl.target_amount; v_raised := pl.raised_amount; v_min := pl.min_ticket; v_roi := pl.projected_roi_pct;
    v_months := pl.duration_months; v_close := pl.closes_at; v_status := pl.status; v_title := pl.title;
  else raise exception 'INVALID_KIND'; end if;

  if v_status <> 'open' or v_close < now() then raise exception 'OFFERING_CLOSED'; end if;
  if p_amount is null or p_amount < v_min then raise exception 'BELOW_MINIMUM'; end if;
  if p_amount > v_target - v_raised then raise exception 'EXCEEDS_REMAINING'; end if;

  update wallets set balance = balance - p_amount where user_id = v_uid and balance >= p_amount returning balance into v_bal;
  if v_bal is null then raise exception 'INSUFFICIENT_WALLET'; end if;

  insert into investments (investor_id, offering_id, pool_id, amount, projected_roi_pct, duration_months, projected_return)
  values (v_uid, case when p_kind = 'offering' then p_target end, case when p_kind = 'pool' then p_target end,
          p_amount, v_roi, v_months, round(p_amount * v_roi / 100, 2))
  returning id into v_id;

  insert into transactions (user_id, type, amount, label, related_investment_id)
  values (v_uid, 'investment', -p_amount, 'Investment · ' || v_title, v_id);

  if p_kind = 'offering' then
    update investment_offerings set raised_amount = raised_amount + p_amount,
      status = case when raised_amount + p_amount >= target_amount then 'funded' else status end, updated_at = now()
    where id = p_target;
  else
    update investment_pools set raised_amount = raised_amount + p_amount,
      status = case when raised_amount + p_amount >= target_amount then 'funded' else status end
    where id = p_target;
  end if;

  return jsonb_build_object('investment_id', v_id, 'balance', v_bal);
end $$;

-- How many people have invested (investments themselves are private to each investor).
create or replace function public.investor_count(p_kind text, p_target uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct investor_id)::int from investments
   where status <> 'refunded' and ((p_kind = 'offering' and offering_id = p_target) or (p_kind = 'pool' and pool_id = p_target));
$$;

-- ---------- Internal helpers (revoked from clients) ----------
create or replace function public.refund_investments(p_kind text, p_target uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare i investments;
begin
  for i in select * from investments where status = 'active'
    and ((p_kind = 'offering' and offering_id = p_target) or (p_kind = 'pool' and pool_id = p_target)) for update loop
    update investments set status = 'refunded' where id = i.id;
    update wallets set balance = balance + i.amount where user_id = i.investor_id;
    insert into transactions (user_id, type, amount, label, related_investment_id)
    values (i.investor_id, 'investment_refund', i.amount, 'Investment refund · ' || p_reason, i.id);
  end loop;
  if p_kind = 'offering' then update investment_offerings set status = 'refunded', updated_at = now() where id = p_target;
  else update investment_pools set status = 'refunded' where id = p_target; end if;
end $$;

-- Ops: start the term once funded. Pays raised money to farm wallet(s).
create or replace function public.activate_investment(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o investment_offerings; pl investment_pools; f record;
begin
  if p_kind = 'offering' then
    select * into o from investment_offerings where id = p_target and status = 'funded' for update;
    if o.id is null then raise exception 'NOT_FUNDED'; end if;
    update investment_offerings set status = 'active', started_at = now() where id = o.id;
    update wallets set balance = balance + o.raised_amount where user_id = o.vendor_id;
    insert into transactions (user_id, type, amount, label) values (o.vendor_id, 'investment_funding', o.raised_amount, 'Funding received · ' || o.title);
  else
    select * into pl from investment_pools where id = p_target and status = 'funded' for update;
    if pl.id is null then raise exception 'NOT_FUNDED'; end if;
    update investment_pools set status = 'active', started_at = now() where id = pl.id;
    for f in select * from pool_farms where pool_id = pl.id loop
      update wallets set balance = balance + round(pl.raised_amount * f.allocation_pct / 100, 2) where user_id = f.vendor_id;
      insert into transactions (user_id, type, amount, label)
      values (f.vendor_id, 'investment_funding', round(pl.raised_amount * f.allocation_pct / 100, 2), 'Pool funding · ' || pl.title);
    end loop;
  end if;
end $$;

-- Ops: pay out profit (and principal if final). Debits the farm wallet(s); pro rata to investors.
create or replace function public.distribute_returns(p_kind text, p_target uuid, p_profit numeric, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_principal numeric; v_title text; v_vendor uuid; i investments; v_share numeric; f record; v_bal numeric;
begin
  if p_profit is null or p_profit < 0 then raise exception 'INVALID_AMOUNT'; end if;
  select coalesce(sum(amount), 0) into v_principal from investments where status = 'active'
    and ((p_kind = 'offering' and offering_id = p_target) or (p_kind = 'pool' and pool_id = p_target));
  if v_principal = 0 then raise exception 'NO_INVESTORS'; end if;
  v_total := p_profit + case when p_final then v_principal else 0 end;

  if p_kind = 'offering' then
    select vendor_id, title into v_vendor, v_title from investment_offerings where id = p_target and status = 'active';
    if v_vendor is null then raise exception 'NOT_ACTIVE'; end if;
    update wallets set balance = balance - v_total where user_id = v_vendor and balance >= v_total returning balance into v_bal;
    if v_bal is null then raise exception 'FARM_INSUFFICIENT'; end if;
    insert into transactions (user_id, type, amount, label) values (v_vendor, 'payment', -v_total, 'Investor distribution · ' || v_title);
  else
    select title into v_title from investment_pools where id = p_target and status = 'active';
    if v_title is null then raise exception 'NOT_ACTIVE'; end if;
    for f in select * from pool_farms where pool_id = p_target loop
      update wallets set balance = balance - round(v_total * f.allocation_pct / 100, 2)
      where user_id = f.vendor_id and balance >= round(v_total * f.allocation_pct / 100, 2) returning balance into v_bal;
      if v_bal is null then raise exception 'FARM_INSUFFICIENT'; end if;
      insert into transactions (user_id, type, amount, label)
      values (f.vendor_id, 'payment', -round(v_total * f.allocation_pct / 100, 2), 'Pool distribution · ' || v_title);
    end loop;
  end if;

  for i in select * from investments where status = 'active'
    and ((p_kind = 'offering' and offering_id = p_target) or (p_kind = 'pool' and pool_id = p_target)) for update loop
    v_share := round(p_profit * i.amount / v_principal, 2);
    update investments set returns_paid = returns_paid + v_share, status = case when p_final then 'matured' else status end where id = i.id;
    update wallets set balance = balance + v_share + case when p_final then i.amount else 0 end where user_id = i.investor_id;
    insert into transactions (user_id, type, amount, label, related_investment_id)
    values (i.investor_id, 'investment_return', v_share + case when p_final then i.amount else 0 end,
            case when p_final then 'Final payout · ' else 'Returns · ' end || v_title, i.id);
  end loop;

  if p_final then
    if p_kind = 'offering' then update investment_offerings set status = 'matured' where id = p_target;
    else update investment_pools set status = 'matured' where id = p_target; end if;
  end if;
end $$;

-- Record projected vs actual for one offering/pool right after a payout (the monthly cron covers the rest).
create or replace function public.snapshot_roi_for(p_kind text, p_target uuid) returns void
language sql security definer set search_path = public as $$
  insert into roi_calculations (investment_id, projected_return, actual_return, computed_date)
  select i.id,
    round(i.projected_return * least(1, greatest(0,
      extract(epoch from now() - coalesce(o.started_at, p.started_at)) / (i.duration_months * 30.44 * 86400)))::numeric, 2),
    i.returns_paid, current_date
  from investments i
  left join investment_offerings o on o.id = i.offering_id
  left join investment_pools p on p.id = i.pool_id
  where i.status in ('active','matured') and coalesce(o.started_at, p.started_at) is not null
    and ((p_kind = 'offering' and i.offering_id = p_target) or (p_kind = 'pool' and i.pool_id = p_target))
  on conflict (investment_id, computed_date) do update set projected_return = excluded.projected_return, actual_return = excluded.actual_return;
$$;

-- Cron: refund offerings/pools that missed their target.
create or replace function public.investment_housekeeping() returns void
language plpgsql security definer set search_path = public as $$
declare x record;
begin
  for x in select id from investment_offerings where status = 'open' and closes_at < now() loop
    perform refund_investments('offering', x.id, 'target not reached');
  end loop;
  for x in select id from investment_pools where status = 'open' and closes_at < now() loop
    perform refund_investments('pool', x.id, 'target not reached');
  end loop;
end $$;

-- Cron: snapshot projected vs actual ROI monthly.
create or replace function public.snapshot_roi() returns void
language sql security definer set search_path = public as $$
  insert into roi_calculations (investment_id, projected_return, actual_return, computed_date)
  select i.id,
    round(i.projected_return * least(1, greatest(0,
      extract(epoch from now() - coalesce(o.started_at, p.started_at)) / (i.duration_months * 30.44 * 86400)))::numeric, 2),
    i.returns_paid, current_date
  from investments i
  left join investment_offerings o on o.id = i.offering_id
  left join investment_pools p on p.id = i.pool_id
  where i.status = 'active' and coalesce(o.started_at, p.started_at) is not null
  on conflict (investment_id, computed_date) do update set projected_return = excluded.projected_return, actual_return = excluded.actual_return;
$$;

-- Suspend open offerings/pools if a farm loses verification or badge.
create or replace function public.suspend_on_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification_status <> 'approved' or new.investment_badge <> 'approved' then
    update investment_offerings set status = 'suspended', updated_at = now() where vendor_id = new.user_id and status = 'open';
    update investment_pools set status = 'suspended' where status = 'open'
      and id in (select pool_id from pool_farms where vendor_id = new.user_id);
  end if;
  return new;
end $$;
drop trigger if exists suspend_on_flag on public.vendor_profiles;
create trigger suspend_on_flag after update of verification_status, investment_badge on public.vendor_profiles
  for each row execute function public.suspend_on_flag();

-- ---------- Read models ----------
-- Totals and items come from the same rows, so they always reconcile (PRD P0). Don't recompute on the client.
create or replace function public.my_portfolio() returns jsonb
language sql stable security definer set search_path = public as $$
  with rows as (
    select i.*, coalesce(o.title, p.title) as title, case when i.pool_id is null then 'offering' else 'pool' end as kind,
      coalesce(o.status, p.status) as target_status, coalesce(o.started_at, p.started_at) as started_at,
      coalesce(o.payout_schedule, 'end_of_term') as payout_schedule,
      vp.business_name as farm_name,
      (select count(*) from pool_farms pf where pf.pool_id = i.pool_id) as pool_farm_count,
      (case when i.status = 'active' then i.amount else 0 end) + i.returns_paid as current_value
    from investments i
    left join investment_offerings o on o.id = i.offering_id
    left join investment_pools p on p.id = i.pool_id
    left join vendor_profiles vp on vp.user_id = o.vendor_id
    where i.investor_id = auth.uid()
  )
  select jsonb_build_object(
    'total_invested', coalesce((select sum(amount) from rows where status <> 'refunded'), 0),
    'current_value', coalesce((select sum(current_value) from rows where status = 'active'), 0),
    'returns_to_date', coalesce((select sum(returns_paid) from rows), 0),
    'items', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from rows r), '[]'::jsonb));
$$;

-- =====================================================================
-- Ops console (apps/admin): review KYC, badges and offerings; activate; distribute; pools.
-- Every function checks is_admin() (migration 002).
-- =====================================================================
create or replace function public.admin_invest_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return jsonb_build_object(
    'kyc', coalesce((select jsonb_agg(jsonb_build_object('user_id', k.user_id, 'full_name', k.full_name, 'date_of_birth', k.date_of_birth,
        'address', k.address, 'bvn_last4', k.bvn_last4, 'id_doc_path', k.id_doc_path, 'address_doc_path', k.address_doc_path,
        'status', k.status, 'rejection_reason', k.rejection_reason, 'submitted_at', k.submitted_at, 'email', p.email)
        order by (k.status = 'pending') desc, k.submitted_at desc) from kyc_records k join profiles p on p.id = k.user_id), '[]'::jsonb),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('user_id', v.user_id, 'business_name', v.business_name, 'location', v.location,
        'verification_status', v.verification_status, 'investment_badge', v.investment_badge, 'investment_badge_reason', v.investment_badge_reason,
        'investment_docs', v.investment_docs, 'email', p.email, 'wallet', (select balance from wallets w where w.user_id = v.user_id))
        order by (v.investment_badge = 'pending') desc, v.business_name) from vendor_profiles v join profiles p on p.id = v.user_id
        where v.investment_badge <> 'none'), '[]'::jsonb),
    'offerings', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'summary', o.summary, 'use_of_funds', o.use_of_funds,
        'target_amount', o.target_amount, 'raised_amount', o.raised_amount, 'min_ticket', o.min_ticket, 'projected_roi_pct', o.projected_roi_pct,
        'duration_months', o.duration_months, 'payout_schedule', o.payout_schedule, 'closes_at', o.closes_at, 'started_at', o.started_at,
        'status', o.status, 'review_note', o.review_note, 'created_at', o.created_at, 'farm', v.business_name,
        'farm_wallet', (select balance from wallets w where w.user_id = o.vendor_id),
        'investors', investor_count('offering', o.id),
        'returns_paid', (select coalesce(sum(returns_paid), 0) from investments i where i.offering_id = o.id))
        order by (o.status in ('pending_review','funded')) desc, o.created_at desc)
        from investment_offerings o join vendor_profiles v on v.user_id = o.vendor_id where o.status <> 'draft'), '[]'::jsonb),
    'pools', coalesce((select jsonb_agg(jsonb_build_object('id', pl.id, 'title', pl.title, 'summary', pl.summary,
        'target_amount', pl.target_amount, 'raised_amount', pl.raised_amount, 'min_ticket', pl.min_ticket, 'projected_roi_pct', pl.projected_roi_pct,
        'duration_months', pl.duration_months, 'closes_at', pl.closes_at, 'started_at', pl.started_at, 'status', pl.status,
        'investors', investor_count('pool', pl.id),
        'returns_paid', (select coalesce(sum(returns_paid), 0) from investments i where i.pool_id = pl.id),
        'farms', (select coalesce(jsonb_agg(jsonb_build_object('vendor_id', f.vendor_id, 'name', v.business_name, 'allocation_pct', f.allocation_pct)), '[]'::jsonb)
                    from pool_farms f join vendor_profiles v on v.user_id = f.vendor_id where f.pool_id = pl.id))
        order by pl.created_at desc) from investment_pools pl), '[]'::jsonb));
end $$;

create or replace function public.admin_set_kyc(p_user uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('approved','rejected','pending') then raise exception 'INVALID_STATUS'; end if;
  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  update kyc_records set status = p_status, rejection_reason = case when p_status = 'rejected' then trim(p_reason) end, reviewed_at = now()
   where user_id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.admin_set_badge(p_user uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('approved','rejected','pending') then raise exception 'INVALID_STATUS'; end if;
  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  update vendor_profiles set investment_badge = p_status, investment_badge_reason = case when p_status = 'rejected' then trim(p_reason) end
   where user_id = p_user;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.admin_review_offering(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  update investment_offerings set status = case when p_approve then 'open' else 'rejected' end, review_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
   where id = p_id and status = 'pending_review';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

create or replace function public.admin_activate_investment(p_kind text, p_target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  perform activate_investment(p_kind, p_target);
end $$;

create or replace function public.admin_distribute_returns(p_kind text, p_target uuid, p_profit numeric, p_final boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  perform distribute_returns(p_kind, p_target, p_profit, p_final);
  perform snapshot_roi_for(p_kind, p_target);
end $$;

-- p_farms: [{"vendor_id": "...", "allocation_pct": 50}, ...] — must total 100, all badge-approved.
create or replace function public.admin_create_pool(p_title text, p_summary text, p_target numeric, p_min_ticket numeric,
  p_roi numeric, p_months int, p_closes_at timestamptz, p_farms jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sum numeric;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select coalesce(sum((f->>'allocation_pct')::numeric), 0) into v_sum from jsonb_array_elements(p_farms) f;
  if v_sum <> 100 then raise exception 'ALLOCATION_NOT_100'; end if;
  if exists (select 1 from jsonb_array_elements(p_farms) f
              where not exists (select 1 from vendor_profiles v where v.user_id = (f->>'vendor_id')::uuid
                                  and v.verification_status = 'approved' and v.investment_badge = 'approved'))
    then raise exception 'FARM_NOT_VERIFIED'; end if;
  insert into investment_pools (title, summary, target_amount, min_ticket, projected_roi_pct, duration_months, closes_at)
  values (trim(p_title), nullif(trim(coalesce(p_summary, '')), ''), p_target, coalesce(p_min_ticket, 10000), p_roi, p_months, p_closes_at)
  returning id into v_id;
  insert into pool_farms (pool_id, vendor_id, allocation_pct)
  select v_id, (f->>'vendor_id')::uuid, (f->>'allocation_pct')::numeric from jsonb_array_elements(p_farms) f;
  return v_id;
end $$;

-- ---------- Lock down internal/ops functions ----------
revoke execute on function public.refund_investments(text, uuid, text) from public, anon, authenticated;
revoke execute on function public.activate_investment(text, uuid) from public, anon, authenticated;
revoke execute on function public.distribute_returns(text, uuid, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.investment_housekeeping() from public, anon, authenticated;
revoke execute on function public.snapshot_roi() from public, anon, authenticated;
revoke execute on function public.snapshot_roi_for(text, uuid) from public, anon, authenticated;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  foreach t in array array['kyc_records', 'investment_offerings', 'investment_pools'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Cron (pg_cron already enabled):
-- select cron.schedule('p360-invest-close', '*/15 * * * *', $$select public.investment_housekeeping()$$);
-- select cron.schedule('p360-roi-monthly', '0 2 1 * *', $$select public.snapshot_roi()$$);

-- =====================================================================
-- Sign-up personas (vet, supplier type, buyer type) and the Farm Book (credit).
-- Note: place_order, refund_sub_order, rider_advance, vendor_orders and submit_vendor_application
-- are redefined here; these later definitions are the ones in force.
-- =====================================================================
-- ---------- Personas ----------
-- Buyers: individual or business. Suppliers: what they supply.
alter table public.profiles add column if not exists buyer_type text check (buyer_type in ('individual','business'));
alter table public.profiles add column if not exists buyer_business_name text;
alter table public.vendor_profiles add column if not exists supplier_type text check (supplier_type in ('feed','equipment','medicine'));

create or replace function public.set_buyer_type(p_type text, p_business_name text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type not in ('individual','business') then raise exception 'INVALID_TYPE'; end if;
  if p_type = 'business' and coalesce(trim(p_business_name), '') = '' then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
  update profiles set buyer_type = p_type, buyer_business_name = case when p_type = 'business' then trim(p_business_name) end
   where id = auth.uid();
end $$;

drop function if exists public.submit_vendor_application(text, text[], text, text, double precision, double precision);
create or replace function public.submit_vendor_application(
  p_business_name text, p_categories text[], p_location text, p_id_doc_path text,
  p_lat double precision default null, p_lng double precision default null, p_supplier_type text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_supplier_type is not null and p_supplier_type not in ('feed','equipment','medicine') then raise exception 'INVALID_TYPE'; end if;
  insert into vendor_profiles (user_id, business_name, categories, location, id_doc_path, lat, lng, supplier_type)
  values (auth.uid(), p_business_name, p_categories, p_location, p_id_doc_path, p_lat, p_lng, p_supplier_type)
  on conflict (user_id) do update set business_name = excluded.business_name, categories = excluded.categories,
    location = excluded.location, id_doc_path = excluded.id_doc_path, lat = excluded.lat, lng = excluded.lng,
    supplier_type = coalesce(excluded.supplier_type, vendor_profiles.supplier_type),
    verification_status = 'pending', rejection_reason = null;
  update profiles set roles = (select array_agg(distinct r) from unnest(roles || array['vendor']) r) where id = auth.uid();
end $$;

-- ---------- Vets: register, get approved by ops, manage slots and bookings ----------
alter table public.vets add column if not exists user_id uuid unique references auth.users on delete set null;
alter table public.vets add column if not exists phone text;
alter table public.vets add column if not exists licence_doc_path text;
alter table public.vets add column if not exists status text not null default 'approved' check (status in ('pending','approved','rejected'));
alter table public.vets add column if not exists rejection_reason text;
alter table public.vets add column if not exists created_at timestamptz default now();

drop policy if exists vets_own_r on public.vets;
create policy vets_own_r on public.vets for select using (user_id = auth.uid());

create or replace function public.submit_vet_application(p_name text, p_specialty text, p_years int, p_fee numeric, p_bio text,
  p_phone text, p_licence_doc text, p_onsite boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := trim(coalesce(p_name, '')); v_initials text;
begin
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  if p_fee is null or p_fee <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if coalesce(p_licence_doc, '') = '' then raise exception 'DOCS_REQUIRED'; end if;
  select upper(string_agg(left(w, 1), '')) into v_initials
    from (select w from regexp_split_to_table(regexp_replace(v_name, '^(Dr\.?|Doctor)\s+', '', 'i'), '\s+') w limit 2) t;
  insert into vets (user_id, name, initials, specialty, years, fee, bio, phone, licence_doc_path, onsite, verified, status, rating, reviews)
  values (auth.uid(), v_name, v_initials, nullif(trim(coalesce(p_specialty, '')), ''), p_years, p_fee, nullif(trim(coalesce(p_bio, '')), ''),
          nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''), p_licence_doc, coalesce(p_onsite, true), false, 'pending', null, 0)
  on conflict (user_id) do update set name = excluded.name, initials = excluded.initials, specialty = excluded.specialty, years = excluded.years,
    fee = excluded.fee, bio = excluded.bio, phone = excluded.phone, licence_doc_path = excluded.licence_doc_path, onsite = excluded.onsite,
    verified = false, status = 'pending', rejection_reason = null;
  update profiles set roles = (select array_agg(distinct r) from unnest(roles || array['vet']) r), full_name = coalesce(full_name, v_name)
   where id = auth.uid();
end $$;

-- An approved vet can change these without another review.
create or replace function public.vet_update_profile(p_fee numeric, p_bio text, p_onsite boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_fee is null or p_fee <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  update vets set fee = p_fee, bio = nullif(trim(coalesce(p_bio, '')), ''), onsite = coalesce(p_onsite, onsite) where user_id = auth.uid();
  if not found then raise exception 'NOT_VET'; end if;
end $$;

create or replace function public.vet_self() returns uuid
language sql stable security definer set search_path = public as $$
  select id from vets where user_id = auth.uid() and status = 'approved';
$$;

create or replace function public.vet_add_slot(p_starts_at timestamptz) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := public.vet_self(); s uuid;
begin
  if v is null then raise exception 'VET_NOT_APPROVED'; end if;
  if p_starts_at is null or p_starts_at < now() + interval '30 minutes' then raise exception 'INVALID_TIME'; end if;
  if exists (select 1 from vet_slots where vet_id = v and starts_at = p_starts_at) then raise exception 'SLOT_EXISTS'; end if;
  insert into vet_slots (vet_id, starts_at) values (v, p_starts_at) returning id into s;
  return s;
end $$;

create or replace function public.vet_remove_slot(p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from vet_slots where id = p_slot and vet_id = public.vet_self() and not booked;
  if not found then raise exception 'SLOT_BOOKED'; end if;
end $$;

-- On-site request: propose a visit time (farmer then confirms in the app) or decline.
create or replace function public.vet_respond_onsite(p_consultation uuid, p_accept boolean, p_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept and (p_at is null or p_at < now()) then raise exception 'INVALID_TIME'; end if;
  update consultations set status = case when p_accept then 'proposed' else 'cancelled' end, proposed_at = case when p_accept then p_at else proposed_at end
   where id = p_consultation and vet_id = public.vet_self() and type = 'onsite' and status in ('requested','proposed');
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Finish a consult: the summary is saved to the farmer's flock health records.
create or replace function public.vet_complete(p_consultation uuid, p_summary text) returns void
language plpgsql security definer set search_path = public as $$
declare k consultations; v vets;
begin
  if coalesce(trim(p_summary), '') = '' then raise exception 'SUMMARY_REQUIRED'; end if;
  select * into v from vets where id = public.vet_self();
  update consultations set status = 'completed', summary = trim(p_summary)
   where id = p_consultation and vet_id = v.id and status = 'confirmed' returning * into k;
  if k.id is null then raise exception 'NOT_FOUND'; end if;
  if k.flock_id is not null then
    insert into health_records (flock_id, owner_id, source, author, title, notes)
    values (k.flock_id, k.farmer_id, 'vet', v.name, 'Vet consultation summary', trim(p_summary));
  end if;
end $$;

-- Everything the vet's own screens need.
create or replace function public.vet_desk() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v vets;
begin
  select * into v from vets where user_id = auth.uid();
  if v.id is null then return null; end if;
  return jsonb_build_object(
    'vet', to_jsonb(v) - 'licence_doc_path',
    'slots', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'booked', s.booked) order by s.starts_at)
                         from vet_slots s where s.vet_id = v.id and s.starts_at > now() - interval '1 hour'), '[]'::jsonb),
    'consultations', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'type', k.type, 'status', k.status,
        'at', coalesce(k.proposed_at, k.requested_date::timestamptz), 'requested_date', k.requested_date, 'location', k.location, 'notes', k.notes,
        'summary', k.summary, 'meeting_url', k.meeting_url, 'fee', k.fee, 'created_at', k.created_at,
        'farmer', coalesce(vp.business_name, p.full_name, 'Farmer'), 'farmer_phone', p.phone,
        'flock', case when f.id is null then null else coalesce(f.code, '') || ' · ' || f.type || ' · ' || f.size || ' birds' end)
        order by (k.status in ('requested','proposed','confirmed')) desc, coalesce(k.proposed_at, k.created_at) desc)
      from consultations k join profiles p on p.id = k.farmer_id
      left join vendor_profiles vp on vp.user_id = k.farmer_id left join flocks f on f.id = k.flock_id
      where k.vet_id = v.id), '[]'::jsonb));
end $$;

-- Ops: review vets
create or replace function public.admin_vets() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'specialty', v.specialty, 'years', v.years, 'fee', v.fee, 'bio', v.bio,
      'phone', v.phone, 'licence_doc_path', v.licence_doc_path, 'status', v.status, 'rejection_reason', v.rejection_reason, 'onsite', v.onsite,
      'created_at', v.created_at, 'email', p.email, 'registered', v.user_id is not null)
      order by (v.status = 'pending') desc, v.created_at desc nulls last)
    from vets v left join profiles p on p.id = v.user_id), '[]'::jsonb);
end $$;

create or replace function public.admin_set_vet(p_vet uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if p_status not in ('approved','rejected','pending') then raise exception 'INVALID_STATUS'; end if;
  if p_status = 'rejected' and coalesce(trim(p_reason), '') = '' then raise exception 'REASON_REQUIRED'; end if;
  update vets set status = p_status, verified = (p_status = 'approved'), rejection_reason = case when p_status = 'rejected' then trim(p_reason) end
   where id = p_vet;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- =====================================================================
-- Farm Book: selling on credit
-- A farm keeps a book of customers it trusts with credit.
--  · App buyers: allowed once they've bought enough from THIS farm (₦300,000 business / ₦50,000 individual);
--    they can then choose "Pay later" at checkout up to their limit.
--  · People not on the app: the farm writes the sale down; it stays "payment pending" until a receipt is uploaded.
-- =====================================================================
alter table public.sub_orders add column if not exists on_credit boolean not null default false;

create table if not exists public.credit_customers (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  buyer_id uuid references public.profiles on delete set null,        -- null = not on the app
  name text not null,
  phone text,
  customer_type text not null default 'individual' check (customer_type in ('individual','business')),
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),   -- only used for app buyers at checkout
  status text not null default 'active' check (status in ('active','blocked')),
  notes text,
  created_at timestamptz default now(),
  unique (vendor_id, buyer_id)
);

create table if not exists public.credit_entries (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  customer_id uuid not null references public.credit_customers on delete cascade,
  sub_order_id uuid references public.sub_orders on delete set null,  -- set for "Pay later" app orders
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  due_date date,
  receipt_path text,
  paid_via text check (paid_via in ('receipt','wallet')),
  paid_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists credit_entries_vendor_idx on public.credit_entries (vendor_id, status);
create index if not exists credit_entries_customer_idx on public.credit_entries (customer_id);

alter table public.credit_customers enable row level security;
alter table public.credit_entries enable row level security;
drop policy if exists credit_customers_r on public.credit_customers;
create policy credit_customers_r on public.credit_customers for select using (vendor_id = auth.uid() or buyer_id = auth.uid());
drop policy if exists credit_entries_r on public.credit_entries;
create policy credit_entries_r on public.credit_entries for select using (vendor_id = auth.uid()
  or exists (select 1 from credit_customers c where c.id = customer_id and c.buyer_id = auth.uid()));
-- All writes go through the RPCs below.

-- What a buyer must have bought from this farm before the farm can offer them credit.
create or replace function public.credit_threshold(p_type text) returns numeric
language sql immutable as $$ select case when p_type = 'business' then 300000 else 50000 end::numeric $$;

create or replace function public.credit_outstanding(p_customer uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from credit_entries where customer_id = p_customer and status = 'pending';
$$;

-- The farm's whole book: customers with what they owe, every entry, and app buyers who qualify (or are getting close).
create or replace function public.farm_book() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if not exists (select 1 from vendor_profiles where user_id = v) then raise exception 'NOT_VENDOR'; end if;
  return jsonb_build_object(
    'outstanding', coalesce((select sum(amount) from credit_entries where vendor_id = v and status = 'pending'), 0),
    'collected_30d', coalesce((select sum(amount) from credit_entries where vendor_id = v and status = 'paid' and paid_at > now() - interval '30 days'), 0),
    'overdue', coalesce((select sum(amount) from credit_entries where vendor_id = v and status = 'pending' and due_date < current_date), 0),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'customer_type', c.customer_type,
        'on_app', c.buyer_id is not null, 'credit_limit', c.credit_limit, 'status', c.status, 'notes', c.notes,
        'outstanding', credit_outstanding(c.id),
        'pending_count', (select count(*) from credit_entries e where e.customer_id = c.id and e.status = 'pending'))
        order by credit_outstanding(c.id) desc, c.name) from credit_customers c where c.vendor_id = v), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'customer_id', e.customer_id, 'customer', c.name, 'on_app', c.buyer_id is not null,
        'description', e.description, 'amount', e.amount, 'status', e.status, 'due_date', e.due_date, 'receipt_path', e.receipt_path,
        'paid_via', e.paid_via, 'paid_at', e.paid_at, 'created_at', e.created_at, 'from_order', e.sub_order_id is not null,
        'overdue', e.status = 'pending' and e.due_date < current_date)
        order by (e.status = 'pending') desc, e.created_at desc)
      from credit_entries e join credit_customers c on c.id = e.customer_id where e.vendor_id = v and e.status <> 'cancelled'), '[]'::jsonb),
    'eligible', coalesce((select jsonb_agg(to_jsonb(t) order by t.qualifies desc, t.bought desc) from (
        select o.buyer_id, coalesce(p.buyer_business_name, p.full_name, 'Buyer') as name, coalesce(p.buyer_type, 'individual') as buyer_type,
               sum(s.items_total) as bought, credit_threshold(coalesce(p.buyer_type, 'individual')) as threshold,
               sum(s.items_total) >= credit_threshold(coalesce(p.buyer_type, 'individual')) as qualifies
          from sub_orders s join orders o on o.id = s.order_id join profiles p on p.id = o.buyer_id
         where s.vendor_id = v and s.status = 'delivered' and o.buyer_id <> v
           and not exists (select 1 from credit_customers c where c.vendor_id = v and c.buyer_id = o.buyer_id)
         group by o.buyer_id, p.buyer_business_name, p.full_name, p.buyer_type
         order by sum(s.items_total) desc limit 30) t), '[]'::jsonb));
end $$;

-- Allow an app buyer to pay later, once they've bought enough from this farm.
create or replace function public.farm_book_allow_buyer(p_buyer uuid, p_limit numeric) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); p profiles; v_bought numeric; v_id uuid;
begin
  if not exists (select 1 from vendor_profiles where user_id = v and verification_status = 'approved') then raise exception 'VENDOR_NOT_VERIFIED'; end if;
  if p_limit is null or p_limit <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into p from profiles where id = p_buyer;
  if p.id is null or p_buyer = v then raise exception 'NOT_FOUND'; end if;
  select coalesce(sum(s.items_total), 0) into v_bought from sub_orders s join orders o on o.id = s.order_id
   where s.vendor_id = v and o.buyer_id = p_buyer and s.status = 'delivered';
  if v_bought < credit_threshold(coalesce(p.buyer_type, 'individual')) then raise exception 'NOT_ELIGIBLE'; end if;
  insert into credit_customers (vendor_id, buyer_id, name, phone, customer_type, credit_limit)
  values (v, p_buyer, coalesce(p.buyer_business_name, p.full_name, 'Buyer'), p.phone, coalesce(p.buyer_type, 'individual'), p_limit)
  on conflict (vendor_id, buyer_id) do update set credit_limit = excluded.credit_limit, status = 'active'
  returning id into v_id;
  return v_id;
end $$;

-- Change a customer's limit, block them from new credit, or edit their details.
create or replace function public.farm_book_update_customer(p_customer uuid, p_limit numeric default null, p_status text default null,
  p_name text default null, p_phone text default null, p_notes text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status is not null and p_status not in ('active','blocked') then raise exception 'INVALID_STATUS'; end if;
  if p_limit is not null and p_limit < 0 then raise exception 'INVALID_AMOUNT'; end if;
  update credit_customers set credit_limit = coalesce(p_limit, credit_limit), status = coalesce(p_status, status),
    name = coalesce(nullif(trim(p_name), ''), name), phone = coalesce(p_phone, phone), notes = coalesce(p_notes, notes)
   where id = p_customer and vendor_id = auth.uid();
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Write down a credit sale. p_customer null = a new customer who isn't on the app (name required).
create or replace function public.farm_book_log_credit(p_customer uuid, p_name text, p_phone text, p_type text,
  p_description text, p_amount numeric, p_due date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_customer uuid := p_customer; v_id uuid;
begin
  if not exists (select 1 from vendor_profiles where user_id = v) then raise exception 'NOT_VENDOR'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if coalesce(trim(p_description), '') = '' then raise exception 'DESCRIPTION_REQUIRED'; end if;
  if v_customer is null then
    if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
    insert into credit_customers (vendor_id, name, phone, customer_type)
    values (v, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), case when p_type = 'business' then 'business' else 'individual' end)
    returning id into v_customer;
  elsif not exists (select 1 from credit_customers where id = v_customer and vendor_id = v) then
    raise exception 'NOT_FOUND';
  end if;
  insert into credit_entries (vendor_id, customer_id, description, amount, due_date)
  values (v, v_customer, trim(p_description), p_amount, p_due) returning id into v_id;
  return v_id;
end $$;

-- The customer paid the farm directly: uploading the receipt marks it paid.
create or replace function public.farm_book_settle(p_entry uuid, p_receipt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_receipt), '') = '' then raise exception 'RECEIPT_REQUIRED'; end if;
  update credit_entries set status = 'paid', paid_via = 'receipt', receipt_path = p_receipt, paid_at = now()
   where id = p_entry and vendor_id = auth.uid() and status = 'pending';
  if not found then raise exception 'ALREADY_ACTIONED'; end if;
end $$;

-- Remove an entry written by mistake (hand-written entries only; order entries follow the order).
create or replace function public.farm_book_cancel(p_entry uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update credit_entries set status = 'cancelled' where id = p_entry and vendor_id = auth.uid() and status = 'pending' and sub_order_id is null;
  if not found then raise exception 'ALREADY_ACTIONED'; end if;
end $$;

-- Buyer side: can I pay later with this farm, and how much is left?
create or replace function public.credit_available(p_vendor uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('customer_id', c.id, 'limit', c.credit_limit, 'outstanding', credit_outstanding(c.id),
           'available', greatest(0, c.credit_limit - credit_outstanding(c.id)))
    from credit_customers c where c.vendor_id = p_vendor and c.buyer_id = auth.uid() and c.status = 'active' and c.credit_limit > 0;
$$;

-- Buyer side: everything I owe, by farm.
create or replace function public.my_credit() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('customer_id', c.id, 'vendor_id', c.vendor_id, 'farm', vp.business_name, 'status', c.status,
      'limit', c.credit_limit, 'outstanding', credit_outstanding(c.id), 'available', greatest(0, c.credit_limit - credit_outstanding(c.id)),
      'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'description', e.description, 'amount', e.amount, 'status', e.status,
          'due_date', e.due_date, 'created_at', e.created_at, 'paid_at', e.paid_at, 'overdue', e.status = 'pending' and e.due_date < current_date)
          order by (e.status = 'pending') desc, e.created_at desc)
        from credit_entries e where e.customer_id = c.id and e.status <> 'cancelled'), '[]'::jsonb))
    order by credit_outstanding(c.id) desc), '[]'::jsonb)
  from credit_customers c join vendor_profiles vp on vp.user_id = c.vendor_id
  where c.buyer_id = auth.uid();
$$;

-- Buyer settles a credit entry from their wallet. Order entries pay the farm net of the 10% commission, like any order.
create or replace function public.credit_pay(p_entry uuid) returns numeric
language plpgsql security definer set search_path = public as $$
declare e credit_entries; v_bal numeric; v_net numeric; v_farm text;
begin
  select ce.* into e from credit_entries ce join credit_customers c on c.id = ce.customer_id
   where ce.id = p_entry and c.buyer_id = auth.uid() for update of ce;
  if e.id is null or e.status <> 'pending' then raise exception 'ALREADY_ACTIONED'; end if;
  update wallets set balance = balance - e.amount where user_id = auth.uid() and balance >= e.amount returning balance into v_bal;
  if v_bal is null then raise exception 'INSUFFICIENT_WALLET'; end if;
  select business_name into v_farm from vendor_profiles where user_id = e.vendor_id;
  v_net := case when e.sub_order_id is not null then round(e.amount * 0.9, 2) else e.amount end;
  update wallets set balance = balance + v_net where user_id = e.vendor_id;
  insert into transactions (user_id, type, amount, label) values (auth.uid(), 'payment', -e.amount, 'Credit paid · ' || coalesce(v_farm, 'farm') || ' · ' || e.description);
  insert into transactions (user_id, type, amount, label) values (e.vendor_id, 'payout', v_net, 'Credit settled · ' || e.description);
  update credit_entries set status = 'paid', paid_via = 'wallet', paid_at = now() where id = e.id;
  return v_bal;
end $$;

-- ---------- Orders: "Pay later" (p_method = 'credit') ----------
-- Goods go on credit with one farm; the delivery fee is still paid now from the wallet (it pays the rider).
create or replace function public.place_order(p_address_id uuid, p_items jsonb, p_method text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_area text; v_bad text[] := '{}'; it jsonb; l listings;
  v_order uuid; v_code text; v_sub uuid; v_vendor uuid; v_items numeric; v_fee numeric; v_total numeric; v_bal numeric;
  v_credit boolean := p_method = 'credit'; v_customer credit_customers; v_vendors int;
begin
  select area into v_area from addresses where id = p_address_id and user_id = v_uid;
  if v_area is null then raise exception 'ADDRESS_NOT_FOUND'; end if;
  if not exists (select 1 from coverage_areas where name = v_area) then raise exception 'OUT_OF_COVERAGE'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into l from listings where id = (it->>'listing_id')::uuid for update;
    if l.id is null or l.status <> 'live' or l.quantity < (it->>'qty')::int then
      v_bad := v_bad || (it->>'listing_id');
    end if;
  end loop;
  if array_length(v_bad, 1) > 0 then raise exception 'ITEM_UNAVAILABLE:%', array_to_string(v_bad, ','); end if;

  select coalesce(sum(l2.price * (x->>'qty')::int), 0), count(distinct l2.vendor_id) * 1250, count(distinct l2.vendor_id)
    into v_items, v_fee, v_vendors
    from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid;
  v_total := v_items + v_fee;

  if v_credit then
    if v_vendors <> 1 then raise exception 'CREDIT_ONE_FARM'; end if;
    select c.* into v_customer from credit_customers c
     where c.buyer_id = v_uid and c.status = 'active' and c.credit_limit > 0
       and c.vendor_id = (select l2.vendor_id from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid limit 1)
     for update;
    if v_customer.id is null then raise exception 'CREDIT_NOT_ALLOWED'; end if;
    if v_items > v_customer.credit_limit - credit_outstanding(v_customer.id) then raise exception 'CREDIT_LIMIT'; end if;
    update wallets set balance = balance - v_fee where user_id = v_uid and balance >= v_fee returning balance into v_bal;
    if v_bal is null then raise exception 'INSUFFICIENT_WALLET'; end if;
  elsif p_method = 'wallet' then
    update wallets set balance = balance - v_total where user_id = v_uid and balance >= v_total returning balance into v_bal;
    if v_bal is null then raise exception 'INSUFFICIENT_WALLET'; end if;
  end if;

  insert into orders (buyer_id, address_id, items_total, delivery_fee, total, payment_method, payment_ref)
  values (v_uid, p_address_id, v_items, v_fee, v_total, p_method, p_ref) returning id, code into v_order, v_code;
  if v_credit then
    insert into transactions (user_id, type, amount, label, related_order_id)
    values (v_uid, 'payment', -v_fee, 'Delivery fee · ' || v_code || ' · goods on credit', v_order);
  else
    insert into transactions (user_id, type, amount, label, related_order_id)
    values (v_uid, 'payment', -v_total, 'Payment · ' || v_code || case when p_method = 'wallet' then ' · wallet' else ' · card' end, v_order);
  end if;

  for v_vendor in select distinct l2.vendor_id from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid loop
    insert into sub_orders (order_id, vendor_id, via_search, delivery_fee, sla_deadline, items_total, on_credit)
      select v_order, v_vendor, bool_or(coalesce((x->>'via_search')::boolean, false)), 1250,
             now() + interval '24 hours', sum(l2.price * (x->>'qty')::int), v_credit
      from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid
      where l2.vendor_id = v_vendor
      returning id into v_sub;
    insert into order_items (sub_order_id, listing_id, title, quantity, price)
      select v_sub, l2.id, l2.title, (x->>'qty')::int, l2.price
      from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid
      where l2.vendor_id = v_vendor;
    update listings l2 set quantity = l2.quantity - (x->>'qty')::int
      from jsonb_array_elements(p_items) x
      where l2.id = (x->>'listing_id')::uuid and l2.vendor_id = v_vendor;
    if v_credit then
      insert into credit_entries (vendor_id, customer_id, sub_order_id, description, amount, due_date)
      values (v_vendor, v_customer.id, v_sub, 'Order ' || v_code, v_items, current_date + 14);
    end if;
  end loop;

  return jsonb_build_object('order_id', v_order, 'code', v_code, 'total', v_total, 'on_credit', v_credit);
end $$;

-- A credit order only ever took the delivery fee, so that is all a refund returns; the book entry is voided.
create or replace function public.refund_sub_order(p_sub uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare s sub_orders; o orders; amt numeric;
begin
  select * into s from sub_orders where id = p_sub for update;
  if s.status in ('refunded','delivered') then return; end if;
  select * into o from orders where id = s.order_id;
  amt := case when s.on_credit then s.delivery_fee else s.items_total + s.delivery_fee end;
  update sub_orders set status = 'refunded', decline_reason = p_reason, updated_at = now() where id = p_sub;
  update wallets set balance = balance + amt where user_id = o.buyer_id;
  insert into transactions (user_id, type, amount, label, related_order_id)
  values (o.buyer_id, 'refund', amt, 'Refund · ' || o.code, o.id);
  if s.on_credit then update credit_entries set status = 'cancelled' where sub_order_id = p_sub and status = 'pending'; end if;
  update listings l set quantity = l.quantity + oi.quantity
    from order_items oi where oi.sub_order_id = p_sub and l.id = oi.listing_id;
end $$;

-- Same as migration 004, except a credit order doesn't pay the farm at delivery (the buyer hasn't paid yet).
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
    if not s.on_credit then
      net := round(s.items_total * 0.9, 2);   -- 10% platform commission
      update wallets set balance = balance + net where user_id = s.vendor_id;
      insert into transactions (user_id, type, amount, label, related_order_id)
      values (s.vendor_id, 'payout', net, 'Payout · ' || o.code, o.id);
    end if;
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

create or replace function public.vendor_orders() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'status', s.status, 'code', o.code, 'items_total', s.items_total, 'on_credit', s.on_credit,
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

-- Internal helper: only callable from other functions
revoke execute on function public.credit_outstanding(uuid) from public, anon, authenticated;

-- Realtime: a vet's approval shows up on their desk without a refresh
do $$ begin
  alter publication supabase_realtime add table public.vets;
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- Commission rules: credit sales pay commission when settled; vets earn 90% of the consult fee.
-- Redefines add_bank, wallet_withdraw, vet_complete, vet_desk, farm_book_settle and farm_book (these are the ones in force).
-- =====================================================================
-- ---------- Vet payout account ----------
alter table public.vets add column if not exists bank_name text;
alter table public.vets add column if not exists bank_account_last4 text;
alter table public.vets add column if not exists bank_verified boolean default false;

-- Farms, riders and vets all save their payout account here.
create or replace function public.add_bank(p_bank text, p_account text) returns void
language plpgsql security definer set search_path = public as $$
declare n1 int; n2 int; n3 int;
begin
  if p_account !~ '^[0-9]{10}$' then raise exception 'INVALID_ACCOUNT'; end if;
  update vendor_profiles set bank_name = p_bank, bank_account_last4 = right(p_account, 4), bank_verified = true where user_id = auth.uid();
  get diagnostics n1 = row_count;
  update riders set bank_name = p_bank, bank_account_last4 = right(p_account, 4), bank_verified = true where user_id = auth.uid();
  get diagnostics n2 = row_count;
  update vets set bank_name = p_bank, bank_account_last4 = right(p_account, 4), bank_verified = true where user_id = auth.uid();
  get diagnostics n3 = row_count;
  if n1 + n2 + n3 = 0 then raise exception 'NOT_VENDOR'; end if;
end $$;

-- The signed-in user's payout account, whichever kind of earner they are.
create or replace function public.my_payout_account() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(t) from (
    select bank_name, bank_account_last4, business_name as holder from vendor_profiles where user_id = auth.uid() and bank_verified
    union all
    select bank_name, bank_account_last4, name from riders where user_id = auth.uid() and bank_verified
    union all
    select bank_name, bank_account_last4, name from vets where user_id = auth.uid() and bank_verified
    limit 1) t;
$$;

create or replace function public.wallet_withdraw(p_amount numeric, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare acct jsonb := public.my_payout_account(); v numeric; t uuid;
begin
  if acct is null then raise exception 'NO_BANK'; end if;
  if not exists (select 1 from withdrawal_codes where user_id = auth.uid() and code = p_code
                 and created_at > now() - interval '5 minutes') then raise exception 'INVALID_CODE'; end if;
  delete from withdrawal_codes where user_id = auth.uid();
  update wallets set balance = balance - p_amount where user_id = auth.uid() and balance >= p_amount and p_amount > 0
    returning balance into v;
  if v is null then raise exception 'INSUFFICIENT_FUNDS'; end if;
  insert into transactions (user_id, type, amount, status, label)
  values (auth.uid(), 'withdrawal', -p_amount, 'processing', 'Withdrawal · ' || (acct->>'bank_name') || ' ••' || (acct->>'bank_account_last4'))
  returning id into t;
  return t;
end $$;

-- ---------- Vets earn 90% of the consult fee ----------
create or replace function public.vet_complete(p_consultation uuid, p_summary text) returns void
language plpgsql security definer set search_path = public as $$
declare k consultations; v vets; net numeric;
begin
  if coalesce(trim(p_summary), '') = '' then raise exception 'SUMMARY_REQUIRED'; end if;
  select * into v from vets where id = public.vet_self();
  update consultations set status = 'completed', summary = trim(p_summary)
   where id = p_consultation and vet_id = v.id and status = 'confirmed' returning * into k;
  if k.id is null then raise exception 'NOT_FOUND'; end if;
  if k.flock_id is not null then
    insert into health_records (flock_id, owner_id, source, author, title, notes)
    values (k.flock_id, k.farmer_id, 'vet', v.name, 'Vet consultation summary', trim(p_summary));
  end if;
  -- The farmer paid the fee when booking. The vet is paid on completion, less the 10% platform commission.
  net := round(coalesce(k.fee, 0) * 0.9, 2);
  if net > 0 and v.user_id is not null then
    update wallets set balance = balance + net where user_id = v.user_id;
    insert into transactions (user_id, type, amount, label) values (v.user_id, 'payout', net, 'Consult fee · ' ||
      coalesce((select coalesce(vp.business_name, p.full_name) from profiles p left join vendor_profiles vp on vp.user_id = p.id where p.id = k.farmer_id), 'farmer'));
  end if;
end $$;

create or replace function public.vet_desk() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v vets;
begin
  select * into v from vets where user_id = auth.uid();
  if v.id is null then return null; end if;
  return jsonb_build_object(
    'vet', to_jsonb(v) - 'licence_doc_path',
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'earned', coalesce((select sum(amount) from transactions where user_id = auth.uid() and type = 'payout' and label like 'Consult fee%'), 0),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'booked', s.booked) order by s.starts_at)
                         from vet_slots s where s.vet_id = v.id and s.starts_at > now() - interval '1 hour'), '[]'::jsonb),
    'consultations', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'type', k.type, 'status', k.status,
        'at', coalesce(k.proposed_at, k.requested_date::timestamptz), 'requested_date', k.requested_date, 'location', k.location, 'notes', k.notes,
        'summary', k.summary, 'meeting_url', k.meeting_url, 'fee', k.fee, 'net', round(coalesce(k.fee, 0) * 0.9, 2), 'created_at', k.created_at,
        'farmer', coalesce(vp.business_name, p.full_name, 'Farmer'), 'farmer_phone', p.phone,
        'flock', case when f.id is null then null else coalesce(f.code, '') || ' · ' || f.type || ' · ' || f.size || ' birds' end)
        order by (k.status in ('requested','proposed','confirmed')) desc, coalesce(k.proposed_at, k.created_at) desc)
      from consultations k join profiles p on p.id = k.farmer_id
      left join vendor_profiles vp on vp.user_id = k.farmer_id left join flocks f on f.id = k.flock_id
      where k.vet_id = v.id), '[]'::jsonb));
end $$;

-- ---------- Credit sales: commission is due when the money comes back ----------
-- The customer paid the farm directly. For an order placed in the app, the farm owes Poultry360 the 10% commission,
-- taken from the farm's wallet as the entry is marked paid. Hand-written entries (not app orders) carry no commission.
create or replace function public.farm_book_settle(p_entry uuid, p_receipt text) returns void
language plpgsql security definer set search_path = public as $$
declare e credit_entries; fee numeric; v_bal numeric;
begin
  if coalesce(trim(p_receipt), '') = '' then raise exception 'RECEIPT_REQUIRED'; end if;
  select * into e from credit_entries where id = p_entry and vendor_id = auth.uid() and status = 'pending' for update;
  if e.id is null then raise exception 'ALREADY_ACTIONED'; end if;
  if e.sub_order_id is not null then
    fee := round(e.amount * 0.1, 2);
    update wallets set balance = balance - fee where user_id = auth.uid() and balance >= fee returning balance into v_bal;
    if v_bal is null then raise exception 'COMMISSION_FUNDS:%', fee; end if;
    insert into transactions (user_id, type, amount, label) values (auth.uid(), 'payment', -fee, 'Commission · ' || e.description || ' (paid to you directly)');
  end if;
  update credit_entries set status = 'paid', paid_via = 'receipt', receipt_path = p_receipt, paid_at = now() where id = e.id;
end $$;

-- Same as migration 007, plus each entry's commission and the farm's wallet balance (so the app can explain the charge).
create or replace function public.farm_book() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v uuid := auth.uid();
begin
  if not exists (select 1 from vendor_profiles where user_id = v) then raise exception 'NOT_VENDOR'; end if;
  return jsonb_build_object(
    'wallet', coalesce((select balance from wallets where user_id = v), 0),
    'outstanding', coalesce((select sum(amount) from credit_entries where vendor_id = v and status = 'pending'), 0),
    'collected_30d', coalesce((select sum(amount) from credit_entries where vendor_id = v and status = 'paid' and paid_at > now() - interval '30 days'), 0),
    'overdue', coalesce((select sum(amount) from credit_entries where vendor_id = v and status = 'pending' and due_date < current_date), 0),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'customer_type', c.customer_type,
        'on_app', c.buyer_id is not null, 'credit_limit', c.credit_limit, 'status', c.status, 'notes', c.notes,
        'outstanding', credit_outstanding(c.id),
        'pending_count', (select count(*) from credit_entries e where e.customer_id = c.id and e.status = 'pending'))
        order by credit_outstanding(c.id) desc, c.name) from credit_customers c where c.vendor_id = v), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'customer_id', e.customer_id, 'customer', c.name, 'on_app', c.buyer_id is not null,
        'description', e.description, 'amount', e.amount, 'status', e.status, 'due_date', e.due_date, 'receipt_path', e.receipt_path,
        'paid_via', e.paid_via, 'paid_at', e.paid_at, 'created_at', e.created_at, 'from_order', e.sub_order_id is not null,
        'commission', case when e.sub_order_id is not null then round(e.amount * 0.1, 2) else 0 end,
        'overdue', e.status = 'pending' and e.due_date < current_date)
        order by (e.status = 'pending') desc, e.created_at desc)
      from credit_entries e join credit_customers c on c.id = e.customer_id where e.vendor_id = v and e.status <> 'cancelled'), '[]'::jsonb),
    'eligible', coalesce((select jsonb_agg(to_jsonb(t) order by t.qualifies desc, t.bought desc) from (
        select o.buyer_id, coalesce(p.buyer_business_name, p.full_name, 'Buyer') as name, coalesce(p.buyer_type, 'individual') as buyer_type,
               sum(s.items_total) as bought, credit_threshold(coalesce(p.buyer_type, 'individual')) as threshold,
               sum(s.items_total) >= credit_threshold(coalesce(p.buyer_type, 'individual')) as qualifies
          from sub_orders s join orders o on o.id = s.order_id join profiles p on p.id = o.buyer_id
         where s.vendor_id = v and s.status = 'delivered' and o.buyer_id <> v
           and not exists (select 1 from credit_customers c where c.vendor_id = v and c.buyer_id = o.buyer_id)
         group by o.buyer_id, p.buyer_business_name, p.full_name, p.buyer_type
         order by sum(s.items_total) desc limit 30) t), '[]'::jsonb));
end $$;

-- =====================================================================
-- Farm inventory (offline-first, last write wins)
-- =====================================================================
create table if not exists public.farm_inventory (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  category text not null check (category in ('feed','medicine','vaccine','equipment','other')),
  name text not null,
  quantity numeric not null default 0 check (quantity >= 0),
  unit text,
  low_at numeric check (low_at is null or low_at >= 0),     -- warn when stock falls to this level
  expiry_date date,                                          -- drugs and vaccines
  notes text,
  status text not null default 'active' check (status in ('active','removed')),
  updated_at timestamptz default now(),
  updated_by text
);
create index if not exists farm_inventory_owner_idx on public.farm_inventory (owner_id);

alter table public.farm_inventory enable row level security;
drop policy if exists own_inventory on public.farm_inventory;
create policy own_inventory on public.farm_inventory for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Last write wins, same as flocks and vaccinations.
drop trigger if exists lww_inventory on public.farm_inventory;
create trigger lww_inventory before update on public.farm_inventory for each row execute function public.lww();
