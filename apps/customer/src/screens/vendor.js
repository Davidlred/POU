import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Image, ScrollView, RefreshControl, Alert, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usePage, useWide, useTheme, liveChannel, Screen, AppBar, BackButton, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Skeleton, Sheet, useTick,
  naira, countdown, rpc, publicUrl, uploadImage, friendlyError, timeAgo, STATUS_LABEL, supabase, Fab,
  HeaderBar, SectionHead, FigureStrip, ActionList, ActionRow, DataTable, MoneyLine, Thumb, PlaceholderArt, CountBadge, ProgressSegments } from '@p360/shared';
import { getHere } from '../lib/spot';
import { useAuth } from '../context/AuthContext';
import { INVEST_ENABLED } from '../lib/roi';
import { CATEGORIES, WASTE_CATEGORIES, SUPPLY_CATEGORIES, catLabel, unitsFor, TITLE_EXAMPLE } from '../lib/catalog';
import { ExploreOptions } from './explore';
import { getPhotos, asksSource, PhotoSourceSheet } from '../lib/photos';
import { useFarm, flockStats } from '../lib/offlineQueue';
import { itemAlert } from './inventory';
import { TopBar } from '../components/RoleSwitcher';

const day = (d = new Date()) => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const items = (o) => (o.items || []).map((i) => i.qty + ' × ' + (i.title || i.name)).join(', ');
const shortDay = (iso) => new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
const pct = (n) => (Math.round(n * 10) / 10).toLocaleString() + '%';

function VerifyBanner({ navigation }) {
  const { vendor, supplierOnly } = useAuth();
  if (!vendor || vendor.verification_status === 'approved') return null;
  return vendor.verification_status === 'rejected'
    ? <Banner tone="err" title="Action needed on your verification" body={vendor.rejection_reason} action="Fix" onAction={() => navigation.navigate('Pending')} />
    : <Banner tone="warn" icon="timer-sand" title="Verification in review" body={supplierOnly ? "Products go live once you're approved." : "Farm Hub is open now. Listings go live once you're approved."} action="Status" onAction={() => navigation.navigate('Pending')} />;
}

