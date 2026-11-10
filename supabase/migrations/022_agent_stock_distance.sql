-- =====================================================================
-- Poultry360 · migration 022: agents run their own shops; delivery fee by distance
-- * An agent is a seller in their own right. Joining a store (agent_join) opens a shop for them:
--   a vendor_profiles row with parent_id = the store, approved because the store is. Their products
--   are copies of the store's listings (listings.source_id): same price, title and photos, kept in
--   step with the store's listing, but the stock is the agent's own.
-- * Agents get stock by buying it from their store, two ways: the store records a handover paid
--   outside the app (store_give_stock), or the agent pays from their wallet (agent_request_stock)
--   and the store confirms it handed the goods over (store_confirm_stock). Declined or cancelled
--   requests are refunded to the agent's wallet.
-- * Rebate: each product's agent_commission_pct (set by the store) is earned on what the agent buys.
--   It adds up per quarter (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec, Nigerian time); a finished quarter's
--   rebate is owed, and the store records what it pays (store_record_payout).
-- * Customers order from the agent's shop like from any seller; a Poultry360 rider collects from the agent.
-- * Delivery fee by distance: N800 + N100 per km (straight line from the seller's pinned location to the
--   delivery address, rounded up, at least 1 km), at most N3,000. N1,250 when either isn't pinned.
-- * Missed-sale claims (021) and agent codes at checkout are removed.
-- Requires 015. 021 is not needed. Safe to run more than once.
-- =====================================================================

-- ---------- Columns and tables ----------
alter table public.vendor_profiles add column if not exists parent_id uuid references public.vendor_profiles(user_id) on delete set null;
alter table public.listings add column if not exists source_id uuid references public.listings(id) on delete set null;
-- one copy of each store product per agent
create unique index if not exists listings_agent_copy on public.listings (vendor_id, source_id) where source_id is not null;

