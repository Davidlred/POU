-- =====================================================================
-- Poultry360 · migration 017: look up a store from its invite link
-- The page a shared invite link opens shows "Join <store> as an agent" before the visitor
-- signs in, so it needs the store's name from the code. Only the name and area are returned,
-- and only for approved stores. Requires 015. Safe to run more than once.
-- =====================================================================
create or replace function public.store_by_invite(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', business_name, 'location', location)
    from vendor_profiles
   where agent_invite_code = upper(trim(coalesce(p_code, ''))) and verification_status = 'approved';
$$;
grant execute on function public.store_by_invite(text) to anon, authenticated;
