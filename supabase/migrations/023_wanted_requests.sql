-- 023 · Wanted requests: buyers post what they need, verified sellers reply with a price, and an accepted offer
-- becomes a listing reserved for that buyer (checked out like any other). Safe to run more than once.

alter table public.listings add column if not exists reserved_for uuid references public.profiles(id) on delete cascade;
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check check (status in ('draft','live','unpublished','reserved'));
drop policy if exists listings_r on public.listings;
create policy listings_r on public.listings for select using (status = 'live' or vendor_id = auth.uid() or reserved_for = auth.uid());

-- place_order also accepts a listing reserved for this buyer (an accepted Wanted offer).
create or replace function public.place_order(p_address_id uuid, p_items jsonb, p_method text, p_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_addr addresses; v_bad text[] := '{}'; it jsonb; l listings;
  v_order uuid; v_code text; v_sub uuid; v_vendor uuid; v_items numeric; v_fee numeric; v_total numeric; v_bal numeric;
  v_credit boolean := p_method = 'credit'; v_customer credit_customers; v_vendors int;
begin
  select * into v_addr from addresses where id = p_address_id and user_id = v_uid;
  if v_addr.id is null then raise exception 'ADDRESS_NOT_FOUND'; end if;
  if not exists (select 1 from coverage_areas where name = v_addr.area) then raise exception 'OUT_OF_COVERAGE'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into l from listings where id = (it->>'listing_id')::uuid for update;
    if l.id is null or not (l.status = 'live' or (l.status = 'reserved' and l.reserved_for = v_uid)) or l.quantity < (it->>'qty')::int then
      v_bad := v_bad || (it->>'listing_id');
    end if;
  end loop;
  if array_length(v_bad, 1) > 0 then raise exception 'ITEM_UNAVAILABLE:%', array_to_string(v_bad, ','); end if;

  select coalesce(sum(l2.price * (x->>'qty')::int), 0), count(distinct l2.vendor_id)
    into v_items, v_vendors
    from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid;
  select coalesce(sum(public.delivery_fee_for(vp.lat, vp.lng, v_addr.lat, v_addr.lng)), 0) into v_fee
    from vendor_profiles vp
   where vp.user_id in (select l2.vendor_id from jsonb_array_elements(p_items) x join listings l2 on l2.id = (x->>'listing_id')::uuid);
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
      select v_order, v_vendor, bool_or(coalesce((x->>'via_search')::boolean, false)),
             (select public.delivery_fee_for(vp.lat, vp.lng, v_addr.lat, v_addr.lng) from vendor_profiles vp where vp.user_id = v_vendor),
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

-- ---------- Agent stock ----------
-- Start of the current quarter, Nigerian time.
create or replace function public.quarter_start(p_at timestamptz default now()) returns timestamptz
language sql stable as $$
  select date_trunc('quarter', p_at at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
$$;

-- ---------- Wanted requests (buyers post what they need; verified sellers reply with a price) ----------
-- Accepting an offer turns it into a listing reserved for that buyer (status 'reserved', reserved_for = buyer),
-- so it goes through the normal cart, checkout, rider and payout. Nobody else sees a reserved listing.
create table if not exists public.buy_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  type text,
  title text not null,
  quantity int not null check (quantity > 0),
  unit text not null default 'unit',
  max_price numeric(12,2) check (max_price is null or max_price > 0),
  needed_by date,
  notes text,
  area text,
  lat double precision,
  lng double precision,
  status text not null default 'open' check (status in ('open','accepted','closed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists buy_requests_open on public.buy_requests (created_at desc) where status = 'open';

create table if not exists public.buy_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.buy_requests(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  price numeric(12,2) not null check (price > 0),
  quantity int not null check (quantity > 0),
  note text,
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  listing_id uuid references public.listings(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (request_id, vendor_id)
);

alter table public.buy_requests enable row level security;
alter table public.buy_offers enable row level security;
-- Reads only; every write goes through the functions below.
drop policy if exists buy_requests_r on public.buy_requests;
create policy buy_requests_r on public.buy_requests for select using (buyer_id = auth.uid() or status = 'open');
drop policy if exists buy_offers_r on public.buy_offers;
create policy buy_offers_r on public.buy_offers for select using (
  vendor_id = auth.uid() or exists (select 1 from buy_requests r where r.id = request_id and r.buyer_id = auth.uid()));

-- Which categories a seller is shown: a store sees supplies, a farm sees birds/eggs/meat, both see all; agents see all.
create or replace function public.wanted_fits(p_category text, p_roles text[]) returns boolean language sql immutable as $$
  select case
    when 'agent' = any(p_roles) then true
    when 'vendor' = any(p_roles) and 'supplier' = any(p_roles) then true
    when 'supplier' = any(p_roles) then p_category in ('feed','drugs','equipment','packaging')
    else p_category not in ('feed','drugs','equipment','packaging') end
$$;

-- Buyer posts a request. The area and pin come from their first saved address, so sellers can see how far it is.
create or replace function public.post_buy_request(p_category text, p_type text, p_title text, p_quantity int, p_unit text,
  p_max_price numeric default null, p_needed_by date default null, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a addresses; v uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(p_quantity, 0) <= 0 then raise exception 'WANTED_INCOMPLETE'; end if;
  if p_needed_by is not null and p_needed_by < (now() at time zone 'Africa/Lagos')::date then raise exception 'WANTED_DATE_PAST'; end if;
  if (select count(*) from buy_requests where buyer_id = v_uid and status = 'open') >= 10 then raise exception 'WANTED_TOO_MANY'; end if;
  select * into a from addresses where user_id = v_uid order by created_at limit 1;
  insert into buy_requests (buyer_id, category, type, title, quantity, unit, max_price, needed_by, notes, area, lat, lng)
  values (v_uid, p_category, nullif(trim(coalesce(p_type, '')), ''), trim(p_title), p_quantity, coalesce(nullif(p_unit, ''), 'unit'),
          p_max_price, p_needed_by, nullif(trim(coalesce(p_notes, '')), ''), a.area, a.lat, a.lng)
  returning id into v;
  return v;
end $$;

-- Buyer closes a request: no more offers; pending ones are declined.
create or replace function public.close_buy_request(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update buy_requests set status = 'closed', updated_at = now() where id = p_request and buyer_id = auth.uid() and status = 'open';
  if not found then raise exception 'WANTED_NOT_FOUND'; end if;
  update buy_offers set status = 'declined', updated_at = now() where request_id = p_request and status = 'pending';
end $$;

-- Buyer's requests with every offer (seller, rating, price, quantity, distance and delivery fee).
create or replace function public.my_buy_requests() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'category', r.category, 'type', r.type, 'title', r.title, 'quantity', r.quantity, 'unit', r.unit,
    'max_price', r.max_price, 'needed_by', r.needed_by, 'notes', r.notes, 'area', r.area, 'status', r.status, 'created_at', r.created_at,
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'status', o.status, 'price', o.price, 'quantity', o.quantity, 'note', o.note, 'listing_id', o.listing_id, 'created_at', o.created_at,
        'vendor_id', o.vendor_id, 'seller', vp.business_name, 'rating', vp.rating, 'rating_count', vp.rating_count,
        'km', case when vp.lat is not null and r.lat is not null then round((public.distance_km(vp.lat, vp.lng, r.lat, r.lng))::numeric, 1) end,
        'delivery_fee', public.delivery_fee_for(vp.lat, vp.lng, r.lat, r.lng)) order by o.status = 'withdrawn', o.price)
      from buy_offers o join vendor_profiles vp on vp.user_id = o.vendor_id where o.request_id = r.id), '[]'::jsonb)
  ) order by r.status = 'open' desc, r.created_at desc), '[]'::jsonb)
  from buy_requests r where r.buyer_id = auth.uid();
