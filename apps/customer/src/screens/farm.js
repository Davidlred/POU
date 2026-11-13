import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Linking, Alert } from 'react-native';
import { Press as Pressable } from '@p360/shared';
import { useWide, HeaderBar, SectionHead, FigureStrip, BarChart, DataTable, MeterBar, UnderTabs, PlaceholderArt, usePage, useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Stat, Group, Row, naira, isoDate, shortDate, timeAgo, supabase, rpc, Fab } from '@p360/shared';
import { useFarm, save, retryFailed, discardFailed, flockStats } from '../lib/offlineQueue';
import { itemAlert, perKg, stockKg, afterUsing } from './inventory';
import { isClosed, flockSummary, series, farmTotals } from '../lib/flockHistory';
import { askForNotifications, notificationsAllowed } from '../lib/reminders';
import { useAuth } from '../context/AuthContext';
import { FarmBookScreen } from './farmbook';
import { InventoryScreen } from './inventory';
import { VetHomeScreen } from './vet';
import { TopBar } from '../components/RoleSwitcher';

const TYPES = [['layers', 'Layers', 'egg-outline'], ['broilers', 'Broilers', 'food-drumstick-outline'], ['turkey', 'Turkey', 'turkey']];
const BREEDS = { layers: ['Isa Brown', 'Lohmann Brown', 'Noiler'], broilers: ['Ross 308', 'Cobb 500', 'Arbor Acres'], turkey: ['Bronze', 'White Holland', 'Local'] };

export function SyncBar({ quiet }) {
  const { c } = useTheme();
  const st = useFarm();
  if (st.failed.length) return <Banner tone="err" icon="sync-alert" title={'Sync failed for ' + st.failed.length + ' entr' + (st.failed.length > 1 ? 'ies' : 'y')} body={st.failed[0].error} action="Retry" onAction={retryFailed} />;
  if (!st.online) return <Banner tone="warn" icon="cloud-off-outline" title={'Offline · ' + st.pending + ' entr' + (st.pending === 1 ? 'y' : 'ies') + ' saved on this phone'} body="They'll sync automatically when you're back online." />;
  if (st.pending) return <Banner tone="warn" icon="cloud-upload-outline" title={st.pending + ' entries waiting to sync'} />;
  return st.lastSync && !quiet ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="cloud-check-outline" size={16} color={c.sage} /><Txt v="small" color={c.sage}>All synced · {timeAgo(st.lastSync)}</Txt></View> : null;
}

function Bars({ values, highlightLast = true }) {
  const { c } = useTheme();
  const max = Math.max(1, ...values);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 110 }}>
      {values.map((v, i) => <View key={i} style={{ flex: 1, height: Math.max(4, (v / max) * 110), borderRadius: 4, backgroundColor: highlightLast && i === values.length - 1 ? c.ember : c.sf2 }} />)}
    </View>
  );
}

const dmy = (d) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
const qty = (n) => Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 1 });

// A closed flock, summed up in one card. Its whole record stays one tap away.
function PastFlockCard({ f, s, onPress }) {
  return (
    <Card onPress={onPress}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><Txt v="bold" style={{ flex: 1 }}>{f.code} · {f.breed || f.type}</Txt><Pill label="Closed" /></View>
      <Txt v="label">{dmy(s.start)} to {dmy(s.end)} · {s.weeks} week{s.weeks === 1 ? '' : 's'}</Txt>
      <Txt v="small">{qty(s.started)} birds · {s.mortality.toFixed(1)}% mortality · {qty(s.output)} {s.outputUnit} · costs {naira(s.totalCost)}</Txt>
    </Card>
  );
}

// The sync state as one pill: synced / waiting / offline / failed (Retry).
function SyncPill() {
  const st = useFarm();
  if (st.failed.length) return <Pressable onPress={retryFailed} accessibilityRole="button"><Pill tone="err" icon="sync-alert" label={'Sync failed · Retry'} /></Pressable>;
  if (!st.online) return <Pill tone="warn" icon="cloud-off-outline" label={'Offline · ' + st.pending + ' saved on this phone'} />;
  if (st.pending) return <Pill tone="warn" icon="cloud-upload-outline" label={st.pending + ' waiting to sync'} />;
  return st.lastSync ? <Pill tone="ok" icon="cloud-check-outline" label={'Synced ' + timeAgo(st.lastSync)} /> : null;
}

