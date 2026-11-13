import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, ScrollView } from 'react-native';
import { Press as Pressable } from '@p360/shared';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, ChipRow, Chip, Skeleton, naira, rpc, publicUrl, friendlyError, supabase,
  useWide, usePage, HeaderBar, SectionHead, SelectCard, MoneyLine, Thumb, SuccessMoment, DataTable } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { deliveryFee, distanceKm, kmLabel } from '../lib/nearby';
import { useSpot } from '../lib/spot';
import { deliveryWindow } from '../lib/eta';
import { TEST_CARDS, chargeCard } from '../lib/payments';
import { SUPPLY_CATEGORIES } from '../lib/catalog';

// Cart lines grouped by seller. A group is hidden ("Verified farm near you") while every line came from browsing.
function groupByVendor(items) {
  const g = {};
  items.forEach((x) => {
    const e = (g[x.vendor_id] = g[x.vendor_id] || { vendor: x.vendor_name, via: true, items: [], supplies: true });
    e.items.push(x);
    if (!x.via_search) e.via = false;
    if (!SUPPLY_CATEGORIES.includes(x.category)) e.supplies = false;
  });
  return Object.entries(g).map(([id, v]) => ({ id, ...v, word: v.supplies ? 'store' : 'farm' }));
}
const groupName = (g) => (g.via ? 'Verified ' + g.word + ' near you' : g.vendor || 'Verified seller');

// Seller locations for the groups in the cart (to price delivery by distance).
function useSellerSpots(groups) {
  const [spots, setSpots] = useState({});
  const ids = groups.map((g) => g.id).join(',');
  useEffect(() => {
    if (!ids) return;
    supabase.from('vendor_profiles').select('user_id,lat,lng').in('user_id', ids.split(',')).then(({ data }) => setSpots(Object.fromEntries((data || []).map((v) => [v.user_id, v]))));
  }, [ids]);
  return spots;
}

function Stepper({ qty, onChange }) {
  const { c } = useTheme();
  const b = (icon, label, fn) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={fn} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} /></Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.sf2, borderRadius: 100, padding: 3 }}>
      {b(qty === 1 ? 'trash-can-outline' : 'minus', qty === 1 ? 'Remove' : 'Fewer', () => onChange(qty - 1))}
      <Txt v="mono" style={{ minWidth: 26, textAlign: 'center' }}>{qty}</Txt>
      {b('plus', 'More', () => onChange(qty + 1))}
    </View>
  );
}