$$;

-- Sellers: open requests that fit what they sell, nearest first when both are pinned, with their own offer if they made one.
create or replace function public.open_buy_requests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v vendor_profiles; v_roles text[];
begin
  select * into v from vendor_profiles where user_id = auth.uid();
  if v.user_id is null then return '[]'::jsonb; end if;
  select roles into v_roles from profiles where id = auth.uid();
  return coalesce((select jsonb_agg(x.j order by x.km nulls last, x.created_at desc) from (
    select r.created_at,
      case when v.lat is not null and r.lat is not null then public.distance_km(v.lat, v.lng, r.lat, r.lng) end as km,
      jsonb_build_object('id', r.id, 'category', r.category, 'type', r.type, 'title', r.title, 'quantity', r.quantity, 'unit', r.unit,
        'max_price', r.max_price, 'needed_by', r.needed_by, 'notes', r.notes, 'area', r.area, 'created_at', r.created_at,
        'buyer', coalesce(nullif(p.buyer_business_name, ''), split_part(coalesce(p.full_name, 'Buyer'), ' ', 1)),
        'business', p.buyer_type = 'business',
        'km', case when v.lat is not null and r.lat is not null then round((public.distance_km(v.lat, v.lng, r.lat, r.lng))::numeric, 1) end,
        'offers', (select count(*) from buy_offers o where o.request_id = r.id and o.status in ('pending','accepted')),
        'mine', (select jsonb_build_object('id', o.id, 'price', o.price, 'quantity', o.quantity, 'note', o.note, 'status', o.status)
                   from buy_offers o where o.request_id = r.id and o.vendor_id = v.user_id)) as j
    from buy_requests r join profiles p on p.id = r.buyer_id
    where r.status = 'open' and r.buyer_id <> auth.uid()
      and (r.needed_by is null or r.needed_by >= (now() at time zone 'Africa/Lagos')::date)
      and public.wanted_fits(r.category, coalesce(v_roles, '{}'))
  ) x), '[]'::jsonb);