// Farm Hub: Flocks · Farm Book · Inventory · Vet care. The Flocks tab shows one flock's page; chips switch flock.
export function FarmHomeScreen({ navigation, route }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const { data } = useFarm();
  const { bookName } = useAuth();
  const [tab, setTab] = useState(route?.params?.tab || 'flocks');
  useEffect(() => { if (route?.params?.tab) setTab(route.params.tab); }, [route?.params?.tab]);
  const running = data.flocks.filter((f) => !isClosed(f));
  const pastCount = data.flocks.length - running.length;
  const [sel, setSel] = useState(null);
  const flock = running.find((f) => f.id === sel) || running[0] || null;
  const stockAlerts = (data.farm_inventory || []).filter((x) => x.status !== 'removed').filter(itemAlert).length;
  const tabs = [{ value: 'flocks', label: 'Flocks' }, { value: 'book', label: bookName }, { value: 'inventory', label: 'Inventory', count: stockAlerts }, { value: 'vet', label: 'Vet care' }];
  const flocks = !data.flocks.length ? (
    <Empty art="bird" title="Start with your first flock" body="Add a batch to log eggs, feed, losses and costs. Works without signal." action="Add a flock" onAction={() => navigation.navigate('FlockForm')} />
  ) : <>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: wide ? 0 : 20 }} style={wide ? null : { marginRight: -20 }}>
      {running.map((f) => <Chip key={f.id} label={f.code + ' · ' + (f.breed || f.type)} selected={flock?.id === f.id} onPress={() => setSel(f.id)} />)}
      <Chip icon="plus" label="New flock" onPress={() => navigation.navigate('FlockForm')} />
      {pastCount ? <Chip icon="archive-outline" label={'Past flocks · ' + pastCount} onPress={() => navigation.navigate('FlockHistory')} /> : null}
    </ScrollView>
    {flock ? <FlockView f={flock} navigation={navigation} /> : (
      <Card style={{ gap: 10, padding: 18 }}>
        <Txt v="h2">No flocks running right now</Txt>
        <Txt v="small">Everything from your past flocks is kept in Past flocks and the dashboard.</Txt>
        <Button small icon="plus" title="Start a new flock" onPress={() => navigation.navigate('FlockForm')} style={{ alignSelf: 'flex-start', paddingHorizontal: 18 }} />
      </Card>
    )}
  </>;
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: wide ? 24 : 16, paddingBottom: 60 }, page]}>
        {!wide ? <TopBar navigation={navigation} cart={false} /> : null}
        <HeaderBar title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><Txt v="display">Farm Hub</Txt><SyncPill /></View>}>
          {data.flocks.length ? <Button small variant="outline" icon="chart-bar" title="Dashboard" onPress={() => navigation.navigate('FarmDashboard')} style={{ paddingHorizontal: 16 }} /> : null}
          {wide ? <Button small icon="plus" title="New flock" onPress={() => navigation.navigate('FlockForm')} style={{ paddingHorizontal: 18 }} /> : null}
        </HeaderBar>
        <SyncBar quiet />
        <UnderTabs tabs={tabs} value={tab} onChange={setTab} />
        {tab === 'flocks' ? flocks : tab === 'book' ? <FarmBookScreen navigation={navigation} embedded />
          : tab === 'inventory' ? <InventoryScreen navigation={navigation} route={{ params: {} }} embedded /> : <VetHomeScreen navigation={navigation} embedded />}
      </ScrollView>
    </Screen>
  );
}

// Every flock you have closed, with its totals. Nothing here is ever deleted.
export function FlockHistoryScreen({ navigation }) {
  const { data } = useFarm();
  const past = useMemo(() => data.flocks.filter(isClosed).map((f) => ({ f, s: flockSummary(f, data.farm_logs) })).sort((a, b) => (a.s.end < b.s.end ? 1 : -1)), [data]);
  const total = (k) => past.reduce((n, x) => n + x.s[k], 0);
  const eggs = past.filter((x) => x.s.outputUnit === 'eggs').reduce((n, x) => n + x.s.output, 0);
  const meat = past.filter((x) => x.s.outputUnit === 'kg').reduce((n, x) => n + x.s.output, 0);
  return (
    <Screen scroll>
      <AppBar title="Flock history" subtitle={past.length + ' closed flock' + (past.length === 1 ? '' : 's')} />
      {!past.length ? <Empty icon="archive-outline" title="No closed flocks yet" body="When you close out a flock, its full record of feed, output, mortality and costs is kept here." /> : <>
        <FigureStrip items={[{ label: 'Birds raised', value: qty(total('started')), icon: 'bird' }, { label: 'Feed used', value: qty(total('feedKg')) + ' kg', icon: 'sack' }, ...(eggs ? [{ label: 'Eggs', value: qty(eggs), icon: 'egg-outline' }] : []), ...(meat ? [{ label: 'Meat', value: qty(meat) + ' kg', icon: 'scale' }] : []), { label: 'Total costs', value: naira(total('totalCost')), icon: 'cash' }]} />
        {past.map(({ f, s }) => <PastFlockCard key={f.id} f={f} s={s} onPress={() => navigation.navigate('FlockDetail', { id: f.id })} />)}
        <Button variant="outline" icon="chart-bar" title="Open the dashboard" onPress={() => navigation.navigate('FarmDashboard')} />
      </>}
    </Screen>
  );
}