export function CartScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const { items, setQty, remove, validate, subtotal } = useCart();
  const { session } = useAuth();   // website visitors can fill a cart; checking out asks them to sign in
  const { spot } = useSpot();
  const toMarket = () => (session ? navigation.popTo('Tabs', { screen: 'Market' }) : navigation.navigate('Market'));
  const [checking, setChecking] = useState(true);
  useFocusEffect(useCallback(() => { setChecking(true); validate().finally(() => setChecking(false)); }, []));
  const groups = groupByVendor(items.filter((x) => !x.unavailable));
  const allGroups = groupByVendor(items);
  const spots = useSellerSpots(allGroups);
  const bad = items.filter((x) => x.unavailable);
  const delivery = groups.reduce((t, g) => t + deliveryFee(spots[g.id], spot), 0);
  if (!items.length) return (
    <Screen><AppBar title="Cart" />
      <Empty art="eggs" title="Your cart is empty" body="Eggs, birds and feed from verified sellers near you, delivered by Poultry360." action="Browse the market" onAction={toMarket} />
    </Screen>
  );
  const button = session ? <Button title="Checkout" disabled={checking || subtotal <= 0} loading={checking} onPress={() => navigation.navigate('Checkout')} />
    : <Button title="Sign in to check out" disabled={checking || subtotal <= 0} onPress={() => navigation.navigate('SignIn')} />;
  const lines = (
    <View style={{ gap: 16 }}>
      {bad.length ? <Banner tone="err" title={bad.length + (bad.length === 1 ? ' item is' : ' items are') + ' no longer available'} body="Remove them to check out with the rest." /> : null}
      {allGroups.map((g) => {
        const km = distanceKm(spots[g.id], spot);
        return (
          <View key={g.id} style={{ backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.sf2, paddingHorizontal: 16, paddingVertical: 11, flexWrap: 'wrap' }}>
              <Icon name="check-decagram" size={18} color={c.acc} />
              <Txt v="bold" style={{ flex: 1, minWidth: 140 }} numberOfLines={1}>{groupName(g)}</Txt>
              <Txt v="small">{(km != null ? kmLabel(km) + ' · ' : '') + 'delivery ' + naira(deliveryFee(spots[g.id], spot))}</Txt>
            </View>
            {g.items.map((x, i) => (
              <View key={x.listing_id} style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 12, padding: 14, borderTopWidth: i ? 1 : 0, borderColor: c.line, opacity: x.unavailable ? 0.6 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <Thumb uri={x.photo ? publicUrl('listing-photos', x.photo) : null} category={x.category} size={56} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt v="strong" numberOfLines={2} style={{ textDecorationLine: x.unavailable ? 'line-through' : 'none' }}>{x.title}</Txt>
                    {x.unavailable ? <Txt v="small" color={c.err}>No longer available</Txt> : <Txt v="small">{naira(x.price)} / {x.unit}</Txt>}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, justifyContent: wide ? 'flex-end' : 'space-between' }}>
                  {x.unavailable ? null : <Stepper qty={x.qty} onChange={(n) => setQty(x.listing_id, n)} />}
                  <Txt v="mono" style={{ minWidth: 90, textAlign: 'right' }}>{naira(x.price * x.qty)}</Txt>
                  <Pressable onPress={() => remove(x.listing_id)} accessibilityRole="button" hitSlop={8} style={{ minHeight: 40, justifyContent: 'center' }}><Txt v="bold" color={c.err} style={{ fontSize: 14 }}>Remove</Txt></Pressable>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
  const totals = (
    <View style={{ gap: 4 }}>
      <MoneyLine label="Subtotal" value={naira(subtotal)} />
      <MoneyLine label={'Delivery · ' + groups.length + (groups.length === 1 ? ' seller' : ' sellers')} value={naira(delivery)} />
      <View style={{ borderTopWidth: 1, borderColor: c.line, marginTop: 6, paddingTop: 6 }}><MoneyLine strong label="Total" value={naira(subtotal + delivery)} /></View>
    </View>
  );
  const note = <Txt v="small">Each seller's order travels separately, so delivery is charged per seller. Final fees are confirmed at checkout.</Txt>;
  if (wide) return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, gap: 24 }, page]}>
        <HeaderBar title="Cart" subtitle={items.length + (items.length === 1 ? ' item from ' : ' items from ') + allGroups.length + (allGroups.length === 1 ? ' seller' : ' sellers')} />
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.6 }}>{lines}</View>
          <Card style={{ flex: 1, padding: 20, gap: 14 }}><Txt v="h2">Summary</Txt>{totals}{button}{note}</Card>
        </View>
      </ScrollView>
    </Screen>
  );
  return (
    <Screen scroll footer={<>{totals}{button}</>}>
      <AppBar title="Cart" subtitle={items.length + (items.length === 1 ? ' item · ' : ' items · ') + allGroups.length + (allGroups.length === 1 ? ' seller' : ' sellers')} />
      {lines}
      {note}
    </Screen>
  );
}

// Area names are compared exactly when an order is placed, so save them exactly as listed.
const CITY = 'Port Harcourt';
const ELSEWHERE = 'Elsewhere in Port Harcourt';
const OUTSIDE = 'Outside Port Harcourt';
const squash = (t) => t.toLowerCase().replace(/[^a-z]/g, '');
export function canonicalArea(typed, areas) {
  const t = squash(typed || '');
  if (['portharcourt', 'portharcourtcity', 'ph', 'phc', 'obioakpor'].includes(t)) return CITY;
  return areas.find((a) => squash(a) === t) || (typed || '').trim();
}

