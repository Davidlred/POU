-- =====================================================================
-- Poultry360 · migration 015: store agents and commission
-- A store (any approved farm or supplier, the "mother store") shares an invite code. People join
-- as its agents in the mobile app. An agent's sale counts for the store in two ways:
--   * logged: the agent records a sale from the store's catalogue (price from the listing, stock goes down)
--   * order:  a buyer enters the agent's code at checkout; when that store's part is delivered it is credited
-- Commission is a % set per product (listings.agent_commission_pct). Payouts are recorded by the
-- store (paid outside the app); owed = earned - paid. Requires 001-014. Safe to run more than once.
-- =====================================================================
alter table public.listings add column if not exists agent_commission_pct numeric(5,2) not null default 0
  check (agent_commission_pct >= 0 and agent_commission_pct <= 100);
alter table public.vendor_profiles add column if not exists agent_invite_code text unique;
alter table public.orders add column if not exists agent_code text;

create table if not exists public.store_agents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  agent_id uuid not null references public.profiles on delete cascade,
  code text unique not null,                       -- the agent's own code, given to buyers
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz default now()
);
create unique index if not exists store_agents_pair on public.store_agents (store_id, agent_id);
create unique index if not exists one_store_per_agent on public.store_agents (agent_id) where status = 'active';

create table if not exists public.agent_sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  agent_id uuid not null references public.profiles on delete cascade,
  source text not null check (source in ('logged','order')),
  sub_order_id uuid unique references public.sub_orders on delete set null,
  buyer_name text,
  buyer_phone text,
  items jsonb not null,                            -- [{ listing_id, name, unit, qty, unit_price, total, pct, commission }]
  total numeric(14,2) not null check (total >= 0),
  commission numeric(14,2) not null default 0 check (commission >= 0),
  status text not null default 'recorded' check (status in ('recorded','cancelled')),
  created_at timestamptz default now()
);
create index if not exists agent_sales_store_idx on public.agent_sales (store_id, created_at desc);
create index if not exists agent_sales_agent_idx on public.agent_sales (agent_id, created_at desc);

create table if not exists public.agent_payouts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  agent_id uuid not null references public.profiles on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  note text,
  created_at timestamptz default now()
);

alter table public.store_agents enable row level security;
alter table public.agent_sales enable row level security;
alter table public.agent_payouts enable row level security;
drop policy if exists store_agents_r on public.store_agents;
create policy store_agents_r on public.store_agents for select using (store_id = auth.uid() or agent_id = auth.uid());
drop policy if exists agent_sales_r on public.agent_sales;
create policy agent_sales_r on public.agent_sales for select using (store_id = auth.uid() or agent_id = auth.uid());
drop policy if exists agent_payouts_r on public.agent_payouts;
create policy agent_payouts_r on public.agent_payouts for select using (store_id = auth.uid() or agent_id = auth.uid());

-- A short code nobody has used yet (letters and digits that can't be misread).
create or replace function public.p360_code(p_len int) returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
    from generate_series(1, p_len);
$$;

-- ---------- Store side ----------
-- The store's invite code (created on first use).
create or replace function public.store_invite_code() returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  select agent_invite_code into v_code from vendor_profiles where user_id = auth.uid();
  if not found then raise exception 'NOT_VENDOR'; end if;
  if v_code is null then
    loop
      v_code := 'ST' || p360_code(6);
      begin
        update vendor_profiles set agent_invite_code = v_code where user_id = auth.uid();
        exit;
      exception when unique_violation then null;
      end;
    end loop;
  end if;
  return v_code;
end $$;

-- A new invite code (the old one stops working; agents who already joined stay).
create or replace function public.store_new_invite_code() returns text
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from vendor_profiles where user_id = auth.uid()) then raise exception 'NOT_VENDOR'; end if;
  update vendor_profiles set agent_invite_code = null where user_id = auth.uid();
  return store_invite_code();
end $$;