export function FlockFormScreen({ navigation }) {
  const { data } = useFarm();
  const [type, setType] = useState('layers'); const [breed, setBreed] = useState('Isa Brown'); const [size, setSize] = useState(''); const [start, setStart] = useState(isoDate()); const [errs, setErrs] = useState({});
  const submit = async () => {
    const e = {};
    if (!(parseInt(size, 10) > 0)) e.size = 'Enter the number of birds';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) e.start = 'Use YYYY-MM-DD';
    else if (start > isoDate()) e.start = "Start date can't be in the future";
    setErrs(e); if (Object.keys(e).length) return;
    const n = data.flocks.filter((f) => f.type === type).length + 1;
    await save('flocks', { type, breed, size: parseInt(size, 10), start_date: start, status: 'active', code: type[0].toUpperCase() + '-' + String(n).padStart(2, '0') });
    navigation.goBack();
  };
  return (
    <Screen scroll footer={<Button title="Save flock" onPress={submit} />}>
      <AppBar title="New flock" close />
      <Txt v="strong" style={{ fontSize: 13 }}>Type</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>{TYPES.map(([id, l]) => <Chip key={id} label={l} selected={type === id} onPress={() => { setType(id); setBreed(BREEDS[id][0]); }} />)}</View>
      <Txt v="strong" style={{ fontSize: 13 }}>Breed</Txt>
      <ChipRow options={BREEDS[type]} value={breed} onChange={setBreed} />
      <Input label="Batch size" keyboardType="number-pad" value={size} onChangeText={(t) => setSize(t.replace(/\D/g, ''))} suffix="birds" mono error={errs.size} />
      <DateInput label="Start date" value={start} onChange={(v) => { setStart(v); setErrs((e) => ({ ...e, start: undefined })); }} max={isoDate()} error={errs.start} />
    </Screen>
  );
}

const LAYER_FEED_GUIDE = [110, 125];   // grams per bird per day, laying hens

