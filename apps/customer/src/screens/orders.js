import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Image, ScrollView, RefreshControl, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, liveChannel, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, ChipRow, Segmented, Steps, Stars, Pill, Skeleton,
  naira, rpc, publicUrl, uploadImage, friendlyError, timeAgo, clock, STATUS_LABEL, ORDER_STEPS, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';

const ACTIVE = ['placed', 'confirmed', 'ready', 'picked_up', 'out_for_delivery'];
const tone = (s) => (s === 'delivered' ? 'ok' : ['refunded', 'cancelled', 'flagged'].includes(s) ? 'err' : s === 'out_for_delivery' || s === 'picked_up' ? 'live' : 'warn');

export function OrdersScreen({ navigation }) {
  const { c } = useTheme();
  const [tab, setTab] = useState('active');
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { setOrders(await rpc('buyer_orders')); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const list = (orders || []).filter((o) => (tab === 'active') === (o.subs || []).some((s) => ACTIVE.includes(s.status)));
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <Txt v="display" style={{ fontSize: 28 }}>Orders</Txt>
        <Segmented options={[{ value: 'active', label: 'Active' }, { value: 'past', label: 'Past' }]} value={tab} onChange={setTab} />
        {orders === null ? <Skeleton h={110} r={20} /> : !list.length ? <Empty icon="receipt-text-outline" title={tab === 'active' ? 'No active orders' : 'No past orders yet'} body="Orders you place appear here, tracked per farm." action={tab === 'active' ? 'Browse the market' : undefined} onAction={() => navigation.navigate('Market')} />
          : list.map((o) => (
            <View key={o.id} style={{ gap: 8 }}>
              <Txt v="label">{o.code} · {timeAgo(o.created_at)}</Txt>
              {(o.subs || []).map((s) => (
                <Card key={s.id} onPress={() => navigation.navigate('Tracking', { orderId: o.id })} style={s.status === 'out_for_delivery' ? { borderWidth: 2, borderColor: c.ember } : null}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>{s.vendor}</Txt><Pill tone={tone(s.status)} label={STATUS_LABEL[s.status]} /></View>
                  <Txt v="small" numberOfLines={1}>{s.items}</Txt>
                  {s.status === 'delivered' && !s.reviewed ? <Button small title="Rate this order" onPress={() => navigation.navigate('Rate', { subId: s.id, vendor: s.vendor })} /> : null}
                </Card>
              ))}
            </View>
          ))}
      </ScrollView>
    </Screen>
  );
}

