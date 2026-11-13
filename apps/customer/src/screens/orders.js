import React, { useCallback, useEffect, useState } from 'react';
import { View, Image, ScrollView, RefreshControl, Linking , Platform } from 'react-native';
import { Press as Pressable } from '@p360/shared';
import MapView, { Marker, PROVIDER_GOOGLE } from '../lib/map';
import { useFocusEffect } from '@react-navigation/native';
import { usePage, useWide, useTheme, liveChannel, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, ChipRow, Segmented, Steps, Stars, Pill, Skeleton,
  naira, rpc, publicUrl, uploadImage, friendlyError, timeAgo, STATUS_LABEL, supabase, PhotoButtons, HeaderBar, SectionHead, LiveDot, MoneyLine, SelectCard, ProgressSegments } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { getPhotos } from '../lib/photos';
import { liveOrder, ACTIVE, ORDER_FLOW, timeOfDay, firstName } from '../lib/eta';
import { TopBar } from '../components/RoleSwitcher';

const tone = (s) => (s === 'delivered' ? 'ok' : ['refunded', 'cancelled', 'flagged'].includes(s) ? 'err' : s === 'out_for_delivery' || s === 'picked_up' ? 'live' : 'warn');
const orderStatus = (o) => {
  const subs = o.subs || [];
  const live = subs.filter((s) => ACTIVE.includes(s.status)).sort((a, b) => ORDER_FLOW.indexOf(b.status) - ORDER_FLOW.indexOf(a.status))[0];
  return (live || subs[0] || {}).status;
};