function AddressForm({ areas, onSaved, onCancel }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const [label, setLabel] = useState('Home');
  const [line, setLine] = useState('');
  const [area, setArea] = useState('');
  const [other, setOther] = useState('');
  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const locate = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) return setErr('Allow location to pin your address.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  };
  const save = async () => {
    const a = area === ELSEWHERE ? CITY : area === OUTSIDE ? canonicalArea(other, areas) : area;
    if (!line.trim() || !a) return setErr('Add the street address and area.');
    setBusy(true);
    const { data, error } = await supabase.from('addresses').insert({ user_id: uid, label, line: line.trim(), area: a, lat: geo?.lat, lng: geo?.lng }).select().single();
    setBusy(false);
    if (error) return setErr(friendlyError(error));
    onSaved(data);
  };
  return (
    <Card style={{ gap: 14, padding: 18 }}>
      <Txt v="h2">New address</Txt>
      <ChipRow options={['Home', 'Work', 'Restaurant', 'Other']} value={label} onChange={setLabel} />
      <Input label="Street address" value={line} onChangeText={(t) => { setLine(t); setErr(null); }} placeholder="12 Aba Road" />
      <Txt v="strong" style={{ fontSize: 14 }}>Area</Txt>
      <ChipRow options={[...areas.filter((a) => a !== CITY), ELSEWHERE, OUTSIDE]} value={area} onChange={(v) => { setArea(v); setErr(null); }} />
      {area === OUTSIDE ? <Input value={other} onChangeText={setOther} placeholder="e.g. Onne" /> : null}
      <Pressable onPress={locate} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: geo ? c.yolk : c.line2, backgroundColor: geo ? c.sagebg : c.sf }}>
        <Icon name={geo ? 'check-circle' : 'crosshairs-gps'} color={geo ? c.sage : c.acc} />
        <View style={{ flex: 1 }}><Txt v="strong">{geo ? 'Location pinned' : 'Pin my current location'}</Txt><Txt v="small">{geo ? 'Delivery is priced by distance' : 'Without a pin, delivery is a flat ₦1,250'}</Txt></View>
      </Pressable>
      {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>{onCancel ? <Button small variant="outline" title="Cancel" onPress={onCancel} style={{ flex: 1 }} /> : null}<Button small title="Save address" loading={busy} onPress={save} style={{ flex: 1 }} /></View>
    </Card>
  );
}

// A numbered checkout section heading.
function Step({ n, title, children }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.navactink} style={{ fontSize: 14 }}>{n}</Txt></View>
        <Txt v="h2">{title}</Txt>
      </View>
      {children}
    </View>
  );
}

