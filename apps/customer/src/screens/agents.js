import React, { useCallback, useEffect, useState } from 'react';
import { View, BackHandler, Alert, Image, Linking, Platform, FlatList, ScrollView } from 'react-native';
import { Press as Pressable } from '@p360/shared';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Empty, Input, Chip, Segmented, Pill, Group, Row, Skeleton, Sheet, Banner,
  naira, shortDate, timeAgo, rpc, friendlyError, shareText, useWide, usePage, inviteLink, agentLink, pendingInviteNow, clearPendingInvite,
  PLAY_STORE_URL, LOGO_MARK, supabase, useTick, countdown, publicUrl, HeaderBar, SectionHead, FigureStrip, ActionList, ActionRow, DataTable, MeterBar, MoneyLine, Thumb } from '@p360/shared';
import { TopBar } from '../components/RoleSwitcher';
import { useAuth } from '../context/AuthContext';
import { fetchListings } from '../lib/catalog';
import { distanceKm, kmLabel } from '../lib/nearby';
import { getHere, useSpot } from '../lib/spot';
import { ListingCard, useGridCols, padRows } from './buyer';

// Store agents: people who run their own shop with a store's (the "mother store") products.
// An agent buys stock from the store (the store records a cash handover, or the agent pays from the wallet
// and the store confirms), sells it in the app from their own shop or offline, and earns the store's
// rebate on what they buy, every quarter.
// Agent side: AgentJoin (open a shop), AgentDesk (root screen in agent mode), AgentBuy, AgentSale, AgentShop
// (the public shop page). Store side: StoreAgents (invite + requests + leaderboard), StoreAgent (one agent),
// StoreGiveStock (record a handover).

// Share a link: copy it, or send it with the phone's / browser's share options (WhatsApp, SMS…).
// Either choice closes the pop-up; onCopied lets the screen say "Link copied".
function ShareLinkSheet({ visible, onClose, onCopied, title, link, message }) {
  const { c } = useTheme();
  const copy = async () => {
    onClose();
    try { await Clipboard.setStringAsync(link); onCopied?.(); } catch { Alert.alert("Couldn't copy", link); }
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt v="h2">{title}</Txt>
      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, backgroundColor: c.sf }}>
        <Txt v="body" selectable numberOfLines={2}>{link}</Txt>
      </View>
      <Button icon="content-copy" title="Copy link" onPress={copy} />
      <Button variant="outline" icon="share-variant-outline" title="Share" onPress={() => { onClose(); shareText(message); }} />
    </Sheet>
  );
}

// true for a moment after flash(): the "Link copied" confirmation
function useFlash(ms = 2500) {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return undefined; const t = setTimeout(() => setOn(false), ms); return () => clearTimeout(t); }, [on, ms]);
  return [on, () => setOn(true)];
}

const plural = (u, q) => (Number(q) === 1 || !u || u === 'kg' || u.endsWith('s') ? u : u + 's');
const itemsText = (items) => (items || []).map((i) => Number(i.qty).toLocaleString() + ' ' + plural(i.unit || 'unit', i.qty) + ' ' + i.name).join(', ');
const firstName = (n) => (n || '').trim().split(' ')[0];
// '2026-12-31' -> '31 Dec'
const dayMonth = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : '');

// "Pin my location" for a shop's address: shows whether it's pinned.
function PinButton({ geo, onPin }) {
  const [busy, setBusy] = useState(false);
  return <Button small variant="outline" icon={geo ? 'check' : 'crosshairs-gps'} title={geo ? 'Location pinned' : 'Pin my location'} loading={busy}
    onPress={async () => { setBusy(true); try { const h = await getHere(); if (h) onPin(h); } finally { setBusy(false); } }} />;
}

// Pick products and how many: used for buying stock, handing it over and logging a sale.
// products: [{ id, title, price, unit, quantity }]; lines: { [id]: qty text }
function ItemPicker({ products, lines, setLines, onChange, stockLabel = 'in stock' }) {
  const toggle = (p) => { setLines((l) => { const n = { ...l }; if (n[p.id] !== undefined) delete n[p.id]; else n[p.id] = ''; return n; }); onChange?.(); };
  const qty = (p) => parseInt(lines[p.id] || '0', 10) || 0;
  return <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {products.map((p) => <Chip key={p.id} label={p.title + ' · ' + naira(p.price) + '/' + p.unit} selected={lines[p.id] !== undefined} onPress={() => toggle(p)} />)}
    </View>
    {products.filter((p) => lines[p.id] !== undefined).map((p) => (
      <Card key={p.id}>
        <Txt v="bold">{p.title}</Txt>
        <Input label={'How many ' + plural(p.unit, 2) + '?'} keyboardType="number-pad" value={lines[p.id]} mono autoFocus hint={Number(p.quantity).toLocaleString() + ' ' + stockLabel}
          onChangeText={(t) => { setLines((l) => ({ ...l, [p.id]: t.replace(/\D/g, '') })); onChange?.(); }} />
        {qty(p) > 0 ? <Txt v="small">{qty(p) + ' × ' + naira(p.price) + ' = '}<Txt v="mono" style={{ fontSize: 13 }}>{naira(qty(p) * Number(p.price))}</Txt></Txt> : null}
      </Card>
    ))}
  </>;
}
// The chosen lines, checked against what's available. Returns { items, total, rebate, error }.
function pickedLines(products, lines, stockLabel) {
  const chosen = products.filter((p) => lines[p.id] !== undefined);
  const qty = (p) => parseInt(lines[p.id] || '0', 10) || 0;
  if (!chosen.length) return { error: 'Pick at least one product', total: 0, rebate: 0 };
  const total = chosen.reduce((t, p) => t + qty(p) * Number(p.price), 0);
  const rebate = chosen.reduce((t, p) => t + Math.round(qty(p) * Number(p.price) * Number(p.pct || 0)) / 100, 0);
  if (chosen.some((p) => qty(p) < 1)) return { error: 'Enter how many for each product', total, rebate };
  const over = chosen.find((p) => qty(p) > Number(p.quantity));
  if (over) return { error: 'Only ' + Number(over.quantity).toLocaleString() + ' ' + plural(over.unit, over.quantity) + ' of ' + over.title + ' ' + stockLabel, total, rebate };
  return { items: chosen.map((p) => ({ listing_id: p.id, qty: qty(p) })), total, rebate };
}

