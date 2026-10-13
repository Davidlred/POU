import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView, Linking, Alert } from 'react-native';
import { useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Stat, Group, Row, naira, isoDate, shortDate, timeAgo, supabase, rpc } from '@p360/shared';
import { useFarm, save, retryFailed, discardFailed, flockStats } from '../lib/offlineQueue';
import { itemAlert } from './inventory';
import { isClosed, flockSummary, series, farmTotals } from '../lib/flockHistory';
import { askForNotifications, notificationsAllowed } from '../lib/reminders';

const TYPES = [['layers', 'Layers', 'egg-outline'], ['broilers', 'Broilers', 'food-drumstick-outline'], ['turkey', 'Turkey', 'turkey']];
const BREEDS = { layers: ['Isa Brown', 'Lohmann Brown', 'Noiler'], broilers: ['Ross 308', 'Cobb 500', 'Arbor Acres'], turkey: ['Bronze', 'White Holland', 'Local'] };

export function SyncBar() {
  const { c } = useTheme();
  const st = useFarm();
  if (st.failed.length) return <Banner tone="err" icon="sync-alert" title={'Sync failed for ' + st.failed.length + ' entr' + (st.failed.length > 1 ? 'ies' : 'y')} body={st.failed[0].error} action="Retry" onAction={retryFailed} />;
  if (!st.online) return <Banner tone="warn" icon="cloud-off-outline" title={'Offline · ' + st.pending + ' entr' + (st.pending === 1 ? 'y' : 'ies') + ' saved on this phone'} body="They'll sync automatically when you're back online." />;
  if (st.pending) return <Banner tone="warn" icon="cloud-upload-outline" title={st.pending + ' entries waiting to sync'} />;
  return st.lastSync ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="cloud-check-outline" size={16} color={c.sage} /><Txt v="small" color={c.sage}>All synced · {timeAgo(st.lastSync)}</Txt></View> : null;
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

export function FarmHomeScreen({ navigation }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const flocks = data.flocks.filter((f) => !isClosed(f));
  // Closed flocks are history, not deleted: newest first.
  const past = useMemo(() => data.flocks.filter(isClosed).map((f) => ({ f, s: flockSummary(f, data.farm_logs) })).sort((a, b) => (a.s.end < b.s.end ? 1 : -1)), [data]);
  const today = isoDate();
  const overdue = data.vaccinations.filter((v) => !v.administered_date && v.scheduled_date < today && flocks.some((f) => f.id === v.flock_id)).length;
  const birds = flocks.reduce((s, f) => s + flockStats(f, data.farm_logs).alive, 0);
  const [book, setBook] = useState(null);
  const stock = (data.farm_inventory || []).filter((x) => x.status !== 'removed');
  const stockAlerts = stock.filter(itemAlert).length;
  useEffect(() => navigation.addListener('focus', () => { rpc('farm_book').then(setBook).catch(() => {}); }), [navigation]);
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt v="display" style={{ fontSize: 28 }}>Farm Hub</Txt>
          {data.flocks.length ? <Button small variant="outline" icon="chart-bar" title="Dashboard" onPress={() => navigation.navigate('FarmDashboard')} style={{ height: 40 }} /> : null}
        </View>
        <SyncBar />
        <Card onPress={() => navigation.navigate('FarmBook')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.t1, alignItems: 'center', justifyContent: 'center' }}><Icon name="notebook-outline" color={c.t1i} /></View>
          <View style={{ flex: 1 }}><Txt v="bold">Farm Book</Txt><Txt v="small">{book && Number(book.outstanding) > 0 ? 'Customers owe you ' + naira(book.outstanding) : 'Track customers who buy on credit'}</Txt></View>
          {book && Number(book.overdue) > 0 ? <Pill tone="err" label="Overdue" /> : <Icon name="chevron-right" color={c.mute} />}
        </Card>
        <Card onPress={() => navigation.navigate('Inventory')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.t4, alignItems: 'center', justifyContent: 'center' }}><Icon name="warehouse" color={c.t4i} /></View>
          <View style={{ flex: 1 }}><Txt v="bold">Inventory</Txt><Txt v="small">{stock.length ? stock.length + ' item' + (stock.length === 1 ? '' : 's') + ' in store' + (stockAlerts ? ' · ' + stockAlerts + ' need attention' : '') : 'Feed, drugs, vaccines and equipment you have'}</Txt></View>
          {stockAlerts ? <Pill tone="warn" label={String(stockAlerts)} /> : <Icon name="chevron-right" color={c.mute} />}
        </Card>
        {!data.flocks.length ? <Empty icon="egg-outline" title="Start with your first flock" body="Add a batch to log feed, mortality and production. Works without signal." action="Add a flock" onAction={() => navigation.navigate('FlockForm')} /> : null}
        {data.flocks.length && !flocks.length ? (
          <Card>
            <Txt v="bold">No flocks running right now</Txt>
            <Txt v="small">Everything from your past flocks is kept below and in the dashboard.</Txt>
            <Button small icon="plus" title="Start a new flock" onPress={() => navigation.navigate('FlockForm')} />
          </Card>
        ) : null}
        {flocks.length ? <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat label="Flocks" value={flocks.length} /><Stat label="Birds" value={birds.toLocaleString()} />
            <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('Vaccinations')}><Stat label="Overdue jabs" value={overdue} subColor={c.err} sub={overdue ? 'Tap to review' : 'All on time'} /></Pressable>
          </View>
          {flocks.map((f) => {
            const s = flockStats(f, data.farm_logs);
            return (
              <Card key={f.id} onPress={() => navigation.navigate('FlockDetail', { id: f.id })}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt v="bold" style={{ flex: 1 }}>{f.code} · {f.breed || f.type}</Txt>{s.pending || f._pending ? <Pill tone="warn" label="Pending sync" /> : <Icon name="chevron-right" color={c.mute} />}</View>
                <Txt v="label">{s.alive.toLocaleString()} birds · {f.type === 'broilers' ? 'Day ' + s.days : 'Week ' + s.week} · {s.mortality.toFixed(1)}% mortality</Txt>
              </Card>
            );
          })}
        </> : null}
        {past.length ? <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <Txt v="h2">Past flocks</Txt>
            <Txt v="bold" color={c.acc} onPress={() => navigation.navigate('FlockHistory')} style={{ fontSize: 14, paddingVertical: 8 }}>{past.length > 3 ? 'See all ' + past.length : 'Full history'}</Txt>
          </View>
          {past.slice(0, 3).map(({ f, s }) => <PastFlockCard key={f.id} f={f} s={s} onPress={() => navigation.navigate('FlockDetail', { id: f.id })} />)}
        </> : null}
      </ScrollView>
      {data.flocks.length ? <Pressable accessibilityLabel="Add flock" onPress={() => navigation.navigate('FlockForm')} style={{ position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 18, backgroundColor: c.yolk, alignItems: 'center', justifyContent: 'center', elevation: 4 }}><Icon name="plus" size={26} color="#2A2119" /></Pressable> : null}
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Birds raised" value={qty(total('started'))} />
          <Stat label="Feed used" value={qty(total('feedKg')) + ' kg'} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {eggs ? <Stat label="Eggs" value={qty(eggs)} /> : null}
          {meat ? <Stat label="Meat" value={qty(meat) + ' kg'} /> : null}
          <Stat label="Total costs" value={naira(total('totalCost'))} />
        </View>
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

