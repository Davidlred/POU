-- =====================================================================
-- Poultry360 · migration 018: ops can tell farms and stores apart
-- admin_vendors() now returns 'kind' (farm | store | both, from profiles.roles) and
-- 'supplier_type', so the ops dashboard tags each application. Safe to run more than once.
-- =====================================================================
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
  ), '[]'::jsonb);
end $$;