// ---------- Agent side ----------
// Opening a shop: the store's code (filled in from an invite link), the agent's name and where riders collect from.
export function AgentJoinScreen({ navigation, route }) {
  const { c } = useTheme();
  const { refresh, profile } = useAuth();
  const [onboarding] = useState(() => !(profile?.roles || []).length);   // first sign-up: the app opens on its own once the role exists
  const [fromLink] = useState(() => route?.params?.code || pendingInviteNow() || '');
  const [code, setCode] = useState(fromLink);
  const [store, setStore] = useState(null);
  const [name, setName] = useState(profile?.full_name || '');
  const [address, setAddress] = useState('');
  const [geo, setGeo] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = code.trim();
    if (k.length < 4) { setStore(null); return undefined; }
    const t = setTimeout(() => rpc('store_by_invite', { p_code: k }).then((r) => setStore(r || null)).catch(() => setStore(null)), 300);
    return () => clearTimeout(t);
  }, [code]);
  const open = async () => {
    const e = {};
    if (code.trim().length < 4) e.code = "Enter the store's code";
    if (!name.trim()) e.name = 'Enter your name';
    if (!address.trim()) e.address = 'Enter your address';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const r = await rpc('agent_join', { p_code: code.trim(), p_location: address.trim(), p_lat: geo?.lat ?? null, p_lng: geo?.lng ?? null, p_name: name.trim() });
      await clearPendingInvite();
      await refresh();
      Alert.alert('Your shop is open', 'Buy stock from ' + r.store + ' to start selling.');
      if (!onboarding) navigation.popTo('Tabs');
    } catch (er) { setErrs({ form: friendlyError(er) }); } finally { setBusy(false); }
  };
  const elsewhere = async () => { await clearPendingInvite(); navigation.navigate('Role'); };
  return (
    <Screen scroll footer={<>
      {errs.form ? <Txt v="small" color={c.err} style={{ textAlign: 'center' }}>{errs.form}</Txt> : null}
      <Button title="Open my shop" loading={busy} onPress={open} />
    </>}>
      {navigation.canGoBack() ? <AppBar /> : <View style={{ height: 40 }} />}
      <Txt v="display">Open your shop</Txt>
      {store ? <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront-outline" size={22} color={c.navactink} /></View>
        <View style={{ flex: 1 }}><Txt v="small">Selling for</Txt><Txt v="strong">{store.name}</Txt></View>
        <Icon name="check-decagram" color={c.acc} />
      </Card> : null}
      {!fromLink || !store ? <Input label="Store code" value={code} onChangeText={(t) => { setCode(t.toUpperCase()); setErrs({}); }} placeholder="ST4K9QXR" autoCapitalize="characters" autoCorrect={false} mono error={errs.code} /> : null}
      <Input label="Your name" value={name} onChangeText={(t) => { setName(t); setErrs({}); }} placeholder="Adaeze Okafor" autoCapitalize="words" error={errs.name} />
      <Input label="Shop address" value={address} onChangeText={(t) => { setAddress(t); setErrs({}); }} placeholder="12 Aba Road, GRA" error={errs.address} hint="Riders collect your orders here." />
      <PinButton geo={geo} onPin={setGeo} />
      {onboarding ? <Pressable onPress={elsewhere} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 10 }}><Txt v="small">Not joining a store? Use Poultry360 another way</Txt></Pressable> : null}
    </Screen>
  );
}

// Days through the current quarter, for the bar on the money card.
function quarterProgress(end) {
  if (!end) return { pct: 0, left: 0 };
  const e = new Date(end + 'T23:59:59');
  const s = new Date(e.getFullYear(), e.getMonth() - 2, 1);
  const pct = Math.min(1, Math.max(0, (Date.now() - s) / (e - s)));
  return { pct, left: Math.max(0, Math.ceil((e - Date.now()) / 864e5)) };
}

const MOVE = { pending: ['Waiting', 'warn'], declined: ['Declined', 'err'], cancelled: ['Cancelled', 'neutral'] };

