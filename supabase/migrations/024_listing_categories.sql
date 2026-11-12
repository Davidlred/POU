-- 024 · Who may list what: farms list birds, eggs and meat; stores list feed, drugs and vaccines, equipment and packaging,
-- plus day-old chicks. Wanted requests follow the same rule. Safe to run more than once.

-- ---------- Who may list what ----------
-- A farm lists birds, eggs and meat; a store lists feed, drugs and vaccines, equipment and packaging, plus day-old chicks.
-- An account that is both lists everything. Checked when a listing is added or its category/kind changes, so older
-- listings keep working; listings made by RPCs (agent copies, accepted Wanted offers) are not checked here.
create or replace function public.store_bird_type(p_type text) returns boolean language sql immutable as $$
  select coalesce(p_type, '') in ('Day-old broiler chicks', 'Day-old layer chicks', 'Noiler chicks', 'Turkey poults')
$$;

create or replace function public.seller_may_list(p_category text, p_type text, p_roles text[]) returns boolean language sql immutable as $$
  select case
    when p_category in ('feed','drugs','equipment','packaging') then 'supplier' = any(p_roles)
    when p_category in ('eggs','chicken','turkey','live_birds') then 'vendor' = any(p_roles)
      or ('supplier' = any(p_roles) and p_category = 'live_birds' and public.store_bird_type(p_type))
    else true end   -- waste categories and anything else: unchanged
$$;

create or replace function public.guard_listing_category() returns trigger language plpgsql as $$
declare v_roles text[];
begin
  if current_user not in ('authenticated', 'anon') or new.source_id is not null or new.is_waste then return new; end if;
  if tg_op = 'UPDATE' and new.category is not distinct from old.category
     and (new.attributes->>'type') is not distinct from (old.attributes->>'type') then return new; end if;
  select roles into v_roles from profiles where id = new.vendor_id;
  if not public.seller_may_list(new.category, new.attributes->>'type', coalesce(v_roles, '{}')) then
    raise exception 'CATEGORY_NOT_ALLOWED';
  end if;
  return new;
end $$;
drop trigger if exists guard_listing_category on public.listings;
create trigger guard_listing_category before insert or update on public.listings
  for each row execute function public.guard_listing_category();

-- Wanted: sellers see the requests they are allowed to supply (same rule), so a store sees day-old chick requests too.
drop function if exists public.wanted_fits(text, text[]);
create or replace function public.wanted_fits(p_category text, p_type text, p_roles text[]) returns boolean language sql immutable as $$
  select case when 'agent' = any(p_roles) then true else public.seller_may_list(p_category, p_type, p_roles) end
$$;

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
      and public.wanted_fits(r.category, r.type, coalesce(v_roles, '{}'))
  ) x), '[]'::jsonb);
end $$;