// A seller without a pinned location: listed after nearby sellers, at a flat delivery fee.
function PinCard() {
  const { c } = useTheme();
  const { vendor, refresh, seller } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!vendor || vendor.lat != null) return null;
  const pin = async () => {
    setBusy(true);
    try { const h = await getHere(); if (h) { await rpc('set_shop_location', { p_lat: h.lat, p_lng: h.lng }); await refresh(); } }
    catch (e) { Alert.alert("Couldn't save it", friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <ActionRow icon="map-marker-radius-outline" iconTone="orange" title={'Pin your ' + seller + "'s location"} detail="Nearby buyers see you first and pay less for delivery. Do it while you're there."
      action={{ title: 'Pin it now', icon: 'crosshairs-gps', onPress: pin, loading: busy }} />
  );
}

export function VendorHomeScreen({ navigation }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const { profile, vendor, wallet, refreshWallet, supplierOnly, storeLocked, seller, bookName } = useAuth();
  const approved = vendor?.verification_status === 'approved';
  const { data } = useFarm();
  const [orders, setOrders] = useState(null);
  const [book, setBook] = useState(null);
  const [agents, setAgents] = useState(null);
  const [period, setPeriod] = useState('30');
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(null);
  useTick(1000);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      setOrders(await rpc('vendor_orders')); refreshWallet();
      rpc('farm_book').then(setBook).catch(() => setBook(null));
      if (supplierOnly) rpc('store_agents_dashboard', { p_days: period === 'all' ? null : Number(period) }).then(setAgents).catch(() => setAgents(null));
    } finally { setBusy(false); }
  }, [supplierOnly, period]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const accept = async (o) => { setActing(o.id); try { await rpc('vendor_respond', { p_sub: o.id, p_accept: true }); await load(); } catch (e) { Alert.alert("Couldn't accept", friendlyError(e)); } finally { setActing(null); } };
  const handOver = (m) => Alert.alert('Handed over?', items(m) + ' moves from your stock to ' + (m.agent_name || 'the agent') + "'s. " + naira(m.total) + ' goes to your wallet.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Handed over', onPress: async () => { try { await rpc('store_confirm_stock', { p_move: m.id, p_accept: true }); load(); } catch (e) { Alert.alert("Couldn't save", friendlyError(e)); } } }]);

  const first = (profile?.full_name || '').split(' ')[0];
  const today = day();
  const list = orders || [];
  const fresh = list.filter((o) => o.status === 'placed');
  const accepted = list.filter((o) => o.status === 'confirmed');
  const weekAgo = Date.now() - 7 * 864e5, twoWeeks = Date.now() - 14 * 864e5;
  const sold = (from, to) => list.filter((o) => o.status === 'delivered' && new Date(o.created_at).getTime() >= from && new Date(o.created_at).getTime() < to).reduce((s, o) => s + Number(o.items_total), 0);
  const thisWeek = sold(weekAgo, Date.now() + 1), lastWeek = sold(twoWeeks, weekAgo);
  const trend = lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;
  // farm figures from Farm Hub records
  const running = (data.flocks || []).filter((f) => f.status !== 'inactive');
  const stats = running.map((f) => ({ f, s: flockStats(f, data.farm_logs || []) }));
  const alive = stats.reduce((t, x) => t + x.s.alive, 0);
  const eggsToday = (data.farm_logs || []).filter((l) => l.kind === 'production' && l.log_date === today && running.find((f) => f.id === l.flock_id && f.type === 'layers')).reduce((t, l) => t + Number(l.quantity || 0), 0);
  const layersAlive = stats.filter((x) => x.f.type === 'layers').reduce((t, x) => t + x.s.alive, 0);
  const lowItems = (data.farm_inventory || []).filter((i) => i.status !== 'removed').map((i) => ({ i, a: itemAlert(i) })).filter((x) => x.a && (x.a.label === 'Running low' || x.a.label === 'Out of stock'));
  const dueVacc = (data.vaccinations || []).filter((v) => !v.administered_date && v.scheduled_date <= today && running.find((f) => f.id === v.flock_id));
  const pending = agents?.pending || [];

  const actionRows = [
    ...fresh.map((o) => {
      const cd = countdown(o.sla_deadline);
      return <ActionRow key={o.id} icon="shopping-outline" title={items(o)} detail={o.buyer + (o.area ? ', ' + o.area : '') + ' · ' + o.code}
        pill={<Pill tone={cd.ms < 3 * 3.6e6 ? 'err' : 'warn'} icon="timer-outline" label={cd.text.slice(0, 5) + ' left'} />} amount={naira(o.items_total)}
        onPress={() => navigation.navigate('VendorOrder', { id: o.id })} action={{ title: 'Accept', onPress: () => accept(o), loading: acting === o.id }} />;
    }),
    ...accepted.map((o) => <ActionRow key={o.id} icon="package-variant-closed" title={items(o)} detail={o.buyer + (o.area ? ', ' + o.area : '') + ' · ' + o.code}
      pill={<Pill tone="ok" label={'Accepted · pack by the ' + (seller === 'store' ? 'counter' : 'gate')} />} amount={naira(o.items_total)}
      onPress={() => navigation.navigate('VendorOrder', { id: o.id })} action={{ title: 'Mark ready', variant: 'outline', onPress: () => navigation.navigate('VendorOrder', { id: o.id }) }} />),
    ...pending.map((m) => <ActionRow key={m.id} lead={<View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.hink}>{(m.agent_name || 'A')[0]}</Txt></View>}
      title={(m.agent_name || 'Agent') + ' · stock order'} detail={items(m)} pill={<Pill tone="warn" label="Paid · waiting" />} amount={naira(m.total)} action={{ title: 'Handed over', onPress: () => handOver(m) }} />),
    ...(supplierOnly ? [] : lowItems.slice(0, 3).map(({ i, a }) => <ActionRow key={i.id} icon="sack" iconTone="warn" title={i.name + (a.label === 'Out of stock' ? ' is out of stock' : ' is running low')}
      detail={Number(i.quantity).toLocaleString() + ' ' + (i.unit || '') + ' left'} pill={<Pill tone={a.tone} icon="alert-outline" label={a.label} />} action={{ title: 'Restock', variant: 'outline', onPress: () => navigation.navigate('Inventory', { tab: i.category === 'feed' ? 'feed' : undefined }) }} />)),
    ...(supplierOnly ? [] : dueVacc.slice(0, 3).map((v) => <ActionRow key={v.id} icon="needle" iconTone="warn" title={v.vaccine + ' is due'} detail={(running.find((f) => f.id === v.flock_id)?.code || 'Flock') + ' · ' + shortDay(v.scheduled_date)}
      pill={<Pill tone="warn" label="Due" />} action={{ title: 'Open', variant: 'outline', onPress: () => navigation.navigate('Vaccinations', { flockId: v.flock_id }) }} />)),
  ];
  const needs = (
    <ActionList count={actionRows.length} empty={
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.sf }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sagebg, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={20} color={c.sage} /></View>
        <View style={{ flex: 1 }}><Txt v="strong">You're all caught up</Txt><Txt v="small">New orders show here with a 24-hour timer.</Txt></View>
      </View>}>
      {actionRows}
    </ActionList>
  );
  const figures = supplierOnly ? [
    { label: 'Available payout', value: naira(wallet?.balance), note: 'Withdraw any time', icon: 'wallet-outline' },
    { label: 'Sales this week', value: naira(thisWeek), note: trend == null ? 'Delivered orders' : (trend >= 0 ? 'Up ' : 'Down ') + Math.abs(trend) + '% on last week', tone: trend == null ? 'mute' : trend >= 0 ? 'ok' : 'warn', icon: 'chart-line' },
    { label: 'Sold to agents', value: naira(agents?.totals?.bought || 0), note: period === 'all' ? 'All time' : 'Last ' + period + ' days', icon: 'account-group-outline' },
    { label: 'Rebates owed', value: naira(agents?.owed || 0), note: agents?.quarter ? naira(agents.quarter) + ' this quarter' : 'Paid at quarter end', icon: 'hand-coin-outline' },
  ] : [
    { label: 'Available payout', value: naira(wallet?.balance), note: 'Withdraw any time', icon: 'wallet-outline' },
    { label: 'Sales this week', value: naira(thisWeek), note: trend == null ? 'Delivered orders' : (trend >= 0 ? 'Up ' : 'Down ') + Math.abs(trend) + '% on last week', tone: trend == null ? 'mute' : trend >= 0 ? 'ok' : 'warn', icon: 'chart-line' },
    { label: 'Eggs today', value: eggsToday.toLocaleString(), note: layersAlive ? 'Lay rate ' + pct((eggsToday / layersAlive) * 100) : 'Log today\'s eggs', icon: 'egg-outline' },
    { label: 'Birds alive', value: alive.toLocaleString(), note: running.length === 1 ? '1 flock running' : running.length + ' flocks running', icon: 'bird' },
  ];
  const flockTable = (
    <View style={{ gap: 12 }}>
      <SectionHead title="Running flocks" action="Farm Hub" onAction={() => navigation.navigate('FarmHome')} />
      <DataTable minWidth={420} columns={[{ label: 'Flock', flex: 1.6 }, { label: 'Birds', right: true }, { label: 'Mortality', right: true }, { label: 'Today', right: true }]}
        rows={stats.map(({ f, s }) => {
          const eggs = (data.farm_logs || []).filter((l) => l.flock_id === f.id && l.kind === 'production' && l.log_date === today).reduce((t, l) => t + Number(l.quantity || 0), 0);
          return { key: f.id, onPress: () => navigation.navigate('FlockDetail', { id: f.id }), cells: [
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><PlaceholderArt kind={f.type === 'layers' ? 'eggs' : 'bird'} size={36} radius={10} /><View style={{ flexShrink: 1 }}><Txt v="strong" numberOfLines={1}>{f.code || f.breed || 'Flock'}</Txt><Txt v="small">{'Week ' + s.week + ' · ' + f.type}</Txt></View></View>,
            <Txt v="mono">{s.alive.toLocaleString()}</Txt>,
            <Pill tone={s.mortality < 5 ? 'ok' : 'warn'} icon={s.mortality < 5 ? 'check' : 'alert-outline'} label={pct(s.mortality)} />,
            <Txt v="mono">{f.type === 'layers' ? eggs.toLocaleString() + ' eggs' : 'Day ' + s.days}</Txt>] };
        })}
        empty={<Empty art="bird" title="No flocks running" body="Start a flock in Farm Hub to track feed, losses and output." action="Start a flock" onAction={() => navigation.navigate('FlockForm')} style={{ borderWidth: 0 }} />} />
    </View>
  );
  const nextDebts = (book?.entries || []).filter((e) => e.status === 'pending').sort((a, b) => (a.due_date < b.due_date ? -1 : 1)).slice(0, 2);
  const bookCard = (
    <Hearth onPress={() => navigation.navigate('FarmBook')}>
      <Txt v="label" color={c.hmute}>{'Customers owe you · ' + bookName}</Txt>
      <Txt v="monoLg" color={c.hink} style={{ fontSize: wide ? 40 : 36, lineHeight: wide ? 46 : 42 }}>{naira(book?.outstanding || 0)}</Txt>
      {Number(book?.overdue) > 0 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="alert-outline" size={16} color={c.herr} /><Txt v="small" color={c.herr}>{naira(book.overdue) + ' is overdue'}</Txt></View>
        : <Txt v="small" color={c.hmute}>Nothing overdue</Txt>}
      {nextDebts.length ? <View style={{ borderTopWidth: 1, borderColor: c.hline, paddingTop: 8, gap: 4 }}>
        {nextDebts.map((e) => <MoneyLine key={e.id} onDark label={e.customer + ' · due ' + shortDay(e.due_date)} value={naira(e.amount)} />)}
      </View> : null}
      <Button small variant="hearthOutline" title={'Open ' + bookName} onPress={() => navigation.navigate('FarmBook')} style={{ alignSelf: 'flex-start', paddingHorizontal: 18 }} />
    </Hearth>
  );
  const PERIODS = [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }];
  const leaders = (agents?.agents || []).filter((a) => a.status === 'active');
  const agentTable = (
    <View style={{ gap: 12 }}>
      <SectionHead title="Top agents" right={<View style={{ width: wide ? 300 : 0, display: wide ? 'flex' : 'none' }}><Segmented options={PERIODS} value={period} onChange={setPeriod} /></View>} action={wide ? null : 'All agents'} onAction={() => navigation.navigate('Agents')} />
      {!wide ? <Segmented options={PERIODS} value={period} onChange={setPeriod} /> : null}
      <DataTable minWidth={560} columns={[{ label: 'Rank', width: 56 }, { label: 'Agent', flex: 1.6 }, { label: 'Bought', right: true }, { label: 'Sales logged', right: true }, { label: 'Rebate owed', right: true }]}
        rows={leaders.map((a, i) => ({ key: a.agent_id, onPress: () => navigation.navigate('StoreAgent', { agentId: a.agent_id }), cells: [
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: i === 0 && Number(a.period_bought) > 0 ? c.orange : c.sf2, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={i === 0 && Number(a.period_bought) > 0 ? c.onorange : c.mute} style={{ fontSize: 13 }}>{i + 1}</Txt></View>,
          <Txt v="strong" numberOfLines={1}>{a.name}</Txt>, <Txt v="mono">{naira(a.period_bought)}</Txt>, <Txt v="mono">{naira(a.period_sold)}</Txt>, <Txt v="mono">{naira(Number(a.earned) - Number(a.paid))}</Txt>] }))}
        empty={<Empty icon="account-group-outline" title="No agents yet" body="Share your invite link from Agents to add your first agent." action="Invite agents" onAction={() => navigation.navigate('Agents')} style={{ borderWidth: 0 }} />} />
      <Txt v="small">Ranked by what each agent bought from you. Rebates are paid at quarter end.</Txt>
    </View>
  );
  const header = (
    <HeaderBar lead={wide ? null : undefined}
      title={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><Txt v="display" numberOfLines={1} style={{ flexShrink: 1 }}>{vendor?.business_name || (supplierOnly ? 'Your store' : 'Your farm')}</Txt>{approved ? <Pill tone="ok" label={supplierOnly ? 'Verified store' : 'Verified'} /> : null}</View>}
      subtitle={new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' }) + (vendor?.location ? ' · ' + vendor.location : '')}>
      {!storeLocked && !supplierOnly ? <Button small variant="outline" icon="notebook-edit-outline" title="Log today's records" onPress={() => (running.length === 1 ? navigation.navigate('Log', { flockId: running[0].id }) : navigation.navigate('FarmHome'))} style={{ paddingHorizontal: 16 }} /> : null}
      <Button small icon="plus" title={supplierOnly ? 'Add product' : 'Add listing'} onPress={() => navigation.navigate('ListingForm')} style={{ paddingHorizontal: 18 }} />
    </HeaderBar>
  );
  const top = wide ? null : <TopBar navigation={navigation} cart={false} />;
  const scroll = (children) => (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: wide ? 28 : 20 }, page]} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        {top}{header}<VerifyBanner navigation={navigation} />{children}
      </ScrollView>
    </Screen>
  );
  if (!vendor) return scroll(<Empty art="eggs" title={supplierOnly ? 'Finish setting up your store' : 'Finish setting up your farm'} body="Add your business details and ID so we can verify you." action="Add business details" onAction={() => navigation.navigate('Business')} />);
  // a store in review only sees its status, its products (drafts) and what else it can do; the rest opens on approval
  if (storeLocked) return scroll(<>
    <PinCard />
    <Card onPress={() => navigation.navigate('MyListings')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <PlaceholderArt kind="feed" size={52} />
      <View style={{ flex: 1 }}><Txt v="bold">Add products while you wait</Txt><Txt v="small">Save drafts now and publish once you're approved.</Txt></View>
      <Icon name="chevron-right" color={c.mute} />
    </Card>
    <SectionHead title="While you wait" />
    <ExploreOptions navigation={navigation} />
  </>);
  return scroll(<>
    {vendor.lat == null ? <PinCard /> : null}
    {needs}
    <FigureStrip items={figures} />
    {supplierOnly ? (wide ? <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}><View style={{ flex: 1.5 }}>{agentTable}</View><View style={{ flex: 1 }}>{bookCard}</View></View> : <>{agentTable}{bookCard}</>)
      : wide ? <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}><View style={{ flex: 1.5 }}>{flockTable}</View><View style={{ flex: 1 }}>{bookCard}</View></View> : <>{flockTable}{bookCard}</>}
    {!supplierOnly ? (
      <View style={{ gap: 12 }}>
        <SectionHead title="More" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[['Sell waste', 'sprout-outline', 't1', 'WasteHome'], ...(approved ? [['Agents', 'account-group-outline', 't3', 'StoreAgents']] : []), ...(INVEST_ENABLED ? [['Raise funds', 'cash-plus', 't2', 'RaiseHome']] : [])].map(([l, i, t, to]) => (
            <Pressable key={l} onPress={() => navigation.navigate(to)} accessibilityRole="button" style={({ hovered }) => ({ flexBasis: wide ? '22%' : '45%', flexGrow: 1, minHeight: 64, borderRadius: 18, backgroundColor: c[t], paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: hovered ? 0.9 : 1 })}>
              <Icon name={i} color={c[t + 'i']} /><Txt v="bold" style={{ fontSize: 14 }}>{l}</Txt>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null}
  </>);
}

const LISTING_TABS = (g) => [{ value: 'live', label: 'Live · ' + g.live.length }, { value: 'draft', label: 'Drafts · ' + g.draft.length }, { value: 'out', label: 'Sold out · ' + g.out.length }];

export function MyListingsScreen({ navigation }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const { uid, vendor, supplierOnly } = useAuth();
  const noun = supplierOnly ? 'product' : 'listing';
  const title = supplierOnly ? 'Products' : 'Listings';
  const approved = vendor?.verification_status === 'approved';
  // In review they can only save drafts, so open on Drafts
  const [tab, setTab] = useState(approved ? 'live' : 'draft');
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => { const { data } = await supabase.from('listings').select('*').eq('vendor_id', uid).order('updated_at', { ascending: false }); setRows(data || []); }, [uid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!vendor) return (
    <Screen><AppBar title={title} />
      <Empty icon="lock-clock" title="Listings open once you're verified" body="Add your business details to apply." action="Add business details" onAction={() => navigation.navigate('Business')} /></Screen>
  );
  const g = { live: (rows || []).filter((r) => r.status === 'live' && r.quantity > 0), draft: (rows || []).filter((r) => r.status !== 'live'), out: (rows || []).filter((r) => r.status === 'live' && r.quantity === 0) };
  const list = g[tab];
  const setStatus = async (r, status) => { const { error } = await supabase.from('listings').update({ status }).eq('id', r.id); if (error) Alert.alert("Couldn't change it", friendlyError(error)); load(); };
  const rowAction = (r) => (r.status === 'live' && r.quantity === 0 ? { title: 'Add stock', variant: 'primary', onPress: () => navigation.navigate('ListingForm', { id: r.id, waste: r.is_waste }) }
    : r.status === 'live' ? { title: 'Unpublish', variant: 'outline', onPress: () => setStatus(r, 'unpublished') }
    : { title: 'Publish', variant: 'primary', disabled: !approved, onPress: () => setStatus(r, 'live') });
  const statusPill = (r) => (r.status !== 'live' ? <Pill label={r.status === 'draft' ? 'Draft' : 'Unpublished'} /> : r.quantity === 0 ? <Pill tone="err" label="Sold out" /> : <Pill tone="ok" label="Live" />);
  const stockText = (r) => (r.quantity > 0 && r.quantity <= 5 ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Icon name="alert-outline" size={15} color={c.warn} /><Txt v="strong" color={c.warn}>{r.quantity + ' left · low'}</Txt></View>
    : <Txt v="body">{Number(r.quantity).toLocaleString() + ' ' + r.unit + (r.quantity === 1 ? '' : 's')}</Txt>);
  const table = rows === null ? <Skeleton h={200} r={20} /> : (
    <DataTable minWidth={680} columns={[{ label: supplierOnly ? 'Product' : 'Listing', flex: 2.4 }, { label: 'Price', flex: 1.1 }, { label: 'Stock', flex: 1.1 }, { label: 'Status', flex: 0.9 }, { label: '', width: 130, right: true }]}
      rows={list.map((r) => {
        const a = rowAction(r);
        return { key: r.id, onPress: () => navigation.navigate('ListingForm', { id: r.id, waste: r.is_waste }), cells: [
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Thumb uri={r.photos?.[0] ? publicUrl('listing-photos', r.photos[0]) : null} category={r.category} size={44} /><Txt v="strong" numberOfLines={2} style={{ flexShrink: 1 }}>{r.title}</Txt></View>,
          <Txt v="mono">{naira(r.price) + ' / ' + r.unit}</Txt>, stockText(r), statusPill(r),
          <Button small variant={a.variant} title={a.title} disabled={a.disabled} onPress={a.onPress} style={{ height: 40, paddingHorizontal: 14 }} />] };
      })}
      empty={<Empty art={supplierOnly ? 'feed' : 'eggs'} title={tab === 'live' ? 'Nothing live yet' : tab === 'draft' ? 'No drafts' : 'Nothing sold out'} body={approved ? 'Add a ' + noun + ' and it goes live in under a minute.' : 'Add a ' + noun + ' and save it as a draft.'} style={{ borderWidth: 0 }} />} />
  );
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: 18, paddingBottom: 100 }, page]}>
        {!wide ? <TopBar navigation={navigation} cart={false} /> : null}
        <HeaderBar title={title}>{wide ? <><View style={{ width: 380 }}><Segmented options={LISTING_TABS(g)} value={tab} onChange={setTab} /></View><Button small icon="plus" title={'Add ' + noun} onPress={() => navigation.navigate('ListingForm')} style={{ paddingHorizontal: 18 }} /></> : null}</HeaderBar>
        {approved ? null : vendor.verification_status === 'rejected'
          ? <Banner tone="err" title="Action needed on your verification" body={vendor.rejection_reason} action="Fix" onAction={() => navigation.navigate('Pending')} />
          : <Banner tone="warn" icon="timer-sand" title="Publishing opens once you're verified" body="Save drafts now. They're ready to publish when you're approved." />}
        {!wide ? <Segmented options={LISTING_TABS(g)} value={tab} onChange={setTab} /> : null}
        {table}
      </ScrollView>
      {!wide ? <Fab label={'Add ' + noun} onPress={() => navigation.navigate('ListingForm')} /> : null}
    </Screen>
  );
}

