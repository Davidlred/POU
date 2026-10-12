import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, Image, ActivityIndicator, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, ChipRow, Group, Row, naira, rpc, publicUrl, friendlyError, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { DELIVERY_FEE } from '../lib/catalog';
import { TEST_CARDS, chargeCard } from '../lib/payments';

function groupByVendor(items) {
  const g = {};
  items.forEach((x) => { (g[x.vendor_id] = g[x.vendor_id] || { vendor: x.vendor_name, via: true, items: [] }).items.push(x); if (!x.via_search) g[x.vendor_id].via = false; });
  return Object.entries(g).map(([id, v]) => ({ id, ...v }));
}

export function CartScreen({ navigation }) {
  const { c } = useTheme();
  const { items, setQty, remove, validate, subtotal } = useCart();
  const [checking, setChecking] = useState(true);
  useFocusEffect(useCallback(() => { setChecking(true); validate().finally(() => setChecking(false)); }, []));
  const groups = groupByVendor(items);
  const bad = items.filter((x) => x.unavailable);
  if (!items.length) return <Screen><AppBar title="Cart" /><Empty icon="shopping-outline" title="Your cart is empty" body="Fresh eggs, birds and feed from verified farms." action="Browse the market" onAction={() => navigation.navigate('Tabs', { screen: 'Market' })} /></Screen>;
  return (
    <Screen scroll footer={<>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="small" style={{ fontSize: 14 }}>Subtotal</Txt><Txt v="mono">{naira(subtotal)}</Txt></View>
      <Button title="Checkout" disabled={checking || subtotal <= 0} loading={checking} onPress={() => navigation.navigate('Checkout')} />
    </>}>
      <AppBar title="Cart" subtitle={items.length + ' items · ' + groups.length + (groups.length === 1 ? ' source' : ' sources')} />
      {bad.length ? <Banner tone="err" title={bad.length + (bad.length === 1 ? ' item is' : ' items are') + ' no longer available'} body="Remove them to check out with the rest." /> : null}
      {groups.map((g) => (
        <Card key={g.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name={g.via ? 'map-search-outline' : 'check-decagram'} size={16} color={c.acc} /><Txt v="bold" style={{ fontSize: 13 }}>{g.via ? 'Verified farm near you' : g.vendor}</Txt></View>
          {g.items.map((x) => (
            <View key={x.listing_id} style={{ gap: 8, opacity: x.unavailable ? 0.6 : 1 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                {x.photo ? <Image source={{ uri: publicUrl('listing-photos', x.photo) }} style={{ width: 52, height: 52, borderRadius: 12 }} /> : <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: c.sf2 }} />}
                <View style={{ flex: 1 }}><Txt v="strong" style={{ textDecorationLine: x.unavailable ? 'line-through' : 'none' }}>{x.title}</Txt>
                  {x.unavailable ? <Txt v="small" color={c.err}>No longer available</Txt> : <Txt v="small">{naira(x.price)} / {x.unit}</Txt>}</View>
                <Txt v="mono" style={{ fontSize: 14 }}>{naira(x.price * x.qty)}</Txt>
              </View>
              {x.unavailable ? <Button small variant="dark" title="Remove" onPress={() => remove(x.listing_id)} /> : (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Pressable accessibilityLabel="Decrease" onPress={() => setQty(x.listing_id, x.qty - 1)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name={x.qty === 1 ? 'trash-can-outline' : 'minus'} size={20} /></Pressable>
                  <Txt v="mono" style={{ width: 28, textAlign: 'center' }}>{x.qty}</Txt>
                  <Pressable accessibilityLabel="Increase" onPress={() => setQty(x.listing_id, x.qty + 1)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} /></Pressable>
                </View>
              )}
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}

function AddressForm({ areas, onSaved, onCancel }) {
  const { uid } = useAuth();
  const [label, setLabel] = useState('Home');
  const [line, setLine] = useState('');
  const [area, setArea] = useState('');
  const [other, setOther] = useState('');
  const [geo, setGeo] = useState(null);
  const [busy, setBusy] = useState(false);
  const locate = async () => {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) return alert('Location permission is needed to pin your address.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  };
  const save = async () => {
    const a = area === 'Other' ? other.trim() : area;
    if (!line.trim() || !a) return alert('Add the street address and area.');
    setBusy(true);
    const { data, error } = await supabase.from('addresses').insert({ user_id: uid, label, line: line.trim(), area: a, lat: geo?.lat, lng: geo?.lng }).select().single();
    setBusy(false);
    if (error) return alert(friendlyError(error));
    onSaved(data);
  };
  return (
    <Card>
      <Txt v="h2">New address</Txt>
      <ChipRow options={['Home', 'Work', 'Restaurant', 'Other']} value={label} onChange={setLabel} />
      <Input label="Street address" value={line} onChangeText={setLine} placeholder="12 Aba Road" />
      <Txt v="strong" style={{ fontSize: 13 }}>Area</Txt>
      <ChipRow options={[...areas, 'Other']} value={area} onChange={setArea} />
      {area === 'Other' ? <Input value={other} onChangeText={setOther} placeholder="e.g. Onne" hint="We'll tell you if we deliver there yet." /> : null}
      <Button small variant="outline" icon="crosshairs-gps" title={geo ? 'Location pinned' : 'Pin my current location'} onPress={locate} />
      <View style={{ flexDirection: 'row', gap: 8 }}>{onCancel ? <Button small variant="outline" title="Cancel" onPress={onCancel} style={{ flex: 1 }} /> : null}<Button small title="Save address" loading={busy} onPress={save} style={{ flex: 1 }} /></View>
    </Card>
  );
}

export function CheckoutScreen({ navigation, route }) {
  const { c } = useTheme();
  const manageOnly = !!route.params?.manageOnly;
  const { wallet, refreshWallet } = useAuth();
  const { items, clear, validate } = useCart();
  const live = items.filter((x) => !x.unavailable);
  const groups = useMemo(() => groupByVendor(live), [items]);
  const [step, setStep] = useState('address');
  const [addrs, setAddrs] = useState(null);
  const [areas, setAreas] = useState([]);
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState('ok');
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
  const fee = groups.length * DELIVERY_FEE;
  const total = itemsTotal + fee;
  const balance = Number(wallet?.balance || 0);
  // Pay later: the goods go on credit with the farm; the delivery fee is paid now so the rider is paid.
  const onCredit = method === 'credit' && !!credit;
  const creditOk = !!credit && itemsTotal <= Number(credit.available) && balance >= fee;
  const payNow = onCredit ? fee : total;

  const pay = async () => {
    setState({ phase: 'processing' });
    let ref = null;
    if (method !== 'wallet' && !onCredit) {
      const r = await chargeCard(method, total);
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
    <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <ActivityIndicator size="large" color={c.ember} />
      <Txt v="h1" style={{ textAlign: 'center' }}>Confirming your payment</Txt>
      <Txt v="small" style={{ textAlign: 'center' }}>This usually takes a few seconds. Please keep the app open.</Txt>
      <Txt v="mono">{naira(payNow)}</Txt>
    </Screen>
  );
  if (state.phase === 'failed') return (
    <Screen scroll>
      <AppBar onBack={() => setState({ phase: 'idle' })} />
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.errbg, alignItems: 'center', justifyContent: 'center' }}><Icon name="credit-card-off-outline" size={32} color={c.err} /></View>
      <Txt v="display">Payment didn't go through</Txt>
      <Txt v="body" color={c.mute}>{state.reason}</Txt>
      {balance >= total ? <Hearth onPress={() => { setMethod('wallet'); setState({ phase: 'idle' }); }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name="wallet-outline" color={c.yolk} /><View style={{ flex: 1 }}><Txt v="bold" color={c.hink}>Pay from wallet</Txt><Txt v="small" color={c.hmute}>{naira(balance)} available</Txt></View><Icon name="chevron-right" color={c.hink} /></View></Hearth> : null}
      <Button variant="outline" title="Try another card" onPress={() => setState({ phase: 'idle' })} />
      <Txt v="small">Your cart is saved, so nothing is lost.</Txt>
    </Screen>
  );

  if (step === 'address' || manageOnly) return (
    <Screen scroll footer={manageOnly ? null : <Button title="Continue to review" disabled={!covered} onPress={() => setStep('review')} />}>
      <AppBar title={manageOnly ? 'Delivery addresses' : 'Deliver to'} subtitle={manageOnly ? null : '1 of 2'} />
      {addrs === null ? <ActivityIndicator color={c.ember} /> : addrs.map((a) => {
        const on = a.id === sel; const ok = areas.includes(a.area);
        return (
          <Pressable key={a.id} onPress={() => setSel(a.id)} style={{ backgroundColor: c.sf, borderRadius: 20, padding: 16, gap: 12, borderWidth: on ? 2 : 1.5, borderColor: on ? (ok ? c.ember : c.err) : c.line }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Icon name={a.label === 'Work' ? 'briefcase-outline' : a.label === 'Restaurant' ? 'silverware-fork-knife' : 'home-outline'} />
              <View style={{ flex: 1, gap: 2 }}><Txt v="bold">{a.label}</Txt><Txt v="small">{a.line}, {a.area}</Txt>
                {ok ? <Txt v="small" color={c.sage} style={{ fontSize: 12 }}>In delivery area</Txt> : null}</View>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 2, borderColor: on ? (ok ? c.ember : c.err) : c.line2 }} />
            </View>
            {on && !ok ? <Banner tone="err" icon="map-marker-off-outline" title={"We don't deliver to " + a.area + ' yet'} body={'Our riders cover ' + areas.slice(0, 4).join(', ') + ' and more. Choose another address.'} /> : null}
          </Pressable>
        );
      })}
      {adding ? <AddressForm areas={areas} onCancel={addrs?.length ? () => setAdding(false) : null} onSaved={(a) => { setAddrs([...(addrs || []), a]); setSel(a.id); setAdding(false); }} />
        : <Button variant="outline" icon="map-marker-plus-outline" title="Add a new address" onPress={() => setAdding(true)} />}
      {!manageOnly ? <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="information-outline" size={18} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Poultry360 riders handle every delivery, so we can only accept addresses inside our coverage area.</Txt></View> : null}
    </Screen>
  );

  return (
    <Screen scroll footer={<Button icon="lock-outline" title={onCredit ? 'Place order · pay ' + naira(fee) + ' now' : 'Pay ' + naira(total)} disabled={(method === 'wallet' && balance < total) || (onCredit && !creditOk)} onPress={pay} />}>
      <AppBar title="Review order" subtitle="2 of 2" onBack={() => setStep('address')} />
      <Card onPress={() => setStep('address')} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name="map-marker-outline" color={c.acc} /><View style={{ flex: 1 }}><Txt v="strong">{address?.line}, {address?.area}</Txt><Txt v="small">Poultry360 rider</Txt></View><Txt v="bold" color={c.acc} style={{ fontSize: 13 }}>Change</Txt></Card>
      <Card>
        {groups.map((g, i) => (
          <View key={g.id} style={{ gap: 8, paddingTop: i ? 10 : 0, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
            <Txt v="label">Order {i + 1} · {g.via ? 'Verified farm near you' : g.vendor}</Txt>
            {g.items.map((x) => <View key={x.listing_id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body" style={{ flex: 1 }}>{x.title} × {x.qty}</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(x.price * x.qty)}</Txt></View>)}
          </View>
        ))}
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="small" style={{ fontSize: 14 }}>Items</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(itemsTotal)}</Txt></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="small" style={{ fontSize: 14 }}>Delivery · {groups.length} pickup{groups.length > 1 ? 's' : ''}</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(fee)}</Txt></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}><Txt v="bold">Total</Txt><Txt v="mono" style={{ fontSize: 22 }}>{naira(total)}</Txt></View>
        <Txt v="small" style={{ fontSize: 12 }}>Prices include the platform commission. No extra charges.</Txt>
      </Card>
      {onCredit ? <Banner tone="info" icon="credit-card-clock-outline" title={naira(itemsTotal) + ' goes on credit'}
        body={'You pay the ' + naira(fee) + ' delivery fee from your wallet now. The ' + naira(itemsTotal) + ' for the goods is due within 14 days: pay it in the app under Pay later, or pay the farm directly.'} /> : null}
      <Txt v="label">Pay with</Txt>
      {credit ? (
        <Group>
          <Row last icon="credit-card-clock-outline" title={'Pay later · credit with ' + (groups[0].via ? 'this farm' : groups[0].vendor || 'this farm')}
            subtitle={itemsTotal > Number(credit.available) ? naira(credit.available) + ' credit left · not enough for this order' : balance < fee ? 'Add ' + naira(fee - balance) + ' to your wallet for the delivery fee' : naira(credit.available) + ' credit left · delivery fee paid now'}
            onPress={creditOk ? () => setMethod('credit') : undefined}
            right={<View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: method === 'credit' ? 6 : 2, borderColor: method === 'credit' ? c.ember : c.line2 }} />} />
        </Group>
      ) : null}
      <Group>
        <Row icon="wallet-outline" title="Wallet" subtitle={naira(balance) + ' available' + (balance < total ? ' · not enough' : '')} onPress={balance >= total ? () => setMethod('wallet') : undefined}
          right={<View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: method === 'wallet' ? 6 : 2, borderColor: method === 'wallet' ? c.ember : c.line2 }} />} />
        {TEST_CARDS.map((card, i) => <Row key={card.id} icon="credit-card-outline" title={card.label} subtitle={card.note} onPress={() => setMethod(card.id)} last={i === TEST_CARDS.length - 1}
          right={<View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: method === card.id ? 6 : 2, borderColor: method === card.id ? c.ember : c.line2 }} />} />)}
      </Group>
      <Txt v="label" style={{ textAlign: 'center' }}>Secured by Paystack · simulated in this MVP</Txt>
    </Screen>
  );
}

export function OrderSuccessScreen({ navigation, route }) {
  const { c } = useTheme();
  const [o, setO] = useState(null);
  useEffect(() => { rpc('order_detail', { p_order: route.params.orderId }).then(setO); }, []);
  return (
    <Screen scroll footer={<><Button title="Track order" onPress={() => navigation.replace('Tracking', { orderId: route.params.orderId })} /><Button variant="ghost" title="Keep shopping" onPress={() => navigation.navigate('Tabs', { screen: 'Home' })} /></>}>
      <View style={{ height: 32 }} />
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.yolk, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={40} color="#2A2119" /></View>
      <Txt v="display">Order placed</Txt>
      {o ? <Txt v="mono" color={c.mute}>{o.code} · {naira(o.total)} paid</Txt> : <ActivityIndicator color={c.ember} />}
      {o?.subs?.map((s) => (
        <Card key={s.id}>
          {s.via_search ? <><Txt v="label" color={c.acc}>Your order is coming from</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Txt v="bold">{s.vendor.name}</Txt><Icon name="check-decagram" size={16} color={c.acc} />{s.vendor.rating ? <Txt v="mono" style={{ fontSize: 12 }}>★ {Number(s.vendor.rating).toFixed(1)}</Txt> : null}</View>
            <Txt v="small">Matched from verified farms near you with stock</Txt></>
            : <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt v="bold">{s.vendor.name}</Txt><Txt v="small" color={c.warn}>Awaiting farm</Txt></View>}
          <Txt v="small">{(s.items || []).map((i) => i.title + ' × ' + i.qty).join(', ')}</Txt>
        </Card>
      ))}
    </Screen>
  );
}