create or replace function public.store_remove_agent(p_agent uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update store_agents set status = 'removed' where store_id = auth.uid() and agent_id = p_agent and status = 'active';
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

-- Commission paid to an agent outside the app.
create or replace function public.store_record_payout(p_agent uuid, p_amount numeric, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if not exists (select 1 from store_agents where store_id = auth.uid() and agent_id = p_agent) then raise exception 'NOT_FOUND'; end if;
  insert into agent_payouts (store_id, agent_id, amount, note) values (auth.uid(), p_agent, round(p_amount, 2), nullif(trim(coalesce(p_note, '')), ''));
end $$;

-- A logged sale entered by mistake: cancelled, and its stock goes back.
create or replace function public.agent_cancel_sale(p_sale uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s agent_sales; it jsonb;
begin
  select * into s from agent_sales where id = p_sale and status = 'recorded' and source = 'logged'
     and (store_id = auth.uid() or (agent_id = auth.uid() and created_at > now() - interval '24 hours')) for update;
  if not found then raise exception 'ALREADY_ACTIONED'; end if;
  update agent_sales set status = 'cancelled' where id = s.id;
  for it in select * from jsonb_array_elements(s.items) loop
    update listings set quantity = quantity + (it->>'qty')::int where id = (it->>'listing_id')::uuid;
  end loop;
end $$;

-- Leaderboard and totals for the store. p_days null = all time.
create or replace function public.store_agents_dashboard(p_days int default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_from timestamptz := case when p_days is null then '-infinity'::timestamptz else now() - make_interval(days => p_days) end;
begin
  if not exists (select 1 from vendor_profiles where user_id = v) then raise exception 'NOT_VENDOR'; end if;
  return jsonb_build_object(
    'invite_code', (select agent_invite_code from vendor_profiles where user_id = v),
    'agents', coalesce((
      select jsonb_agg(x order by x->>'status', (x->>'period_total')::numeric desc, x->>'name') from (
        select jsonb_build_object(
          'agent_id', a.agent_id, 'name', coalesce(p.full_name, p.email, 'Agent'), 'email', p.email, 'code', a.code, 'status', a.status, 'joined_at', a.joined_at,
          'period_sales', (select count(*) from agent_sales s where s.store_id = v and s.agent_id = a.agent_id and s.status = 'recorded' and s.created_at >= v_from),
          'period_total', (select coalesce(sum(total), 0) from agent_sales s where s.store_id = v and s.agent_id = a.agent_id and s.status = 'recorded' and s.created_at >= v_from),
          'period_commission', (select coalesce(sum(commission), 0) from agent_sales s where s.store_id = v and s.agent_id = a.agent_id and s.status = 'recorded' and s.created_at >= v_from),
          'earned', (select coalesce(sum(commission), 0) from agent_sales s where s.store_id = v and s.agent_id = a.agent_id and s.status = 'recorded'),
          'paid', (select coalesce(sum(amount), 0) from agent_payouts o where o.store_id = v and o.agent_id = a.agent_id)) x
        from store_agents a join profiles p on p.id = a.agent_id where a.store_id = v) t), '[]'::jsonb),
    'totals', (select jsonb_build_object('sales', count(*), 'total', coalesce(sum(total), 0), 'commission', coalesce(sum(commission), 0))
                 from agent_sales where store_id = v and status = 'recorded' and created_at >= v_from),
    'owed', (select coalesce(sum(commission), 0) from agent_sales where store_id = v and status = 'recorded')
            - (select coalesce(sum(amount), 0) from agent_payouts where store_id = v),
    'recent', coalesce((select jsonb_agg(r order by r.created_at desc) from (
        select s.id, s.agent_id, coalesce(p.full_name, p.email) agent_name, s.source, s.buyer_name, s.items, s.total, s.commission, s.status, s.created_at
          from agent_sales s join profiles p on p.id = s.agent_id where s.store_id = v order by s.created_at desc limit 50) r), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(o order by o.created_at desc) from (
        select o.id, o.agent_id, o.amount, o.note, o.created_at from agent_payouts o where o.store_id = v order by o.created_at desc limit 50) o), '[]'::jsonb));
end $$;

-- ---------- Agent side ----------
create or replace function public.agent_join(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); st vendor_profiles; v_code text;
begin
  select * into st from vendor_profiles where agent_invite_code = upper(trim(coalesce(p_code, '')));
  if not found then raise exception 'INVALID_STORE_CODE'; end if;
  if st.user_id = v then raise exception 'OWN_STORE'; end if;
  if st.verification_status <> 'approved' then raise exception 'STORE_NOT_APPROVED'; end if;
  if exists (select 1 from store_agents where agent_id = v and status = 'active' and store_id <> st.user_id) then raise exception 'AGENT_HAS_STORE'; end if;
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
  update profiles set roles = (select array_agg(distinct r) from unnest(roles || array['agent']) r), active_role = 'agent' where id = v;
  return jsonb_build_object('store', st.business_name);
end $$;

create or replace function public.agent_leave() returns void
language plpgsql security definer set search_path = public as $$
begin
  update store_agents set status = 'removed' where agent_id = auth.uid() and status = 'active';
end $$;

-- A sale the agent made from the store's catalogue. p_items: [{ listing_id, qty }].
create or replace function public.agent_log_sale(p_items jsonb, p_buyer_name text default null, p_buyer_phone text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); v_store uuid; it jsonb; l listings; v_qty int; v_line numeric; v_com numeric;
  v_lines jsonb := '[]'::jsonb; v_total numeric := 0; v_comm numeric := 0; v_id uuid;
begin
  select store_id into v_store from store_agents where agent_id = v and status = 'active';
  if v_store is null then raise exception 'NOT_AGENT'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'ITEMS_REQUIRED'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(it->>'qty', '')::numeric::int;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    select * into l from listings where id = (it->>'listing_id')::uuid and vendor_id = v_store for update;
    if not found or l.status = 'unpublished' then raise exception 'NOT_FOUND'; end if;
    if l.quantity < v_qty then raise exception 'OUT_OF_STOCK'; end if;
    update listings set quantity = quantity - v_qty where id = l.id;
    v_line := round(v_qty * l.price, 2);
    v_com := round(v_line * l.agent_commission_pct / 100, 2);
    v_lines := v_lines || jsonb_build_object('listing_id', l.id, 'name', l.title, 'unit', l.unit, 'qty', v_qty, 'unit_price', l.price,
      'total', v_line, 'pct', l.agent_commission_pct, 'commission', v_com);
    v_total := v_total + v_line; v_comm := v_comm + v_com;
  end loop;
  insert into agent_sales (store_id, agent_id, source, buyer_name, buyer_phone, items, total, commission)
  values (v_store, v, 'logged', nullif(trim(coalesce(p_buyer_name, '')), ''), nullif(trim(coalesce(p_buyer_phone, '')), ''), v_lines, v_total, v_comm)
  returning id into v_id;
  return v_id;
end $$;

-- Everything the agent's screen needs.
create or replace function public.agent_home() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); a store_agents;
begin
  select * into a from store_agents where agent_id = v and status = 'active';
  if not found then return jsonb_build_object('store', null); end if;
  return jsonb_build_object(
    'store', (select jsonb_build_object('id', user_id, 'name', business_name, 'location', location) from vendor_profiles where user_id = a.store_id),
    'code', a.code, 'joined_at', a.joined_at,
    'month', (select jsonb_build_object('sales', count(*), 'total', coalesce(sum(total), 0), 'commission', coalesce(sum(commission), 0))
                from agent_sales where agent_id = v and store_id = a.store_id and status = 'recorded' and created_at >= date_trunc('month', now())),
    'earned', (select coalesce(sum(commission), 0) from agent_sales where agent_id = v and store_id = a.store_id and status = 'recorded'),
    'paid', (select coalesce(sum(amount), 0) from agent_payouts where agent_id = v and store_id = a.store_id),
    'products', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'price', price, 'unit', unit, 'quantity', quantity, 'pct', agent_commission_pct) order by title)
                  from listings where vendor_id = a.store_id and status <> 'unpublished'), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(s order by s.created_at desc) from (
        select id, source, buyer_name, items, total, commission, status, created_at from agent_sales
         where agent_id = v and store_id = a.store_id order by created_at desc limit 30) s), '[]'::jsonb));