// A group of fields under a heading (the redesign's grouped forms).
function FormGroup({ title, children }) {
  return <Card style={{ gap: 14, padding: 18 }}><Txt v="h2">{title}</Txt>{children}</Card>;
}

export function ListingFormScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const { uid, vendor } = useAuth();
  const id = route.params?.id; const waste = !!route.params?.waste;
  const { supplierOnly } = useAuth();
  const cats = waste ? WASTE_CATEGORIES : supplierOnly ? CATEGORIES.filter((k) => SUPPLY_CATEGORIES.includes(k.id)) : CATEGORIES;
  const [f, setF] = useState({ category: cats[0].id, title: '', price: '', unit: waste ? 'bag' : unitsFor(cats[0].id)[0], quantity: '', description: '', moisture: '', agent_pct: '' });
  const [photos, setPhotos] = useState([]); // { uri, path, state }
  const [errs, setErrs] = useState({});
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: undefined })); };
  // A new category keeps the unit only if it fits (feed is sold by the bag, not the crate).
  const setCategory = (cat) => setF((x) => ({ ...x, category: cat, unit: waste || unitsFor(cat).includes(x.unit) ? x.unit : unitsFor(cat)[0] }));
  const noun = supplierOnly ? 'product' : 'listing';
  useEffect(() => {
    if (!id) return;
    supabase.from('listings').select('*').eq('id', id).single().then(({ data: l }) => {
      if (!l) return;
      setF({ category: l.category, title: l.title, price: String(l.price), unit: l.unit, quantity: String(l.quantity), description: l.description || '', moisture: l.attributes?.moisture ? String(l.attributes.moisture) : '', agent_pct: Number(l.agent_commission_pct) ? String(Number(l.agent_commission_pct)) : '' });
      setPhotos((l.photos || []).map((p) => ({ uri: publicUrl('listing-photos', p), path: p, state: 'done' })));
    });
  }, [id]);
  // Phone: the + tile asks camera or gallery. Website: the browser's own picker.
  const [photoMenu, setPhotoMenu] = useState(false);
  const addPhoto = async (camera) => {
    const assets = await getPhotos(camera, 4 - photos.length);
    if (!assets) return;
    setErrs((e) => ({ ...e, photos: undefined }));
    assets.forEach(async (a) => {
      setPhotos((p) => [...p, { uri: a.uri, state: 'uploading' }]);
      try { const path = await uploadImage('listing-photos', uid, a.uri); setPhotos((p) => p.map((x) => (x.uri === a.uri ? { ...x, path, state: 'done' } : x))); }
      catch { setPhotos((p) => p.map((x) => (x.uri === a.uri ? { ...x, state: 'failed' } : x))); }
    });
  };
  // What is still missing, in order; the button says it.
  const missing = !photos.some((p) => p.state === 'done') ? 'Add at least 1 photo' : !f.title.trim() ? 'Add a title' : !(Number(f.price) > 0) ? 'Enter a price'
    : !(parseInt(f.quantity, 10) > 0) ? 'Enter how many you have' : f.agent_pct !== '' && !(Number(f.agent_pct) >= 0 && Number(f.agent_pct) <= 100) ? 'Agent rebate must be 0 to 100' : null;
  const validate = () => {
    const e = {};
    if (!photos.some((p) => p.state === 'done')) e.photos = 'Add at least 1 photo';
    if (!f.title.trim()) e.title = 'Add a title';
    if (!(Number(f.price) > 0)) e.price = 'Enter a price';
    if (!(parseInt(f.quantity, 10) > 0)) e.quantity = 'Must be at least 1';
    if (f.agent_pct !== '' && !(Number(f.agent_pct) >= 0 && Number(f.agent_pct) <= 100)) e.agent_pct = 'Enter 0 to 100';
    setErrs(e); return !Object.keys(e).length;
  };
  const save = async (status) => {
    if (status === 'live' && !validate()) return setPreview(false);
    setBusy(true);
    const row = { vendor_id: uid, category: f.category, is_waste: waste, title: f.title.trim() || 'Untitled draft', description: f.description || null,
      price: Number(f.price) || 1, unit: f.unit, quantity: parseInt(f.quantity, 10) || 0, status, agent_commission_pct: Math.min(100, Number(f.agent_pct) || 0),
      photos: photos.filter((p) => p.path).map((p) => p.path), attributes: waste && f.moisture ? { moisture: Number(f.moisture) } : {} };
    const { error } = id ? await supabase.from('listings').update(row).eq('id', id) : await supabase.from('listings').insert(row);
    setBusy(false);
    if (error) return Alert.alert("Couldn't save", friendlyError(error));
    navigation.goBack();
  };
  const del = () => Alert.alert('Delete this ' + noun + '?', 'Buyers stop seeing it. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('listings').delete().eq('id', id); navigation.goBack(); } }]);
  const uploading = photos.some((p) => p.state === 'uploading');
  const narrow = wide ? { maxWidth: 760 } : null;
  if (preview) return (
    <Screen scroll style={narrow} footer={<><Button title={vendor?.verification_status === 'approved' ? 'Publish ' + noun : 'Publishing opens once you are verified'} loading={busy} onPress={() => save('live')} disabled={vendor?.verification_status !== 'approved'} /><Button variant="ghost" title="Save as draft" onPress={() => save('draft')} /></>}>
      <AppBar title="Preview" onBack={() => setPreview(false)} />
      <Txt v="small">This is how buyers see your {noun}.</Txt>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {photos[0] ? <Image source={{ uri: photos[0].uri }} style={{ height: 220 }} /> : <View style={{ height: 220, backgroundColor: c.sf2 }} />}
        <View style={{ padding: 16, gap: 6 }}><Txt v="small">{vendor?.business_name}</Txt><Txt v="h1">{f.title}</Txt><Txt v="mono" style={{ fontSize: 24 }}>{naira(f.price)} <Txt v="small">/ {f.unit}</Txt></Txt>
          <Txt v="small">{f.quantity} available · Delivered by Poultry360</Txt></View>
      </Card>
      {vendor?.verification_status === 'approved' ? <Banner tone="info" icon="lightning-bolt-outline" body={'Goes live in under a minute. It can also show in nearby "' + catLabel(f.category).toLowerCase() + '" searches.'} /> : null}
    </Screen>
  );
  return (
    <Screen scroll style={narrow} footer={<View style={{ flexDirection: 'row', gap: 10 }}><Button variant="outline" title="Save draft" onPress={() => save('draft')} style={{ flex: 1 }} /><Button title={uploading ? 'Uploading photos…' : missing || 'Preview'} disabled={uploading || !!missing} onPress={() => validate() && setPreview(true)} style={{ flex: 1.4 }} /></View>}>
      <AppBar title={id ? 'Edit ' + noun : waste ? 'Sell waste' : 'New ' + noun} close />
      <ProgressSegments total={4} done={[photos.some((p) => p.state === 'done'), !!f.title.trim(), Number(f.price) > 0 && parseInt(f.quantity, 10) > 0, true].filter(Boolean).length} current={!!missing} />
      <FormGroup title="Photos">
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {photos.map((p, i) => (
            <Pressable key={p.uri} onPress={() => setPhotos(photos.filter((_, j) => j !== i))} accessibilityLabel="Remove photo" style={{ width: 88, height: 88, borderRadius: 16, overflow: 'hidden', backgroundColor: c.sf2 }}>
              <Image source={{ uri: p.uri }} style={{ width: 88, height: 88, opacity: p.state === 'done' ? 1 : 0.4 }} />
              {p.state !== 'done' ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><Icon name={p.state === 'failed' ? 'alert-circle' : 'cloud-upload-outline'} color={p.state === 'failed' ? c.err : c.ink} /></View> : null}
            </Pressable>
          ))}
          {photos.length < 4 ? <Pressable accessibilityRole="button" accessibilityLabel="Add photo" onPress={() => (asksSource ? setPhotoMenu(true) : addPhoto(false))} style={{ width: 88, height: 88, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: errs.photos ? c.err : c.line2, alignItems: 'center', justifyContent: 'center', gap: 4 }}><Icon name="camera-plus-outline" color={errs.photos ? c.err : c.acc} /><Txt v="small" style={{ fontSize: 13 }}>Add</Txt></Pressable> : null}
        </ScrollView>
        <Txt v="small" color={errs.photos ? c.err : undefined}>{errs.photos || 'Up to 4. Tap a photo to remove it.'}</Txt>
      </FormGroup>
      <FormGroup title="What it is">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{cats.map((k) => <Chip key={k.id} label={k.label} selected={f.category === k.id} onPress={() => setCategory(k.id)} />)}</View>
        <Input label="Title" value={f.title} onChangeText={set('title')} placeholder={waste ? 'Dry layer manure, 50 kg bag' : TITLE_EXAMPLE[f.category] || 'Product name and size'} error={errs.title} />
        <Input label="Description (optional)" value={f.description} onChangeText={set('description')} multiline placeholder={SUPPLY_CATEGORIES.includes(f.category) ? 'Pack size, storage or how to use' : "How it's raised, graded or packed"} />
        {waste ? <Input label="Moisture % (optional)" keyboardType="number-pad" value={f.moisture} onChangeText={(t) => set('moisture')(t.replace(/\D/g, '').slice(0, 2))} mono /> : null}
      </FormGroup>
      <FormGroup title="Price and stock">
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Input label="Price" prefix="₦" keyboardType="number-pad" value={f.price} onChangeText={(t) => set('price')(t.replace(/[^\d.]/g, ''))} mono error={errs.price} /></View>
          <View style={{ flex: 1 }}><Input label="How many" keyboardType="number-pad" value={f.quantity} onChangeText={(t) => set('quantity')(t.replace(/\D/g, ''))} mono error={errs.quantity} /></View>
        </View>
        <Txt v="strong" style={{ fontSize: 14 }}>Sold per</Txt>
        <ChipRow options={waste ? ['bag', 'tonne'] : [...new Set([...unitsFor(f.category), f.unit])]} value={f.unit} onChange={set('unit')} />
        <Input label="Agent rebate (optional)" suffix="%" keyboardType="decimal-pad" value={f.agent_pct} onChangeText={(t) => set('agent_pct')(t.replace(/[^\d.]/g, ''))} mono error={errs.agent_pct} hint="Agents earn this on what they buy from you, every 3 months." />
      </FormGroup>
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="truck-delivery-outline" size={16} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>{waste ? 'Orders over 1 tonne may need a scheduled truck pickup. We confirm the time with you.' : 'No delivery setup needed. Poultry360 riders collect from ' + (supplierOnly ? 'your store.' : 'your farm.')}</Txt></View>
      {id ? <Button variant="ghost" title={'Delete this ' + noun} onPress={del} /> : null}
      <PhotoSourceSheet visible={photoMenu} onClose={() => setPhotoMenu(false)} onPick={addPhoto} />
    </Screen>
  );
}