// One order in the list: code, status, items, total. Selected (website) = 2 px primary border.
function OrderCard({ o, selected, onPress, onRate, flat }) {
  const { c } = useTheme();
  const st = orderStatus(o);
  const unrated = (o.subs || []).find((s) => s.status === 'delivered' && !s.reviewed);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={({ hovered }) => (flat ? { paddingVertical: 14, paddingHorizontal: 20, gap: 8 } : { backgroundColor: c.sf, borderRadius: 20, borderWidth: selected ? 2 : 1, borderColor: selected ? c.yolk : hovered ? c.line2 : c.line, padding: 16, gap: 8 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt v="bold" style={{ flex: 1 }}>{o.code}</Txt>
        {st ? <Pill tone={tone(st)} icon={st === 'out_for_delivery' ? null : undefined} label={STATUS_LABEL[st]} /> : null}
      </View>
      <Txt v="small" numberOfLines={2}>{(o.subs || []).map((s) => (Array.isArray(s.items) ? s.items.map((i) => i.qty + ' × ' + i.title).join(', ') : s.items)).filter(Boolean).join(' · ')}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Txt v="small">{timeAgo(o.created_at)}</Txt>
        <Txt v="mono">{naira(o.total)}</Txt>
      </View>
      {unrated && onRate ? <Button small variant="outline" icon="star-outline" title="Rate this order" onPress={() => onRate(unrated)} /> : null}
    </Pressable>
  );
}

export function OrdersScreen({ navigation }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const [tab, setTab] = useState('active');
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null);
  const load = useCallback(async () => { setBusy(true); try { setOrders(await rpc('buyer_orders')); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const isActive = (o) => (o.subs || []).some((s) => ACTIVE.includes(s.status));
  const act = (orders || []).filter(isActive);
  const past = (orders || []).filter((o) => !isActive(o));
  const list = tab === 'active' ? act : past;
  useEffect(() => { if (wide && list.length && !list.find((o) => o.id === sel)) setSel(list[0].id); }, [wide, tab, orders]);
  const rate = (o) => (s) => navigation.navigate('Rate', { subId: s.id, vendor: s.vendor });
  const seg = <Segmented options={[{ value: 'active', label: 'Active · ' + act.length }, { value: 'past', label: 'Past · ' + past.length }]} value={tab} onChange={setTab} />;
  const empty = <Empty art="eggs" title={tab === 'active' ? 'No orders on the way' : 'No past orders yet'} body="Orders you place show here, tracked live until they reach you." action="Browse the market" onAction={() => navigation.navigate('Market')} />;
  if (wide) return (
    <Screen pad={false}>
      <View style={[{ flex: 1, padding: 20, gap: 20 }, page]}>
        <HeaderBar title="Orders"><View style={{ width: 300 }}>{seg}</View></HeaderBar>
        {orders === null ? <Skeleton h={200} r={20} /> : !list.length ? empty : (
          <View style={{ flex: 1, flexDirection: 'row', gap: 20, minHeight: 0 }}>
            <ScrollView style={{ flex: 0.55 }} contentContainerStyle={{ gap: 10, paddingBottom: 24 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
              {list.map((o) => <OrderCard key={o.id} o={o} selected={o.id === sel} onPress={() => setSel(o.id)} onRate={rate(o)} />)}
            </ScrollView>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
              {sel ? <OrderDetail key={sel} orderId={sel} navigation={navigation} /> : null}
            </ScrollView>
          </View>
        )}
      </View>
    </Screen>
  );
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <TopBar navigation={navigation} />
        <Txt v="display">Orders</Txt>
        {seg}
        {orders === null ? <Skeleton h={110} r={20} /> : !list.length ? empty
          : Platform.OS !== 'web'
            // phone app: one edge-to-edge list with dividers
            ? <View style={[{ backgroundColor: c.sf, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.line }, { marginHorizontal: -20 }]}>
                {list.map((o, i) => <View key={o.id} style={{ borderTopWidth: i ? 1 : 0, borderColor: c.line }}><OrderCard flat o={o} onPress={() => navigation.navigate('Tracking', { orderId: o.id })} onRate={rate(o)} /></View>)}
              </View>
            : list.map((o) => <OrderCard key={o.id} o={o} onPress={() => navigation.navigate('Tracking', { orderId: o.id })} onRate={rate(o)} />)}
      </ScrollView>
    </Screen>
  );
}

// Live tracking for one order: ETA Hearth with the rider and the map, the steps with times, then the summary.
function OrderDetail({ orderId, navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const [o, setO] = useState(null);
  const load = useCallback(() => rpc('order_detail', { p_order: orderId }).then(setO).catch(() => {}), [orderId]);
  useEffect(() => {
    load();
    const ch = liveChannel('track-' + orderId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_orders', filter: 'order_id=eq.' + orderId }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders' }, load)
      .subscribe();
    const t = setInterval(load, 20000);   // foreground-only refresh while the order is open
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [orderId, load]);
  if (!o) return <Skeleton h={300} r={24} />;
  const live = liveOrder(o);
  return <>
    {live ? <EtaCard live={live} address={o.address} /> : null}
    {(o.subs || []).map((s) => <SubBlock key={s.id} s={s} o={o} navigation={navigation} />)}
    <Card style={{ gap: 6 }}>
      <Txt v="h2">Order {o.code}</Txt>
      <Txt v="small">{'Placed ' + new Date(o.created_at).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}{o.address ? ' · to ' + o.address.line + ', ' + o.address.area : ''}</Txt>
      <View style={{ borderTopWidth: 1, borderColor: c.line, marginTop: 6, paddingTop: 6 }}>
        <MoneyLine label="Items" value={naira((o.subs || []).reduce((t, s) => t + Number(s.items_total || 0), 0))} />
        <MoneyLine label="Delivery" value={naira(o.delivery_fee)} />
        <MoneyLine strong label="Total" value={naira(o.total)} />
      </View>
      {o.subs?.[0] ? <Button small variant="ghost" icon="lifebuoy" title="Something wrong?" onPress={() => navigation.navigate('Issue', { subId: o.subs[0].id })} style={{ alignSelf: wide ? 'flex-start' : 'stretch' }} /> : null}
    </Card>
  </>;
}

// The ETA Hearth: orange dot + status, arrival time large, "About 12 minutes · 2.1 km away", the rider with Call, the map under it.
function EtaCard({ live, address }) {
  const { c } = useTheme();
  const wide = useWide();
  const r = live.rider;
  const stale = r?.updated_at && Date.now() - new Date(r.updated_at).getTime() > 60000;
  return (
    <Hearth style={{ gap: 14 }}>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14, alignItems: wide ? 'flex-start' : 'stretch' }}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><LiveDot /><Txt v="strong" color={c.hink}>{live.title}</Txt></View>
          <Txt v="label" color={c.hmute}>{live.label}</Txt>
          <Txt v="monoLg" color={c.hink} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: wide ? 44 : 38, lineHeight: wide ? 50 : 44 }}>{live.big}</Txt>
          <Txt v="body" color={c.hmute}>{live.km != null ? live.sub_line : live.line}</Txt>
        </View>
        {r ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', minWidth: wide ? 260 : undefined }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.hbtn, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.onhbtn}>{(r.name || 'R')[0]}</Txt></View>
            <View style={{ flex: 1 }}>
              <Txt v="bold" color={c.hink} numberOfLines={1}>{r.name}</Txt>
              <Txt v="small" color={c.hmute} numberOfLines={1}>{'Poultry360 rider · ' + (r.vehicle || '') + (r.plate ? ' · ' + r.plate : '')}</Txt>
            </View>
            {r.phone ? <Button small variant="onHearth" icon="phone" title="Call" onPress={() => Linking.openURL('tel:+' + r.phone)} style={{ paddingHorizontal: 16 }} /> : null}
          </View>
        ) : null}
      </View>
      {r?.lat != null ? (
        <View style={{ height: wide ? 260 : 220, borderRadius: 18, overflow: 'hidden' }}>
          <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} region={{ latitude: r.lat, longitude: r.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }}>
            <Marker coordinate={{ latitude: r.lat, longitude: r.lng }} title={r.name} pinColor={stale ? 'gray' : c.orange} />
            {address?.lat ? <Marker coordinate={{ latitude: address.lat, longitude: address.lng }} title="You" pinColor={c.yolk} /> : null}
          </MapView>
          {stale ? <View style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}><Banner tone="warn" icon="signal-off" title="Last known location · updating" body={'Updated ' + timeAgo(r.updated_at) + '. The time may change.'} /></View> : null}
        </View>
      ) : null}
      <ProgressSegments total={6} done={live.step} onDark />
    </Hearth>
  );
}