create table if not exists public.agent_stock_moves (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  agent_id uuid not null references public.profiles on delete cascade,
  paid_in text not null check (paid_in in ('cash','app')),   -- cash/transfer outside the app (the store records it) or the agent's wallet
  status text not null default 'pending' check (status in ('pending','done','declined','cancelled')),
  items jsonb not null,                                       -- [{ listing_id (the store's), name, unit, qty, unit_price, total, pct, rebate }]
  total numeric(14,2) not null check (total >= 0),
  rebate numeric(14,2) not null default 0 check (rebate >= 0),
  note text,
  created_at timestamptz default now(),
  done_at timestamptz
);
create index if not exists agent_stock_store_idx on public.agent_stock_moves (store_id, created_at desc);
create index if not exists agent_stock_agent_idx on public.agent_stock_moves (agent_id, created_at desc);
alter table public.agent_stock_moves enable row level security;
drop policy if exists agent_stock_r on public.agent_stock_moves;
create policy agent_stock_r on public.agent_stock_moves for select using (store_id = auth.uid() or agent_id = auth.uid());

-- ---------- Claims and checkout agent codes are gone ----------
drop trigger if exists agent_credit_on_delivery on public.sub_orders;
drop function if exists public.agent_credit_delivery();
drop function if exists public.agent_claim_order(text, text);
drop function if exists public.store_decide_claim(uuid, boolean);
drop function if exists public.agent_claims_list();
drop function if exists public.agent_credit_sub(uuid, uuid);
drop function if exists public.set_order_agent(uuid, text);
drop table if exists public.agent_claims;

-- ---------- Guards ----------
-- App users can't change who a shop belongs to (or their own verification / badge).
create or replace function public.vendor_guard_columns() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.verification_status := old.verification_status;
    new.rejection_reason := old.rejection_reason;
    new.investment_badge := old.investment_badge;
    new.investment_badge_reason := old.investment_badge_reason;
    new.parent_id := old.parent_id;
  end if;
  return new;
end $$;

-- An agent's shop only changes through the RPCs below (buying stock, orders, logged sales):
-- no direct inserts, edits or deletes from the app.
create or replace function public.guard_agent_listing() returns trigger language plpgsql as $$
declare v uuid := case when tg_op = 'DELETE' then old.vendor_id else new.vendor_id end;
begin
  if current_user in ('authenticated', 'anon') and exists (select 1 from vendor_profiles where user_id = v and parent_id is not null) then
    raise exception 'AGENT_LISTING_LOCKED';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists guard_agent_listing on public.listings;
create trigger guard_agent_listing before insert or update or delete on public.listings
  for each row execute function public.guard_agent_listing();

-- When a store changes a product (price, title, photos…), its agents' copies follow.
create or replace function public.sync_agent_copies() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.source_id is null and (new.price, new.title, new.description, new.unit, new.category, new.photos, new.attributes, new.is_waste)
     is distinct from (old.price, old.title, old.description, old.unit, old.category, old.photos, old.attributes, old.is_waste) then
    update listings set price = new.price, title = new.title, description = new.description, unit = new.unit,
      category = new.category, photos = new.photos, attributes = new.attributes, is_waste = new.is_waste
     where source_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_agent_copies on public.listings;
create trigger sync_agent_copies after update on public.listings
  for each row execute function public.sync_agent_copies();

-- An account with an agent shop can't also register a farm or store (it would overwrite the shop).
drop function if exists public.submit_vendor_application(text, text[], text, text, double precision, double precision, text);
create or replace function public.submit_vendor_application(
  p_business_name text, p_categories text[], p_location text, p_id_doc_path text,
  p_lat double precision default null, p_lng double precision default null, p_supplier_type text default null,
  p_is_farm boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_farm boolean := coalesce(p_is_farm, p_supplier_type is null);   -- older apps: no supplier type means a farm
begin
  if p_supplier_type is not null and p_supplier_type not in ('feed','equipment','medicine') then raise exception 'INVALID_TYPE'; end if;
  if exists (select 1 from vendor_profiles where user_id = auth.uid() and parent_id is not null) then raise exception 'AGENT_ACCOUNT'; end if;
  insert into vendor_profiles (user_id, business_name, categories, location, id_doc_path, lat, lng, supplier_type)
  values (auth.uid(), p_business_name, p_categories, p_location, p_id_doc_path, p_lat, p_lng, p_supplier_type)
  on conflict (user_id) do update set business_name = excluded.business_name, categories = excluded.categories,
    location = excluded.location, id_doc_path = excluded.id_doc_path,
    lat = coalesce(excluded.lat, vendor_profiles.lat), lng = coalesce(excluded.lng, vendor_profiles.lng),
    supplier_type = coalesce(excluded.supplier_type, vendor_profiles.supplier_type),
    verification_status = 'pending', rejection_reason = null;
  update profiles set
    roles = (select array_agg(distinct r) from unnest(roles
      || case when v_farm then array['vendor'] else array[]::text[] end
      || case when p_supplier_type is not null then array['supplier'] else array[]::text[] end) r),
    active_role = case when v_farm then 'vendor' else 'supplier' end
  where id = auth.uid();
end $$;

-- A seller (farm, store or agent) pins where riders collect from. Nearby buyers see them first.
create or replace function public.set_shop_location(p_location text default null, p_lat double precision default null, p_lng double precision default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (p_lat is null) <> (p_lng is null) or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'INVALID_LOCATION'; end if;
  update vendor_profiles set location = coalesce(nullif(trim(coalesce(p_location, '')), ''), location),
    lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng)
   where user_id = auth.uid();
  if not found then raise exception 'NOT_VENDOR'; end if;
end $$;

-- ---------- Delivery fee by distance ----------
create or replace function public.distance_km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2)
    + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)));
$$;
-- Keep in step with deliveryFee() in apps/customer/src/lib/nearby.js.
create or replace function public.delivery_fee_for(v_lat double precision, v_lng double precision, a_lat double precision, a_lng double precision)
returns numeric language sql immutable as $$
  select case when v_lat is null or v_lng is null or a_lat is null or a_lng is null then 1250::numeric
    else least(3000, 800 + 100 * greatest(1, ceil(public.distance_km(v_lat, v_lng, a_lat, a_lng))))::numeric end;
$$;

-- place_order, with the delivery fee worked out per seller from the distance.
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
    if l.id is null or l.status <> 'live' or l.quantity < (it->>'qty')::int then
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

