import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme, Screen, AppBar, Txt, Button, Card, Icon, Banner, ChipRow, Segmented, Pill, isoDate, shortDate } from '@p360/shared';
import { useFarm, save, flockStats } from '../lib/offlineQueue';
import { askForNotifications } from '../lib/reminders';
import { GUIDE_COPY, BIRDS, HEALTH, FEEDS, FEED_RULES, VACCINE_NOTES, EXPECT, ageDays, ageLabel, addDays, missingVaccinations, rowStatus, feedStage, feedNeed } from '../lib/careGuide';

const VIEWS = [{ value: 'health', label: 'Vaccines' }, { value: 'feed', label: 'Feed' }, { value: 'expect', label: 'Output' }];
const TYPE_OPTIONS = [{ value: 'broilers', label: 'Broilers' }, { value: 'layers', label: 'Layers' }];
const ALL = 'General chart';
const kg = (n) => Number(n).toLocaleString('en-NG', { maximumFractionDigits: 1 });

// Vaccination, routine drug and feed chart by bird type and age. With one of the farmer's flocks picked,
// it shows real dates, where the flock is today, and can put the vaccines on that flock's schedule.
export function CareGuideScreen({ navigation, route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const today = isoDate();
  const flocks = data.flocks.filter((f) => f.status !== 'inactive' && BIRDS[f.type]);
  const first = flocks.find((f) => f.id === route.params?.flockId) || flocks[0];
  const [type, setType] = useState(first?.type || 'broilers');
  const [flockId, setFlockId] = useState(first?.id || null);
  const [view, setView] = useState(route.params?.view || 'health');
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);

  const mine = flocks.filter((f) => f.type === type);
  const flock = mine.find((f) => f.id === flockId) || null;
  const age = flock ? ageDays(flock, today) : null;
  const birds = flock ? flockStats(flock, data.farm_logs).alive : 100;
  const bird = BIRDS[type];
  const missing = flock ? missingVaccinations(flock, data.vaccinations, today) : [];

  const pickType = (t) => { setType(t); setFlockId(flocks.find((f) => f.type === t)?.id || null); setAdded(0); };
  const addAll = async () => {
    setBusy(true);
    for (const m of missing) await save('vaccinations', { flock_id: flock.id, vaccine: m.vaccine, scheduled_date: m.scheduled_date });
    setAdded(missing.length); setBusy(false);
    askForNotifications();   // so the phone can remind them 2 days before and on the day
  };

  const STATUS = { given: ['ok', 'Given'], scheduled: ['neutral', 'On your schedule'], now: ['warn', 'Due now'], next: ['neutral', null], past: ['neutral', 'Age passed'] };
  const healthRow = (it, i) => {
    const st = flock ? rowStatus(it, flock, data.vaccinations, today) : null;
    const dated = flock && !it.laying && !it.hatchery;
    const when = !dated ? null : it.repeatDays ? 'First on ' + shortDate(addDays(flock.start_date, it.day)) : shortDate(addDays(flock.start_date, it.day)) + (it.to ? ' to ' + shortDate(addDays(flock.start_date, it.to)) : '');
    const label = st ? (st === 'next' ? when : STATUS[st][1]) : null;
    return (
      <Card key={it.name + i} tone={st === 'now' ? 'warn' : undefined} style={st === 'past' || st === 'given' ? { opacity: 0.7 } : null}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Icon name={it.kind === 'vaccine' ? 'needle' : 'pill'} size={18} color={it.kind === 'vaccine' ? c.acc : c.mute} />
          <Txt v="label" style={{ flex: 1 }}>{ageLabel(it)} · {it.kind === 'vaccine' ? 'Vaccine' : 'Drug / care'}</Txt>
          {label ? <Pill tone={STATUS[st][0]} label={label} /> : null}
        </View>
        <Txt v="bold">{it.name}</Txt>
        <Txt v="small">{it.route} · {it.against}</Txt>
        {st && st !== 'next' && when ? <Txt v="small" color={c.mute}>{when}</Txt> : null}
        {it.note ? <Txt v="small" color={c.mute}>{it.note}</Txt> : null}
      </Card>
    );
  };

  const feedCard = (s) => {
    const on = flock && feedStage(type, age) === s;
    const need = feedNeed(s, birds);
    const span = s.to == null ? 'From week ' + (Math.floor(s.from / 7) + 1) + (type === 'broilers' ? ' to sale' : ' onwards') : 'Weeks ' + (Math.floor(s.from / 7) + 1) + ' to ' + Math.round(s.to / 7);
    return (
      <Card key={s.name} tone={on ? 'ok' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Icon name="sack" size={18} color={c.acc} /><Txt v="label" style={{ flex: 1 }}>{span}</Txt>
          {on ? <Pill tone="ok" label={flock.code + ' is here'} /> : null}
        </View>
        <Txt v="bold">{s.name}</Txt>
        <Txt v="small">{s.form} · {s.protein}</Txt>
        {s.note ? <Txt v="small" color={c.mute}>{s.note}</Txt> : null}
        <View style={{ backgroundColor: c.sf2, borderRadius: 12, padding: 10, gap: 2 }}>
          <Txt v="label">{flock ? 'For your ' + birds.toLocaleString() + ' birds' : 'For every 100 birds'}</Txt>
          {need.perDayKg != null
            ? <Txt v="small"><Txt v="mono">{kg(need.perDayKg)} kg</Txt> a day{need.bagEveryDays >= 1 ? ' · one 25 kg bag every ' + kg(need.bagEveryDays) + ' days' : ' · ' + kg(need.perDayKg / 25) + ' bags a day'}</Txt>
            : <Txt v="small"><Txt v="mono">{kg(need.totalKg)} kg</Txt> · about <Txt v="mono">{need.bags}</Txt> bags (25 kg)</Txt>}
        </View>
      </Card>
    );
  };

  const ex = EXPECT[type];
  return (
    <Screen scroll>
      <AppBar title="Vaccine & feed chart" />
      <Segmented options={TYPE_OPTIONS} value={type} onChange={pickType} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={bird.icon} size={28} color={c.acc} />
        <View style={{ flex: 1 }}><Txt v="bold">{bird.label} · {bird.purpose}</Txt><Txt v="small">{bird.cycle}</Txt></View>
      </Card>
      {mine.length ? <ChipRow options={[...mine.map((f) => f.code), ALL]} value={flock ? flock.code : ALL} onChange={(v) => { setFlockId(mine.find((f) => f.code === v)?.id || null); setAdded(0); }} /> : null}
      {flock ? <Txt v="small">{flock.code} · day {age} (week {Math.floor(age / 7) + 1}) · {birds.toLocaleString()} birds</Txt>
        : !mine.length ? <Txt v="small">{'Add a ' + (type === 'broilers' ? 'broiler' : 'layer') + ' flock in Farm Hub to see its dates.'}</Txt> : null}
      <Segmented options={VIEWS} value={view} onChange={setView} />

      {view === 'health' ? <>
        <Txt v="small" color={c.mute}>{GUIDE_COPY}</Txt>
        {flock && missing.length ? <Button icon="calendar-plus" loading={busy} disabled={busy} title={'Add ' + missing.length + ' vaccination' + (missing.length === 1 ? '' : 's') + ' to ' + flock.code + "'s schedule"} onPress={addAll} /> : null}
        {flock && added ? <Banner tone="ok" title={added + ' added. You will get reminders.'} action="See schedule" onAction={() => navigation.navigate('Vaccinations', { flockId: flock.id })} /> : null}
        {HEALTH[type].map(healthRow)}
        <Txt v="label">Handling</Txt>
        <Card>{VACCINE_NOTES.map((n) => <View key={n} style={{ flexDirection: 'row', gap: 8 }}><Icon name="check" size={16} color={c.sage} /><Txt v="small" style={{ flex: 1 }}>{n}</Txt></View>)}</Card>
        <Button variant="outline" icon="storefront-outline" title="Shop for drugs & vaccines" onPress={() => navigation.navigate('Listings', { category: 'drugs' })} />
      </> : null}

      {view === 'feed' ? <>
        {FEEDS[type].map(feedCard)}
        <Txt v="small" color={c.mute}>Amounts are estimates.</Txt>
        <Card>{FEED_RULES.map((n) => <View key={n} style={{ flexDirection: 'row', gap: 8 }}><Icon name="check" size={16} color={c.sage} /><Txt v="small" style={{ flex: 1 }}>{n}</Txt></View>)}</Card>
        <Button variant="outline" icon="storefront-outline" title="Shop for feed" onPress={() => navigation.navigate('Listings', { category: 'feed' })} />
      </> : null}

      {view === 'expect' ? <>
        <Txt v="label">{ex.title}</Txt>
        <Card>{ex.rows.map(([a, b], i) => (
          <View key={a} style={{ flexDirection: 'row', gap: 12, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            <Txt v="bold" style={{ width: 110, fontSize: 14 }}>{a}</Txt><Txt v="small" style={{ flex: 1 }}>{b}</Txt>
          </View>))}</Card>
        <Txt v="small" color={c.mute}>{ex.note}</Txt>
        <Txt v="small" color={c.mute}>{ex.unit}</Txt>
      </> : null}
    </Screen>
  );
}