// One seller's part: steps with times, refund notice, proof of delivery and rating.
function SubBlock({ s, o, navigation }) {
  const { c } = useTheme();
  const a = s.assignment; const r = a?.rider;
  const idx = ORDER_FLOW.indexOf(s.status);
  const at = (i) => (i === 0 ? timeOfDay(o.created_at) : i === 5 && s.delivered_at ? timeOfDay(s.delivered_at) : i === idx && s.updated_at ? timeOfDay(s.updated_at) : null);
  const steps = ['Order placed', 'Accepted by the seller', 'Ready for pickup', 'Picked up, quality checked', 'On the way to you', 'Delivered']
    .map((label, i) => ({ label, state: s.status === 'delivered' || i < idx ? 'done' : i === idx ? 'current' : 'todo', time: s.status === 'delivered' || i <= idx ? at(i) : null }));
  const waitingRider = s.status === 'ready' && !(r && ['accepted', 'at_farm'].includes(a?.status));
  const items = (s.items || []).map((i) => i.qty + ' × ' + i.title).join(', ');
  if (['refunded', 'cancelled', 'flagged'].includes(s.status)) return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Txt v="bold" style={{ flex: 1 }}>{s.vendor.name}</Txt><Pill tone="err" label={STATUS_LABEL[s.status]} /></View>
      <Txt v="small">{items}</Txt>
      <Banner tone="info" icon="cash-refund" title={naira(s.items_total) + ' refunded to your wallet'} body={s.decline_reason} />
    </Card>
  );
  return (
    <Card style={{ gap: 14, padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="check-decagram" size={18} color={c.acc} />
        <View style={{ flex: 1 }}><Txt v="bold">{'From ' + s.vendor.name}</Txt><Txt v="small" numberOfLines={2}>{items}</Txt></View>
        <Pill tone={tone(s.status)} label={STATUS_LABEL[s.status]} />
      </View>
      <Steps steps={steps} />
      {waitingRider && Date.now() - new Date(s.updated_at).getTime() > 10 * 60000 ? <Banner tone="warn" icon="clock-alert-outline" title="Running late" body="All riders near the seller are busy. The next free rider gets your order." /> : null}
      {s.status === 'delivered' ? (
        <View style={{ gap: 10, borderTopWidth: 1, borderColor: c.line, paddingTop: 12 }}>
          <Txt v="label">Proof of delivery</Txt>
          {a?.proof_path ? <Image source={{ uri: publicUrl('proofs', a.proof_path) }} style={{ height: 180, borderRadius: 16, backgroundColor: c.sf2 }} /> : null}
          <Txt v="small">{'Delivered' + (a?.delivered_at ? ' at ' + timeOfDay(a.delivered_at) : '') + (r ? ' by ' + firstName(r.name) : '')}</Txt>
          {!s.reviewed ? <Button icon="star-outline" title="Rate this order" onPress={() => navigation.navigate('Rate', { subId: s.id, vendor: s.vendor.name, rider: r?.name })} /> : <Pill tone="ok" label="Thanks for rating" />}
        </View>
      ) : null}
    </Card>
  );
}

export function TrackingScreen({ navigation, route }) {
  const wide = useWide();
  return (
    <Screen scroll style={wide ? { maxWidth: 820 } : null}>
      <AppBar title="Track order" />
      <OrderDetail orderId={route.params.orderId} navigation={navigation} />
    </Screen>
  );
}

const TAGS = ['Fresh', 'As described', 'Good value', 'Well packed'];
export function RateScreen({ navigation, route }) {
  const { subId, vendor, rider } = route.params;
  const wide = useWide();
  const [p, setP] = useState(0); const [d, setD] = useState(0); const [tags, setTags] = useState([]); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.from('reviews').insert({ sub_order_id: subId, product_rating: p, delivery_rating: d || null, tags, comment: note || null });
    setBusy(false);
    if (error) return alert(friendlyError(error));
    navigation.goBack();
  };
  return (
    <Screen scroll style={wide ? { maxWidth: 640 } : null} footer={<Button title={p ? 'Submit ratings' : 'Rate the product to continue'} disabled={!p} loading={busy} onPress={submit} />}>
      <AppBar title="Rate your order" close />
      <Card style={{ gap: 12 }}><Txt v="h2">The product</Txt><Txt v="small">{vendor}</Txt><Stars value={p} onChange={setP} /><ChipRow options={TAGS} value={tags} onChange={setTags} multi /></Card>
      <Card style={{ gap: 12 }}><Txt v="h2">The delivery</Txt><Txt v="small">{'Poultry360' + (rider ? ' · ' + rider : '')}</Txt><Stars value={d} onChange={setD} />
        <Input value={note} onChangeText={setNote} placeholder="A note for the delivery team (optional)" multiline /></Card>
      <Txt v="small">Product ratings go to the seller. Delivery ratings go to Poultry360's riders.</Txt>
    </Screen>
  );
}