// The agent's dashboard (newdesign 6.4): header with Share shop / Log a sale / Buy stock, the rebate Hearth with the
// quarter's progress, figures, then needs-action + My stock on the left and the shop link + Restock on the right.
export function AgentDeskScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const { wallet, refreshWallet } = useAuth();
  useTick(30000);
  const [d, setD] = useState(undefined);
  const [orders, setOrders] = useState([]);
  const [sharing, setSharing] = useState(false);
  const [copied, flashCopied] = useFlash();
  const [placing, setPlacing] = useState(false);
  const load = useCallback(async () => {
    try {
      setD(await rpc('agent_home'));
      rpc('vendor_orders').then((r) => setOrders(r || [])).catch(() => {});
      refreshWallet();
    } catch { setD(null); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const shell = (children) => (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: wide ? 24 : 18, paddingBottom: 48 }, page]}>
        {!wide ? <TopBar navigation={navigation} cart={false} /> : null}
        {children}
      </ScrollView>
    </Screen>
  );
  if (d === undefined) return shell(<><Skeleton h={60} r={16} /><Skeleton h={180} r={24} /><Skeleton h={110} r={20} /></>);
  if (!d?.store) return shell(<Empty icon="storefront-outline" title="You're not with a store" body="Ask a store for its code to open your shop." action="Join a store" onAction={() => navigation.navigate('AgentJoin')} />);

  const name = d.shop ? firstName(d.shop.name) : '';
  const rebate = d.rebate || {};
  const owed = Number(rebate.earned || 0) - Number(rebate.paid || 0);
  const q = quarterProgress(rebate.quarter_end);
  const stock = d.stock || [];
  const units = stock.reduce((t, p) => t + Math.max(0, Number(p.quantity)), 0);
  const need = orders.filter((o) => o.status === 'placed' || o.status === 'confirmed');
  const moves = d.moves || [];
  const pending = moves.filter((m) => m.status === 'pending');
  const logged = (d.recent || []).filter((s) => s.source === 'logged');
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = (t) => new Date(t).getTime() >= monthStart;
  const soldOrders = orders.filter((o) => o.status === 'delivered' && thisMonth(o.created_at));
  const soldLogged = logged.filter((s) => s.status === 'recorded' && thisMonth(s.created_at));
  const sold = soldOrders.reduce((t, o) => t + Number(o.items_total), 0) + soldLogged.reduce((t, s) => t + Number(s.total), 0);
  const sales = soldOrders.length + soldLogged.length;
  const unpinned = !d.shop?.location || d.shop?.lat == null;
  const link = agentLink(d.code);
  const copyLink = async () => { try { await Clipboard.setStringAsync(link); flashCopied(); } catch { Alert.alert("Couldn't copy", link); } };
  const cancelBuy = (m) => Alert.alert('Cancel this order?', naira(m.total) + ' goes back to your wallet.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Cancel order', style: 'destructive', onPress: async () => { try { await rpc('agent_cancel_stock', { p_move: m.id }); load(); } catch (e) { Alert.alert("Couldn't cancel", friendlyError(e)); } } }]);
  const cancelSale = (s) => Alert.alert('Cancel this sale?', 'The stock goes back into your shop.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Cancel sale', style: 'destructive', onPress: async () => { try { await rpc('agent_cancel_sale', { p_sale: s.id }); load(); } catch (e) { Alert.alert("Couldn't cancel", friendlyError(e)); } } }]);
  const leaveStore = () => Alert.alert('Leave ' + d.store.name + '?', 'Your shop closes and its products come off sale. Your records stay.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: async () => { try { await rpc('agent_leave'); load(); } catch (e) { Alert.alert("Couldn't leave", friendlyError(e)); } } }]);

  const header = (
    <HeaderBar lead={<View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" color={c.hink}>{(name || 'A')[0].toUpperCase()}</Txt></View>}
      title={(name || 'Your') + "'s shop"}
      subtitle={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><Icon name="check-decagram" size={16} color={c.acc} /><Txt v="small" style={{ fontSize: 14 }}>{'Agent for ' + d.store.name + (d.shop?.location ? ' · ' + d.shop.location : '')}</Txt><Pill label={'Code ' + d.code} /></View>}>
      <Button small variant="outline" icon={copied ? 'check' : 'share-variant-outline'} title={copied ? 'Link copied' : 'Share shop'} onPress={() => setSharing(true)} style={{ paddingHorizontal: 16 }} />
      <Button small variant="outline" icon="receipt-text-outline" title="Log a sale" onPress={() => navigation.navigate('AgentSale')} style={{ paddingHorizontal: 16 }} />
      <Button small icon="cart-arrow-down" title="Buy stock" onPress={() => navigation.navigate('AgentBuy')} style={{ paddingHorizontal: 18 }} />
    </HeaderBar>
  );
  const money = (
    <Hearth style={wide ? { flex: 1, justifyContent: 'space-between' } : null}>
      <Txt v="label" color={c.hmute}>Rebate owed to you</Txt>
      <Txt v="monoLg" color={c.hink} style={{ fontSize: wide ? 44 : 40, lineHeight: wide ? 50 : 46 }}>{naira(owed)}</Txt>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt v="small" color={c.hmute}>{'This quarter so far ' + naira(rebate.quarter)}</Txt>
          <Txt v="small" color={c.hmute}>{q.left + (q.left === 1 ? ' day' : ' days') + ' to payout'}</Txt>
        </View>
        <MeterBar pct={q.pct} onDark />
        <Txt v="small" color={c.hmute}>{'Paid to you after ' + dayMonth(rebate.quarter_end)}</Txt>
      </View>
    </Hearth>
  );
  const figures = (
    <FigureStrip style={wide ? { flex: 1.4 } : null} items={[
      { label: 'Wallet', value: naira(wallet?.balance), note: 'Top up to buy stock', icon: 'wallet-outline' },
      { label: 'In stock', value: units.toLocaleString(), note: stock.length === 1 ? '1 product' : stock.length + ' products', icon: 'package-variant-closed', tone: stock.some((p) => p.quantity > 0 && p.quantity <= 3) ? 'warn' : 'mute' },
      { label: 'Sold this month', value: naira(sold), note: sales === 1 ? '1 sale' : sales + ' sales', icon: 'chart-line' },
    ]} />
  );
  const actionRows = [
    ...pending.map((m) => (
      <ActionRow key={m.id} icon="truck-fast-outline" iconTone="warn" title={'Stock from ' + d.store.name} detail={itemsText(m.items)} amount={naira(m.total)}
        action={{ title: 'Cancel', variant: 'outline', onPress: () => cancelBuy(m) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
          {[['Paid', 'done'], ['Handover', 'current'], ['In your stock', 'todo']].map(([label, st], i) => (
            <React.Fragment key={label}>
              {i ? <View style={{ flex: 1, height: 2, maxWidth: 60, backgroundColor: i === 1 ? c.yolk : c.line2 }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: st === 'done' ? c.yolk : st === 'current' ? c.orange : 'transparent', borderWidth: st === 'todo' ? 2 : 0, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>
                  {st === 'done' ? <Icon name="check" size={11} color={c.onyolk} /> : null}
                </View>
                <Txt v={st === 'current' ? 'bold' : 'small'} color={st === 'todo' ? c.mute : undefined} style={{ fontSize: 13 }}>{label}</Txt>
              </View>
            </React.Fragment>
          ))}
        </View>
      </ActionRow>
    )),
    ...need.map((o) => {
      const cd = countdown(o.sla_deadline);
      return <ActionRow key={o.id} icon="shopping-outline" title={(o.items || []).map((i) => i.qty + ' × ' + i.title).join(', ')} detail={o.buyer + (o.area ? ', ' + o.area : '')}
        pill={o.status === 'placed' ? <Pill tone={cd.ms < 3 * 3.6e6 ? 'err' : 'warn'} icon="timer-outline" label={cd.text.slice(0, 5) + ' left'} /> : <Pill tone="ok" label="Accepted · pack by the counter" />}
        amount={naira(o.items_total)} onPress={() => navigation.navigate('VendorOrder', { id: o.id })}
        action={{ title: o.status === 'placed' ? 'Open' : 'Mark ready', variant: o.status === 'placed' ? 'primary' : 'outline', onPress: () => navigation.navigate('VendorOrder', { id: o.id }) }} />;
    }),
  ];
  const needs = (
    <ActionList count={actionRows.length} empty={
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.sf }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sagebg, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={20} color={c.sage} /></View>
        <View style={{ flex: 1 }}><Txt v="strong">You're all caught up</Txt><Txt v="small">Customer orders show here with a 24-hour timer.</Txt></View>
      </View>}>{actionRows}</ActionList>
  );
  const stockTable = (
    <View style={{ gap: 12 }}>
      <SectionHead title="My stock" action={stock.length ? 'Buy more' : null} onAction={() => navigation.navigate('AgentBuy')} />
      <DataTable minWidth={600} columns={[{ label: 'Product', flex: 2.2 }, { label: 'Price', flex: 1.2 }, { label: 'In stock', flex: 1 }, { label: 'Value', right: true }, { label: 'Status', flex: 0.9, right: true }]}
        rows={stock.map((p) => ({ key: p.id, cells: [
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Thumb uri={p.photo ? publicUrl('listing-photos', p.photo) : null} category="feed" size={40} /><Txt v="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{p.title}</Txt></View>,
          <Txt v="body" numberOfLines={1}>{naira(p.price) + ' / ' + p.unit}</Txt>,
          <Txt v="mono">{Number(p.quantity).toLocaleString() + ' ' + plural(p.unit, p.quantity)}</Txt>,
          <Txt v="mono">{naira(Number(p.price) * Math.max(0, Number(p.quantity)))}</Txt>,
          <Pill tone={p.quantity <= 0 ? 'err' : p.quantity <= 3 ? 'warn' : 'ok'} icon={p.quantity > 0 && p.quantity <= 3 ? 'alert-outline' : undefined} label={p.quantity <= 0 ? 'Sold out' : p.quantity <= 3 ? 'Low' : 'On sale'} />] }))}
        empty={<Empty art="feed" title="No stock yet" body={'Buy from ' + d.store.name + ', then customers can order it from your shop.'} action="Buy stock" onAction={() => navigation.navigate('AgentBuy')} style={{ borderWidth: 0 }} />} />
    </View>
  );
  const activity = [...moves.filter((m) => m.status !== 'pending').map((m) => ({ kind: 'buy', at: m.created_at, m })), ...logged.map((s) => ({ kind: 'sale', at: s.created_at, s }))]
    .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);
  const recent = (
    <View style={{ gap: 12 }}>
      <SectionHead title="Recent activity" />
      <DataTable minWidth={560} columns={[{ label: 'When', flex: 0.9 }, { label: 'What', flex: 2.4 }, { label: 'Amount', right: true }]}
        rows={activity.map((a) => a.kind === 'buy' ? { key: 'm' + a.m.id, cells: [
          <Txt v="small">{timeAgo(a.at)}</Txt>,
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="cart-arrow-down" size={18} color={c.acc} /><Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>{'Bought ' + itemsText(a.m.items)}</Txt>{MOVE[a.m.status] ? <Pill tone={MOVE[a.m.status][1]} label={MOVE[a.m.status][0]} /> : null}</View>,
          <View style={{ alignItems: 'flex-end' }}><Txt v="mono">{naira(a.m.total)}</Txt>{Number(a.m.rebate) > 0 && !MOVE[a.m.status] ? <Txt v="small" color={c.sage}>{'+' + naira(a.m.rebate) + ' rebate'}</Txt> : null}</View>] }
          : { key: 's' + a.s.id, onPress: a.s.status === 'recorded' && Date.now() - new Date(a.s.created_at).getTime() < 864e5 ? () => cancelSale(a.s) : undefined, cells: [
          <Txt v="small">{timeAgo(a.at)}</Txt>,
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="receipt-text-outline" size={18} color={c.t2i} /><Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>{'Sold ' + itemsText(a.s.items) + (a.s.buyer_name ? ' to ' + a.s.buyer_name : '')}</Txt>{a.s.status === 'cancelled' ? <Pill label="Cancelled" /> : null}</View>,
          <Txt v="mono">{naira(a.s.total)}</Txt>] })}
        empty={<Empty icon="history" title="Nothing yet" body="Stock you buy and sales you log show here." style={{ borderWidth: 0 }} />} />
    </View>
  );
  const shopLink = (
    <Card style={{ gap: 12, padding: 18 }}>
      <Txt v="h2">Your shop link</Txt>
      <Txt v="small">Customers who open it order from your stock.</Txt>
      <View style={{ backgroundColor: c.sf2, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 }}><Txt v="mono" selectable numberOfLines={1} style={{ fontSize: 14 }}>{link.replace(/^https?:\/\//, '')}</Txt></View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small icon={copied ? 'check' : 'content-copy'} title={copied ? 'Copied' : 'Copy link'} onPress={copyLink} style={{ flex: 1 }} />
        <Button small variant="outline" icon="eye-outline" title="Open" onPress={() => navigation.navigate('AgentShop', { code: d.code })} style={{ flex: 1 }} />
      </View>
    </Card>
  );
  const where = (
    <Card onPress={() => setPlacing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: unpinned ? c.warnbg : c.sagebg, alignItems: 'center', justifyContent: 'center' }}><Icon name={unpinned ? 'map-marker-alert-outline' : 'map-marker-check-outline'} size={20} color={unpinned ? c.warn : c.sage} /></View>
      <View style={{ flex: 1 }}><Txt v="strong">{d.shop?.location ? 'Pickup address' : 'Add your shop address'}</Txt><Txt v="small" numberOfLines={2}>{d.shop?.location ? d.shop.location + (d.shop.lat == null ? ' · not pinned' : ' · pinned') : 'Riders collect your orders here'}</Txt></View>
      <Icon name="chevron-right" color={c.mute} />
    </Card>
  );
  const products = (d.products || []).slice(0, 6);
  const restock = products.length ? (
    <View style={{ gap: 12 }}>
      <SectionHead title={'Restock from ' + d.store.name} action="Buy stock" onAction={() => navigation.navigate('AgentBuy')} />
      <View style={{ backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
        {products.map((p, i) => (
          <Pressable key={p.id} onPress={() => navigation.navigate('AgentBuy')} accessibilityRole="button"
            style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: i ? 1 : 0, borderColor: c.line, backgroundColor: hovered ? c.sf2 : 'transparent' })}>
            <Thumb uri={p.photo ? publicUrl('listing-photos', p.photo) : null} category="feed" size={44} />
            <View style={{ flex: 1, gap: 2 }}><Txt v="strong" numberOfLines={1}>{p.title}</Txt><Txt v="small">{naira(p.price) + ' / ' + p.unit + (Number(p.quantity) > 0 ? '' : ' · store is out')}</Txt></View>
            {Number(p.pct) > 0 ? <Pill tone="ok" icon={null} label={Number(p.pct) + '% rebate'} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  ) : null;
  return shell(<>
    {header}
    {unpinned ? <Banner tone="warn" icon="map-marker-alert-outline" title={d.shop?.location ? "Pin your shop's location" : 'Add your shop address'} body="Nearby buyers see you first and pay less for delivery." action="Add" onAction={() => setPlacing(true)} /> : null}
    {wide ? <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>{money}{figures}</View> : <>{money}{figures}</>}
    {wide ? (
      <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
        <View style={{ flex: 1.6, gap: 24 }}>{needs}{stockTable}{recent}</View>
        <View style={{ flex: 1, gap: 24, minWidth: 300 }}>{shopLink}{where}{restock}<Button variant="ghost" title="Leave this store" onPress={leaveStore} /></View>
      </View>
    ) : <>{needs}{stockTable}{shopLink}{where}{restock}{recent}<Button variant="ghost" title="Leave this store" onPress={leaveStore} /></>}
    <ShareLinkSheet visible={sharing} onClose={() => setSharing(false)} onCopied={flashCopied} title="Your shop link" link={link} message={'Order from my shop on Poultry360: ' + link} />
    <ShopPlaceSheet visible={placing} onClose={() => setPlacing(false)} shop={d.shop} onDone={load} />
  </>);
}

// Where riders collect from (an agent who joined before shops had addresses, or one who hasn't pinned it).
function ShopPlaceSheet({ visible, onClose, shop, onDone }) {
  const [address, setAddress] = useState(shop?.location || '');
  const [geo, setGeo] = useState(shop?.lat != null ? { lat: shop.lat, lng: shop.lng } : null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!address.trim()) return setErr('Enter your address');
    setBusy(true);
    try { await rpc('set_shop_location', { p_location: address.trim(), p_lat: geo?.lat ?? null, p_lng: geo?.lng ?? null }); onClose(); onDone(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt v="h1">Shop address</Txt>
      <Input label="Address" value={address} onChangeText={(t) => { setAddress(t); setErr(null); }} placeholder="12 Aba Road, GRA" error={err} hint="Riders collect your orders here." />
      <PinButton geo={geo} onPin={setGeo} />
      <Button title="Save" loading={busy} onPress={save} />
    </Sheet>
  );
}

// Buying stock from the store with the wallet (newdesign 6.4, two-column flow). The store hands it over, then it
// shows in the agent's stock.
export function AgentBuyScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const { wallet, refreshWallet } = useAuth();
  const [d, setD] = useState(null);
  const [qty, setQty] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { rpc('agent_home').then(setD).catch(() => setD({ products: [] })); refreshWallet(); }, []));
  const products = d?.products || [];
  const lines = Object.fromEntries(Object.entries(qty).filter(([, n]) => n > 0).map(([k, n]) => [k, String(n)]));
  const pick = pickedLines(products, lines, 'available');
  const balance = Number(wallet?.balance || 0);
  const short = Math.ceil(pick.total - balance);
  const step = (p, dlt) => { setErr(null); setQty((x) => ({ ...x, [p.id]: Math.max(0, Math.min(Number(p.quantity), (x[p.id] || 0) + dlt)) })); };
  const buy = async () => {
    if (pick.error) return setErr(pick.error);
    setBusy(true);
    try {
      await rpc('agent_request_stock', { p_items: pick.items });
      refreshWallet();
      Alert.alert('Order sent', (d?.store?.name || 'The store') + ' hands it over, then it shows in your stock.');
      navigation.goBack();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const rows = d === null ? <Skeleton h={200} r={20} /> : !products.length ? <Empty art="feed" title="The store has no products yet" body="Check back when it lists its stock." /> : (
    <View style={{ backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      {products.map((p, i) => {
        const n = qty[p.id] || 0;
        const out = Number(p.quantity) <= 0;
        return (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: c.line, opacity: out ? 0.55 : 1 }}>
            <Thumb uri={p.photo ? publicUrl('listing-photos', p.photo) : null} category="feed" size={52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="strong" numberOfLines={2}>{p.title}</Txt>
              <Txt v="small">{naira(p.price) + ' / ' + p.unit + (Number(p.pct) > 0 ? ' · ' + Number(p.pct) + '% rebate' : '')}</Txt>
              <Txt v="small" color={out ? c.err : undefined}>{out ? 'The store is out of stock' : Number(p.quantity).toLocaleString() + ' available'}</Txt>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.sf2, borderRadius: 100, padding: 3 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={'Fewer ' + p.title} onPress={() => step(p, -1)} disabled={!n} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center', opacity: n ? 1 : 0.4 }}><Icon name="minus" size={20} /></Pressable>
              <Txt v="mono" style={{ minWidth: 28, textAlign: 'center' }}>{n}</Txt>
              <Pressable accessibilityRole="button" accessibilityLabel={'More ' + p.title} onPress={() => step(p, 1)} disabled={out || n >= Number(p.quantity)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center', opacity: out || n >= Number(p.quantity) ? 0.4 : 1 }}><Icon name="plus" size={20} /></Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
  const payBtn = short > 0 && pick.total > 0
    ? <Button variant={wide ? 'onHearth' : 'primary'} icon="wallet-plus-outline" title={'Top up ' + naira(short)} onPress={() => navigation.navigate('TopUp', { amount: short, returnTo: 'AgentBuy' })} />
    : <Button variant={wide ? 'onHearth' : 'primary'} title={pick.total > 0 ? 'Pay ' + naira(pick.total) + ' from wallet' : 'Pick what to buy'} disabled={pick.total <= 0} loading={busy} onPress={buy} />;
  const summary = (
    <Hearth style={{ gap: 12 }}>
      <Txt v="label" color={c.hmute}>{'Buying from ' + (d?.store?.name || 'your store')}</Txt>
      <Txt v="monoLg" color={c.hink} style={{ fontSize: 40, lineHeight: 46 }}>{naira(pick.total)}</Txt>
      <View>
        <MoneyLine onDark label="Rebate you earn" value={'+' + naira(pick.rebate)} color={c.hacc} />
        <MoneyLine onDark label="Wallet" value={naira(balance)} />
      </View>
      {err ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="alert-outline" size={16} color={c.herr} /><Txt v="small" color={c.herr} style={{ flex: 1 }}>{err}</Txt></View> : null}
      {wide ? payBtn : null}
      <Txt v="small" color={c.hmute}>The store hands over after it confirms. Paying cash? Ask the store to record a handover.</Txt>
    </Hearth>
  );
  if (wide) return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, gap: 24 }, page]}>
        <AppBar title="Buy stock" subtitle={d?.store?.name} close bare />
        <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.5 }}>{rows}</View>
          <View style={{ flex: 1 }}>{summary}</View>
        </View>
      </ScrollView>
    </Screen>
  );
  return (
    <Screen scroll footer={payBtn}>
      <AppBar title="Buy stock" subtitle={d?.store?.name} close />
      {rows}
      {summary}
    </Screen>
  );
}

// A sale made outside the app, from the agent's own stock.
export function AgentSaleScreen({ navigation }) {
  const { c } = useTheme();
  const [d, setD] = useState(null);
  const [lines, setLines] = useState({});
  const [buyer, setBuyer] = useState(''); const [phone, setPhone] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { rpc('agent_home').then(setD).catch(() => setD({ stock: [] })); }, []));
  const products = (d?.stock || []).filter((p) => p.quantity > 0);
  const pick = pickedLines(products, lines, 'in stock');
  const chosen = products.some((p) => lines[p.id] !== undefined);
  const save = async () => {
    if (pick.error) return setErr(pick.error);
    setBusy(true);
    try {
      await rpc('agent_log_sale', { p_items: pick.items, p_buyer_name: buyer.trim() || null, p_buyer_phone: phone.trim() || null });
      navigation.goBack();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title={'Save sale · ' + naira(pick.total)} loading={busy} disabled={!chosen} onPress={save} />}>
      <AppBar title="Log a sale" close />
      <Txt v="strong" style={{ fontSize: 13 }}>What did you sell?</Txt>
      {d === null ? <Skeleton h={44} r={22} /> : !products.length ? <Card><Txt v="small">Nothing in stock. Buy stock first.</Txt></Card>
        : <ItemPicker products={products} lines={lines} setLines={setLines} onChange={() => setErr(null)} />}
      <Input label="Buyer (optional)" value={buyer} onChangeText={setBuyer} placeholder="Mama Joy" autoCapitalize="words" />
      <Input label="Buyer's phone (optional)" value={phone} onChangeText={setPhone} placeholder="0803 123 4567" keyboardType="phone-pad" mono />
      {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
    </Screen>
  );
}

// The agent's shop page (their link): their own stock, with how far they are from the customer.
export function AgentShopScreen({ navigation, route }) {
  const { c } = useTheme();
  const page = usePage();
  const cols = useGridCols(4);
  const { spot } = useSpot();
  const code = String(route.params?.code || '').toUpperCase();
  const [shop, setShop] = useState(undefined);
  const [items, setItems] = useState(null);
  useEffect(() => {
    rpc('agent_shop', { p_code: code }).then((r) => {
      setShop(r || null);
      if (!r) return setItems([]);
      fetchListings({ vendorId: r.shop.id, limit: 60 }).then(setItems).catch(() => setItems([]));
    }).catch(() => setShop(null));
  }, [code]);
  if (shop === null) return (
    <Screen>
      <AppBar />
      <Empty icon="storefront-remove-outline" title="This shop link isn't active" body="The agent may have stopped selling. You can still shop the market." action="Go to the market"
        onAction={() => (navigation.getState().routeNames.includes('Market') ? navigation.navigate('Market') : navigation.popTo('Tabs', { screen: 'Market' }))} />
    </Screen>
  );
  const km = shop ? distanceKm(shop.shop, spot) : null;
  return (
    <Screen pad={false}>
      <AppBar />
      <FlatList key={cols} data={padRows(items || [], cols)} keyExtractor={(x) => x.id} numColumns={cols} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={[{ padding: 20, paddingTop: 0, gap: 12 }, page]}
        ListHeaderComponent={shop ? <View style={{ gap: 12, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" color={c.navactink}>{shop.agent.slice(0, 1).toUpperCase()}</Txt></View>
          <Txt v="h1">{shop.agent + "'s shop"}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="check-decagram" size={18} color={c.acc} />
            <Txt v="small" style={{ flexShrink: 1 }}>{'Agent for ' + shop.store.name + (km != null ? ' · ' + kmLabel(km) + ' from you' : '')}</Txt>
          </View>
          {shop.is_me ? <Banner tone="info" icon="eye-outline" title="This is how customers see your shop" body="Share its link from your desk." /> : null}
        </View> : <Skeleton h={160} r={20} />}
        ListEmptyComponent={items ? <Empty icon="store-off-outline" title="Nothing for sale right now" body="Check back soon." /> : null}
        renderItem={({ item }) => <ListingCard l={item} spot={spot} onPress={() => navigation.navigate('Product', { id: item.id })} />} />
    </Screen>
  );
}

// Where a store's invite link lands: "Join <store> as an agent".
// Signed out (website): create an account or sign in; the code is filled in afterwards.
// Signed in: on to opening the shop.
export function JoinStoreScreen({ navigation, route }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const [code] = useState(() => route.params?.code || pendingInviteNow());
  const [store, setStore] = useState(undefined);
  useEffect(() => {
    if (!code) { setStore(null); return; }
    // An invalid link is forgotten, so the next visit opens the normal home page.
    rpc('store_by_invite', { p_code: code }).then((r) => { setStore(r || null); if (!r) clearPendingInvite(); }).catch(() => { setStore(null); clearPendingInvite(); });
  }, [code]);
  const later = async () => { await clearPendingInvite(); if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate(session ? 'Tabs' : 'Landing'); };
  return (
    <Screen scroll style={{ flexGrow: 1, justifyContent: 'center', gap: 18, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignSelf: 'center', width: 96, height: 96, borderRadius: 28, backgroundColor: c.logobg, alignItems: 'center', justifyContent: 'center' }}><Image source={LOGO_MARK} style={{ width: 80, height: 80 }} /></View>
      {store === undefined ? <Skeleton h={80} r={20} /> : !store ? <>
        <Txt v="display" style={{ textAlign: 'center' }}>This invite link isn't valid</Txt>
        <Txt v="body" color={c.mute} style={{ textAlign: 'center' }}>Ask the store for a new link.</Txt>
        <Button variant="outline" title="Go to Poultry360" onPress={later} />
      </> : <>
        <Txt v="display" style={{ textAlign: 'center' }}>{'Join ' + store.name + ' as an agent'}</Txt>
        <Txt v="body" color={c.mute} style={{ textAlign: 'center' }}>Open your own shop with their products and earn a rebate every 3 months.</Txt>
        {session ? <Button title="Open my shop" onPress={() => navigation.navigate('AgentJoin', { code })} />
          : <>
            <Button title="Create an account" onPress={() => navigation.navigate('Email', { mode: 'signup' })} />
            <Button variant="outline" title="I have an account" onPress={() => navigation.navigate('SignIn')} />
          </>}
        {PLAY_STORE_URL ? <Button variant="ghost" icon="google-play" title="Get the Android app" onPress={() => Linking.openURL(PLAY_STORE_URL)} /> : null}
        <Pressable onPress={later} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 8 }}><Txt v="small">Not now</Txt></Pressable>
      </>}
    </Screen>
  );
}

// ---------- Store side ----------
const PERIODS = [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }];

export function StoreAgentsScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const { refreshWallet } = useAuth();
  const [period, setPeriod] = useState('30');
  const [d, setD] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, flashCopied] = useFlash();
  const load = useCallback(async () => {
    setBusy(true);
    try {
      await rpc('store_invite_code');   // makes sure the store has a code
      setD(await rpc('store_agents_dashboard', { p_days: period === 'all' ? null : Number(period) }));
    } catch (e) { setD(null); Alert.alert("Couldn't load agents", friendlyError(e)); } finally { setBusy(false); }
  }, [period]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const confirm = (m, accept) => Alert.alert(accept ? 'Handed over?' : "Can't supply this?",
    accept ? itemsText(m.items) + ' moves from your stock to ' + firstName(m.agent_name) + "'s. " + naira(m.total) + ' goes to your wallet.' : firstName(m.agent_name) + ' gets ' + naira(m.total) + ' back.',
    [{ text: 'Cancel', style: 'cancel' }, { text: accept ? 'Handed over' : 'Decline', style: accept ? 'default' : 'destructive',
      onPress: async () => { try { await rpc('store_confirm_stock', { p_move: m.id, p_accept: accept }); refreshWallet(); load(); } catch (e) { Alert.alert("Couldn't save", friendlyError(e)); } } }]);
  const newCode = () => Alert.alert('Make a new code?', 'The old code and link stop working. Agents who already joined stay.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'New code', onPress: async () => { try { await rpc('store_new_invite_code'); load(); } catch (e) { Alert.alert("Couldn't change it", friendlyError(e)); } } }]);
  const active = (d?.agents || []).filter((a) => a.status === 'active');
  const shell = (children) => (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: wide ? 24 : 18, paddingBottom: 48 }, page]}>
        {!wide && navigation.getState?.()?.type === 'tab' ? <TopBar navigation={navigation} cart={false} /> : !wide ? <AppBar title="Agents" /> : null}
        {children}
      </ScrollView>
    </Screen>
  );
  if (d === undefined) return shell(<><Skeleton h={160} r={24} /><Skeleton h={180} r={20} /></>);
  if (d === null) return shell(<Empty icon="wifi-off" title="Couldn't load agents" action="Try again" onAction={load} />);
  const money = (
    <Hearth style={wide ? { flex: 1.3 } : null}>
      <Txt v="label" color={c.hmute}>Rebates owed</Txt>
      <Txt v="monoLg" color={c.hink} style={{ fontSize: wide ? 44 : 40, lineHeight: wide ? 50 : 46 }}>{naira(d.owed)}</Txt>
      <Txt v="small" color={c.hmute}>{'From finished quarters · this quarter ends ' + dayMonth(d.quarter_end)}</Txt>
      <View style={{ flexDirection: 'row', gap: 24, borderTopWidth: 1, borderColor: c.hline, paddingTop: 10, flexWrap: 'wrap' }}>
        <View><Txt v="small" color={c.hmute}>Bought this quarter</Txt><Txt v="mono" color={c.hink}>{naira(d.totals?.bought)}</Txt></View>
        <View><Txt v="small" color={c.hmute}>Rebate this quarter</Txt><Txt v="mono" color={c.hink}>{naira(d.quarter)}</Txt></View>
        <View><Txt v="small" color={c.hmute}>Agents</Txt><Txt v="mono" color={c.hink}>{active.length}</Txt></View>
      </View>
    </Hearth>
  );
  const invite = (
    <Card style={[{ gap: 14, padding: 18 }, wide ? { flex: 1 } : null]}>
      <Txt v="h2">Invite agents</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.sf2, borderRadius: 16, paddingVertical: 12, paddingLeft: 16, paddingRight: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt v="label">Invite code</Txt>
          <Txt v="mono" selectable style={{ fontSize: 26, lineHeight: 32, letterSpacing: 4 }}>{d.invite_code}</Txt>
        </View>
        <Button small variant="ghost" title="New code" onPress={newCode} style={{ paddingHorizontal: 10 }} />
      </View>
      <Button small icon={copied ? 'check' : 'share-variant-outline'} title={copied ? 'Link copied' : 'Share invite link'} onPress={() => setSharing(true)} />
    </Card>
  );
  const handOver = (
    <ActionList title="Stock to hand over" count={d.pending?.length || 0} empty={<Txt v="small">Stock orders agents pay for in the app show here until you hand them over.</Txt>}>
      {(d.pending || []).map((m) => (
        <ActionRow key={m.id} lead={<View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.hink}>{(m.agent_name || 'A')[0]}</Txt></View>}
          title={m.agent_name} detail={itemsText(m.items) + ' · paid ' + timeAgo(m.created_at)} pill={<Pill tone="warn" label="Paid · waiting" />} amount={naira(m.total)}
          action={{ title: 'Handed over', onPress: () => confirm(m, true) }}>
          {!wide ? <Button small variant="ghost" title="Decline" onPress={() => confirm(m, false)} style={{ alignSelf: 'flex-start', height: 36, paddingHorizontal: 0 }} /> : null}
        </ActionRow>
      ))}
    </ActionList>
  );
  const board = (
    <View style={{ gap: 12 }}>
      <SectionHead title="Top agents" right={wide ? <View style={{ width: 300 }}><Segmented options={PERIODS} value={period} onChange={setPeriod} /></View> : null} />
      {!wide ? <Segmented options={PERIODS} value={period} onChange={setPeriod} /> : null}
      <DataTable minWidth={600} columns={[{ label: 'Rank', width: 56 }, { label: 'Agent', flex: 1.6 }, { label: 'Bought', right: true }, { label: 'Sales logged', right: true }, { label: 'Rebate owed', right: true }]}
        rows={active.map((a, i) => ({ key: a.agent_id, onPress: () => navigation.navigate('StoreAgent', { agentId: a.agent_id }), cells: [
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: i === 0 && Number(a.period_bought) > 0 ? c.orange : c.sf2, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={i === 0 && Number(a.period_bought) > 0 ? c.onorange : c.mute} style={{ fontSize: 13 }}>{i + 1}</Txt></View>,
          <View><Txt v="strong" numberOfLines={1}>{a.name}</Txt><Txt v="small">{a.code}</Txt></View>,
          <Txt v="mono">{naira(a.period_bought)}</Txt>, <Txt v="mono">{naira(a.period_sold)}</Txt>, <Txt v="mono">{naira(Number(a.earned) - Number(a.paid))}</Txt>] }))}
        empty={<Empty icon="account-group-outline" title="No agents yet" body="Share your invite link to add your first agent." style={{ borderWidth: 0 }} />} />
      <Txt v="small">Ranked by what each agent bought from you. Rebates are paid at quarter end; set each product's rebate when you add or edit it.</Txt>
    </View>
  );
  return shell(<>
    {wide ? <HeaderBar title="Agents" subtitle={active.length === 1 ? '1 agent' : active.length + ' agents'} /> : null}
    {wide ? <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>{money}{invite}</View> : <>{money}{invite}</>}
    {handOver}
    {board}
    <ShareLinkSheet visible={sharing} onClose={() => setSharing(false)} onCopied={flashCopied} title="Agent invite link" link={inviteLink(d.invite_code)}
      message={'Open a shop with my products on Poultry360: ' + inviteLink(d.invite_code)} />
  </>);
}

export function StoreAgentScreen({ navigation, route }) {
  const { c } = useTheme();
  const [d, setD] = useState(undefined);
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setD(await rpc('store_agents_dashboard', { p_days: null })); } catch { setD(null); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const a = d?.agents.find((x) => x.agent_id === route.params.agentId);
  if (d === undefined) return <Screen><AppBar /><Skeleton h={160} r={24} /></Screen>;
  if (!a) return <Screen><AppBar /><Empty icon="account-off-outline" title="Agent not found" /></Screen>;
  const owed = Number(a.earned) - Number(a.paid);
  const moves = (d.moves || []).filter((m) => m.agent_id === a.agent_id);
  const sales = d.recent.filter((s) => s.agent_id === a.agent_id);
  const payouts = d.payouts.filter((p) => p.agent_id === a.agent_id);
  const record = async () => {
    if (!(Number(amount) > 0)) return;
    setBusy(true);
    try { await rpc('store_record_payout', { p_agent: a.agent_id, p_amount: Number(amount), p_note: note.trim() || null }); setPay(false); setAmount(''); setNote(''); load(); }
    catch (e) { Alert.alert("Couldn't record it", friendlyError(e)); } finally { setBusy(false); }
  };
  const remove = () => Alert.alert('Remove ' + a.name + '?', 'Their shop closes and its products come off sale. Their records stay.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await rpc('store_remove_agent', { p_agent: a.agent_id }); navigation.goBack(); } catch (e) { Alert.alert("Couldn't remove", friendlyError(e)); } } }]);
  const cancel = (s) => Alert.alert('Cancel this sale?', 'The stock goes back into their shop.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Cancel sale', style: 'destructive', onPress: async () => { try { await rpc('agent_cancel_sale', { p_sale: s.id }); load(); } catch (e) { Alert.alert("Couldn't cancel", friendlyError(e)); } } }]);
  return (
    <Screen scroll>
      <AppBar title={a.name} subtitle={'Code ' + a.code + ' · joined ' + shortDate(a.joined_at)} />
      <Hearth>
        <Txt v="label" color={c.hmute}>Rebate owed</Txt>
        <Txt v="monoLg" color={c.hink}>{naira(owed)}</Txt>
        <Txt v="small" color={c.hmute}>{'This quarter ' + naira(a.quarter) + ' · due after ' + dayMonth(a.quarter_end) + ' · paid ' + naira(a.paid)}</Txt>
      </Hearth>
      {a.status === 'active' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button icon="cart-arrow-up" title="Give stock" onPress={() => navigation.navigate('StoreGiveStock', { agentId: a.agent_id, name: a.name })} style={{ flex: 1 }} />
          <Button variant="outline" icon="cash-check" title="Record payout" onPress={() => { setAmount(owed > 0 ? String(Math.round(owed)) : ''); setPay(true); }} style={{ flex: 1 }} />
        </View>
      ) : <Pill label="Removed" />}
      {a.location ? <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name="map-marker-outline" color={c.acc} /><Txt v="body" style={{ flex: 1 }}>{a.location}</Txt></Card> : null}
      <Txt v="h2">Stock they bought</Txt>
      {!moves.length ? <Card><Txt v="small">Nothing yet.</Txt></Card> : (
        <Group>{moves.map((m, i) => (
          <Row key={m.id} last={i === moves.length - 1} icon={m.paid_in === 'app' ? 'cellphone' : 'cash'} title={naira(m.total) + (m.paid_in === 'app' ? ' · paid in the app' : ' · paid you')}
            subtitle={itemsText(m.items) + ' · ' + shortDate(m.created_at) + (m.note ? ' · ' + m.note : '')}
            right={MOVE[m.status] ? <Pill tone={MOVE[m.status][1]} label={MOVE[m.status][0]} /> : Number(m.rebate) > 0 ? <Txt v="mono" style={{ fontSize: 14 }}>{naira(m.rebate)}</Txt> : null} />
        ))}</Group>
      )}
      {sales.length ? <>
        <Txt v="h2">Sales they logged</Txt>
        <Group>{sales.map((s, i) => (
          <Row key={s.id} last={i === sales.length - 1} icon={s.source === 'order' ? 'cart-outline' : 'receipt-text-outline'}
            title={naira(s.total) + (s.buyer_name ? ' · ' + s.buyer_name : '')} subtitle={itemsText(s.items) + ' · ' + shortDate(s.created_at)}
            onPress={s.source === 'logged' && s.status === 'recorded' ? () => cancel(s) : undefined}
            right={s.status === 'cancelled' ? <Pill label="Cancelled" /> : null} />
        ))}</Group>
      </> : null}
      {payouts.length ? <>
        <Txt v="h2">Payouts</Txt>
        <Group>{payouts.map((p, i) => <Row key={p.id} last={i === payouts.length - 1} icon="cash-check" title={naira(p.amount)} subtitle={shortDate(p.created_at) + (p.note ? ' · ' + p.note : '')} />)}</Group>
      </> : null}
      {a.status === 'active' ? <Button variant="ghost" title="Remove agent" onPress={remove} /> : null}
      <Sheet visible={pay} onClose={() => setPay(false)}>
        <Txt v="h1">Record a payout</Txt>
        <Input label="Amount paid" prefix="₦" keyboardType="number-pad" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} mono autoFocus />
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Bank transfer, 12 Nov" />
        <Button title="Save" loading={busy} disabled={!(Number(amount) > 0)} onPress={record} />
      </Sheet>
    </Screen>
  );
}

