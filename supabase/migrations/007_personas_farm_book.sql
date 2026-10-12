-- =====================================================================
-- Poultry360 · migration 007: sign-up personas (vet, supplier type, buyer type)
-- and the Farm Book (selling on credit). Requires 001–006. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
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