export function FlockDetailScreen({ navigation, route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const [tab, setTab] = useState('production');
  const f = data.flocks.find((x) => x.id === route.params.id);
  const logs = useMemo(() => data.farm_logs.filter((l) => l.flock_id === route.params.id).sort((a, b) => (a.log_date < b.log_date ? 1 : -1)), [data, route.params.id]);
  if (!f) return <Screen><AppBar /><Empty icon="egg-off-outline" title="Flock not found" /></Screen>;
  const closed = isClosed(f);
  const s = flockStats(f, data.farm_logs);
  const sum = flockSummary(f, data.farm_logs);
  const kind = { production: 'production', feed: 'feed', health: 'mortality', expenses: 'expense' }[tab];
  const rows = logs.filter((l) => l.kind === kind);
  const value = (l) => Number(tab === 'feed' || tab === 'expenses' ? l.cost || l.quantity : l.quantity);
  // A running flock charts the last two weeks; a closed one charts its whole life, so the record never looks empty.
  const bars = closed ? series(rows, value, sum.start, sum.end)
    : Array.from({ length: 14 }).map((_, i) => { const d = isoDate(new Date(Date.now() - (13 - i) * 864e5)); return rows.filter((l) => l.log_date === d).reduce((a, l) => a + value(l), 0); });
  const span = closed ? 'whole flock' : 'last 14 days';
  const unit = tab === 'production' ? (f.type === 'layers' ? 'eggs' : 'kg') : tab === 'feed' ? 'kg' : tab === 'health' ? 'birds' : '';
  const setStatus = (status) => save('flocks', { ...f, _pending: undefined, _failed: undefined, status });
  const close = () => Alert.alert('Close out ' + f.code + '?', 'Use this when the flock is sold or finished. It moves to your flock history with every feed, output, mortality and cost entry kept. You can reopen it if this was a mistake.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Close out', onPress: () => setStatus('inactive').then(() => navigation.goBack()) }]);
  const reopen = () => Alert.alert('Reopen ' + f.code + '?', 'It goes back to your running flocks so you can keep logging.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reopen', onPress: () => setStatus('active') }]);
  const shown = closed ? 100 : 20;
  return (
    <Screen scroll>
      <AppBar title={f.code + ' · ' + (f.breed || f.type)} subtitle={closed ? 'Closed · ' + sum.weeks + ' week' + (sum.weeks === 1 ? '' : 's') + ' · ' + qty(sum.remaining) + ' birds at close' : s.alive.toLocaleString() + ' birds · ' + (f.type === 'broilers' ? 'day ' + s.days : 'week ' + s.week)}
        right={closed ? null : <Pressable onPress={() => navigation.navigate('Vaccinations', { flockId: f.id })} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Vaccinations"><Icon name="needle" /></Pressable>} />
      <SyncBar />
      {closed ? <Banner tone="info" icon="archive-outline" title={'Closed on ' + dmy(sum.end)} body={'Ran from ' + dmy(sum.start) + '. The full record is kept: nothing was deleted.'} /> : null}
      <Card>
        <Txt v="label">{closed ? 'Flock record' : 'So far'}</Txt>
        {[['Birds started', qty(sum.started)], ['Birds lost', qty(sum.dead) + ' (' + sum.mortality.toFixed(1) + '%)'], [closed ? 'Birds at close' : 'Birds now', qty(sum.remaining)],
          ['Feed used', qty(sum.feedKg) + ' kg · ' + naira(sum.feedCost)], [f.type === 'layers' ? 'Eggs collected' : 'Output', qty(sum.output) + ' ' + sum.outputUnit], ['Vet and other costs', naira(sum.vetCost + sum.otherCost)]].map(([l, v]) => (
          <View key={l} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Txt v="body" color={c.mute}>{l}</Txt><Txt v="mono" style={{ fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{v}</Txt></View>))}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}><Txt v="bold">Total costs</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(sum.totalCost)}</Txt></View>
      </Card>
      <Segmented options={[{ value: 'health', label: 'Health' }, { value: 'feed', label: 'Feed' }, { value: 'production', label: 'Output' }, { value: 'expenses', label: 'Costs' }]} value={tab} onChange={setTab} />
      {rows.length ? <Card>
        <Txt v="label">{tab === 'health' ? 'Mortality · ' + s.dead + ' birds (' + s.mortality.toFixed(1) + '%) · ' + span : tab === 'production' ? 'Output · ' + span : tab === 'feed' ? 'Feed spend · ' + span : 'Other costs · ' + span}</Txt>
        <Bars values={bars} highlightLast={!closed} />
      </Card> : <Empty icon={tab === 'feed' ? 'sack' : tab === 'health' ? 'heart-pulse' : tab === 'production' ? 'egg-outline' : 'cash'} title={'No ' + (tab === 'health' ? 'mortality' : tab === 'production' ? 'output' : tab === 'feed' ? 'feed' : 'costs') + (closed ? ' was logged for this flock' : ' logged yet')} />}
      {!closed ? <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small variant="outline" icon="egg-outline" title="Output" onPress={() => navigation.navigate('Log', { flockId: f.id, kind: 'production' })} style={{ flex: 1 }} />
        <Button small variant="outline" icon="sack" title="Feed" onPress={() => navigation.navigate('Log', { flockId: f.id, kind: 'feed' })} style={{ flex: 1 }} />
        <Button small variant="outline" icon="heart-minus-outline" title="Loss" onPress={() => navigation.navigate('Log', { flockId: f.id, kind: 'mortality' })} style={{ flex: 1 }} />
      </View> : null}
      {tab === 'expenses' && !closed ? <Button small variant="outline" icon="cash-plus" title="Log vet or other cost" onPress={() => navigation.navigate('Log', { flockId: f.id, kind: 'expense' })} /> : null}
      {tab === 'health' ? <Button small variant="outline" icon="folder-heart-outline" title="Health records" onPress={() => navigation.navigate('HealthRecords', { flockId: f.id })} /> : null}
      {rows.length ? <Group>{rows.slice(0, shown).map((l, i) => (
        <Row key={l.id} last={i === Math.min(rows.length, shown) - 1} title={(l.kind === 'expense' || (l.kind === 'feed' && l.cost) ? naira(l.cost) + (l.kind === 'feed' ? ' · ' + l.quantity + ' kg' : '') : Number(l.quantity).toLocaleString() + ' ' + (l.unit || unit)) + (l.cause ? ' · ' + l.cause : '')}
          subtitle={(closed ? dmy(l.log_date) : shortDate(l.log_date)) + (l.updated_by ? ' · by ' + l.updated_by : '')}
          right={l._failed ? <Icon name="sync-alert" color={c.err} /> : l._pending ? <Icon name="cloud-upload-outline" color={c.warn} /> : <Icon name="cloud-check-outline" size={18} color={c.sage} />} />))}</Group> : null}
      {rows.length > shown ? <Txt v="small" style={{ textAlign: 'center' }}>Showing the latest {shown} of {rows.length} entries.</Txt> : null}
      {closed ? <Button variant="ghost" title="Reopen this flock" onPress={reopen} /> : <Button variant="ghost" title="Close out this flock (sold / finished)" onPress={close} />}
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
  const submit = async () => {
    if (kind === 'expense' ? !(Number(cost) > 0) : !(n > 0)) return setErr('Enter a value above 0');
    if (over) return;
    await save('farm_logs', { flock_id: flockId, kind, quantity: kind === 'expense' ? 1 : n, cost: Number(cost || 0), cause: cause || null, log_date: date, unit: kind === 'production' ? (f?.type === 'layers' ? 'eggs' : 'kg') : kind === 'feed' ? 'kg' : null });
    navigation.goBack();
  };
  return (
    <Screen scroll footer={<><SyncHint /><Button title="Save entry" disabled={over} onPress={submit} /></>}>
      <AppBar title={'Log · ' + (f?.code || '')} close />
      <Segmented options={[{ value: 'feed', label: 'Feed' }, { value: 'mortality', label: 'Mortality' }, { value: 'production', label: 'Output' }, { value: 'expense', label: 'Cost' }]} value={kind} onChange={(k) => { setKind(k); setErr(null); setCause(null); }} />
      {kind !== 'expense' ? <Input label={kind === 'feed' ? 'Feed used (kg)' : kind === 'mortality' ? 'Birds lost' : f?.type === 'layers' ? 'Eggs collected' : 'Output (kg)'} keyboardType="number-pad" value={qty} onChangeText={(t) => { setQty(t.replace(/[^\d.]/g, '')); setErr(null); }} mono autoFocus
        error={over ? "Can't exceed the " + s.alive.toLocaleString() + ' birds left in this flock' : err} /> : null}
      {kind === 'feed' || kind === 'expense' ? <Input label={kind === 'feed' ? 'Cost (optional)' : 'Amount'} prefix="₦" keyboardType="number-pad" value={cost} onChangeText={(t) => setCost(t.replace(/\D/g, ''))} mono error={kind === 'expense' ? err : null} /> : null}
      {kind === 'mortality' ? <><Txt v="strong" style={{ fontSize: 13 }}>Cause (optional)</Txt><ChipRow options={CAUSES} value={cause} onChange={setCause} /></> : null}
      {kind === 'feed' ? <><Txt v="strong" style={{ fontSize: 13 }}>Feed type</Txt><ChipRow options={['Starter', 'Grower', 'Finisher', 'Layer mash']} value={cause} onChange={setCause} /></> : null}
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
      {!v.administered_date ? <Button small variant={tone === 'err' ? 'dark' : 'outline'} title="Mark administered" onPress={() => done(v)} /> : null}
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
        <Icon name="calendar-heart" size={26} color={c.acc} /><View style={{ flex: 1 }}><Txt v="bold">Vaccination chart</Txt><Txt v="small">See what your birds need by age and add it all to your schedule in one tap</Txt></View><Icon name="chevron-right" color={c.mute} /></Card> : null}
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
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}><Txt v="monoLg" color={c.hink}>{naira(rev - costs)}</Txt><Txt v="mono" color={margin >= 0 ? '#8DB57A' : '#F08A72'}>{margin.toFixed(0)}%</Txt></View>
            <Txt v="small" color={c.hmute}>Marketplace revenue {naira(rev)} · costs {naira(costs)}</Txt>
          </Hearth>
        ) : <Banner icon="chart-line" title="No revenue in this period" body="Margin appears once a Marketplace sale is delivered. Costs and production are tracked below." />}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Feed used" value={qty(t.feedKg) + ' kg'} />
          <Stat label="Birds lost" value={qty(t.dead)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Eggs" value={qty(t.eggs)} />
          <Stat label="Meat" value={qty(t.meatKg) + ' kg'} />
        </View>
        <Card>
          <Txt v="label">Costs · {label.toLowerCase()}</Txt>
          {costs ? <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            <View style={{ flex: feed || 0.0001, backgroundColor: c.ember }} /><View style={{ flex: vet || 0.0001, backgroundColor: c.yolk }} /><View style={{ flex: other || 0.0001, backgroundColor: c.line2 }} /></View> : <Txt v="small">No costs logged in this period.</Txt>}
          {[['Feed', feed, c.ember], ['Vet & drugs', vet, c.yolk], ['Other', other, c.line2]].map(([l, v, col]) => (
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