export function CheckoutScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const manageOnly = !!route.params?.manageOnly;
  const { wallet, refreshWallet } = useAuth();
  const { items, clear, validate } = useCart();
  const live = items.filter((x) => !x.unavailable);
  const groups = useMemo(() => groupByVendor(live), [items]);
  const spots = useSellerSpots(groups);
  const [addrs, setAddrs] = useState(null);
  const [areas, setAreas] = useState([]);
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState('wallet');
  const [card, setCard] = useState('ok');
  const [state, setState] = useState({ phase: 'idle' });
  const [credit, setCredit] = useState(null);   // { limit, outstanding, available } when this farm lets the buyer pay later
  const oneFarm = groups.length === 1 ? groups[0].id : null;
  useEffect(() => {
    if (!oneFarm) { setCredit(null); return; }
    rpc('credit_available', { p_vendor: oneFarm }).then(setCredit).catch(() => setCredit(null));
  }, [oneFarm]);
  useEffect(() => {
    Promise.all([supabase.from('addresses').select('*').order('created_at'), supabase.from('coverage_areas').select('name')]).then(([a, cv]) => {
      setAddrs(a.data || []); setAreas((cv.data || []).map((x) => x.name)); setSel(a.data?.[0]?.id || null); if (!a.data?.length) setAdding(true);
    });
    refreshWallet();
  }, []);

  const address = (addrs || []).find((a) => a.id === sel);
  const covered = address && areas.includes(address.area);
  const itemsTotal = live.reduce((s, x) => s + x.price * x.qty, 0);
  const feeOf = (g) => deliveryFee(spots[g.id], address);
  const fee = groups.reduce((t, g) => t + feeOf(g), 0);
  const total = itemsTotal + fee;
  const balance = Number(wallet?.balance || 0);
  // Pay later: the goods go on credit with the farm; the delivery fee is paid now so the rider is paid.
  const onCredit = method === 'credit' && !!credit;
  const creditOk = !!credit && itemsTotal <= Number(credit.available) && balance >= fee;
  const payNow = onCredit ? fee : total;
  const short = method === 'wallet' && balance < total;
  const why = !covered ? 'Choose an address in our delivery area' : short ? 'Add ' + naira(total - balance) + ' to your wallet, or pay by card' : onCredit && !creditOk ? 'Pay later needs ' + naira(fee) + ' in your wallet for delivery' : null;
  const win = deliveryWindow();

  const pay = async () => {
    setState({ phase: 'processing' });
    let ref = null;
    if (method === 'card') {
      const r = await chargeCard(card, total);
      if (!r.ok) return setState({ phase: 'failed', reason: r.reason });
      ref = r.ref;
    }
    try {
      const res = await rpc('place_order', { p_address_id: sel, p_items: live.map((x) => ({ listing_id: x.listing_id, qty: x.qty, via_search: !!x.via_search })), p_method: onCredit ? 'credit' : method === 'wallet' ? 'wallet' : 'card', p_ref: ref });
      clear(); refreshWallet();
      navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'OrderSuccess', params: { orderId: res.order_id } }] });
    } catch (e) {
      if (String(e.message).startsWith('ITEM_UNAVAILABLE')) { await validate(); setState({ phase: 'idle' }); alert('Some items sold out while you were checking out. You have not been charged.'); return navigation.navigate('Cart'); }
      setState({ phase: 'failed', reason: friendlyError(e) });
    }
  };

  if (state.phase === 'processing') return (
    <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <ActivityIndicator size="large" color={c.yolk} />
      <Txt v="h1" style={{ textAlign: 'center' }}>Confirming your payment</Txt>
      <Txt v="mono" style={{ fontSize: 22 }}>{naira(payNow)}</Txt>
      <Txt v="small" style={{ textAlign: 'center' }}>Keep this page open. It takes a few seconds.</Txt>
    </Screen>
  );
  if (state.phase === 'failed') return (
    <Screen scroll style={wide ? { maxWidth: 560 } : null}>
      <AppBar onBack={() => setState({ phase: 'idle' })} />
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.errbg, alignItems: 'center', justifyContent: 'center' }}><Icon name="credit-card-off-outline" size={34} color={c.err} /></View>
      <Txt v="display">Payment didn't go through</Txt>
      <Txt v="body" color={c.mute}>{state.reason}</Txt>
      {balance >= total ? <Button variant="outline" icon="wallet-outline" title={'Pay from wallet · ' + naira(balance) + ' available'} onPress={() => { setMethod('wallet'); setState({ phase: 'idle' }); }} /> : null}
      <Button title="Try again" onPress={() => setState({ phase: 'idle' })} />
      <Txt v="small">Your cart is saved, so nothing is lost.</Txt>
    </Screen>
  );

  const addressCards = (
    <View style={{ gap: 10 }}>
      {addrs === null ? <Skeleton h={80} r={20} /> : addrs.map((a) => {
        const ok = areas.includes(a.area);
        return (
          <SelectCard key={a.id} selected={a.id === sel} onPress={() => setSel(a.id)} error={a.id === sel && !ok}
            lead={<View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name={a.label === 'Work' ? 'briefcase-outline' : a.label === 'Restaurant' ? 'silverware-fork-knife' : 'home-outline'} size={20} /></View>}
            title={a.label} subtitle={a.line + ', ' + a.area}>
            {ok ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name={a.lat != null ? 'check' : 'map-marker-question-outline'} size={16} color={a.lat != null ? c.sage : c.warn} />
                <Txt v="small" color={a.lat != null ? c.sage : c.warn}>{a.lat != null ? 'In delivery area · location pinned' : 'In delivery area · not pinned, flat delivery fee'}</Txt></View>
              : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="alert-outline" size={16} color={c.err} /><Txt v="small" color={c.err}>{"We don't deliver to " + a.area + ' yet'}</Txt></View>}
          </SelectCard>
        );
      })}
      {adding ? <AddressForm areas={areas} onCancel={addrs?.length ? () => setAdding(false) : null} onSaved={(a) => { setAddrs([...(addrs || []), a]); setSel(a.id); setAdding(false); }} />
        : <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={({ hovered }) => ({ minHeight: 56, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: hovered ? c.sf : 'transparent' })}>
            <Icon name="plus" size={20} color={c.acc} /><Txt v="bold" color={c.acc}>Add a new address</Txt></Pressable>}
    </View>
  );

  if (manageOnly) return (
    <Screen scroll style={wide ? { maxWidth: 720 } : null}>
      <AppBar title="Delivery addresses" />
      {addressCards}
      <Txt v="small">Poultry360 riders deliver only inside our delivery area. Pinned addresses get delivery priced by distance.</Txt>
    </Screen>
  );

  const orderRows = (
    <View style={{ backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      {groups.map((g, i) => (
        <View key={g.id} style={{ padding: 14, gap: 6, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check-decagram" size={16} color={c.acc} />
            <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>{groupName(g)}</Txt>
            <Txt v="mono">{naira(g.items.reduce((t, x) => t + x.price * x.qty, 0))}</Txt>
          </View>
          <Txt v="small" numberOfLines={2}>{g.items.map((x) => x.qty + ' × ' + x.title).join(', ')}</Txt>
          <Txt v="small">{'Delivery ' + naira(feeOf(g))}</Txt>
        </View>
      ))}
    </View>
  );
  const payWith = (
    <View style={{ gap: 10 }}>
      <SelectCard selected={method === 'wallet'} onPress={() => setMethod('wallet')}
        lead={<Icon name="wallet-outline" color={c.acc} />} title="Wallet" subtitle={naira(balance) + ' available' + (balance < total ? ' · not enough' : '')} />
      <SelectCard selected={method === 'card'} onPress={() => setMethod('card')} lead={<Icon name="credit-card-outline" color={c.acc} />} title="Card" subtitle="Test cards · simulated">
        {method === 'card' ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{TEST_CARDS.map((k) => <Chip key={k.id} label={k.label} selected={card === k.id} onPress={() => setCard(k.id)} />)}</View> : null}
      </SelectCard>
      {credit ? (
        <SelectCard selected={method === 'credit'} onPress={() => setMethod('credit')} disabled={itemsTotal > Number(credit.available)}
          lead={<Icon name="credit-card-clock-outline" color={c.acc} />} title={'Pay later · ' + (groups[0].via ? 'with this ' + groups[0].word : groups[0].vendor)}
          subtitle={itemsTotal > Number(credit.available) ? naira(credit.available) + ' credit left · not enough for this order' : naira(credit.available) + ' credit left · pay delivery now'} />
      ) : null}
    </View>
  );
  const summary = (
    <Hearth style={{ gap: 12 }}>
      <Txt v="label" color={c.hmute}>{onCredit ? 'Pay now, delivery only' : 'Amount due'}</Txt>
      <View>
        <MoneyLine onDark label="Subtotal" value={naira(itemsTotal)} />
        <MoneyLine onDark label={'Delivery · ' + groups.length + (groups.length === 1 ? ' seller' : ' sellers')} value={naira(fee)} />
      </View>
      <Txt v="monoLg" color={c.hink} style={{ fontSize: 40, lineHeight: 46 }}>{naira(payNow)}</Txt>
      {onCredit ? <Txt v="small" color={c.hmute}>{naira(itemsTotal) + ' goes on pay later, due in 14 days.'}</Txt> : null}
      {why ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="alert-outline" size={16} color={c.herr} /><Txt v="small" color={c.herr} style={{ flex: 1 }}>{why}</Txt></View> : null}
      {wide ? <Button variant="onHearth" icon="lock-outline" title={'Pay ' + naira(payNow)} disabled={!!why} onPress={pay} /> : null}
      <Txt v="small" color={c.hmute}>{'The seller is paid only after delivery. Arriving ' + win.day.toLowerCase() + ', ' + win.time + '.'}</Txt>
    </Hearth>
  );
  const sections = <>
    <Step n={1} title="Deliver to">{addressCards}</Step>
    <Step n={2} title="Your order">{orderRows}</Step>
    <Step n={3} title="Pay with">{payWith}</Step>
  </>;
  if (wide) return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, gap: 24 }, page]}>
        <HeaderBar title="Checkout" subtitle="Payments are simulated in this version" />
        <View style={{ flexDirection: 'row', gap: 28, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.5, gap: 28 }}>{sections}</View>
          <View style={{ flex: 1 }}>{summary}</View>
        </View>
      </ScrollView>
    </Screen>
  );
  return (
    <Screen scroll footer={
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View><Txt v="small">To pay</Txt><Txt v="mono" style={{ fontSize: 20 }}>{naira(payNow)}</Txt></View>
        <Button icon="lock-outline" title={'Pay ' + naira(payNow)} disabled={!!why} onPress={pay} style={{ flex: 1 }} />
      </View>}>
      <AppBar title="Checkout" />
      {sections}
      {summary}
    </Screen>
  );
}

