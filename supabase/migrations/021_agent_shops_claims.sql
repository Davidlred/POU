-- =====================================================================
-- Poultry360 · migration 021: agent shops and missed-sale claims
-- * Agent shop: an agent's link (<WEB_URL>/a/<agent code>) opens their store's products under the
--   agent's name. Buying from it puts the agent's code on the order automatically (no code to type).
-- * Claims: an order that still went through without the code can be claimed by the agent with its
--   order number (within 14 days, store's own orders only). The store approves or rejects; an approved
--   claim is credited when that part of the order is delivered (at once if it already was).
-- Requires 015. Safe to run more than once.
-- =====================================================================

create table if not exists public.agent_claims (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.vendor_profiles(user_id) on delete cascade,
  agent_id uuid not null references public.profiles on delete cascade,
  sub_order_id uuid not null references public.sub_orders on delete cascade,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  decided_at timestamptz
);
-- one live claim per order part (a rejected one doesn't block another agent)
create unique index if not exists agent_claims_live on public.agent_claims (sub_order_id) where status <> 'rejected';
create index if not exists agent_claims_store_idx on public.agent_claims (store_id, created_at desc);
alter table public.agent_claims enable row level security;
drop policy if exists agent_claims_r on public.agent_claims;
create policy agent_claims_r on public.agent_claims for select using (store_id = auth.uid() or agent_id = auth.uid());

-- The shop page: who the agent is and which store they sell for. Callable signed out; null if the code
-- is unknown, the agent has left or the store isn't approved. Products are read like any store's.
create or replace function public.agent_shop(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', a.code,
    'agent', coalesce(nullif(split_part(trim(coalesce(p.full_name, '')), ' ', 1), ''), 'Your agent'),
    'is_me', a.agent_id = auth.uid(),
    'store', jsonb_build_object('id', v.user_id, 'name', v.business_name, 'location', v.location))
  from store_agents a join profiles p on p.id = a.agent_id join vendor_profiles v on v.user_id = a.store_id
  where a.code = upper(trim(coalesce(p_code, ''))) and a.status = 'active' and v.verification_status = 'approved';
$$;
grant execute on function public.agent_shop(text) to anon, authenticated;

-- Record the agent's commission on one delivered order part (once; prices as the buyer paid them).
create or replace function public.agent_credit_sub(p_sub uuid, p_agent uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s sub_orders; v_lines jsonb := '[]'::jsonb; v_total numeric := 0; v_comm numeric := 0; r record; v_line numeric; v_com numeric;
begin
  select * into s from sub_orders where id = p_sub;
  if not found or s.status <> 'delivered' then return; end if;
  for r in select oi.listing_id, oi.title, oi.quantity, oi.price, coalesce(l.agent_commission_pct, 0) pct, l.unit
             from order_items oi left join listings l on l.id = oi.listing_id where oi.sub_order_id = s.id loop
    v_line := round(r.quantity * r.price, 2);
    v_com := round(v_line * r.pct / 100, 2);
    v_lines := v_lines || jsonb_build_object('listing_id', r.listing_id, 'name', r.title, 'unit', r.unit, 'qty', r.quantity, 'unit_price', r.price,
      'total', v_line, 'pct', r.pct, 'commission', v_com);
    v_total := v_total + v_line; v_comm := v_comm + v_com;
  end loop;
  insert into agent_sales (store_id, agent_id, source, sub_order_id, items, total, commission)
  values (s.vendor_id, p_agent, 'order', s.id, v_lines, v_total, v_comm) on conflict (sub_order_id) do nothing;
end $$;
revoke execute on function public.agent_credit_sub(uuid, uuid) from public, anon, authenticated;

-- On delivery: the agent whose code is on the order, or else an approved claim.
create or replace function public.agent_credit_delivery() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_agent uuid;
begin
  if new.status <> 'delivered' or old.status = 'delivered' then return new; end if;
  select sa.agent_id into v_agent from orders o join store_agents sa on sa.code = o.agent_code and sa.status = 'active'
   where o.id = new.order_id and sa.store_id = new.vendor_id;
  if v_agent is null then
    select agent_id into v_agent from agent_claims where sub_order_id = new.id and status = 'approved';
  end if;
  if v_agent is not null then perform agent_credit_sub(new.id, v_agent); end if;
  return new;
end $$;
drop trigger if exists agent_credit_on_delivery on public.sub_orders;
create trigger agent_credit_on_delivery after update of status on public.sub_orders
  for each row execute function public.agent_credit_delivery();
revoke execute on function public.agent_credit_delivery() from public, anon, authenticated;

-- Agent: "this was my customer". p_order is the order number (P360-… or just the part after it).
create or replace function public.agent_claim_order(p_order text, p_note text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := auth.uid(); a store_agents; o orders; s sub_orders; v_code text := upper(regexp_replace(coalesce(p_order, ''), '\s', '', 'g')); v_id uuid;
begin
  select * into a from store_agents where agent_id = v and status = 'active';
  if not found then raise exception 'NOT_AGENT'; end if;
  if v_code not like 'P360-%' then v_code := 'P360-' || v_code; end if;
  select * into o from orders where code = v_code;
  if found then select * into s from sub_orders where order_id = o.id and vendor_id = a.store_id for update; end if;
  if o.id is null or s.id is null then raise exception 'CLAIM_NOT_FOUND'; end if;   -- other stores' orders look the same as unknown ones
  if o.buyer_id = v then raise exception 'CLAIM_OWN_ORDER'; end if;
  if s.status in ('cancelled', 'refunded') then raise exception 'CLAIM_CANCELLED'; end if;
  if s.created_at < now() - interval '14 days' then raise exception 'CLAIM_TOO_OLD'; end if;
  if exists (select 1 from agent_sales where sub_order_id = s.id)
     or exists (select 1 from store_agents sa where sa.code = o.agent_code and sa.store_id = s.vendor_id and sa.status = 'active') then
    raise exception 'CLAIM_HAS_AGENT';
  end if;
  if exists (select 1 from agent_claims where sub_order_id = s.id and (status <> 'rejected' or agent_id = v)) then raise exception 'CLAIM_EXISTS'; end if;
  insert into agent_claims (store_id, agent_id, sub_order_id, note)
  values (a.store_id, v, s.id, nullif(trim(coalesce(p_note, '')), '')) returning id into v_id;
  return v_id;
end $$;

-- Store: approve or reject a claim. Approved and already delivered = credited now.
create or replace function public.store_decide_claim(p_claim uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c agent_claims;
begin
  select * into c from agent_claims where id = p_claim and store_id = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'ALREADY_ACTIONED'; end if;
  update agent_claims set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now() where id = c.id;
  if p_approve then perform agent_credit_sub(c.sub_order_id, c.agent_id); end if;
end $$;

-- Claims with what the order was, for either side: the store sees its agents' claims, an agent sees their own.
create or replace function public.agent_claims_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'status') <> 'pending', x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', c.id, 'status', c.status, 'note', c.note, 'created_at', c.created_at, 'decided_at', c.decided_at,
      'agent_name', coalesce(p.full_name, p.email, 'Agent'), 'order_code', o.code, 'order_status', s.status,
      'ordered_at', s.created_at, 'total', s.items_total,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('name', oi.title, 'qty', oi.quantity, 'unit', l.unit)), '[]'::jsonb)
                  from order_items oi left join listings l on l.id = oi.listing_id where oi.sub_order_id = s.id),
      'commission', (select commission from agent_sales where sub_order_id = s.id and agent_id = c.agent_id)) x
    from agent_claims c join sub_orders s on s.id = c.sub_order_id join orders o on o.id = s.order_id join profiles p on p.id = c.agent_id
    where (c.store_id = auth.uid() or c.agent_id = auth.uid()) and c.created_at > now() - interval '90 days'
    order by c.created_at desc limit 100) t;
$$;
