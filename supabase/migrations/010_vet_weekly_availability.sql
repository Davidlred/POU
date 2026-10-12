-- =====================================================================
-- Poultry360 · migration 010: vets set weekly availability
-- "Every Tuesday, Wednesday and Friday, 9am to 3pm" → bookable slots are opened for the next
-- 4 weeks and topped up automatically. One-off slots still work. Requires 001–009.
-- Safe to run more than once. (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================

-- Where a slot came from: opened by hand, or generated from the weekly schedule.
alter table public.vet_slots add column if not exists source text not null default 'manual' check (source in ('manual','schedule'));

-- One window per weekday. weekday follows Postgres dow / JavaScript getDay(): 0 = Sunday … 6 = Saturday. Times are Nigerian time.
create table if not exists public.vet_availability (
  vet_id uuid not null references public.vets on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_minutes int not null default 60 check (slot_minutes in (30, 45, 60, 90)),
  primary key (vet_id, weekday),
  check (end_time > start_time)
);
-- A schedule slot the vet removed for one particular day, so topping up doesn't bring it back.
create table if not exists public.vet_slot_exceptions (
  vet_id uuid not null references public.vets on delete cascade,
  starts_at timestamptz not null,
  primary key (vet_id, starts_at)
);
alter table public.vet_availability enable row level security;
alter table public.vet_slot_exceptions enable row level security;
drop policy if exists vet_availability_own_r on public.vet_availability;
create policy vet_availability_own_r on public.vet_availability for select using (vet_id = public.vet_self());
-- All writes go through the RPCs below.

-- Opens any missing schedule slots for the next 28 days. Returns how many were added.
create or replace function public.vet_generate_slots(p_vet uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_today date := (now() at time zone 'Africa/Lagos')::date;
begin
  insert into vet_slots (vet_id, starts_at, source)
  select p_vet, x.ts, 'schedule' from (
    select ((d::date + a.start_time) + (k * make_interval(mins => a.slot_minutes))) at time zone 'Africa/Lagos' as ts
      from generate_series(v_today, v_today + 27, interval '1 day') d
      join vet_availability a on a.vet_id = p_vet and a.weekday = extract(dow from d)::int
      cross join lateral generate_series(0, (extract(epoch from (a.end_time - a.start_time))::int / 60) / a.slot_minutes - 1) k
  ) x
  where x.ts > now() + interval '30 minutes'
    and not exists (select 1 from vet_slots s where s.vet_id = p_vet and s.starts_at = x.ts)
    and not exists (select 1 from vet_slot_exceptions e where e.vet_id = p_vet and e.starts_at = x.ts);
  get diagnostics n = row_count;
  return n;
end $$;

-- Set (or clear, with an empty p_days) the weekly schedule. Unbooked schedule slots are rebuilt; booked ones are never touched.
create or replace function public.vet_set_availability(p_days int[], p_start time, p_end time, p_slot_minutes int default 60) returns int
language plpgsql security definer set search_path = public as $$
declare v uuid := public.vet_self(); v_has boolean := coalesce(array_length(p_days, 1), 0) > 0;
begin
  if v is null then raise exception 'VET_NOT_APPROVED'; end if;
  if v_has then
    if exists (select 1 from unnest(p_days) d where d not between 0 and 6) then raise exception 'INVALID_TYPE'; end if;
    if p_slot_minutes not in (30, 45, 60, 90) then raise exception 'INVALID_TYPE'; end if;
    if p_start is null or p_end is null or p_end < p_start + make_interval(mins => p_slot_minutes) then raise exception 'INVALID_HOURS'; end if;
  end if;
  delete from vet_availability where vet_id = v;
  if v_has then
    insert into vet_availability (vet_id, weekday, start_time, end_time, slot_minutes)
    select v, d, p_start, p_end, p_slot_minutes from (select distinct unnest(p_days) as d) t;
  end if;
  delete from vet_slots where vet_id = v and source = 'schedule' and not booked and starts_at > now();
  delete from vet_slot_exceptions where vet_id = v;   -- a new schedule starts clean
  return vet_generate_slots(v);
end $$;

-- Top up the next 4 weeks. Called when the vet opens their desk and when a farmer opens a vet's page,
-- so a vet who hasn't opened the app for a while still has slots to book.
create or replace function public.vet_refresh_slots(p_vet uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v uuid := coalesce(p_vet, public.vet_self());
begin
  if v is null or not exists (select 1 from vets where id = v and verified) then return 0; end if;
  return vet_generate_slots(v);
end $$;

-- Removing one schedule slot remembers it, so the top-up doesn't reopen that particular time.
create or replace function public.vet_remove_slot(p_slot uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s vet_slots;
begin
  delete from vet_slots where id = p_slot and vet_id = public.vet_self() and not booked returning * into s;
  if s.id is null then raise exception 'SLOT_BOOKED'; end if;
  if s.source = 'schedule' then
    insert into vet_slot_exceptions (vet_id, starts_at) values (s.vet_id, s.starts_at) on conflict do nothing;
  end if;
end $$;

-- Same as migration 008, plus the weekly schedule and each slot's source.
create or replace function public.vet_desk() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v vets;
begin
  select * into v from vets where user_id = auth.uid();
  if v.id is null then return null; end if;
  return jsonb_build_object(
    'vet', to_jsonb(v) - 'licence_doc_path',
    'balance', coalesce((select balance from wallets where user_id = auth.uid()), 0),
    'earned', coalesce((select sum(amount) from transactions where user_id = auth.uid() and type = 'payout' and label like 'Consult fee%'), 0),
    'availability', (select jsonb_build_object('days', jsonb_agg(a.weekday order by a.weekday), 'start', to_char(min(a.start_time), 'HH24:MI'),
                       'end', to_char(max(a.end_time), 'HH24:MI'), 'slot_minutes', max(a.slot_minutes))
                       from vet_availability a where a.vet_id = v.id having count(*) > 0),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'booked', s.booked, 'source', s.source) order by s.starts_at)
                         from vet_slots s where s.vet_id = v.id and s.starts_at > now() - interval '1 hour'), '[]'::jsonb),
    'consultations', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'type', k.type, 'status', k.status,
        'at', coalesce(k.proposed_at, k.requested_date::timestamptz), 'requested_date', k.requested_date, 'location', k.location, 'notes', k.notes,
        'summary', k.summary, 'meeting_url', k.meeting_url, 'fee', k.fee, 'net', round(coalesce(k.fee, 0) * 0.9, 2), 'created_at', k.created_at,
        'farmer', coalesce(vp.business_name, p.full_name, 'Farmer'), 'farmer_phone', p.phone,
        'flock', case when f.id is null then null else coalesce(f.code, '') || ' · ' || f.type || ' · ' || f.size || ' birds' end)
        order by (k.status in ('requested','proposed','confirmed')) desc, coalesce(k.proposed_at, k.created_at) desc)
      from consultations k join profiles p on p.id = k.farmer_id
      left join vendor_profiles vp on vp.user_id = k.farmer_id left join flocks f on f.id = k.flock_id
      where k.vet_id = v.id), '[]'::jsonb));
end $$;

-- Internal: only callable from the functions above
revoke execute on function public.vet_generate_slots(uuid) from public, anon, authenticated;
