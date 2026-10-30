-- =====================================================================
-- Poultry360 · migration 016: a supplier is not made a farm
-- submit_vendor_application used to add the 'vendor' (farm) role to every account that sent
-- business details, so a supplier-only store was treated as a farm and landed in Farm Hub.
-- Now the role follows what was registered: 'supplier' for a supplier, 'vendor' for a farm,
-- both when both. Accounts already affected are corrected below. Safe to run more than once.
-- =====================================================================
drop function if exists public.submit_vendor_application(text, text[], text, text, double precision, double precision, text);
create or replace function public.submit_vendor_application(
  p_business_name text, p_categories text[], p_location text, p_id_doc_path text,
  p_lat double precision default null, p_lng double precision default null, p_supplier_type text default null,
  p_is_farm boolean default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_farm boolean := coalesce(p_is_farm, p_supplier_type is null);   -- older apps: no supplier type means a farm
begin
  if p_supplier_type is not null and p_supplier_type not in ('feed','equipment','medicine') then raise exception 'INVALID_TYPE'; end if;
  insert into vendor_profiles (user_id, business_name, categories, location, id_doc_path, lat, lng, supplier_type)
  values (auth.uid(), p_business_name, p_categories, p_location, p_id_doc_path, p_lat, p_lng, p_supplier_type)
  on conflict (user_id) do update set business_name = excluded.business_name, categories = excluded.categories,
    location = excluded.location, id_doc_path = excluded.id_doc_path, lat = excluded.lat, lng = excluded.lng,
    supplier_type = coalesce(excluded.supplier_type, vendor_profiles.supplier_type),
    verification_status = 'pending', rejection_reason = null;
  update profiles set
    roles = (select array_agg(distinct r) from unnest(roles
      || case when v_farm then array['vendor'] else array[]::text[] end
      || case when p_supplier_type is not null then array['supplier'] else array[]::text[] end) r),
    active_role = case when v_farm then 'vendor' else 'supplier' end
  where id = auth.uid();
end $$;

-- Supplier-only stores that were wrongly made farms: they chose a supply type and no birds or eggs.
update public.profiles p set
  roles = array_remove(p.roles, 'vendor'),
  active_role = case when p.active_role = 'vendor' then 'supplier' else p.active_role end
  from public.vendor_profiles v
 where v.user_id = p.id
   and v.supplier_type is not null
   and 'supplier' = any(p.roles) and 'vendor' = any(p.roles)
   and not (coalesce(v.categories, '{}') && array['Eggs','Broilers','Turkey','Live birds']);
