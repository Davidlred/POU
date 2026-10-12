-- =====================================================================
-- Poultry360 · migration 008: commission rules
--  · Credit sales made in the app: the 10% commission is collected when the money is paid back,
--    whether the buyer pays in the app or the farm records a receipt. Hand-written (off-app) entries carry none.
--  · Vets: Poultry360 keeps 10% of the consult fee; the vet receives 90% when the consult is completed,
--    and can withdraw it like farms and riders.
-- Requires 001–007. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
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
