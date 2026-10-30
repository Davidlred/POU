-- =====================================================================
-- Poultry360 · migration 012: feed prices and automatic feed cost
-- Each feed in a farm's inventory carries the price of one bag (25 kg by default).
-- Logging feed on a flock then records which feed was used and the price per kg at
-- that moment, so the cost is calculated by the app (kg × price per kg) and past
-- entries keep the price they were logged at.
-- Requires 009. Safe to run more than once. (A fresh project only needs schema.sql.)
-- =====================================================================
alter table public.farm_inventory add column if not exists bag_price numeric check (bag_price is null or bag_price >= 0);   -- ₦ for one bag (feed only)
alter table public.farm_inventory add column if not exists bag_kg numeric not null default 25 check (bag_kg > 0);            -- kg in one bag

-- No foreign key on inventory_id: entries are written offline and may reach the server
-- before the feed item they point at; the link is informational.
alter table public.farm_logs add column if not exists inventory_id uuid;     -- feed item used (feed entries)
alter table public.farm_logs add column if not exists unit_cost numeric;     -- ₦ per kg when it was logged
