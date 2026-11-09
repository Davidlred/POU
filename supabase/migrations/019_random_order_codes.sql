-- =====================================================================
-- 019 · Random order numbers
-- New orders get "P360-" + 6 random characters (e.g. P360-7KQ4XM) instead of a running count
-- (P360-2100, 2101…), so nobody can tell how many orders there are. Existing orders keep their numbers.
-- Paste into Supabase → SQL Editor → Run. Safe to run more than once.
-- =====================================================================

create or replace function public.new_order_code() returns text language plpgsql volatile as $$
declare
  abc constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   -- no 0/O or 1/I/L
  c text;
begin
  loop
    c := 'P360-';
    for i in 1..6 loop c := c || substr(abc, 1 + floor(random() * length(abc))::int, 1); end loop;
    exit when not exists (select 1 from public.orders where code = c);
  end loop;
  return c;
end $$;

alter table public.orders alter column code set default public.new_order_code();
drop sequence if exists public.order_seq;
