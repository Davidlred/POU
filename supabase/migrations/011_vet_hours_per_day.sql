-- =====================================================================
-- Poultry360 · migration 011: vets set different hours for each day
-- e.g. Tuesday 09:00–15:00, Wednesday 10:00–13:00, Friday 12:00–18:00.
-- Requires 010. Safe to run more than once.
-- (A fresh project only needs schema.sql, which already includes this.)
-- =====================================================================

-- p_windows: [{"weekday": 2, "start": "09:00", "end": "15:00"}, …]  (weekday 0 = Sunday … 6 = Saturday, Nigerian time).
-- An empty array turns the weekly schedule off. The consult length is the same on every day.
-- Unbooked schedule slots are rebuilt; booked slots and one-off slots are never touched.
create or replace function public.vet_set_weekly(p_windows jsonb, p_slot_minutes int default 60) returns int
language plpgsql security definer set search_path = public as $$
declare v uuid := public.vet_self(); w jsonb; v_day int; v_start time; v_end time;
begin
  if v is null then raise exception 'VET_NOT_APPROVED'; end if;
  if p_slot_minutes not in (30, 45, 60, 90) then raise exception 'INVALID_TYPE'; end if;
  if jsonb_typeof(coalesce(p_windows, '[]'::jsonb)) <> 'array' then raise exception 'INVALID_TYPE'; end if;
  -- Check everything before changing anything, so a bad day can't leave half a schedule behind.
  for w in select * from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) loop
    v_day := (w->>'weekday')::int; v_start := (w->>'start')::time; v_end := (w->>'end')::time;
    if v_day is null or v_day not between 0 and 6 then raise exception 'INVALID_TYPE'; end if;
    if v_start is null or v_end is null or v_end < v_start + make_interval(mins => p_slot_minutes) then raise exception 'INVALID_HOURS'; end if;
  end loop;
  if (select count(*) <> count(distinct (x->>'weekday')) from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) x) then raise exception 'INVALID_TYPE'; end if;

  delete from vet_availability where vet_id = v;
  insert into vet_availability (vet_id, weekday, start_time, end_time, slot_minutes)
  select v, (x->>'weekday')::int, (x->>'start')::time, (x->>'end')::time, p_slot_minutes
    from jsonb_array_elements(coalesce(p_windows, '[]'::jsonb)) x;
  delete from vet_slots where vet_id = v and source = 'schedule' and not booked and starts_at > now();
  delete from vet_slot_exceptions where vet_id = v;   -- a new schedule starts clean
  return vet_generate_slots(v);
end $$;

-- Same as migration 010, but "availability" now lists each day's own hours:
-- { "slot_minutes": 60, "windows": [{ "weekday": 2, "start": "09:00", "end": "15:00" }, …] }  (null when no schedule is set)
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
    'availability', (select jsonb_build_object('slot_minutes', max(a.slot_minutes),
                       'windows', jsonb_agg(jsonb_build_object('weekday', a.weekday, 'start', to_char(a.start_time, 'HH24:MI'), 'end', to_char(a.end_time, 'HH24:MI')) order by a.weekday))
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