end $$;

-- ---------- Buyer side: an agent's code on an order ----------
create or replace function public.set_order_agent(p_order uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a store_agents; v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not exists (select 1 from orders where id = p_order and buyer_id = auth.uid()) then raise exception 'NOT_FOUND'; end if;
  select * into a from store_agents where code = v_code and status = 'active';
  if not found then raise exception 'INVALID_AGENT_CODE'; end if;
  if a.agent_id = auth.uid() then raise exception 'OWN_AGENT_CODE'; end if;
  update orders set agent_code = v_code where id = p_order;
  return jsonb_build_object('store', (select business_name from vendor_profiles where user_id = a.store_id),
    'applies', exists (select 1 from sub_orders where order_id = p_order and vendor_id = a.store_id));
end $$;

-- When a store's part of an order with an agent code is delivered, credit the agent.
create or replace function public.agent_credit_delivery() returns trigger
language plpgsql security definer set search_path = public as $$
declare a store_agents; v_lines jsonb := '[]'::jsonb; v_total numeric := 0; v_comm numeric := 0; r record; v_line numeric; v_com numeric;
begin
  if new.status <> 'delivered' or old.status = 'delivered' then return new; end if;
  select sa.* into a from orders o join store_agents sa on sa.code = o.agent_code and sa.status = 'active'
   where o.id = new.order_id and sa.store_id = new.vendor_id;
  if not found then return new; end if;
  for r in select oi.listing_id, oi.title, oi.quantity, oi.price, coalesce(l.agent_commission_pct, 0) pct, l.unit
             from order_items oi left join listings l on l.id = oi.listing_id where oi.sub_order_id = new.id loop
    v_line := round(r.quantity * r.price, 2);
    v_com := round(v_line * r.pct / 100, 2);
    v_lines := v_lines || jsonb_build_object('listing_id', r.listing_id, 'name', r.title, 'unit', r.unit, 'qty', r.quantity, 'unit_price', r.price,
      'total', v_line, 'pct', r.pct, 'commission', v_com);
    v_total := v_total + v_line; v_comm := v_comm + v_com;
  end loop;
  insert into agent_sales (store_id, agent_id, source, sub_order_id, items, total, commission)
  values (new.vendor_id, a.agent_id, 'order', new.id, v_lines, v_total, v_comm) on conflict (sub_order_id) do nothing;
  return new;
end $$;
drop trigger if exists agent_credit_on_delivery on public.sub_orders;
create trigger agent_credit_on_delivery after update of status on public.sub_orders
  for each row execute function public.agent_credit_delivery();

revoke execute on function public.agent_credit_delivery() from public, anon, authenticated;
revoke execute on function public.p360_code(int) from public, anon, authenticated;
