-- =====================================================================
-- Poultry360 · migration 014: the whole of Port Harcourt counts as covered
-- Coverage used to be only the named neighbourhoods (GRA, D-Line, Woji, ...), so an address
-- whose area was written as "Port Harcourt" (or "PH", "port harcourt", ...) was told
-- "We don't deliver to Port Harcourt yet". This adds the city itself as a covered area and
-- tidies existing addresses so they match the list exactly (place_order compares exactly).
-- Safe to run more than once. (A fresh project only needs schema.sql.)
-- =====================================================================
insert into public.coverage_areas (name) values ('Port Harcourt') on conflict do nothing;

-- "PH", "Port-Harcourt", "port harcourt city", "Obio/Akpor" ... -> "Port Harcourt"
update public.addresses set area = 'Port Harcourt'
 where lower(regexp_replace(area, '[^a-zA-Z]', '', 'g')) in ('portharcourt', 'portharcourtcity', 'ph', 'phc', 'obioakpor')
   and area <> 'Port Harcourt';

-- "gra", " woji " ... -> the exact name on the list
update public.addresses a set area = c.name
  from public.coverage_areas c
 where lower(trim(a.area)) = lower(c.name) and a.area <> c.name;
