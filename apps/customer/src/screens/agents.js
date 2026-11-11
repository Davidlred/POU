import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, BackHandler, Alert, Image, Linking, Platform, FlatList, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Empty, Input, Chip, Segmented, Pill, Group, Row, Skeleton, Sheet, Banner,
  naira, shortDate, timeAgo, rpc, friendlyError, shareText, useWide, usePage, inviteLink, agentLink, pendingInviteNow, clearPendingInvite,
  PLAY_STORE_URL, LOGO_MARK, supabase, useTick, countdown, publicUrl } from '@p360/shared';
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

// A tile in the desk's figures row: icon, label, the figure, a line under it, and optional actions.
function DeskStat({ icon, tone, label, value, sub, children, full }) {
  const { c } = useTheme();
  return (
    <View style={{ flexBasis: full ? '100%' : '30%', flexGrow: 1, minWidth: 140, backgroundColor: c.sf, borderRadius: 22, borderWidth: 1, borderColor: c.line, padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c[tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} color={c[tone + 'i']} /></View>
        <Txt v="label" style={{ flex: 1 }} numberOfLines={1}>{label}</Txt>
      </View>
      <View style={{ gap: 2 }}>
        <Txt v="mono" style={{ fontSize: 22, letterSpacing: -0.4 }} numberOfLines={1}>{value}</Txt>
        {sub ? <Txt v="small" numberOfLines={1}>{sub}</Txt> : null}
      </View>
      {children ? <View style={{ marginTop: 'auto' }}>{children}</View> : null}
    </View>
  );
}

// One of the four big actions under the money card.
function QuickAction({ icon, tone, label, sub, onPress, badge, wide }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed, hovered }) => ({ flexBasis: wide ? '22%' : '45%', flexGrow: 1, minHeight: 104, borderRadius: 22, backgroundColor: c[tone], padding: 16, gap: 10,
        justifyContent: 'space-between', opacity: pressed ? 0.85 : hovered ? 0.92 : 1 })}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={21} color={c[tone + 'i']} /></View>
        {badge ? <View style={{ minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: c.ember, alignItems: 'center', justifyContent: 'center' }}><Txt v="mono" color={c.onember} style={{ fontSize: 12 }}>{badge}</Txt></View> : null}
      </View>
      <View style={{ gap: 2 }}>
        <Txt v="bold" style={{ fontSize: 15 }}>{label}</Txt>
        <Txt v="small" style={{ fontSize: 12 }} numberOfLines={1}>{sub}</Txt>
      </View>
    </Pressable>
  );
}

// A section heading with an optional link on the right.
function DeskHead({ title, action, onAction, count }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
      <Txt v="h2">{title}</Txt>
      {count ? <Pill tone="live" label={String(count)} /> : null}
      <View style={{ flex: 1 }} />
      {action ? <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}><Txt v="bold" color={c.acc} style={{ fontSize: 13 }}>{action}</Txt></Pressable> : null}
    </View>
  );
}

// A friendlier empty state inside a card: icon, one line, and the next step.
function DeskEmpty({ icon, title, body, action, onAction, bare }) {
  const { c } = useTheme();
  const Box = bare ? View : Card;
  return (
    <Box style={{ alignItems: 'center', paddingVertical: 26, paddingHorizontal: 16, gap: 8 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={26} color={c.navactink} /></View>
      <Txt v="strong">{title}</Txt>
      <Txt v="small" style={{ textAlign: 'center', maxWidth: 320 }}>{body}</Txt>
      {action ? <Button small title={action} onPress={onAction} style={{ marginTop: 4, paddingHorizontal: 22 }} /> : null}
    </Box>
  );
}

// Website: rows under column headings, inside one card. A row with onPress highlights on hover.
// columns: [{ label, flex, right }]; rows: [{ key, cells: [node…], onPress }]
function DeskTable({ columns, rows, empty }) {
  const { c } = useTheme();
  // right-aligned columns lay out as a row so a Pill (alignSelf: flex-start) still sits on the right
  const cell = (j, node) => <View key={j} style={columns[j].right ? { flex: columns[j].flex || 1, minWidth: 0, flexDirection: 'row', justifyContent: 'flex-end' } : { flex: columns[j].flex || 1, minWidth: 0 }}>{node}</View>;
  return (
    <Group>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 11, backgroundColor: c.sf2 }}>
        {columns.map((col, j) => cell(j, <Txt v="label">{col.label}</Txt>))}
      </View>
      {rows.length ? rows.map((r) => (
        <Pressable key={r.key} onPress={r.onPress} disabled={!r.onPress} accessibilityRole={r.onPress ? 'button' : undefined}
          style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18, paddingVertical: 12, minHeight: 60,
            borderTopWidth: 1, borderColor: c.line, backgroundColor: hovered && r.onPress ? c.sf2 : 'transparent' })}>
          {r.cells.map((node, j) => cell(j, node))}
        </Pressable>
      )) : <View style={{ borderTopWidth: 1, borderColor: c.line }}>{empty}</View>}
    </Group>
  );
}