export function OrderSuccessScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const [o, setO] = useState(null);
  useEffect(() => { rpc('order_detail', { p_order: route.params.orderId }).then(setO); }, []);
  const win = deliveryWindow();
  const buttons = (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
      <Button title="Track order" icon="map-marker-path" onPress={() => navigation.replace('Tracking', { orderId: route.params.orderId })} style={wide ? { flex: 1 } : null} />
      <Button variant="outline" title="Keep shopping" onPress={() => navigation.popTo('Tabs', { screen: 'Home' })} style={wide ? { flex: 1 } : null} />
    </View>
  );
  const initials = (n) => (n || '').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  return (
    <Screen scroll footer={wide ? null : buttons} style={wide ? { maxWidth: 760 } : null}>
      <View style={{ height: wide ? 24 : 8 }} />
      <SuccessMoment title="Order placed" value={o ? o.code + ' · ' + naira(o.total) : null} body={'Arriving ' + win.day.toLowerCase() + ', ' + win.time + '. You can follow the rider on a live map.'} />
      {!o ? <ActivityIndicator color={c.yolk} /> : (
        <View style={{ gap: 12 }}>
          <SectionHead title="Coming from" />
          <DataTable minWidth={480} columns={[{ label: 'Seller', flex: 1.4 }, { label: 'Items', flex: 1.8 }, { label: 'Amount', right: true }]}
            rows={(o.subs || []).map((s) => ({ key: s.id, cells: [
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.hink} style={{ fontSize: 13 }}>{initials(s.vendor.name)}</Txt></View>
                <Txt v="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{s.vendor.name}</Txt><Icon name="check-decagram" size={16} color={c.acc} />
              </View>,
              <Txt v="small" numberOfLines={2}>{(s.items || []).map((i) => i.qty + ' × ' + i.title).join(', ')}</Txt>,
              <Txt v="mono">{naira(s.items_total)}</Txt>] }))} />
        </View>
      )}
      {wide ? buttons : null}
    </Screen>
  );
}