end $$;

-- Seller makes (or updates) an offer: price per unit and how many they can supply.
create or replace function public.make_offer(p_request uuid, p_price numeric, p_quantity int, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r buy_requests; v uuid;
begin
  if not exists (select 1 from vendor_profiles where user_id = auth.uid() and verification_status = 'approved') then raise exception 'VENDOR_NOT_VERIFIED'; end if;
  select * into r from buy_requests where id = p_request for update;
  if r.id is null or r.status <> 'open' then raise exception 'WANTED_CLOSED'; end if;
  if r.buyer_id = auth.uid() then raise exception 'WANTED_OWN'; end if;
  if coalesce(p_price, 0) <= 0 or coalesce(p_quantity, 0) <= 0 then raise exception 'WANTED_INCOMPLETE'; end if;
  insert into buy_offers (request_id, vendor_id, price, quantity, note)
  values (p_request, auth.uid(), p_price, least(p_quantity, r.quantity), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (request_id, vendor_id) do update set price = excluded.price, quantity = excluded.quantity, note = excluded.note,
    status = 'pending', updated_at = now()
  returning id into v;
  return v;
end $$;

create or replace function public.withdraw_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update buy_offers set status = 'withdrawn', updated_at = now() where id = p_offer and vendor_id = auth.uid() and status = 'pending';
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
end $$;

create or replace function public.decline_offer(p_offer uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update buy_offers o set status = 'declined', updated_at = now()
   where o.id = p_offer and o.status = 'pending' and exists (select 1 from buy_requests r where r.id = o.request_id and r.buyer_id = auth.uid());
  if not found then raise exception 'OFFER_NOT_FOUND'; end if;
end $$;

-- Buyer accepts one offer: it becomes a listing reserved for them (the client puts it in the cart), the request
-- stops taking offers and the other pending offers are declined. Returns the listing id and quantity.
create or replace function public.accept_offer(p_offer uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o buy_offers; r buy_requests; v_listing uuid;
begin
  select * into o from buy_offers where id = p_offer for update;
  if o.id is null then raise exception 'OFFER_NOT_FOUND'; end if;
  select * into r from buy_requests where id = o.request_id for update;
  if r.buyer_id <> auth.uid() then raise exception 'OFFER_NOT_FOUND'; end if;
  if o.status = 'accepted' and o.listing_id is not null then
    return jsonb_build_object('listing_id', o.listing_id, 'quantity', o.quantity);   -- accepted before: open the same one again
  end if;
  if o.status <> 'pending' or r.status <> 'open' then raise exception 'WANTED_CLOSED'; end if;
  if not exists (select 1 from vendor_profiles where user_id = o.vendor_id and verification_status = 'approved') then raise exception 'VENDOR_NOT_VERIFIED'; end if;
  insert into listings (vendor_id, category, title, description, price, unit, quantity, attributes, status, reserved_for)
  values (o.vendor_id, r.category, r.title, o.note, o.price, r.unit, o.quantity,
          jsonb_strip_nulls(jsonb_build_object('type', r.type, 'request_id', r.id)), 'reserved', r.buyer_id)
  returning id into v_listing;
  update buy_offers set status = 'accepted', listing_id = v_listing, updated_at = now() where id = o.id;
  update buy_offers set status = 'declined', updated_at = now() where request_id = r.id and id <> o.id and status = 'pending';
  update buy_requests set status = 'accepted', updated_at = now() where id = r.id;
  return jsonb_build_object('listing_id', v_listing, 'quantity', o.quantity);
end $$;

-- Seller's offers (what they offered, on what, and whether it was accepted).
create or replace function public.my_offers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'price', o.price, 'quantity', o.quantity, 'note', o.note,
    'created_at', o.created_at, 'request', jsonb_build_object('id', r.id, 'title', r.title, 'unit', r.unit, 'quantity', r.quantity, 'status', r.status, 'area', r.area))
    order by o.created_at desc), '[]'::jsonb)
  from buy_offers o join buy_requests r on r.id = o.request_id where o.vendor_id = auth.uid();
$$;

revoke all on function public.post_buy_request(text, text, text, int, text, numeric, date, text) from anon;
revoke all on function public.make_offer(uuid, numeric, int, text) from anon;
revoke all on function public.accept_offer(uuid) from anon;
