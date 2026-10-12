-- =====================================================================
-- Poultry360 · migration 006: Investment module (PRD §12, Phase 4)
-- KYC, farm investment badge, offerings, pools, invest, distributions, portfolio,
-- plus ops-console RPCs. Requires 001–005. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
--
-- LEGAL: raising money from the public is regulated (SEC Nigeria crowdfunding rules).
-- This is TEST-ONLY with simulated money until product and legal sign off.
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