// The store records stock it handed to an agent who paid outside the app.
export function StoreGiveStockScreen({ navigation, route }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const { agentId, name } = route.params;
  const [products, setProducts] = useState(null);
  const [lines, setLines] = useState({});
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('listings').select('id,title,price,unit,quantity,agent_commission_pct,status').eq('vendor_id', uid).is('source_id', null).neq('status', 'draft').eq('is_waste', false).order('title')
      .then(({ data }) => setProducts((data || []).map((l) => ({ ...l, pct: l.agent_commission_pct }))));
  }, [uid]);
  const pick = pickedLines(products || [], lines, 'in stock');
  const chosen = (products || []).some((p) => lines[p.id] !== undefined);
  const save = async () => {
    if (pick.error) return setErr(pick.error);
    setBusy(true);
    try {
      await rpc('store_give_stock', { p_agent: agentId, p_items: pick.items, p_note: note.trim() || null });
      navigation.goBack();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title={'Record handover · ' + naira(pick.total)} loading={busy} disabled={!chosen} onPress={save} />}>
      <AppBar title="Give stock" subtitle={name} close />
      <Txt v="small">For stock they paid you for in cash or by transfer. It moves from your stock to theirs.</Txt>
      {products === null ? <Skeleton h={44} r={22} /> : !products.length ? <Card><Txt v="small">Add products first.</Txt></Card>
        : <ItemPicker products={products} lines={lines} setLines={setLines} onChange={() => setErr(null)} />}
      <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Paid cash, 12 Nov" />
      {chosen && pick.total > 0 ? <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="bold">Total</Txt><Txt v="mono" style={{ fontSize: 18 }}>{naira(pick.total)}</Txt></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body" color={c.mute}>Their rebate</Txt><Txt v="mono" color={c.mute} style={{ fontSize: 14 }}>{naira(pick.rebate)}</Txt></View>
      </Card> : null}
      {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
    </Screen>
  );
}
