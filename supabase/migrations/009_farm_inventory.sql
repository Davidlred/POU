-- =====================================================================
-- Poultry360 · migration 009: farm inventory (feed, drugs, vaccines, equipment, other)
-- Offline-first like the rest of Farm Hub: rows are written by the app's sync queue with
-- client-generated ids; the newest updated_at wins. Requires 001–008. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================
create table if not exists public.farm_inventory (
  id uuid primary key,
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  category text not null check (category in ('feed','medicine','vaccine','equipment','other')),
  name text not null,
  quantity numeric not null default 0 check (quantity >= 0),
  unit text,
  low_at numeric check (low_at is null or low_at >= 0),     -- warn when stock falls to this level
  expiry_date date,                                          -- drugs and vaccines
  notes text,
  status text not null default 'active' check (status in ('active','removed')),
  updated_at timestamptz default now(),
  updated_by text
);
create index if not exists farm_inventory_owner_idx on public.farm_inventory (owner_id);

alter table public.farm_inventory enable row level security;
drop policy if exists own_inventory on public.farm_inventory;
create policy own_inventory on public.farm_inventory for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Last write wins, same as flocks and vaccinations.
drop trigger if exists lww_inventory on public.farm_inventory;
create trigger lww_inventory before update on public.farm_inventory for each row execute function public.lww();
