-- =====================================================================
-- Poultry360 · migration 013: Farm Book sales priced from quantity × unit price, with discount
-- A hand-written credit sale is now a list of items. For a product the farm lists, the price
-- comes from the listing (e.g. ₦4,500 a crate); for anything else the farm enters a unit price.
-- The server works out each line, the subtotal, an optional % discount and the amount owed,
-- and writes the description itself, so nobody types a total by hand.
-- Requires 007. Safe to run more than once. (A fresh project only needs schema.sql.)
-- =====================================================================
alter table public.credit_entries add column if not exists items jsonb;                         -- [{ listing_id, name, unit, qty, unit_price, total }]
alter table public.credit_entries add column if not exists subtotal numeric(14,2);
alter table public.credit_entries add column if not exists discount_pct numeric(5,2) not null default 0
  check (discount_pct >= 0 and discount_pct < 100);

-- p_items: [{ listing_id, qty }] for listed products, or [{ name, unit, unit_price, qty }] for anything else.
create or replace function public.farm_book_log_sale(p_customer uuid, p_name text, p_phone text, p_type text,
  p_items jsonb, p_discount_pct numeric default 0, p_due date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v uuid := auth.uid(); v_customer uuid := p_customer; v_id uuid;
  it jsonb; l record; v_qty numeric; v_price numeric; v_name text; v_unit text;
  v_lines jsonb := '[]'::jsonb; v_sub numeric := 0; v_disc numeric := coalesce(p_discount_pct, 0); v_amount numeric; v_desc text := '';
begin
  if not exists (select 1 from vendor_profiles where user_id = v) then raise exception 'NOT_VENDOR'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'ITEMS_REQUIRED'; end if;
  if v_disc < 0 or v_disc >= 100 then raise exception 'INVALID_DISCOUNT'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(it->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'INVALID_QTY'; end if;
    if nullif(it->>'listing_id', '') is not null then
      select title, price, unit into l from listings where id = (it->>'listing_id')::uuid and vendor_id = v;
      if not found then raise exception 'NOT_FOUND'; end if;
      v_name := l.title; v_price := l.price; v_unit := l.unit;
    else
      v_name := nullif(trim(coalesce(it->>'name', '')), '');
      v_price := nullif(it->>'unit_price', '')::numeric;
      v_unit := coalesce(nullif(trim(coalesce(it->>'unit', '')), ''), 'unit');
      if v_name is null then raise exception 'DESCRIPTION_REQUIRED'; end if;
      if v_price is null or v_price <= 0 then raise exception 'INVALID_AMOUNT'; end if;
    end if;
    v_lines := v_lines || jsonb_build_object('listing_id', nullif(it->>'listing_id', ''), 'name', v_name, 'unit', v_unit,
      'qty', v_qty, 'unit_price', v_price, 'total', round(v_qty * v_price, 2));
    v_sub := v_sub + round(v_qty * v_price, 2);
    v_desc := v_desc || case when v_desc = '' then '' else ', ' end || trim(to_char(v_qty, 'FM999999990.##')) || ' ' || v_unit
      || case when v_qty <> 1 and v_unit <> 'kg' and right(v_unit, 1) <> 's' then 's' else '' end || ' of ' || v_name;
  end loop;

  v_amount := round(v_sub * (100 - v_disc) / 100, 2);
  if v_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_disc > 0 then v_desc := v_desc || ' · ' || trim(to_char(v_disc, 'FM990.##')) || '% off'; end if;

  if v_customer is null then
    if coalesce(trim(p_name), '') = '' then raise exception 'NAME_REQUIRED'; end if;
    insert into credit_customers (vendor_id, name, phone, customer_type)
    values (v, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), case when p_type = 'business' then 'business' else 'individual' end)
    returning id into v_customer;
  elsif not exists (select 1 from credit_customers where id = v_customer and vendor_id = v) then
    raise exception 'NOT_FOUND';
  end if;

  insert into credit_entries (vendor_id, customer_id, description, amount, due_date, items, subtotal, discount_pct)
  values (v, v_customer, v_desc, v_amount, p_due, v_lines, v_sub, v_disc) returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.farm_book_log_sale(uuid, text, text, text, jsonb, numeric, date) from anon;
grant execute on function public.farm_book_log_sale(uuid, text, text, text, jsonb, numeric, date) to authenticated;