// A product the agent holds: photo, name, price, how many are left.
function StockCard({ p }) {
  const { c } = useTheme();
  const uri = p.photo ? publicUrl('listing-photos', p.photo) : null;
  const low = p.quantity > 0 && p.quantity <= 3;
  return (
    <View style={{ flexBasis: '45%', flexGrow: 1, minWidth: 150, maxWidth: '100%', backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ height: 110, backgroundColor: c.sf2 }} />
        : <View style={{ height: 110, backgroundColor: c.t4, alignItems: 'center', justifyContent: 'center' }}><Icon name="package-variant-closed" size={34} color={c.t4i} /></View>}
      <View style={{ padding: 12, gap: 6 }}>
        <Txt v="bold" numberOfLines={1} style={{ fontSize: 14 }}>{p.title}</Txt>
        <Txt v="small" style={{ fontSize: 12 }}>{naira(p.price) + ' / ' + p.unit}</Txt>
        <Pill tone={p.quantity <= 0 ? 'err' : low ? 'warn' : 'ok'} label={p.quantity <= 0 ? 'Sold out' : Number(p.quantity).toLocaleString() + ' ' + plural(p.unit, p.quantity) + (low ? ' · low' : '')} />
      </View>
    </View>
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

export function AgentDeskScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const { setActiveRole, homeRole, wallet, refreshWallet } = useAuth();
  const home = homeRole();
  const leaveMode = useCallback(() => { if (home) setActiveRole(home); }, [home]);
  // The desk is the root screen in agent mode, so Back returns to the role they came from instead of closing the app.
  useFocusEffect(useCallback(() => {
    if (!home || Platform.OS === 'web') return undefined;   // browsers have no hardware Back; BackHandler only logs an error there
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leaveMode(); return true; });
    return () => sub.remove();
  }, [home, leaveMode]));
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

  const name = d?.shop ? firstName(d.shop.name) : '';
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: wide ? 60 : 52, height: wide ? 60 : 52, borderRadius: 30, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}>
        {name ? <Txt v="h1" color={c.navactink}>{name.slice(0, 1).toUpperCase()}</Txt> : <Icon name="storefront-outline" color={c.navactink} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="display" style={{ fontSize: wide ? 30 : 24 }} numberOfLines={1}>{name ? name + "'s shop" : 'Agent'}</Txt>
        {d?.store ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="check-decagram" size={16} color={c.acc} />
          <Txt v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{'Agent for ' + d.store.name}</Txt>
          {wide ? <Pill label={'Code ' + d.code} /> : null}
        </View> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {home && wide ? <Button small variant="outline" icon="arrow-left" title={home === 'buyer' ? 'Shop' : home === 'supplier' ? 'My store' : 'My farm'} onPress={leaveMode} style={{ height: 44 }} /> : null}
        {home && !wide ? <Pressable onPress={leaveMode} accessibilityLabel={home === 'buyer' ? 'Back to shopping' : home === 'supplier' ? 'Back to my store' : 'Back to my farm'} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Icon name={home === 'buyer' ? 'basket-outline' : 'storefront-outline'} /></Pressable> : null}
        <Pressable onPress={() => navigation.navigate('Profile')} accessibilityLabel="Profile" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }}><Icon name="account-outline" /></Pressable>
      </View>
    </View>
  );
  if (d === undefined) return <Screen style={{ paddingTop: 8, gap: 14 }}>{header}<Skeleton h={170} r={26} /><View style={{ flexDirection: 'row', gap: 12 }}><Skeleton h={110} r={22} w="auto" style={{ flex: 1 }} /><Skeleton h={110} r={22} w="auto" style={{ flex: 1 }} /></View></Screen>;
  if (!d?.store) return (
    <Screen scroll style={{ paddingTop: 8 }}>
      {header}
      <Empty icon="storefront-outline" title="You're not with a store" body="Ask a store for its code to open your shop." action="Join a store" onAction={() => navigation.navigate('AgentJoin')} />
    </Screen>
  );

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
  // what happened lately: stock bought and sales logged, newest first
  const activity = [...moves.filter((m) => m.status !== 'pending').map((m) => ({ kind: 'buy', at: m.created_at, m })), ...logged.map((s) => ({ kind: 'sale', at: s.created_at, s }))]
    .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6);
  const products = (d.products || []).slice(0, 5);
  const unpinned = !d.shop?.location || d.shop?.lat == null;

  const leaveStore = () => Alert.alert('Leave ' + d.store.name + '?', 'Your shop closes and its products come off sale. Your records stay.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: async () => { try { await rpc('agent_leave'); load(); } catch (e) { Alert.alert("Couldn't leave", friendlyError(e)); } } }]);
  const cancelSale = (s) => Alert.alert('Cancel this sale?', 'The stock goes back into your shop.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Cancel sale', style: 'destructive', onPress: async () => { try { await rpc('agent_cancel_sale', { p_sale: s.id }); load(); } catch (e) { Alert.alert("Couldn't cancel", friendlyError(e)); } } }]);
  const cancelBuy = (m) => Alert.alert('Cancel this order?', naira(m.total) + ' goes back to your wallet.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Cancel order', style: 'destructive', onPress: async () => { try { await rpc('agent_cancel_stock', { p_move: m.id }); load(); } catch (e) { Alert.alert("Couldn't cancel", friendlyError(e)); } } }]);

  const money = (
    <Hearth style={wide ? { flex: 1.15, justifyContent: 'space-between' } : null}>
      <View style={{ gap: 4 }}>
        <Txt v="label" color={c.hmute}>Rebate owed to you</Txt>
        <Txt v="monoLg" color={c.hink} style={{ fontSize: 36 }}>{naira(owed)}</Txt>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Txt v="small" color={c.hmute}>{'This quarter so far ' + naira(rebate.quarter)}</Txt>
          <Txt v="small" color={c.hmute}>{q.left + (q.left === 1 ? ' day' : ' days') + ' left'}</Txt>
        </View>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.hline, overflow: 'hidden' }}>
          <View style={{ width: Math.round(q.pct * 100) + '%', height: 6, borderRadius: 3, backgroundColor: c.hacc }} />
        </View>
        <Txt v="small" color={c.hmute} style={{ fontSize: 12 }}>{'Paid to you after ' + dayMonth(rebate.quarter_end)}</Txt>
      </View>
    </Hearth>
  );
  const stats = (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, wide ? { flex: 2, alignContent: 'stretch' } : null]}>
      <DeskStat full={!wide} icon="wallet-outline" tone="t1" label="Wallet" value={naira(wallet?.balance)}>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Txt v="bold" color={c.acc} style={{ fontSize: 13 }} onPress={() => navigation.navigate('TopUp')}>Top up</Txt>
          <Txt v="bold" color={c.acc} style={{ fontSize: 13 }} onPress={() => navigation.navigate('Withdraw')}>Withdraw</Txt>
        </View>
      </DeskStat>
      <DeskStat icon="package-variant-closed" tone="t4" label="In stock" value={units.toLocaleString()} sub={stock.length === 1 ? '1 product' : stock.length + ' products'} />
      <DeskStat icon="chart-line" tone="t3" label={wide ? "Sold this month" : "This month"} value={naira(sold)} sub={sales === 1 ? '1 sale' : sales + ' sales'} />
    </View>
  );
  const actions = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <QuickAction wide={wide} icon="cart-arrow-down" tone="t1" label="Buy stock" sub={'From ' + d.store.name} onPress={() => navigation.navigate('AgentBuy')} />
      <QuickAction wide={wide} icon="receipt-text-outline" tone="t2" label="Log a sale" sub="Sold outside the app" onPress={() => navigation.navigate('AgentSale')} />
      <QuickAction wide={wide} icon={copied ? 'check' : 'share-variant-outline'} tone="t3" label={copied ? 'Link copied' : 'Share shop'} sub="WhatsApp, SMS, copy" onPress={() => setSharing(true)} />
      <QuickAction wide={wide} icon="clipboard-list-outline" tone="t4" label="Orders" sub={need.length ? need.length + ' waiting' : 'All caught up'} badge={need.length || null} onPress={() => navigation.navigate('ShopOrders')} />
    </View>
  );

  const action = (
    <View style={{ gap: 12 }}>
      <DeskHead title="Needs your action" count={pending.length + need.length} />
      {!pending.length && !need.length ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sagebg, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={20} color={c.sage} /></View>
          <View style={{ flex: 1 }}><Txt v="strong">You're all caught up</Txt><Txt v="small">New orders show here with a 24-hour timer.</Txt></View>
        </Card>
      ) : null}
      {pending.map((m) => (
        <Card key={m.id} style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.warnbg, alignItems: 'center', justifyContent: 'center' }}><Icon name="truck-fast-outline" size={20} color={c.warn} /></View>
            <View style={{ flex: 1 }}><Txt v="strong">{'Stock from ' + d.store.name}</Txt><Txt v="small" numberOfLines={1}>{itemsText(m.items)}</Txt></View>
            <Txt v="mono" style={{ fontSize: 15 }}>{naira(m.total)}</Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {[['Paid', true], ['Handover', false], ['In your stock', false]].map(([label, done], i) => (
              <React.Fragment key={label}>
                {i ? <View style={{ flex: 1, height: 2, backgroundColor: i === 1 ? c.sage : c.line2 }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: done ? c.sage : i === 1 ? c.ember : 'transparent', borderWidth: done || i === 1 ? 0 : 2, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>
                    {done ? <Icon name="check" size={12} color={c.onyolk} /> : null}
                  </View>
                  <Txt v="small" style={{ fontSize: 12 }} color={i === 1 ? c.ink : undefined}>{label}</Txt>
                </View>
              </React.Fragment>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Txt v="small" style={{ fontSize: 12 }}>{'Paid ' + timeAgo(m.created_at) + ' · waiting for the store'}</Txt>
            <Txt v="bold" color={c.err} style={{ fontSize: 13 }} onPress={() => cancelBuy(m)}>Cancel</Txt>
          </View>
        </Card>
      ))}
      {need.map((o) => {
        const cd = countdown(o.sla_deadline);
        const urgent = o.status === 'placed' && cd.ms < 3 * 3.6e6;
        return (
          <Card key={o.id} onPress={() => navigation.navigate('VendorOrder', { id: o.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: urgent ? c.err : c.ember }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="shopping-outline" size={20} color={c.navactink} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="strong" numberOfLines={1}>{(o.items || []).map((i) => i.qty + ' × ' + i.title).join(', ')}</Txt>
              <Txt v="small" numberOfLines={1}>{o.buyer + (o.area ? ', ' + o.area : '') + ' · ' + naira(o.items_total)}</Txt>
            </View>
            {o.status === 'placed' ? <Txt v="mono" color={urgent ? c.err : c.acc} style={{ fontSize: 13 }}>{cd.text}</Txt> : <Pill tone="warn" label="Prepare" />}
          </Card>
        );
      })}
    </View>
  );

  const stockList = (
    <View style={{ gap: 12 }}>
      <DeskHead title="My stock" action={stock.length ? 'Buy more' : null} onAction={() => navigation.navigate('AgentBuy')} />
      {!stock.length ? <DeskEmpty icon="package-variant" title="No stock yet" body={'Buy from ' + d.store.name + ', then customers can order it from your shop.'} action="Buy stock" onAction={() => navigation.navigate('AgentBuy')} />
        : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{stock.map((p) => <StockCard key={p.id} p={p} />)}{stock.length % 2 ? <View style={{ flexBasis: '45%', flexGrow: 1, minWidth: 150 }} /> : null}</View>}
    </View>
  );

  const restock = products.length ? (
    <View style={{ gap: 12 }}>
      <DeskHead title={'Restock from ' + d.store.name} action="See all" onAction={() => navigation.navigate('AgentBuy')} />
      <Group>{products.map((p, i) => {
        const uri = p.photo ? publicUrl('listing-photos', p.photo) : null;
        return (
          <Pressable key={p.id} onPress={() => navigation.navigate('AgentBuy')} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i === products.length - 1 ? 0 : 1, borderColor: c.line, opacity: pressed ? 0.8 : 1 })}>
            {uri ? <Image source={{ uri }} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.sf2 }} />
              : <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: c.t4, alignItems: 'center', justifyContent: 'center' }}><Icon name="package-variant-closed" size={20} color={c.t4i} /></View>}
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="strong" numberOfLines={1}>{p.title}</Txt>
              <Txt v="small" numberOfLines={1}>{naira(p.price) + ' / ' + p.unit + (Number(p.quantity) > 0 ? '' : ' · out of stock')}</Txt>
            </View>
            {Number(p.pct) > 0 ? <Pill tone="ok" label={Number(p.pct) + '% rebate'} /> : null}
            <Icon name="chevron-right" size={20} color={c.mute} />
          </Pressable>
        );
      })}</Group>
    </View>
  ) : null;

  const recent = (
    <View style={{ gap: 12 }}>
      <DeskHead title="Recent activity" />
      {!activity.length ? <DeskEmpty icon="history" title="Nothing yet" body="Stock you buy and sales you log show here." />
        : <Group>{activity.map((a, i) => {
          const last = i === activity.length - 1;
          if (a.kind === 'buy') return (
            <Row key={'m' + a.m.id} last={last} icon="cart-arrow-down" iconColor={c.acc} title={'Bought ' + itemsText(a.m.items)}
              subtitle={(a.m.paid_in === 'app' ? 'Paid in the app' : 'Paid the store') + ' · ' + timeAgo(a.at)}
              right={MOVE[a.m.status] ? <Pill tone={MOVE[a.m.status][1]} label={MOVE[a.m.status][0]} /> : Number(a.m.rebate) > 0 ? <Txt v="mono" color={c.sage} style={{ fontSize: 14 }}>{'+' + naira(a.m.rebate)}</Txt> : null} />
          );
          const s = a.s;
          const canCancel = s.status === 'recorded' && Date.now() - new Date(s.created_at).getTime() < 864e5;
          return (
            <Row key={'s' + s.id} last={last} icon="receipt-text-outline" iconColor={c.t2i} title={'Sold ' + itemsText(s.items)}
              subtitle={(s.buyer_name ? s.buyer_name + ' · ' : '') + timeAgo(a.at) + (canCancel ? ' · tap to cancel' : '')} onPress={canCancel ? () => cancelSale(s) : undefined}
              right={s.status === 'cancelled' ? <Pill label="Cancelled" /> : <Txt v="mono" style={{ fontSize: 14 }}>{naira(s.total)}</Txt>} />
          );
        })}</Group>}
    </View>
  );

  const shopLink = (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="link-variant" size={22} color={c.navactink} /></View>
        <View style={{ flex: 1 }}><Txt v="strong">Your shop link</Txt><Txt v="small">Customers order from your stock</Txt></View>
      </View>
      <View style={{ backgroundColor: c.sf2, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}><Txt v="mono" selectable numberOfLines={1} style={{ fontSize: 13 }}>{agentLink(d.code).replace(/^https?:\/\//, '')}</Txt></View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button small variant="outline" icon="eye-outline" title="Open" onPress={() => navigation.navigate('AgentShop', { code: d.code })} style={{ flex: 1 }} />
        <Button small icon={copied ? 'check' : 'share-variant-outline'} title={copied ? 'Copied' : 'Share'} onPress={() => setSharing(true)} style={{ flex: 1 }} />
      </View>
    </Card>
  );
  const where = (
    <Card onPress={() => setPlacing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: unpinned ? c.warnbg : c.sagebg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={unpinned ? 'map-marker-alert-outline' : 'map-marker-check-outline'} size={22} color={unpinned ? c.warn : c.sage} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt v="strong">{d.shop?.location ? 'Pickup address' : 'Add your shop address'}</Txt>
        <Txt v="small" numberOfLines={2}>{d.shop?.location ? d.shop.location + (d.shop.lat == null ? ' · not pinned' : ' · pinned') : 'Riders collect your orders here'}</Txt>
      </View>
      <Icon name="chevron-right" color={c.mute} />
    </Card>
  );
  const leave = <Button variant="ghost" title="Leave this store" onPress={leaveStore} />;

  // Website (900 px+): a dashboard page beside the sidebar: header bar with the actions, figures, then tables.
  if (wide) {
    const thumb = (photo, size = 40) => {
      const uri = photo ? publicUrl('listing-photos', photo) : null;
      return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: c.sf2 }} />
        : <View style={{ width: size, height: size, borderRadius: 10, backgroundColor: c.t4, alignItems: 'center', justifyContent: 'center' }}><Icon name="package-variant-closed" size={18} color={c.t4i} /></View>;
    };
    const top = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="h1" color={c.navactink}>{(name || 'A').slice(0, 1).toUpperCase()}</Txt>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="display" style={{ fontSize: 28 }} numberOfLines={1}>{name + "'s shop"}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check-decagram" size={16} color={c.acc} />
            <Txt v="small" numberOfLines={1}>{'Agent for ' + d.store.name}</Txt>
            <Pill label={'Code ' + d.code} />
          </View>
        </View>
        {home ? <Button small variant="ghost" icon="swap-horizontal" title={home === 'buyer' ? 'Switch to buying' : home === 'supplier' ? 'Switch to my store' : 'Switch to my farm'} onPress={leaveMode} /> : null}
        <Button small variant="outline" icon={copied ? 'check' : 'share-variant-outline'} title={copied ? 'Link copied' : 'Share shop'} onPress={() => setSharing(true)} style={{ paddingHorizontal: 18 }} />
        <Button small variant="outline" icon="receipt-text-outline" title="Log a sale" onPress={() => navigation.navigate('AgentSale')} style={{ paddingHorizontal: 18 }} />
        <Button small icon="cart-arrow-down" title="Buy stock" onPress={() => navigation.navigate('AgentBuy')} style={{ paddingHorizontal: 20 }} />
      </View>
    );
    const stockTable = (
      <View style={{ gap: 12 }}>
        <DeskHead title="My stock" count={stock.length || null} action={stock.length ? 'Buy more' : null} onAction={() => navigation.navigate('AgentBuy')} />
        <DeskTable columns={[{ label: 'Product', flex: 2.4 }, { label: 'Price', flex: 1.4 }, { label: 'In stock' }, { label: 'Value', flex: 1.1, right: true }, { label: 'Status', flex: 0.9, right: true }]}
          rows={stock.map((p) => ({ key: p.id, cells: [
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>{thumb(p.photo)}<Txt v="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{p.title}</Txt></View>,
            <Txt v="body" numberOfLines={1}>{naira(p.price) + ' / ' + p.unit}</Txt>,
            <Txt v="mono" style={{ fontSize: 14 }}>{Number(p.quantity).toLocaleString() + ' ' + plural(p.unit, p.quantity)}</Txt>,
            <Txt v="mono" style={{ fontSize: 14 }}>{naira(Number(p.price) * Math.max(0, Number(p.quantity)))}</Txt>,
            <Pill tone={p.quantity <= 0 ? 'err' : p.quantity <= 3 ? 'warn' : 'ok'} label={p.quantity <= 0 ? 'Sold out' : p.quantity <= 3 ? 'Low' : 'On sale'} />] }))}
          empty={<DeskEmpty bare icon="package-variant" title="No stock yet" body={'Buy from ' + d.store.name + ', then customers can order it from your shop.'} action="Buy stock" onAction={() => navigation.navigate('AgentBuy')} />} />
      </View>
    );
    const activityTable = (
      <View style={{ gap: 12 }}>
        <DeskHead title="Recent activity" />
        <DeskTable columns={[{ label: 'When', flex: 0.9 }, { label: 'What', flex: 2.6 }, { label: 'How', flex: 1.2 }, { label: 'Amount', right: true }]}
          rows={activity.map((a) => {
            if (a.kind === 'buy') return { key: 'm' + a.m.id, cells: [
              <Txt v="small">{timeAgo(a.at)}</Txt>,
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="cart-arrow-down" size={18} color={c.acc} /><Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>{'Bought ' + itemsText(a.m.items)}</Txt></View>,
              MOVE[a.m.status] ? <Pill tone={MOVE[a.m.status][1]} label={MOVE[a.m.status][0]} /> : <Txt v="small">{a.m.paid_in === 'app' ? 'Wallet' : 'Paid the store'}</Txt>,
              <View style={{ alignItems: 'flex-end' }}><Txt v="mono" style={{ fontSize: 14 }}>{naira(a.m.total)}</Txt>{Number(a.m.rebate) > 0 ? <Txt v="small" color={c.sage} style={{ fontSize: 12 }}>{'+' + naira(a.m.rebate) + ' rebate'}</Txt> : null}</View>] };
            const s = a.s;
            const canCancel = s.status === 'recorded' && Date.now() - new Date(s.created_at).getTime() < 864e5;
            return { key: 's' + s.id, onPress: canCancel ? () => cancelSale(s) : undefined, cells: [
              <Txt v="small">{timeAgo(a.at)}</Txt>,
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="receipt-text-outline" size={18} color={c.t2i} /><Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>{'Sold ' + itemsText(s.items) + (s.buyer_name ? ' to ' + s.buyer_name : '')}</Txt></View>,
              s.status === 'cancelled' ? <Pill label="Cancelled" /> : <Txt v="small">{canCancel ? 'Logged · click to cancel' : 'Logged sale'}</Txt>,
              <Txt v="mono" style={{ fontSize: 14 }}>{naira(s.total)}</Txt>] };
          })}
          empty={<DeskEmpty bare icon="history" title="Nothing yet" body="Stock you buy and sales you log show here." />} />
      </View>
    );
    return (
      <Screen pad={false}>
        <ScrollView contentContainerStyle={{ width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 32, paddingTop: 24, paddingBottom: 48, gap: 24 }}>
          {top}
          {unpinned ? <Banner tone="warn" icon="map-marker-alert-outline" title={d.shop?.location ? "Pin your shop's location" : 'Add your shop address'} body="Nearby buyers see you first and pay less for delivery." action="Add" onAction={() => setPlacing(true)} /> : null}
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>{money}{stats}</View>
          <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
            <View style={{ flex: 2, gap: 24 }}>{action}{stockTable}{activityTable}</View>
            <View style={{ flex: 1, gap: 24, minWidth: 300 }}>{shopLink}{where}{restock}{leave}</View>
          </View>
        </ScrollView>
        <ShareLinkSheet visible={sharing} onClose={() => setSharing(false)} onCopied={flashCopied} title="Your shop link" link={agentLink(d.code)}
          message={'Order from my shop on Poultry360: ' + agentLink(d.code)} />
        <ShopPlaceSheet visible={placing} onClose={() => setPlacing(false)} shop={d.shop} onDone={load} />
      </Screen>
    );
  }

  return (
    <Screen scroll style={{ paddingTop: 8, gap: 16 }}>
      {header}
      {unpinned ? <Banner tone="warn" icon="map-marker-alert-outline" title={d.shop?.location ? "Pin your shop's location" : 'Add your shop address'} body="Nearby buyers see you first and pay less for delivery." action="Add" onAction={() => setPlacing(true)} /> : null}
      {wide ? <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>{money}{stats}</View> : <>{money}{stats}</>}
      {actions}
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.6, gap: 20 }}>{action}{stockList}{recent}</View>
          <View style={{ flex: 1, gap: 20 }}>{shopLink}{where}{restock}{leave}</View>
        </View>
      ) : <>{action}{stockList}{restock}{recent}{shopLink}{where}{leave}</>}
      <ShareLinkSheet visible={sharing} onClose={() => setSharing(false)} onCopied={flashCopied} title="Your shop link" link={agentLink(d.code)}
        message={'Order from my shop on Poultry360: ' + agentLink(d.code)} />
      <ShopPlaceSheet visible={placing} onClose={() => setPlacing(false)} shop={d.shop} onDone={load} />
    </Screen>
  );
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