function SubTracking({ s, navigation, address }) {
  const { c } = useTheme();
  const a = s.assignment; const r = a?.rider;
  const idx = ORDER_STEPS.indexOf(s.status);
  const steps = [
    { label: 'Order placed' }, { label: 'Confirmed by farm' }, { label: 'Ready for pickup' },
    { label: 'Picked up, quality checked' }, { label: 'On the way to you' }, { label: 'Delivered' },
  ].map((st, i) => ({ ...st, state: s.status === 'delivered' || i < idx ? 'done' : i === idx ? 'current' : 'todo' }));
  const riderLive = r && ['accepted', 'at_farm', 'picked_up', 'at_buyer'].includes(a.status) && r.lat;
  const stale = riderLive && (!r.updated_at || Date.now() - new Date(r.updated_at).getTime() > 60000);
  const waitingRider = s.status === 'ready' && !riderLive;
  if (['refunded', 'cancelled', 'flagged'].includes(s.status)) return (
    <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="bold">{s.vendor.name}</Txt><Pill tone="err" label={STATUS_LABEL[s.status]} /></View>
      <Banner tone="info" icon="cash-refund" title={naira(s.items_total) + ' refunded to your wallet'} body={s.decline_reason} /></Card>
  );
  return (
    <View style={{ gap: 12 }}>
      {riderLive ? (
        <View style={{ height: 240, borderRadius: 20, overflow: 'hidden' }}>
          <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} region={{ latitude: r.lat, longitude: r.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }}>
            <Marker coordinate={{ latitude: r.lat, longitude: r.lng }} title={r.name} pinColor={stale ? 'gray' : c.ember} />
            {address?.lat ? <Marker coordinate={{ latitude: address.lat, longitude: address.lng }} title="You" pinColor={c.ink} /> : null}
          </MapView>
          {stale ? <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}><Banner tone="warn" icon="signal-off" title="Last known location · updating" body={'Rider location last updated ' + timeAgo(r.updated_at) + '. ETA may change.'} /></View> : null}
        </View>
      ) : null}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.yolk} style={{ fontSize: 13 }}>{s.vendor.name.slice(0, 2).toUpperCase()}</Txt></View>
          <View style={{ flex: 1 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt v="bold">{s.vendor.name}</Txt><Icon name="check-decagram" size={15} color={c.acc} /></View><Txt v="small">{(s.items || []).map((i) => i.title + ' × ' + i.qty).join(', ')}</Txt></View>
        </View>
        <Steps steps={steps} />
        {idx <= 2 && !riderLive ? <View style={{ flexDirection: 'row', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line2, borderRadius: 12, padding: 10 }}><Icon name="storefront-outline" size={16} color={c.mute} /><Txt v="small" style={{ flex: 1, fontSize: 12 }}>Updates at this stage come from the farm. The live map starts once a rider is assigned.</Txt></View> : null}
        {waitingRider && Date.now() - new Date(s.updated_at).getTime() > 10 * 60000 ? <Banner tone="warn" icon="clock-alert-outline" title="Running late" body="All riders near the farm are busy. We'll assign the next free rider and update you." /> : null}
      </Card>
      {riderLive ? (
        <Hearth>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.hline, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.hink}>{r.name[0]}</Txt></View>
            <View style={{ flex: 1 }}><Txt v="bold" color={c.hink}>{r.name} · Poultry360 rider</Txt><Txt v="label" color={c.hmute}>{r.vehicle}{r.plate ? ' · ' + r.plate : ''}</Txt></View>
            <Pressable accessibilityLabel="Call rider" onPress={() => Linking.openURL('tel:+' + r.phone)} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.yolk, alignItems: 'center', justifyContent: 'center' }}><Icon name="phone" color={c.onyolk} /></Pressable>
          </View>
        </Hearth>
      ) : null}
      {s.status === 'delivered' ? (
        <Card>
          <Txt v="label">Proof of delivery</Txt>
          {a?.proof_path ? <Image source={{ uri: publicUrl('proofs', a.proof_path) }} style={{ height: 180, borderRadius: 16 }} /> : null}
          <Txt v="small">Delivered {a?.delivered_at ? 'at ' + clock(a.delivered_at) : ''}{r ? ' by ' + r.name : ''}</Txt>
          {!s.reviewed ? <Button title="Rate this order" onPress={() => navigation.navigate('Rate', { subId: s.id, vendor: s.vendor.name, rider: r?.name })} /> : <Pill tone="ok" label="Thanks for rating" />}
          <Button variant="ghost" title="Something wrong with this order?" onPress={() => navigation.navigate('Issue', { subId: s.id })} />
        </Card>
      ) : null}
    </View>
  );
}