-- An agent's rebate with one store: this quarter so far (owed once it ends), earned in finished
-- quarters (plus commission on older sales), paid, and the last day of this quarter.
create or replace function public.agent_rebate(p_store uuid, p_agent uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quarter', (select coalesce(sum(m.rebate), 0) from agent_stock_moves m
                 where m.store_id = p_store and m.agent_id = p_agent and m.status = 'done' and m.done_at >= public.quarter_start()),
    'earned', (select coalesce(sum(m.rebate), 0) from agent_stock_moves m
                where m.store_id = p_store and m.agent_id = p_agent and m.status = 'done' and m.done_at < public.quarter_start())
            + (select coalesce(sum(s.commission), 0) from agent_sales s where s.store_id = p_store and s.agent_id = p_agent and s.status = 'recorded'),
    'paid', (select coalesce(sum(o.amount), 0) from agent_payouts o where o.store_id = p_store and o.agent_id = p_agent),
    'quarter_end', ((public.quarter_start() at time zone 'Africa/Lagos') + interval '3 months' - interval '1 day')::date);
$$;

-- Prices the lines of a stock purchase from the store's own products. p_items: [{ listing_id, qty }].
create or replace function public.agent_stock_lines(p_store uuid, p_items jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare it jsonb; l listings; v_qty int; v_line numeric; v_reb numeric; v_lines jsonb := '[]'::jsonb; v_total numeric := 0; v_rebate numeric := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'ITEMS_REQUIRED'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(it->>'qty', '')::numeric::int;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    select * into l from listings where id = (it->>'listing_id')::uuid and vendor_id = p_store and source_id is null and status <> 'draft';
    if not found then raise exception 'NOT_FOUND'; end if;
    if l.quantity < v_qty then raise exception 'OUT_OF_STOCK'; end if;
    v_line := round(v_qty * l.price, 2);
    v_reb := round(v_line * l.agent_commission_pct / 100, 2);
    v_lines := v_lines || jsonb_build_object('listing_id', l.id, 'name', l.title, 'unit', l.unit, 'qty', v_qty, 'unit_price', l.price,
      'total', v_line, 'pct', l.agent_commission_pct, 'rebate', v_reb);
    v_total := v_total + v_line; v_rebate := v_rebate + v_reb;
  end loop;
  return jsonb_build_object('lines', v_lines, 'total', v_total, 'rebate', v_rebate);
end $$;

-- Adds stock to the agent's copy of a store product (made on first purchase, same price and photos).
create or replace function public.agent_stock_in(p_agent uuid, p_src uuid, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare s listings;
begin
  select * into s from listings where id = p_src;
  insert into listings (vendor_id, source_id, category, is_waste, title, description, price, unit, quantity, attributes, photos, status)
  values (p_agent, s.id, s.category, s.is_waste, s.title, s.description, s.price, s.unit, p_qty, s.attributes, s.photos, 'live')
  on conflict (vendor_id, source_id) where source_id is not null
  do update set quantity = listings.quantity + excluded.quantity, status = 'live';
end $$;

-- Hands a stock purchase over: the store's stock goes down, the agent's goes up. Paid in the app:
-- the store's wallet is credited with what the agent paid.
create or replace function public.agent_stock_deliver(p_move uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m agent_stock_moves; it jsonb; v_name text;
begin
  select * into m from agent_stock_moves where id = p_move and status = 'pending' for update;
  if not found then raise exception 'ALREADY_ACTIONED'; end if;
  for it in select * from jsonb_array_elements(m.items) loop
    update listings set quantity = quantity - (it->>'qty')::int
     where id = (it->>'listing_id')::uuid and vendor_id = m.store_id and quantity >= (it->>'qty')::int;
    if not found then raise exception 'OUT_OF_STOCK'; end if;
    perform agent_stock_in(m.agent_id, (it->>'listing_id')::uuid, (it->>'qty')::int);
  end loop;
  update agent_stock_moves set status = 'done', done_at = now() where id = m.id;
  if m.paid_in = 'app' and m.total > 0 then
    select coalesce(full_name, 'agent') into v_name from profiles where id = m.agent_id;
    update wallets set balance = balance + m.total where user_id = m.store_id;
    insert into transactions (user_id, type, amount, label) values (m.store_id, 'payout', m.total, 'Agent stock · ' || v_name);
  end if;
end $$;

-- Store: "I gave Ada 10 bags" (paid in cash or by transfer, outside the app).
create or replace function public.store_give_stock(p_agent uuid, p_items jsonb, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); x jsonb; v_id uuid;
begin
  if not exists (select 1 from store_agents where store_id = v and agent_id = p_agent and status = 'active') then raise exception 'NOT_FOUND'; end if;
  x := agent_stock_lines(v, p_items);
  insert into agent_stock_moves (store_id, agent_id, paid_in, items, total, rebate, note)
  values (v, p_agent, 'cash', x->'lines', (x->>'total')::numeric, (x->>'rebate')::numeric, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  perform agent_stock_deliver(v_id);
  return v_id;
end $$;

-- Agent: buy stock from the store with the wallet. Waits for the store to hand it over.
create or replace function public.agent_request_stock(p_items jsonb, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); a store_agents; x jsonb; v_total numeric; v_bal numeric; v_id uuid; v_store text;
begin
  select * into a from store_agents where agent_id = v and status = 'active';
  if not found then raise exception 'NOT_AGENT'; end if;
  x := agent_stock_lines(a.store_id, p_items);
  v_total := (x->>'total')::numeric;
  update wallets set balance = balance - v_total where user_id = v and balance >= v_total returning balance into v_bal;
  if v_bal is null then raise exception 'INSUFFICIENT_WALLET'; end if;
  select business_name into v_store from vendor_profiles where user_id = a.store_id;
  insert into transactions (user_id, type, amount, label) values (v, 'payment', -v_total, 'Stock from ' || v_store);
  insert into agent_stock_moves (store_id, agent_id, paid_in, items, total, rebate, note)
  values (a.store_id, v, 'app', x->'lines', v_total, (x->>'rebate')::numeric, nullif(trim(coalesce(p_note, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Returns a wallet purchase that won't go ahead.
create or replace function public.agent_stock_refund(p_move uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare m agent_stock_moves; v_store text;
begin
  select * into m from agent_stock_moves where id = p_move and status = 'pending' for update;
  if not found then raise exception 'ALREADY_ACTIONED'; end if;
  update agent_stock_moves set status = p_status, done_at = now() where id = m.id;
  if m.paid_in = 'app' and m.total > 0 then
    select business_name into v_store from vendor_profiles where user_id = m.store_id;
    update wallets set balance = balance + m.total where user_id = m.agent_id;
    insert into transactions (user_id, type, amount, label) values (m.agent_id, 'refund', m.total, 'Refund · stock from ' || v_store);
  end if;
end $$;

-- Store: handed it over (stock moves, the store is paid) or can't (the agent is refunded).
create or replace function public.store_confirm_stock(p_move uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from agent_stock_moves where id = p_move and store_id = auth.uid() and status = 'pending') then raise exception 'ALREADY_ACTIONED'; end if;
  if p_accept then perform agent_stock_deliver(p_move); else perform agent_stock_refund(p_move, 'declined'); end if;
end $$;

-- Agent: changed their mind before the store handed it over.
create or replace function public.agent_cancel_stock(p_move uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from agent_stock_moves where id = p_move and agent_id = auth.uid() and status = 'pending') then raise exception 'ALREADY_ACTIONED'; end if;
  perform agent_stock_refund(p_move, 'cancelled');
end $$;

-- ---------- Joining, leaving ----------
-- Joining a store opens the agent's shop. p_location is where riders collect from (needed the first time).
drop function if exists public.agent_join(text);
create or replace function public.agent_join(p_code text, p_location text default null, p_lat double precision default null,
  p_lng double precision default null, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); st vendor_profiles; me vendor_profiles; v_code text; v_name text;
  v_loc text := nullif(trim(coalesce(p_location, '')), '');
begin
  select * into st from vendor_profiles where agent_invite_code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'INVALID_STORE_CODE'; end if;
  if st.user_id = v then raise exception 'OWN_STORE'; end if;
  if st.verification_status <> 'approved' then raise exception 'STORE_NOT_APPROVED'; end if;
  select * into me from vendor_profiles where user_id = v;
  if me.user_id is not null and me.parent_id is null then raise exception 'HAS_SHOP'; end if;   -- a farm or store account
  if exists (select 1 from store_agents where agent_id = v and status = 'active' and store_id <> st.user_id) then raise exception 'AGENT_HAS_STORE'; end if;
  if coalesce(v_loc, me.location) is null then raise exception 'ADDRESS_REQUIRED'; end if;
  if nullif(trim(coalesce(p_name, '')), '') is not null then update profiles set full_name = trim(p_name) where id = v; end if;
  select full_name into v_name from profiles where id = v;
  if exists (select 1 from store_agents where store_id = st.user_id and agent_id = v) then
    update store_agents set status = 'active', joined_at = case when status = 'active' then joined_at else now() end
     where store_id = st.user_id and agent_id = v;
  else
    loop
      v_code := 'AG' || p360_code(5);
      begin
        insert into store_agents (store_id, agent_id, code) values (st.user_id, v, v_code);
        exit;
      exception when unique_violation then
        if exists (select 1 from store_agents where store_id = st.user_id and agent_id = v) then exit; end if;
      end;
    end loop;
  end if;
  insert into vendor_profiles (user_id, business_name, categories, location, lat, lng, parent_id, supplier_type, verification_status)
  values (v, coalesce(nullif(trim(coalesce(v_name, '')), ''), 'Agent'), st.categories, v_loc, p_lat, p_lng, st.user_id, st.supplier_type, 'approved')
  on conflict (user_id) do update set parent_id = st.user_id, verification_status = 'approved', rejection_reason = null,
    business_name = excluded.business_name, categories = excluded.categories, supplier_type = excluded.supplier_type,
    location = coalesce(v_loc, vendor_profiles.location), lat = coalesce(p_lat, vendor_profiles.lat), lng = coalesce(p_lng, vendor_profiles.lng);
  -- back with a store: its products the agent still holds go back on sale
  update listings set status = 'live' where vendor_id = v and status = 'unpublished'
     and source_id in (select id from listings where vendor_id = st.user_id);
  update profiles set roles = (select array_agg(distinct r) from unnest(roles || array['agent']) r), active_role = 'agent' where id = v;
  return jsonb_build_object('store', st.business_name);
end $$;

-- Leaving (or being removed) takes the shop's products off sale; the stock stays recorded.
create or replace function public.agent_leave() returns void
language plpgsql security definer set search_path = public as $$
begin
  update store_agents set status = 'removed' where agent_id = auth.uid() and status = 'active';
  update listings set status = 'unpublished' where vendor_id = auth.uid() and source_id is not null and status = 'live';
end $$;

create or replace function public.store_remove_agent(p_agent uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update store_agents set status = 'removed' where store_id = auth.uid() and agent_id = p_agent and status = 'active';
  if not found then raise exception 'NOT_FOUND'; end if;
  update listings set status = 'unpublished' where vendor_id = p_agent and status = 'live'
     and source_id in (select id from listings where vendor_id = auth.uid());
end $$;

-- ---------- Offline sales come out of the agent's own stock ----------
create or replace function public.agent_log_sale(p_items jsonb, p_buyer_name text default null, p_buyer_phone text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_store uuid; it jsonb; l listings; v_qty int; v_line numeric;
  v_lines jsonb := '[]'::jsonb; v_total numeric := 0; v_id uuid;
begin
  select store_id into v_store from store_agents where agent_id = v and status = 'active';
  if v_store is null then raise exception 'NOT_AGENT'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'ITEMS_REQUIRED'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(it->>'qty', '')::numeric::int;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    select * into l from listings where id = (it->>'listing_id')::uuid and vendor_id = v for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if l.quantity < v_qty then raise exception 'OUT_OF_STOCK'; end if;
    update listings set quantity = quantity - v_qty where id = l.id;
    v_line := round(v_qty * l.price, 2);
    v_lines := v_lines || jsonb_build_object('listing_id', l.id, 'name', l.title, 'unit', l.unit, 'qty', v_qty, 'unit_price', l.price,
      'total', v_line, 'pct', 0, 'commission', 0);
    v_total := v_total + v_line;
  end loop;
  insert into agent_sales (store_id, agent_id, source, buyer_name, buyer_phone, items, total, commission)
  values (v_store, v, 'logged', nullif(trim(coalesce(p_buyer_name, '')), ''), nullif(trim(coalesce(p_buyer_phone, '')), ''), v_lines, v_total, 0)
  returning id into v_id;
  return v_id;
end $$;

-- ---------- Read models ----------
-- The shop page: callable signed out; null if the code is unknown, the agent has left or the store isn't approved.
create or replace function public.agent_shop(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', a.code,
    'agent', coalesce(nullif(split_part(trim(coalesce(p.full_name, '')), ' ', 1), ''), 'Your agent'),
    'is_me', a.agent_id = auth.uid(),
    'shop', jsonb_build_object('id', a.agent_id, 'location', s.location, 'lat', s.lat, 'lng', s.lng),
    'store', jsonb_build_object('id', v.user_id, 'name', v.business_name, 'location', v.location))
  from store_agents a join profiles p on p.id = a.agent_id join vendor_profiles v on v.user_id = a.store_id
  left join vendor_profiles s on s.user_id = a.agent_id
  where a.code = upper(trim(coalesce(p_code, ''))) and a.status = 'active' and v.verification_status = 'approved';
$$;
grant execute on function public.agent_shop(text) to anon, authenticated;

-- Everything the agent desk needs.
create or replace function public.agent_home() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); a store_agents;
begin
  select * into a from store_agents where agent_id = v and status = 'active';
  if not found then return jsonb_build_object('store', null); end if;
  return jsonb_build_object(
    'store', (select jsonb_build_object('id', user_id, 'name', business_name, 'location', location) from vendor_profiles where user_id = a.store_id),
    'code', a.code, 'joined_at', a.joined_at,
    'shop', (select jsonb_build_object('id', user_id, 'name', business_name, 'location', location, 'lat', lat, 'lng', lng) from vendor_profiles where user_id = v),
    'rebate', agent_rebate(a.store_id, v),
    -- what the agent holds (their copies of this store's products)
    'stock', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'source_id', l.source_id, 'title', l.title, 'price', l.price, 'unit', l.unit,
                 'quantity', l.quantity, 'photo', l.photos[1]) order by l.title)
                 from listings l where l.vendor_id = v and l.status = 'live'), '[]'::jsonb),
    -- what the agent can buy from the store
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'price', price, 'unit', unit, 'quantity', quantity,
                 'pct', agent_commission_pct, 'photo', photos[1]) order by title)
                 from listings where vendor_id = a.store_id and source_id is null and status <> 'draft' and not is_waste), '[]'::jsonb),
    'moves', coalesce((select jsonb_agg(m order by m.created_at desc) from (
        select id, paid_in, status, items, total, rebate, note, created_at, done_at from agent_stock_moves
         where agent_id = v and store_id = a.store_id order by created_at desc limit 20) m), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(s order by s.created_at desc) from (
        select id, source, buyer_name, items, total, commission, status, created_at from agent_sales
         where agent_id = v and store_id = a.store_id order by created_at desc limit 30) s), '[]'::jsonb));
end $$;

-- The store's agents page. p_days: the period for "bought" and "sold" (null = all time).
create or replace function public.store_agents_dashboard(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_from timestamptz := case when p_days is null then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not exists (select 1 from vendor_profiles where user_id = v) then raise exception 'NOT_VENDOR'; end if;
  return (with ag as (
    select a.agent_id, a.code, a.status, a.joined_at, coalesce(p.full_name, p.email, 'Agent') as name, p.email,
      sp.location, agent_rebate(v, a.agent_id) as reb,
      (select coalesce(sum(m.total), 0) from agent_stock_moves m where m.store_id = v and m.agent_id = a.agent_id and m.status = 'done' and m.done_at >= v_from) as bought,
      (select coalesce(sum(s.items_total), 0) from sub_orders s where s.vendor_id = a.agent_id and s.status = 'delivered' and s.delivered_at >= v_from)
        + (select coalesce(sum(x.total), 0) from agent_sales x where x.store_id = v and x.agent_id = a.agent_id and x.status = 'recorded' and x.created_at >= v_from) as sold
    from store_agents a join profiles p on p.id = a.agent_id left join vendor_profiles sp on sp.user_id = a.agent_id
    where a.store_id = v)
  select jsonb_build_object(
    'invite_code', (select agent_invite_code from vendor_profiles where user_id = v),
    'agents', coalesce((select jsonb_agg(jsonb_build_object('agent_id', agent_id, 'name', name, 'email', email, 'code', code, 'status', status,
        'joined_at', joined_at, 'location', location, 'period_bought', bought, 'period_sold', sold,
        'quarter', reb->'quarter', 'quarter_end', reb->'quarter_end', 'earned', reb->'earned', 'paid', reb->'paid')
        order by status, bought desc, name) from ag), '[]'::jsonb),
    'totals', jsonb_build_object('bought', (select coalesce(sum(bought), 0) from ag), 'sold', (select coalesce(sum(sold), 0) from ag)),
    'owed', (select coalesce(sum((reb->>'earned')::numeric - (reb->>'paid')::numeric), 0) from ag),
    'quarter', (select coalesce(sum((reb->>'quarter')::numeric), 0) from ag),
    'quarter_end', ((public.quarter_start() at time zone 'Africa/Lagos') + interval '3 months' - interval '1 day')::date,
    'pending', coalesce((select jsonb_agg(m order by m.created_at) from (
        select m.id, m.agent_id, coalesce(p.full_name, p.email) agent_name, m.items, m.total, m.note, m.created_at
          from agent_stock_moves m join profiles p on p.id = m.agent_id where m.store_id = v and m.status = 'pending') m), '[]'::jsonb),
    'moves', coalesce((select jsonb_agg(m order by m.created_at desc) from (
        select m.id, m.agent_id, m.paid_in, m.status, m.items, m.total, m.rebate, m.note, m.created_at, m.done_at
          from agent_stock_moves m where m.store_id = v order by m.created_at desc limit 50) m), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(r order by r.created_at desc) from (
        select s.id, s.agent_id, coalesce(p.full_name, p.email) agent_name, s.source, s.buyer_name, s.items, s.total, s.commission, s.status, s.created_at
          from agent_sales s join profiles p on p.id = s.agent_id where s.store_id = v order by s.created_at desc limit 50) r), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(o order by o.created_at desc) from (
        select o.id, o.agent_id, o.amount, o.note, o.created_at from agent_payouts o where o.store_id = v order by o.created_at desc limit 50) o), '[]'::jsonb)));
end $$;

-- Ops: agent shops are not farms or stores to verify.
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
      'listings', (select count(*) from listings l where l.vendor_id = v.user_id),
      'supplier_type', v.supplier_type,
      'kind', case when 'supplier' = any(p.roles) and 'vendor' = any(p.roles) then 'both'
                   when 'supplier' = any(p.roles) then 'store' else 'farm' end
    ) order by v.created_at desc)
    from vendor_profiles v
    join profiles p on p.id = v.user_id
    left join auth.users u on u.id = v.user_id
    where v.parent_id is null
  ), '[]'::jsonb);
end $$;

-- ---------- Agents who joined before this migration get their shop ----------
insert into public.vendor_profiles (user_id, business_name, categories, parent_id, supplier_type, verification_status)
select a.agent_id, coalesce(nullif(trim(coalesce(p.full_name, '')), ''), 'Agent'), st.categories, a.store_id, st.supplier_type, 'approved'
  from public.store_agents a join public.profiles p on p.id = a.agent_id join public.vendor_profiles st on st.user_id = a.store_id
 where a.status = 'active' and st.verification_status = 'approved'
on conflict (user_id) do nothing;

-- Internal helpers: only callable from other functions
revoke execute on function public.agent_rebate(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.agent_stock_lines(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.agent_stock_in(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.agent_stock_deliver(uuid) from public, anon, authenticated;
revoke execute on function public.agent_stock_refund(uuid, text) from public, anon, authenticated;
revoke execute on function public.sync_agent_copies() from public, anon, authenticated;