// Buying stock from the store with the wallet. The store hands it over, then it shows in the agent's stock.
export function AgentBuyScreen({ navigation }) {
  const { c } = useTheme();
  const { wallet, refreshWallet } = useAuth();
  const [d, setD] = useState(null);
  const [lines, setLines] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { rpc('agent_home').then(setD).catch(() => setD({ products: [] })); refreshWallet(); }, []));
  const products = d?.products || [];
  const pick = pickedLines(products, lines, 'available');
  const chosen = products.some((p) => lines[p.id] !== undefined);
  const balance = Number(wallet?.balance || 0);
  const short = Math.ceil(pick.total - balance);
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
  const footer = !chosen ? null : short > 0 && !pick.error
    ? <Button icon="wallet-plus-outline" title={'Top up ' + naira(short)} onPress={() => navigation.navigate('TopUp', { amount: short, returnTo: 'AgentBuy' })} />
    : <Button title={'Pay ' + naira(pick.total) + ' from wallet'} loading={busy} onPress={buy} />;
  return (
    <Screen scroll footer={footer}>
      <AppBar title="Buy stock" subtitle={d?.store?.name} close />
      {d === null ? <Skeleton h={44} r={22} /> : !products.length ? <Card><Txt v="small">The store has no products listed yet.</Txt></Card>
        : <ItemPicker products={products} lines={lines} setLines={setLines} onChange={() => setErr(null)} stockLabel="available" />}
      {chosen && pick.total > 0 ? <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="bold">Total</Txt><Txt v="mono" style={{ fontSize: 18 }}>{naira(pick.total)}</Txt></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body" color={c.mute}>Your rebate</Txt><Txt v="mono" color={c.sage} style={{ fontSize: 14 }}>{naira(pick.rebate)}</Txt></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body" color={c.mute}>Wallet</Txt><Txt v="mono" color={c.mute} style={{ fontSize: 14 }}>{naira(balance)}</Txt></View>
      </Card> : null}
      {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="information-outline" size={18} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Paying cash? Ask the store to record it as a handover.</Txt></View>
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
  const periodLabel = PERIODS.find((x) => x.value === period).label;
  const count = (n, one) => n + ' ' + one + (Number(n) === 1 ? '' : 's');

  if (d === undefined) return <Screen scroll><AppBar title="Agents" /><Skeleton h={140} r={26} /><Skeleton h={180} r={22} /></Screen>;
  if (d === null) return <Screen scroll><AppBar title="Agents" /><Empty icon="wifi-off" title="Couldn't load agents" action="Try again" onAction={load} /></Screen>;

  const stat = (label, value, note) => (
    <View style={{ flexBasis: '28%', flexGrow: 1, minWidth: 150, gap: 2 }}>
      <Txt v="label" color={c.hmute}>{label}</Txt>
      <Txt v="monoLg" color={c.hink} style={{ fontSize: 24 }}>{naira(value)}</Txt>
      <Txt v="small" color={c.hmute}>{note}</Txt>
    </View>
  );
  const money = (
    <Hearth>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 24 }}>
        {stat('Rebates owed', d.owed, 'Finished quarters')}
        {stat('This quarter', d.quarter, 'Due after ' + dayMonth(d.quarter_end))}
        {stat('Sold to agents', d.totals?.bought, periodLabel)}
      </View>
    </Hearth>
  );

  // Stock agents paid for in the app, waiting for the store to hand it over
  const requests = d.pending?.length ? (
    <View style={{ gap: 12 }}>
      <Txt v="h2">{d.pending.length === 1 ? '1 stock order to hand over' : d.pending.length + ' stock orders to hand over'}</Txt>
      {d.pending.map((m) => (
        <Card key={m.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt v="strong" style={{ flex: 1 }} numberOfLines={1}>{m.agent_name}</Txt>
            <Txt v="mono" style={{ fontSize: 15 }}>{naira(m.total)}</Txt>
          </View>
          <Txt v="small">{itemsText(m.items) + ' · paid ' + timeAgo(m.created_at)}</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small variant="outline" title="Decline" onPress={() => confirm(m, false)} style={{ flex: 1 }} />
            <Button small title="Handed over" onPress={() => confirm(m, true)} style={{ flex: 1 }} />
          </View>
        </Card>
      ))}
    </View>
  ) : null;

  const invite = (
    <Card style={{ gap: 14, padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="account-plus-outline" size={22} color={c.navactink} /></View>
        <Txt v="strong" style={{ flex: 1 }}>Invite agents</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.sf2, borderRadius: 16, paddingVertical: 10, paddingLeft: 16, paddingRight: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt v="label">Invite code</Txt>
          <Txt v="mono" selectable style={{ fontSize: 22, letterSpacing: 1 }}>{d.invite_code}</Txt>
        </View>
        <Pressable onPress={newCode} accessibilityRole="button" hitSlop={6} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
          <Txt v="bold" color={c.navactink} style={{ fontSize: 14 }}>New code</Txt>
        </Pressable>
      </View>
      <Button small icon={copied ? 'check' : 'share-variant-outline'} title={copied ? 'Link copied' : 'Share invite link'} onPress={() => setSharing(true)} />
    </Card>
  );

  const note = (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
      <Icon name="information-outline" size={18} color={c.mute} />
      <Txt v="small" style={{ flex: 1 }}>Set each product's agent rebate when you add or edit it. Agents earn it on what they buy from you, every 3 months.</Txt>
    </View>
  );

  const board = (
    <View style={{ gap: 12 }}>
      <View style={wide ? { flexDirection: 'row', alignItems: 'center', gap: 10 } : { gap: 10 }}>
        <Txt v="h2" style={wide ? { flex: 1 } : null}>Top agents</Txt>
        <View style={wide ? { width: 320 } : null}><Segmented options={PERIODS} value={period} onChange={setPeriod} /></View>
      </View>
      {!active.length ? (
        <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="account-group-outline" size={26} color={c.navactink} /></View>
          <Txt v="strong">No agents yet</Txt>
          <Txt v="small" style={{ textAlign: 'center' }}>Share your invite link to add your first agent.</Txt>
        </Card>
      ) : (
        <Group style={{ opacity: busy ? 0.6 : 1 }}>{active.map((a, i) => {
          const lead = i === 0 && Number(a.period_bought) > 0;
          return (
            <Pressable key={a.agent_id} onPress={() => navigation.navigate('StoreAgent', { agentId: a.agent_id })} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 64,
                borderBottomWidth: i === active.length - 1 ? 0 : 1, borderColor: c.line, opacity: pressed ? 0.8 : 1 })}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: lead ? c.navact : c.sf2 }}>
                {lead ? <Icon name="trophy-outline" size={18} color={c.navactink} /> : <Txt v="bold" color={c.mute} style={{ fontSize: 14 }}>{i + 1}</Txt>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="strong" numberOfLines={1}>{a.name}</Txt>
                <Txt v="small" numberOfLines={1}>{'Sold ' + naira(a.period_sold) + ' · owed ' + naira(Number(a.earned) - Number(a.paid))}</Txt>
              </View>
              <Txt v="mono" style={{ fontSize: 16 }}>{naira(a.period_bought)}</Txt>
              <Icon name="chevron-right" size={20} color={c.mute} />
            </Pressable>
          );
        })}</Group>
      )}
      {active.length ? <Txt v="small">Ranked by what they bought from you.</Txt> : null}
    </View>
  );

  return (
    <Screen scroll>
      <AppBar title="Agents" subtitle={active.length ? count(active.length, 'agent') : undefined} />
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.6, gap: 20 }}>{money}{requests}{board}</View>
          <View style={{ flex: 1, gap: 14 }}>{invite}{note}</View>
        </View>
      ) : <>{money}{requests}{invite}{board}{note}</>}
      <ShareLinkSheet visible={sharing} onClose={() => setSharing(false)} onCopied={flashCopied} title="Agent invite link" link={inviteLink(d.invite_code)}
        message={'Open a shop with my products on Poultry360: ' + inviteLink(d.invite_code)} />
    </Screen>
  );
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