export function TrackingScreen({ navigation, route }) {
  const { orderId } = route.params;
  const [o, setO] = useState(null);
  const load = useCallback(() => rpc('order_detail', { p_order: orderId }).then(setO).catch(() => {}), [orderId]);
  useEffect(() => {
    load();
    const ch = liveChannel('track-' + orderId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_orders', filter: 'order_id=eq.' + orderId }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'riders' }, load)
      .subscribe();
    const t = setInterval(load, 20000); // foreground-only refresh while the screen is open
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [orderId, load]);
  return (
    <Screen scroll>
      <AppBar title={o ? o.code : 'Order'} right={<Button small variant="outline" icon="lifebuoy" title="Help" onPress={() => o?.subs?.[0] && navigation.navigate('Issue', { subId: o.subs[0].id })} style={{ height: 40, marginRight: 8 }} />} />
      {!o ? <Skeleton h={300} r={20} /> : o.subs.map((s) => <SubTracking key={s.id} s={s} navigation={navigation} address={o.address} />)}
    </Screen>
  );
}

const TAGS = ['Fresh', 'As described', 'Good value', 'Well packed'];
export function RateScreen({ navigation, route }) {
  const { subId, vendor, rider } = route.params;
  const [p, setP] = useState(0); const [d, setD] = useState(0); const [tags, setTags] = useState([]); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const { error } = await supabase.from('reviews').insert({ sub_order_id: subId, product_rating: p, delivery_rating: d || null, tags, comment: note || null });
    setBusy(false);
    if (error) return alert(friendlyError(error));
    navigation.goBack();
  };
  return (
    <Screen scroll footer={<Button title="Submit ratings" disabled={!p} loading={busy} onPress={submit} />}>
      <AppBar title="Rate your order" close />
      <Card><Txt v="label">The product · {vendor}</Txt><Stars value={p} onChange={setP} /><ChipRow options={TAGS} value={tags} onChange={setTags} multi /></Card>
      <Card><Txt v="label">The delivery · Poultry360{rider ? ' · ' + rider : ''}</Txt><Stars value={d} onChange={setD} />
        <Input value={note} onChangeText={setNote} placeholder="Add a note for the delivery team (optional)" multiline /></Card>
      <Txt v="small">Product ratings go to the farm. Delivery ratings go to Poultry360's delivery service.</Txt>
    </Screen>
  );
}

const REASONS = [['not_received', "I didn't receive my order", 'package-variant-closed-remove'], ['damaged', 'Items damaged or missing', 'heart-broken-outline'], ['wrong', 'Wrong item delivered', 'swap-horizontal'], ['rider', 'Problem with the rider', 'motorbike']];
export function IssueScreen({ navigation, route }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const [reason, setReason] = useState(null); const [details, setDetails] = useState(''); const [photo, setPhoto] = useState(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  const pick = async () => { const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'] }); if (!r.canceled) setPhoto(r.assets[0].uri); };
  const submit = async () => {
    setBusy(true);
    try {
      const path = photo ? await uploadImage('proofs', uid, photo) : null;
      const { error } = await supabase.from('disputes').insert({ sub_order_id: route.params.subId, reason, details: details || null, photo_path: path });
      if (error) throw error;
      setDone(true);
    } catch (e) { alert(friendlyError(e)); } finally { setBusy(false); }
  };
  if (done) return <Screen><AppBar close /><Empty icon="gavel" title="Report received" body="Our team reviews every report and replies within 24 hours. Payment to the farm is held until it's resolved." action="Done" onAction={() => navigation.goBack()} /></Screen>;
  return (
    <Screen scroll footer={<Button title="Submit report" disabled={!reason} loading={busy} onPress={submit} />}>
      <AppBar title="Report an issue" />
      {REASONS.map(([id, label, icon]) => (
        <Pressable key={id} onPress={() => setReason(id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 16, backgroundColor: c.sf, borderWidth: reason === id ? 2 : 1.5, borderColor: reason === id ? c.ember : c.line }}>
          <Icon name={icon} /><Txt v="strong" style={{ flex: 1 }}>{label}</Txt><View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: reason === id ? 6 : 2, borderColor: reason === id ? c.ember : c.line2 }} />
        </Pressable>
      ))}
      <Input value={details} onChangeText={setDetails} placeholder="Tell us what happened" multiline />
      <Button variant="outline" icon="camera-plus-outline" title={photo ? 'Photo added' : 'Add a photo (optional)'} onPress={pick} />
    </Screen>
  );
}
