-- =====================================================================
-- Poultry360 · migration 005: flock start date vs server clock
-- The server's current_date is UTC, an hour behind Nigeria, so a flock dated
-- "today" and entered between midnight and 1am was rejected. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================
alter table public.flocks drop constraint if exists flocks_start_date_check;
alter table public.flocks add constraint flocks_start_date_check check (start_date <= current_date + 1);