const REASONS = [['not_received', "I didn't receive my order", 'package-variant-closed-remove'], ['damaged', 'Items damaged or missing', 'heart-broken-outline'], ['wrong', 'Wrong item delivered', 'swap-horizontal'], ['rider', 'Problem with the rider', 'motorbike']];
export function IssueScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const { uid } = useAuth();
  const [reason, setReason] = useState(null); const [details, setDetails] = useState(''); const [photo, setPhoto] = useState(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const pick = async (camera) => { const assets = await getPhotos(camera); if (assets) setPhoto(assets[0].uri); };
  const submit = async () => {
    setBusy(true);
    try {
      const path = photo ? await uploadImage('proofs', uid, photo) : null;
      const { error } = await supabase.from('disputes').insert({ sub_order_id: route.params.subId, reason, details: details || null, photo_path: path });
      if (error) throw error;
      setDone(true);
    } catch (e) { alert(friendlyError(e)); } finally { setBusy(false); }
  };
  if (done) return <Screen style={wide ? { maxWidth: 560 } : null}><AppBar close /><Empty icon="gavel" title="Report received" body="Our team replies within 24 hours. The seller's payment is held until it's resolved." action="Done" onAction={() => navigation.goBack()} /></Screen>;
  return (
    <Screen scroll style={wide ? { maxWidth: 640 } : null} footer={<Button title={reason ? 'Submit report' : 'Pick what went wrong'} disabled={!reason} loading={busy} onPress={submit} />}>
      <AppBar title="Report an issue" />
      <Txt v="h2">What went wrong?</Txt>
      {REASONS.map(([id, label, icon]) => (
        <SelectCard key={id} selected={reason === id} onPress={() => setReason(id)} lead={<Icon name={icon} color={c.acc} />} title={label} />
      ))}
      <Input label="What happened (optional)" value={details} onChangeText={setDetails} placeholder="Tell us in a few words" multiline />
      <Txt v="strong" style={{ fontSize: 14 }}>{photo ? 'Photo added · add another to replace it' : 'Add a photo (optional)'}</Txt>
      <PhotoButtons onCamera={() => pick(true)} onGallery={() => pick(false)} />
    </Screen>
  );
}