// One flock's page: header with log buttons, five figures, a chart, vaccinations and feed in store, recent entries.
function FlockView({ f, navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const { data } = useFarm();
  const [tab, setTab] = useState(f.type === 'layers' ? 'production' : 'feed');
  const logs = useMemo(() => data.farm_logs.filter((l) => l.flock_id === f.id).sort((a, b) => (a.log_date < b.log_date ? 1 : -1)), [data, f.id]);
  const closed = isClosed(f);
  const s = flockStats(f, data.farm_logs);
  const sum = flockSummary(f, data.farm_logs);
  const today = isoDate();
  const since7 = isoDate(new Date(Date.now() - 6 * 864e5));
  const total = (kind, key, from) => logs.filter((l) => l.kind === kind && (!from || l.log_date >= from)).reduce((t, l) => t + Number(l[key] || 0), 0);
  const eggsToday = logs.filter((l) => l.kind === 'production' && l.log_date === today).reduce((t, l) => t + Number(l.quantity || 0), 0);
  const feed7 = total('feed', 'quantity', since7);
  const gPerBird = s.alive && feed7 ? Math.round((feed7 * 1000) / s.alive / 7) : null;
  const inGuide = gPerBird != null && f.type === 'layers' ? gPerBird >= LAYER_FEED_GUIDE[0] && gPerBird <= LAYER_FEED_GUIDE[1] : null;
  const figures = [
    { label: 'Birds alive', value: qty(s.alive), note: 'of ' + qty(sum.started) + ' started', icon: 'bird' },
    { label: 'Mortality', value: s.mortality.toFixed(1) + '%', note: s.mortality < 5 ? 'Within the 5% guide' : 'Above the 5% guide', tone: s.mortality < 5 ? 'ok' : 'warn', icon: 'heart-pulse' },
    f.type === 'layers'
      ? { label: 'Eggs today', value: qty(eggsToday), note: s.alive ? 'Lay rate ' + Math.round((eggsToday / s.alive) * 100) + '%' : null, icon: 'egg-outline' }
      : { label: 'Output, 7 days', value: qty(total('production', 'quantity', since7)) + ' kg', note: 'Weighed or sold', icon: 'scale' },
    { label: 'Feed per bird', value: gPerBird != null ? gPerBird + ' g' : '–', note: f.type === 'layers' ? 'Guide ' + LAYER_FEED_GUIDE[0] + ' to ' + LAYER_FEED_GUIDE[1] + ' g a day' : 'A day, last 7 days', tone: inGuide == null ? 'mute' : inGuide ? 'ok' : 'warn', icon: 'sack' },
    { label: 'Cost so far', value: naira(sum.totalCost), note: sum.started ? naira(sum.totalCost / sum.started) + ' a bird' : null, icon: 'cash' },
  ];
  // chart
  const kind = { production: 'production', feed: 'feed', health: 'mortality', expenses: 'expense' }[tab];
  const rows = logs.filter((l) => l.kind === kind);
  const value = (l) => Number(tab === 'feed' || tab === 'expenses' ? (tab === 'feed' ? l.quantity : l.cost) : l.quantity);
  const days = Array.from({ length: 14 }).map((_, i) => isoDate(new Date(Date.now() - (13 - i) * 864e5)));
  const raw = closed ? series(rows, value, sum.start, sum.end) : days.map((d) => rows.filter((l) => l.log_date === d).reduce((a, l) => a + value(l), 0));
  const unit = tab === 'production' ? (f.type === 'layers' ? 'eggs' : 'kg') : tab === 'feed' ? 'kg' : tab === 'health' ? 'birds' : '';
  const fmt = (v) => (tab === 'expenses' ? naira(v) : qty(v) + ' ' + unit);
  const bars = raw.map((v, i) => ({ label: closed ? '' : String(new Date(days[i] + 'T12:00:00').getDate()), value: v, text: tab === 'expenses' ? naira(v) : qty(v) }));
  const chartTotal = raw.reduce((a, b) => a + b, 0);
  const chartLabel = { production: f.type === 'layers' ? 'Eggs' : 'Output', feed: 'Feed used', health: 'Birds lost', expenses: 'Costs' }[tab] + (closed ? ', whole flock' : ', last 14 days');
  const vacc = data.vaccinations.filter((v) => v.flock_id === f.id && !v.administered_date).sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1));
  const due = vacc.filter((v) => v.scheduled_date <= today);
  const later = vacc.filter((v) => v.scheduled_date > today).slice(0, 4);
  const feeds = (data.farm_inventory || []).filter((x) => x.category === 'feed' && x.status !== 'removed');
  const markDone = async (v) => {
    if (v.scheduled_date > today) return;   // not before the day it is due
    await save('vaccinations', { ...v, _pending: undefined, _failed: undefined, administered_date: today });
    save('health_records', { flock_id: v.flock_id, source: 'vaccination', author: 'Self', title: v.vaccine + ' administered' });
  };
  const setStatus = (status) => save('flocks', { ...f, _pending: undefined, _failed: undefined, status });
  const close = () => Alert.alert('Close out ' + f.code + '?', 'Use this when the flock is sold or finished. Every feed, output, loss and cost entry is kept, and you can reopen it.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Close out', onPress: () => setStatus('inactive') }]);
  const reopen = () => Alert.alert('Reopen ' + f.code + '?', 'It goes back to your running flocks so you can keep logging.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reopen', onPress: () => setStatus('active') }]);
  const log = (k) => navigation.navigate('Log', { flockId: f.id, kind: k });
  const logButtons = closed ? null : (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button small icon={f.type === 'layers' ? 'egg-outline' : 'scale'} title={f.type === 'layers' ? 'Log eggs' : 'Log output'} onPress={() => log('production')} style={{ paddingHorizontal: 16 }} />
      <Button small variant="outline" icon="sack" title="Feed" onPress={() => log('feed')} style={{ paddingHorizontal: 14 }} />
      <Button small variant="outline" icon="heart-minus-outline" title="Loss" onPress={() => log('mortality')} style={{ paddingHorizontal: 14 }} />
      <Button small variant="outline" icon="cash-plus" title="Cost" onPress={() => log('expense')} style={{ paddingHorizontal: 14 }} />
    </View>
  );
  const head = (
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 14 }}>
      <View style={{ flex: wide ? 1 : undefined, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <PlaceholderArt kind={f.type === 'layers' ? 'eggs' : 'bird'} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Txt v="h1">{f.code + ' · ' + (f.breed || f.type)}</Txt>{closed ? <Pill label="Closed" /> : null}{s.pending || f._pending ? <Pill tone="warn" icon="cloud-upload-outline" label="Saving" /> : null}</View>
          <Txt v="small">{(closed ? sum.weeks + ' weeks · ' + dmy(sum.start) + ' to ' + dmy(sum.end) : (f.type === 'broilers' ? 'Day ' + s.days : 'Week ' + s.week) + ' · started ' + dmy(f.start_date))}</Txt>
        </View>
      </View>
      {logButtons}
    </View>
  );
  const chart = (
    <Card style={{ gap: 14, padding: 18 }}>
      <Segmented options={[{ value: 'production', label: 'Output' }, { value: 'feed', label: 'Feed' }, { value: 'health', label: 'Health' }, { value: 'expenses', label: 'Costs' }]} value={tab} onChange={setTab} />
      {rows.length ? <BarChart label={chartLabel} value={fmt(chartTotal)} note={closed ? null : 'Today ' + fmt(raw[raw.length - 1])} bars={bars} caption={'One bar a ' + (closed ? 'stretch of the flock\'s life' : 'day') + ' · ' + (tab === 'expenses' ? 'naira' : unit)} />
        : <Empty icon={tab === 'feed' ? 'sack' : tab === 'health' ? 'heart-pulse' : tab === 'production' ? 'egg-outline' : 'cash'} title={'No ' + (tab === 'health' ? 'losses' : tab === 'production' ? 'output' : tab === 'feed' ? 'feed' : 'costs') + (closed ? ' were logged' : ' logged yet')} style={{ borderWidth: 0 }} />}
      {tab === 'health' ? <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Button small variant="outline" icon="folder-heart-outline" title="Health records" onPress={() => navigation.navigate('HealthRecords', { flockId: f.id })} style={{ paddingHorizontal: 14 }} />
        {f.type === 'broilers' || f.type === 'layers' ? <Button small variant="outline" icon="calendar-heart" title="Vaccine chart" onPress={() => navigation.navigate('CareGuide', { flockId: f.id, view: 'health' })} style={{ paddingHorizontal: 14 }} /> : null}
      </View> : null}
    </Card>
  );
  const side = (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        <SectionHead title="Vaccinations" count={due.length} action="All" onAction={() => navigation.navigate('Vaccinations', { flockId: f.id })} />
        {due.map((v) => (
          <View key={v.id} style={{ backgroundColor: c.warnbg, borderRadius: 20, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="alert-outline" size={18} color={c.warn} /><Txt v="bold" color={c.warn} style={{ flex: 1 }}>{v.vaccine}</Txt>
              <Txt v="small" color={c.warn}>{v.scheduled_date < today ? Math.round((Date.now() - new Date(v.scheduled_date)) / 864e5) + ' days late' : 'Due today'}</Txt></View>
            <Button small title="Mark administered" onPress={() => markDone(v)} />
          </View>
        ))}
        {later.length ? <View style={{ backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
          {later.map((v, i) => (
            <View key={v.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              <Icon name="needle" size={18} color={c.mute} /><Txt v="strong" style={{ flex: 1 }} numberOfLines={1}>{v.vaccine}</Txt><Txt v="small">{shortDate(v.scheduled_date)}</Txt>
            </View>))}
        </View> : !due.length ? <Txt v="small">Nothing scheduled. Add vaccinations from the vaccine chart in one tap.</Txt> : null}
      </View>
      <View style={{ gap: 10 }}>
        <SectionHead title="Feed in store" action="Inventory" onAction={() => navigation.navigate('Inventory', { tab: 'feed' })} />
        {feeds.length ? feeds.map((x) => {
          const a = itemAlert(x);
          const low = a && (a.label === 'Running low' || a.label === 'Out of stock');
          const fill = Number(x.low_at) > 0 ? Number(x.quantity) / (Number(x.low_at) * 4) : Number(x.quantity) > 0 ? 1 : 0;
          return (
            <View key={x.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Txt v="strong" style={{ flex: 1 }} numberOfLines={1}>{x.name}</Txt>
                {low ? <Pill tone="warn" icon="alert-outline" label={a.label} /> : null}
                <Txt v="mono">{qty(x.quantity) + ' ' + (x.unit || '')}</Txt>
              </View>
              <MeterBar pct={fill} low={!!low} />
            </View>
          );
        }) : <Txt v="small">Add your feed and the price of a bag in Inventory, so feed costs work themselves out.</Txt>}
      </View>
    </View>
  );
  const entries = (
    <View style={{ gap: 12 }}>
      <SectionHead title="Recent entries" />
      <DataTable minWidth={560} columns={[{ label: 'Date', flex: 0.9 }, { label: 'Entry', flex: 1.6 }, { label: 'Amount', flex: 1.2, right: true }, { label: '', width: 40, right: true }]}
        rows={logs.slice(0, 12).map((l) => ({ key: l.id, cells: [
          <Txt v="small">{shortDate(l.log_date)}</Txt>,
          <Txt v="strong" numberOfLines={1}>{({ production: f.type === 'layers' ? 'Eggs' : 'Output', feed: 'Feed', mortality: 'Loss', expense: 'Cost' }[l.kind] || l.kind) + (l.cause ? ' · ' + l.cause : '')}</Txt>,
          <Txt v="mono">{l.kind === 'expense' ? naira(l.cost) : l.kind === 'feed' ? qty(l.quantity) + ' kg' + (l.cost ? ' · ' + naira(l.cost) : '') : qty(l.quantity) + ' ' + (l.unit || (l.kind === 'mortality' ? 'birds' : ''))}</Txt>,
          l._failed ? <Icon name="sync-alert" size={18} color={c.err} /> : l._pending ? <Icon name="cloud-upload-outline" size={18} color={c.warn} /> : <Icon name="cloud-check-outline" size={18} color={c.sage} />] }))}
        empty={<Empty icon="notebook-outline" title="No entries yet" body="Log eggs, feed, losses and costs as they happen. It works without signal." style={{ borderWidth: 0 }} />} />
    </View>
  );
  return (
    <View style={{ gap: wide ? 24 : 18 }}>
      {head}
      {closed ? <Banner tone="info" icon="archive-outline" title={'Closed on ' + dmy(sum.end)} body="The full record is kept. Nothing was deleted." /> : null}
      <FigureStrip items={figures} />
      {wide ? <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}><View style={{ flex: 1.6, gap: 24 }}>{chart}{entries}</View><View style={{ flex: 1 }}>{side}</View></View>
        : <>{chart}{side}{entries}</>}
      {closed ? <Button variant="ghost" title="Reopen this flock" onPress={reopen} /> : <Button variant="ghost" title="Close out this flock (sold or finished)" onPress={close} />}
    </View>
  );
}

export function FlockDetailScreen({ navigation, route }) {
  const wide = useWide();
  const { data } = useFarm();
  const f = data.flocks.find((x) => x.id === route.params.id);
  if (!f) return <Screen><AppBar /><Empty icon="egg-off-outline" title="Flock not found" /></Screen>;
  return (
    <Screen scroll style={wide ? { gap: 20 } : null}>
      <AppBar title="Flock" />
      <SyncBar />
      <FlockView f={f} navigation={navigation} />
    </Screen>
  );
}

const CAUSES = ['Disease', 'Heat stress', 'Predator', 'Injury', 'Unknown'];
export function LogScreen({ navigation, route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const { flockId } = route.params;
  const [kind, setKind] = useState(route.params.kind || 'production');
  const f = data.flocks.find((x) => x.id === flockId);
  const s = f ? flockStats(f, data.farm_logs) : { alive: 0 };
  const [qty, setQty] = useState(''); const [cost, setCost] = useState(''); const [cause, setCause] = useState(null); const [date, setDate] = useState(isoDate()); const [err, setErr] = useState(null);
  const n = Number(qty || 0);
  const over = kind === 'mortality' && n > s.alive;
  // Feed is costed from the farm's own inventory: pick the feed, enter kg, and the price per kg does the rest.
  const feeds = (data.farm_inventory || []).filter((x) => x.category === 'feed' && x.status !== 'removed');
  const [feedId, setFeedId] = useState(null);
  const feed = feeds.find((x) => x.id === feedId) || feeds.find((x) => perKg(x)) || feeds[0] || null;
  const price = feed ? perKg(feed) : null;
  const feedCost = price && n > 0 ? Math.round(n * price) : 0;
  const feedBlocked = kind === 'feed' && (!feed || !price);
  const submit = async () => {
    if (kind === 'expense' ? !(Number(cost) > 0) : !(n > 0)) return setErr('Enter a value above 0');
    if (over || feedBlocked) return;
    if (kind === 'feed') {
      await save('farm_logs', { flock_id: flockId, kind, quantity: n, cost: feedCost, cause: feed.name, inventory_id: feed.id, unit_cost: Math.round(price * 100) / 100, log_date: date, unit: 'kg' });
      await save('farm_inventory', { ...feed, _pending: undefined, _failed: undefined, quantity: afterUsing(feed, n) });   // the feed leaves the store
      return navigation.goBack();
    }
    await save('farm_logs', { flock_id: flockId, kind, quantity: kind === 'expense' ? 1 : n, cost: Number(cost || 0), cause: cause || null, log_date: date, unit: kind === 'production' ? (f?.type === 'layers' ? 'eggs' : 'kg') : null });
    navigation.goBack();
  };
  return (
    <Screen scroll footer={<><SyncHint /><Button title="Save entry" disabled={over || feedBlocked} onPress={submit} /></>}>
      <AppBar title={'Log · ' + (f?.code || '')} close />
      <Segmented options={[{ value: 'feed', label: 'Feed' }, { value: 'mortality', label: 'Mortality' }, { value: 'production', label: 'Output' }, { value: 'expense', label: 'Cost' }]} value={kind} onChange={(k) => { setKind(k); setErr(null); setCause(null); }} />
      {kind !== 'expense' ? <Input label={kind === 'feed' ? 'Feed used (kg)' : kind === 'mortality' ? 'Birds lost' : f?.type === 'layers' ? 'Eggs collected' : 'Output (kg)'} keyboardType={kind === 'feed' ? 'decimal-pad' : 'number-pad'} value={qty} onChangeText={(t) => { setQty(t.replace(/[^\d.]/g, '')); setErr(null); }} mono autoFocus
        error={over ? "Can't exceed the " + s.alive.toLocaleString() + ' birds left in this flock' : err} /> : null}
      {kind === 'expense' ? <Input label="Amount" prefix="₦" keyboardType="number-pad" value={cost} onChangeText={(t) => setCost(t.replace(/\D/g, ''))} mono error={err} /> : null}
      {kind === 'mortality' ? <><Txt v="strong" style={{ fontSize: 13 }}>Cause (optional)</Txt><ChipRow options={CAUSES} value={cause} onChange={setCause} /></> : null}
      {kind === 'feed' ? (!feeds.length
        ? <Banner tone="warn" icon="sack" title="Add your feed price first" body="Add the feed in your inventory with the price of one bag. The cost of every feed entry is worked out from it." action="Add feed" onAction={() => navigation.navigate('InventoryForm', { tab: 'feed', from: 'log' })} />
        : <>
          <Txt v="strong" style={{ fontSize: 13 }}>Which feed?</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {feeds.map((x) => <Chip key={x.id} label={x.name} selected={feed?.id === x.id} onPress={() => setFeedId(x.id)} />)}
            <Chip icon="plus" label="Add feed" onPress={() => navigation.navigate('InventoryForm', { tab: 'feed', from: 'log' })} />
          </View>
          {!price
            ? <Banner tone="warn" icon="tag-outline" title={'Add the price for ' + feed.name + ' first'} body="Enter the price of one 25 kg bag. The cost is worked out from it." action="Add price" onAction={() => navigation.navigate('InventoryForm', { id: feed.id, from: 'log' })} />
            : <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Txt v="label">Cost</Txt><Txt v="mono" style={{ fontSize: 20 }}>{naira(feedCost)}</Txt>
              </View>
              {n > stockKg(feed) ? <Txt v="small" color={c.warn}>{'More than the ' + Number(stockKg(feed).toFixed(1)).toLocaleString() + ' kg in your inventory.'}</Txt> : null}
            </Card>}
        </>) : null}
      {kind === 'expense' ? <><Txt v="strong" style={{ fontSize: 13 }}>Type</Txt><ChipRow options={['Vet & drugs', 'Labour', 'Utilities', 'Other']} value={cause} onChange={setCause} /></> : null}
      <DateInput label="Date" value={date} onChange={setDate} max={isoDate()} />
    </Screen>
  );
}
function SyncHint() { const { c } = useTheme(); const st = useFarm(); return !st.online ? <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}><Icon name="cloud-off-outline" size={16} color={c.mute} /><Txt v="small">Offline. This saves on your phone and syncs later.</Txt></View> : null; }

export function VaccinationsScreen({ navigation, route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const flockId = route.params?.flockId;
  const active = data.flocks.filter((f) => f.status !== 'inactive' && (!flockId || f.id === flockId));
  const ids = active.map((f) => f.id);
  const list = data.vaccinations.filter((v) => ids.includes(v.flock_id));
  const today = isoDate();
  const code = (id) => data.flocks.find((f) => f.id === id)?.code;
  const [form, setForm] = useState(false); const [vac, setVac] = useState(''); const [date, setDate] = useState(today); const [fl, setFl] = useState(flockId || active[0]?.id);
  const done = async (v) => {
    if (v.scheduled_date > today) return;   // not before the day it is due
    await save('vaccinations', { ...v, _pending: undefined, _failed: undefined, administered_date: today });
    save('health_records', { flock_id: v.flock_id, source: 'vaccination', author: 'Self', title: v.vaccine + ' administered' });
  };
  const [notif, setNotif] = useState({ granted: true, canAskAgain: true });
  useEffect(() => navigation.addListener('focus', () => { notificationsAllowed().then((g) => setNotif((n) => ({ ...n, granted: g }))); }), [navigation]);
  const allowNotifs = async () => { const p = await askForNotifications(); setNotif(p); if (!p.granted && !p.canAskAgain) Linking.openSettings(); };
  const add = async () => {
    if (!vac.trim() || !fl) return;
    await save('vaccinations', { flock_id: fl, vaccine: vac.trim(), scheduled_date: date });
    setForm(false); setVac('');
    setNotif(await askForNotifications());   // first time: Android asks to allow notifications, so the reminder can be delivered
  };
  const upcoming = list.filter((v) => !v.administered_date && v.scheduled_date >= today);
  const sec = (title, items, tone) => items.length ? <View style={{ gap: 8 }}><Txt v="label" color={tone === 'err' ? c.err : undefined}>{title}</Txt>{items.map((v) => (
    <Card key={v.id} tone={tone === 'err' ? 'err' : undefined}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="bold" style={{ flex: 1 }}>{v.vaccine} · {code(v.flock_id)}</Txt>{tone === 'err' ? <Txt v="label" color={c.err}>{Math.round((Date.now() - new Date(v.scheduled_date)) / 864e5)} days late</Txt> : null}</View>
      <Txt v="small">{v.administered_date ? 'Given ' + shortDate(v.administered_date) + ' · logged to health record' : shortDate(v.scheduled_date) + (tone ? '' : notif.granted ? ' · you\'ll be reminded 2 days before and on the day' : ' · reminders are off')}</Txt>
      {!v.administered_date ? (v.scheduled_date > today
        ? <Button small variant="outline" title={'Can be marked from ' + shortDate(v.scheduled_date)} disabled />
        : <Button small variant={tone === 'err' ? 'dark' : 'outline'} title="Mark administered" onPress={() => done(v)} />) : null}
    </Card>))}</View> : null;
  return (
    <Screen scroll footer={form ? null : <Button icon="plus" title="Schedule a vaccination" disabled={!active.length} onPress={() => setForm(true)} />}>
      <AppBar title="Vaccinations" />
      {form ? <Card>
        <Input label="Vaccine" value={vac} onChangeText={setVac} placeholder="Newcastle (Lasota)" />
        <DateInput label="Date" value={date} onChange={setDate} />
        {!flockId ? <ChipRow options={active.map((f) => f.code)} value={code(fl)} onChange={(cd) => setFl(active.find((f) => f.code === cd)?.id)} /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" title="Cancel" onPress={() => setForm(false)} style={{ flex: 1 }} /><Button small title="Save" onPress={add} style={{ flex: 1 }} /></View>
      </Card> : null}
      {!notif.granted && upcoming.length ? <Banner tone="warn" icon="bell-off-outline" title="Reminders are turned off" body="Allow notifications and your phone will remind you 2 days before each vaccination and on the day." action="Turn on" onAction={allowNotifs} /> : null}
      {!form ? <Card onPress={() => navigation.navigate('CareGuide', { view: 'health', flockId })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name="calendar-heart" size={26} color={c.acc} /><View style={{ flex: 1 }}><Txt v="bold">Vaccination chart</Txt><Txt v="small">By age. Add it to your schedule in one tap.</Txt></View><Icon name="chevron-right" color={c.mute} /></Card> : null}
      {!list.length && !form ? <Empty icon="needle" title="No schedule set" body="Add upcoming vaccinations and your phone will remind you 2 days before and on the day." /> : null}
      {sec('Overdue', list.filter((v) => !v.administered_date && v.scheduled_date < today), 'err')}
      {sec('Upcoming', list.filter((v) => !v.administered_date && v.scheduled_date >= today).sort((a, b) => (a.scheduled_date > b.scheduled_date ? 1 : -1)))}
      {sec('Done', list.filter((v) => v.administered_date), 'done')}
    </Screen>
  );
}

const PERIODS = [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '365', label: '12 months' }, { value: 'all', label: 'All time' }];

export function FarmDashboardScreen({ navigation }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const [period, setPeriod] = useState('30');
  const [rev, setRev] = useState(null);
  const chosen = useRef(false);
  const running = data.flocks.filter((f) => !isClosed(f)).length;
  // With every flock closed, "last 30 days" is usually empty, so start on the whole record instead.
  useEffect(() => { if (!chosen.current && data.flocks.length && !running) setPeriod('all'); }, [data.flocks.length, running]);
  const since = period === 'all' ? null : isoDate(new Date(Date.now() - Number(period) * 864e5));
  useEffect(() => {
    setRev(null);
    let q = supabase.from('transactions').select('amount').eq('type', 'payout');
    if (since) q = q.gte('created_at', since);
    q.then(({ data: d }) => setRev((d || []).reduce((n, t) => n + Number(t.amount), 0)));
  }, [since]);
  const t = useMemo(() => farmTotals(data.flocks, data.farm_logs, since), [data, since]);
  const { feed, vet, other, costs } = t;
  const margin = rev ? ((rev - costs) / rev) * 100 : null;
  const label = PERIODS.find((p) => p.value === period).label;
  return (
    <Screen scroll>
      <AppBar title="Dashboard" subtitle={running + ' running · ' + (data.flocks.length - running) + ' closed'} />
      <Segmented options={PERIODS} value={period} onChange={(v) => { chosen.current = true; setPeriod(v); }} />
      {!data.flocks.length ? <Empty icon="chart-bar" title="Nothing to show yet" body="Add a flock and log feed, output and losses to see your farm's numbers here." /> : <>
        {rev === null ? null : rev > 0 ? (
          <Hearth>
            <Txt v="label" color={c.hmute}>Net margin · all flocks · {label.toLowerCase()}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}><Txt v="monoLg" color={c.hink}>{naira(rev - costs)}</Txt><Txt v="mono" color={margin >= 0 ? c.hacc : c.herr}>{margin.toFixed(0)}%</Txt></View>
            <Txt v="small" color={c.hmute}>Marketplace revenue {naira(rev)} · costs {naira(costs)}</Txt>
          </Hearth>
        ) : <Banner icon="chart-line" title="No revenue in this period" body="Margin appears once a Marketplace sale is delivered. Costs and production are tracked below." />}
        <FigureStrip items={[{ label: 'Feed used', value: qty(t.feedKg) + ' kg', icon: 'sack' }, { label: 'Birds lost', value: qty(t.dead), icon: 'heart-pulse' }, { label: 'Eggs', value: qty(t.eggs), icon: 'egg-outline' }, { label: 'Meat', value: qty(t.meatKg) + ' kg', icon: 'scale' }]} />
        <Card>
          <Txt v="label">Costs · {label.toLowerCase()}</Txt>
          {costs ? <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            <View style={{ flex: feed || 0.0001, backgroundColor: c.ember }} /><View style={{ flex: vet || 0.0001, backgroundColor: c.t3i }} /><View style={{ flex: other || 0.0001, backgroundColor: c.line2 }} /></View> : <Txt v="small">No costs logged in this period.</Txt>}
          {[['Feed', feed, c.ember], ['Vet & drugs', vet, c.t3i], ['Other', other, c.line2]].map(([l, v, col]) => (
            <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: col }} /><Txt v="body">{l}</Txt></View><Txt v="mono" style={{ fontSize: 14 }}>{naira(v)}</Txt></View>))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}><Txt v="bold">Total</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(costs)}</Txt></View>
        </Card>
        <Txt v="label">By flock</Txt>
        {t.byFlock.length ? <Group>{t.byFlock.map((x, i) => (
          <Row key={x.flock.id} last={i === t.byFlock.length - 1} icon={x.closed ? 'archive-outline' : 'egg-outline'} iconColor={x.closed ? c.mute : undefined} title={x.flock.code + ' · ' + (x.flock.breed || x.flock.type)}
            subtitle={(x.closed ? 'Closed · ' : '') + qty(x.output) + ' ' + x.outputUnit + ' · ' + qty(x.dead) + ' lost'}
            onPress={() => navigation.navigate('FlockDetail', { id: x.flock.id })} right={<Txt v="mono" style={{ fontSize: 14 }}>{naira(x.cost)}</Txt>} />))}</Group>
          : <Card><Txt v="small">No flock had any entries in this period. Try a longer period above.</Txt></Card>}
        {data.flocks.length - running > 0 ? <Button variant="ghost" icon="archive-outline" title="Flock history" onPress={() => navigation.navigate('FlockHistory')} /> : null}
      </>}
    </Screen>
  );
}