const ORDER_TABS = (g) => [{ value: 'new', label: 'New · ' + g.new.length }, { value: 'active', label: 'Active · ' + g.active.length }, { value: 'past', label: 'Past · ' + g.past.length }];
const groupOrders = (rows) => ({
  new: (rows || []).filter((r) => r.status === 'placed'),
  active: (rows || []).filter((r) => ['confirmed', 'ready', 'picked_up', 'out_for_delivery'].includes(r.status)),
  past: (rows || []).filter((r) => ['delivered', 'refunded', 'cancelled', 'flagged'].includes(r.status)),
});
const orderTone = (s) => (s === 'delivered' ? 'ok' : ['refunded', 'flagged', 'cancelled'].includes(s) ? 'err' : 'warn');

// One order in the list (website list column, phone list).
function OrderListCard({ o, selected, onPress, seller }) {
  const { c } = useTheme();
  const cd = countdown(o.sla_deadline);
  const urgent = o.status === 'placed' && cd.ms < 3 * 3.6e6;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={({ hovered }) => ({ backgroundColor: c.sf, borderRadius: 20, borderWidth: selected ? 2 : 1, borderColor: selected ? c.yolk : hovered ? c.line2 : c.line, padding: 14, gap: 6 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt v="bold" style={{ flex: 1 }}>{o.code}</Txt>
        {o.status === 'placed' ? <Pill tone={urgent ? 'err' : 'warn'} icon="timer-outline" label={cd.text.slice(0, 5) + ' left'} />
          : o.status === 'confirmed' ? <Pill tone="ok" label={'Accepted · pack by the ' + (seller === 'store' ? 'counter' : 'gate')} />
          : <Pill tone={orderTone(o.status)} label={STATUS_LABEL[o.status]} />}
      </View>
      <Txt v="strong" numberOfLines={2}>{items(o)}</Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="small">{o.buyer}{o.area ? ', ' + o.area : ''}</Txt><Txt v="mono">{naira(o.items_total)}</Txt></View>
    </Pressable>
  );
}

export function VendorOrdersScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const { seller } = useAuth();
  const stack = route?.name === 'ShopOrders';   // an agent's orders open as a page from their desk, not a tab
  const [tab, setTab] = useState('new');
  const [rows, setRows] = useState(null);
  const [sel, setSel] = useState(null);
  const [acting, setActing] = useState(null);
  useTick(1000);
  const load = useCallback(async () => setRows((await rpc('vendor_orders')) || []), []);
  useFocusEffect(useCallback(() => { load(); const ch = liveChannel('vo').on('postgres_changes', { event: '*', schema: 'public', table: 'sub_orders' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [load]));
  const g = groupOrders(rows);
  const list = g[tab];
  useEffect(() => { if (wide && list.length && !list.find((o) => o.id === sel)) setSel(list[0].id); }, [wide, tab, rows]);
  const accept = async (o) => { setActing(o.id); try { await rpc('vendor_respond', { p_sub: o.id, p_accept: true }); await load(); } catch (e) { Alert.alert("Couldn't accept", friendlyError(e)); } finally { setActing(null); } };
  const seg = <Segmented options={ORDER_TABS(g)} value={tab} onChange={setTab} />;
  const empty = <Empty art={seller === 'store' ? 'feed' : 'eggs'} title={tab === 'new' ? 'No new orders' : tab === 'active' ? 'Nothing being prepared' : 'No past orders yet'} body="New orders show here with a 24-hour timer to accept." />;
  if (wide) return (
    <Screen pad={false}>
      <View style={[{ flex: 1, padding: 20, gap: 20 }, page]}>
        <HeaderBar title="Orders"><View style={{ width: 380 }}>{seg}</View></HeaderBar>
        {rows === null ? <Skeleton h={200} r={20} /> : !list.length ? empty : (
          <View style={{ flex: 1, flexDirection: 'row', gap: 20, minHeight: 0 }}>
            <ScrollView style={{ flex: 0.55 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
              {list.map((o) => <OrderListCard key={o.id} o={o} seller={seller} selected={o.id === sel} onPress={() => setSel(o.id)} />)}
            </ScrollView>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
              {sel ? <SellerOrderDetail key={sel} id={sel} navigation={navigation} onChanged={load} /> : null}
            </ScrollView>
          </View>
        )}
      </View>
    </Screen>
  );
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: stack ? 0 : 8, gap: 14 }}>
        {stack ? <AppBar title="Orders" /> : <><TopBar navigation={navigation} cart={false} /><Txt v="display">Orders</Txt></>}
        {seg}
        {rows === null ? <Skeleton h={100} r={20} /> : !list.length ? empty
          : tab === 'new' ? list.map((o) => {
            const cd = countdown(o.sla_deadline);
            return <ActionRow key={o.id} icon="shopping-outline" title={items(o)} detail={o.buyer + (o.area ? ', ' + o.area : '') + ' · ' + o.code}
              pill={<Pill tone={cd.ms < 3 * 3.6e6 ? 'err' : 'warn'} icon="timer-outline" label={cd.text.slice(0, 5) + ' left'} />} amount={naira(o.items_total)}
              onPress={() => navigation.navigate('VendorOrder', { id: o.id })} action={{ title: 'Accept', onPress: () => accept(o), loading: acting === o.id }} />;
          }) : list.map((o) => <OrderListCard key={o.id} o={o} seller={seller} onPress={() => navigation.navigate('VendorOrder', { id: o.id })} />)}
      </ScrollView>
    </Screen>
  );
}

const DECLINE = ['Out of stock', "Can't prepare in time", 'Other'];
// One order for the seller, by stage: new (countdown, Accept / Decline), accepted (checklist, then riders), ready / on the way (rider),
// past (delivered, paid). The money block is always shown.
function SellerOrderDetail({ id, navigation, onChanged }) {
  const { c } = useTheme();
  const wide = useWide();
  const { seller, bookName } = useAuth();
  const [o, setO] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [decl, setDecl] = useState(false);
  const [reason, setReason] = useState(null);
  const [checks, setChecks] = useState([false, false, false]);
  const [pickup, setPickup] = useState({ riders: [], available_now: 0 });
  useTick(1000);
  const load = useCallback(async () => {
    const [list, opts] = await Promise.all([rpc('vendor_orders'), rpc('vendor_pickup_riders').catch(() => null)]);
    setO((list || []).find((x) => x.id === id) || null);
    if (opts) setPickup(opts);
  }, [id]);
  useEffect(() => {
    load();
    // Live: rider accepted / arrived / picked up shows here without reopening the order.
    const ch = liveChannel('vorder-' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  const act = async (fn) => { setBusy(true); try { await fn(); await load(); onChanged?.(); } catch (e) { Alert.alert("Couldn't do that", friendlyError(e)); } finally { setBusy(false); } };
  const markReady = (riderId) => act(async () => {
    const r = await rpc('vendor_mark_ready', { p_sub: o.id, p_rider: riderId || null });
    if (r.joined) Alert.alert('Added to ' + r.rider + "'s trip", 'They collect it with your other orders.');
    else if (!r.assigned) Alert.alert('Finding a rider', 'Every rider is busy right now. The next one to finish a delivery gets this order.');
  });
  if (o === undefined) return <Skeleton h={240} r={24} />;
  if (o === null) return <Empty icon="receipt-text-outline" title="Order not found" />;
  const cd = countdown(o.sla_deadline);
  const ticked = checks.every(Boolean);
  const money = (
    <Card style={{ gap: 4 }}>
      <Txt v="h2" style={{ marginBottom: 4 }}>Money</Txt>
      {(o.items || []).map((i, k) => <MoneyLine key={k} label={i.qty + ' × ' + i.title} value={naira(i.qty * i.price)} />)}
      <MoneyLine label="Commission, 10%" value={'−' + naira(o.commission)} />
      <View style={{ borderTopWidth: 1, borderColor: c.line, marginTop: 4, paddingTop: 4 }}><MoneyLine strong label="You receive" value={naira(o.net)} /></View>
    </Card>
  );
  const head = (label, extra) => (
    <View style={{ gap: 2 }}>
      <Txt v="label" color={c.hmute}>{o.code + ' · ' + o.buyer + (o.area ? ', ' + o.area : '')}</Txt>
      <Txt v="h2" color={c.hink}>{label}</Txt>
      {extra}
    </View>
  );
  const riderCard = o.rider ? (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="motorbike" color={c.navactink} /></View>
      <View style={{ flex: 1 }}>
        <Txt v="bold">{o.rider.name}{o.status === 'ready' ? ({ offered: ' · waiting to accept', accepted: ' is on the way', at_farm: ' is at your ' + seller }[o.rider.status] || '') : ''}</Txt>
        <Txt v="small">{o.rider.vehicle}{o.rider.plate ? ' · ' + o.rider.plate : ''}</Txt>
      </View>
      {['ready', 'picked_up'].includes(o.status) && o.rider.phone ? <Button small variant="outline" icon="phone" title="Call" onPress={() => Linking.openURL('tel:+' + o.rider.phone)} style={{ paddingHorizontal: 16 }} /> : null}
    </Card>
  ) : null;
  return <>
    {o.status === 'placed' ? <>
      <Hearth>
        {head(items(o))}
        <View><Txt v="monoLg" color={c.hink} style={{ fontSize: 36, lineHeight: 42 }}>{cd.text}</Txt><Txt v="small" color={c.hmute}>Left to accept · refunded to the buyer after that</Txt></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button small variant="onHearth" icon="check" title="Accept" loading={busy} onPress={() => act(() => rpc('vendor_respond', { p_sub: o.id, p_accept: true }))} style={{ flex: 1 }} />
          <Button small variant="hearthOutline" title="Decline" onPress={() => setDecl(true)} style={{ flex: 1 }} />
        </View>
      </Hearth>
    </> : o.status === 'confirmed' ? <>
      <Hearth>{head('Prepare for pickup', <Txt v="small" color={c.hmute}>{items(o)}</Txt>)}<ProgressSegments total={3} done={checks.filter(Boolean).length} onDark /></Hearth>
      <Card style={{ padding: 0, overflow: 'hidden' }}>{['Count the items', 'Remove damaged ones', seller === 'store' ? 'Pack by the counter' : 'Pack by the gate'].map((t, i) => (
        <Pressable key={t} onPress={() => setChecks(checks.map((v, j) => (j === i ? !v : v)))} accessibilityRole="checkbox" accessibilityState={{ checked: checks[i] }}
          style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, minHeight: 56, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: checks[i] ? c.yolk : 'transparent', borderWidth: checks[i] ? 0 : 2, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>{checks[i] ? <Icon name="check" size={18} color={c.onyolk} /> : null}</View>
          <Txt v={checks[i] ? 'bold' : 'body'} style={{ flex: 1 }}>{t}</Txt>
        </Pressable>))}</Card>
      <View style={{ gap: 10 }}>
        {pickup.riders.map((r) => <Button key={r.id} variant="outline" icon="motorbike" disabled={!ticked} loading={busy}
          title={'Add to ' + r.name.split(' ')[0] + "'s trip · " + (r.at_farm ? 'here now' : r.awaiting_accept ? 'waiting to accept' : 'on the way')} onPress={() => markReady(r.id)} />)}
        <Button icon="check-all" title={ticked ? 'Request a new rider' : 'Tick all three to continue'} disabled={!ticked} loading={busy} onPress={() => markReady(null)} />
        <Txt v="small" style={{ textAlign: 'center' }}>{pickup.available_now ? pickup.available_now + (pickup.available_now === 1 ? ' rider' : ' riders') + ' free right now' : 'No riders free right now. The next one to finish a delivery gets it.'}</Txt>
      </View>
    </> : o.status === 'delivered' ? (
      <Hearth>{head('Delivered', <Txt v="small" color={c.hmute}>{timeAgo(o.created_at)}</Txt>)}
        {o.on_credit ? null : <Txt v="monoLg" color={c.hink} style={{ fontSize: 34, lineHeight: 40 }}>{'+' + naira(o.net)}</Txt>}
        <Txt v="small" color={c.hmute}>{o.on_credit ? 'Sold on credit · in your ' + bookName : 'Added to your wallet'}</Txt></Hearth>
    ) : ['refunded', 'cancelled', 'flagged'].includes(o.status) ? (
      <Banner tone="err" title={STATUS_LABEL[o.status]} body="The buyer was refunded. Nothing is paid to you for this order." />
    ) : <>
      <Hearth>{head(STATUS_LABEL[o.status], <Txt v="small" color={c.hmute}>{items(o)}</Txt>)}
        {!o.rider && o.status === 'ready' ? <Txt v="small" color={c.hmute}>{pickup.available_now ? 'Finding a rider. This updates as soon as one accepts.' : 'All riders are on deliveries. The next one to finish gets your order.'}</Txt> : null}
        <Txt v="small" color={c.hmute}>{o.on_credit ? 'Sold on credit: you are not paid at delivery.' : naira(o.net) + ' reaches your wallet on delivery.'}</Txt></Hearth>
      {riderCard}
    </>}
    {o.status !== 'placed' && o.status !== 'confirmed' && o.status !== 'ready' && riderCard && !['picked_up', 'out_for_delivery'].includes(o.status) ? riderCard : null}
    {money}
    {o.on_credit ? <Banner tone="info" icon="credit-card-clock-outline" title="Sold on credit" body={naira(o.items_total) + ' is in your ' + bookName + ' as payment pending.'} action={'Open ' + bookName} onAction={() => navigation.navigate('FarmBook')} /> : null}
    <Sheet visible={decl} onClose={() => setDecl(false)}>
      <Txt v="h1">Why are you declining?</Txt>
      <ChipRow options={DECLINE} value={reason} onChange={setReason} />
      <Txt v="small">The buyer is refunded straight away.</Txt>
      <Button variant="danger" title={reason ? 'Decline order' : 'Pick a reason'} disabled={!reason} loading={busy} onPress={() => { setDecl(false); act(() => rpc('vendor_respond', { p_sub: o.id, p_accept: false, p_reason: reason })); }} />
    </Sheet>
  </>;
}

export function VendorOrderScreen({ navigation, route }) {
  const wide = useWide();
  return (
    <Screen scroll style={wide ? { maxWidth: 760 } : null}>
      <AppBar title="Order" />
      <SellerOrderDetail id={route.params.id} navigation={navigation} />
    </Screen>
  );
}
