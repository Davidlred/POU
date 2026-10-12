import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Linking, Image, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { ThemeProvider, liveChannel, ErrorBoundary, useTheme, useP360Fonts, Loading, EmailScreen, OtpScreen, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, ChipRow, Group, Row, Pill, Stat,
  Stars, Sheet, OtpBoxes, supabase, rpc, uploadImage, friendlyError, timeAgo, naira } from '@p360/shared';

const Stack = createNativeStackNavigator();
const PH = { latitude: 4.8156, longitude: 7.0498 }; // Port Harcourt
const LIVE = ['offered', 'accepted', 'at_farm', 'picked_up', 'at_buyer'];
let watcher = null;
async function startTracking() {
  if (watcher) return;
  watcher = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 15000, distanceInterval: 25 },
    (p) => rpc('rider_ping', { p_lat: p.coords.latitude, p_lng: p.coords.longitude }).catch(() => {}));
}
function stopTracking() { watcher?.remove(); watcher = null; } // location stops the moment a shift/delivery ends (PRD §15)

const itemsText = (o) => (o.items || []).map((i) => i.qty + ' × ' + i.title).join(', ');
const navigateTo = (d) => (d.lat ? Linking.openURL('google.navigation:q=' + d.lat + ',' + d.lng)
  : Linking.openURL('geo:0,0?q=' + encodeURIComponent((d.line || d.location || '') + ' ' + (d.area || '') + ', Port Harcourt')));

// The rider's current trip: one farm pickup, up to 4 orders.
function useRider() {
  const [rider, setRider] = useState(undefined);
  const [trip, setTrip] = useState(null);
  const load = useCallback(async () => {
    const r = await rpc('rider_claim').catch(() => null);
    setRider(r && r.id ? r : null);
    if (r?.id) setTrip(await rpc('rider_current').catch(() => null));
  }, []);
  useEffect(() => {
    load();
    const ch = liveChannel('rider')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'riders' }, load)
      .subscribe();
    const t = setInterval(() => rpc('expire_overdue').catch(() => {}), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load]);
  return { rider, trip, reload: load };
}

function Home({ navigation, ctx }) {
  const { c } = useTheme();
  const { rider, trip, reload } = ctx;
  const [busy, setBusy] = useState(false);
  const [needLoc, setNeedLoc] = useState(false);
  const [left, setLeft] = useState(90);
  const [money, setMoney] = useState(null);
  const timedOut = useRef(false);
  const orders = trip?.orders || [];
  const offered = orders.filter((o) => o.status === 'offered');
  const firstOffer = offered.length ? Math.min(...offered.map((o) => new Date(o.offered_at).getTime())) : null;

  useFocusEffect(useCallback(() => { rpc('rider_profile').then(setMoney).catch(() => {}); }, [trip]));
  useEffect(() => {
    if (!firstOffer) return;
    timedOut.current = false;
    const tick = () => { const l = 90 - Math.floor((Date.now() - firstOffer) / 1000); setLeft(l); if (l <= 0 && !timedOut.current) { timedOut.current = true; respond(false); } };
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [firstOffer]);
  useEffect(() => { if (orders.length && !offered.length) navigation.navigate('Trip'); }, [orders.length, offered.length]);

  const goAvailable = async (on) => {
    setBusy(true);
    try {
      if (on) {
        const p = await Location.requestForegroundPermissionsAsync();
        if (!p.granted) { setNeedLoc(true); return; }
        const pos = await Location.getCurrentPositionAsync({});
        await rpc('rider_set_status', { p_available: true, p_lat: pos.coords.latitude, p_lng: pos.coords.longitude });
        startTracking();
      } else { await rpc('rider_set_status', { p_available: false }); stopTracking(); }
      reload();
    } catch (e) { Alert.alert('Could not update', friendlyError(e)); } finally { setBusy(false); }
  };
  // A trip offer is accepted or turned down as a whole.
  const respond = async (accept) => {
    setBusy(true);
    try { for (const o of offered) await rpc('rider_respond', { p_assignment: o.id, p_accept: accept }).catch(() => {}); } finally { setBusy(false); reload(); }
  };

  if (offered.length) {
    const pay = offered.reduce((s, o) => s + Number(o.earning || 0), 0);
    return (
      <Screen bg="#17120E" scroll style={{ paddingTop: 24, gap: 18 }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 8, borderColor: left > 20 ? '#E9904A' : '#F08A72', alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="monoLg" color="#F3EADF">0:{String(Math.max(0, left)).padStart(2, '0')}</Txt><Txt v="label" color="#A8998A">to accept</Txt></View>
          <Txt v="h1" color="#F3EADF">{offered.length > 1 ? offered.length + ' deliveries, one pickup' : 'New delivery'}</Txt>
          <Txt v="mono" color="#F2B33D" style={{ fontSize: 18 }}>You earn {naira(pay)}</Txt>
        </View>
        <View style={{ backgroundColor: '#221B15', borderColor: '#3A2F25', borderWidth: 1, borderRadius: 22, padding: 16, gap: 14 }}>
          <View style={{ gap: 2 }}><Txt v="label" color="#A8998A">Pickup</Txt><Txt v="bold" color="#F3EADF" style={{ fontSize: 16 }}>{trip.pickup.name}</Txt><Txt v="small" color="#A8998A">{trip.pickup.location}</Txt></View>
          {offered.map((o, i) => (
            <View key={o.id} style={{ gap: 2, borderTopWidth: 1, borderColor: '#3A2F25', paddingTop: 12 }}>
              <Txt v="label" color="#A8998A">Drop-off {offered.length > 1 ? i + 1 : ''} · {o.code}</Txt>
              <Txt v="bold" color="#F3EADF" style={{ fontSize: 16 }}>{o.dropoff.area || o.dropoff.line}</Txt>
              <Txt v="small" color="#A8998A">{itemsText(o)}</Txt>
            </View>
          ))}
        </View>
        <Button title={offered.length > 1 ? 'Accept all ' + offered.length : 'Accept delivery'} loading={busy} onPress={() => respond(true)} style={{ backgroundColor: '#E9904A', height: 60 }} />
        <Button variant="ghost" title="Can't take this" disabled={busy} onPress={() => respond(false)} style={{ marginBottom: 12 }} />
      </Screen>
    );
  }
  if (needLoc) return (
    <Screen scroll footer={<><Button title="Open settings" onPress={() => Linking.openSettings()} /><Button variant="ghost" title="Stay offline" onPress={() => setNeedLoc(false)} /></>}>
      <View style={{ height: 32 }} />
      <Hearth><Icon name="crosshairs-gps" size={36} color={c.ember} /></Hearth>
      <Txt v="display">Allow location to start your shift</Txt>
      <Txt v="body" color={c.mute}>Dispatch only sends pickups to riders it can locate. Location is shared only while you're available or on a delivery, and stops when a delivery completes.</Txt>
    </Screen>
  );
  const on = rider.status !== 'offline';
  return (
    <Screen style={{ gap: 18, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View><Txt v="h1">Hi, {rider.name.split(' ')[0]}</Txt><Txt v="small">Zone · {rider.zone || 'Unassigned'}</Txt></View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => navigation.navigate('History')} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="History"><Icon name="history" /></Pressable>
          <Pressable onPress={() => navigation.navigate('Profile')} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Profile and wallet"><Icon name="account-circle-outline" /></Pressable>
        </View>
      </View>
      {!rider.active ? <Banner tone="warn" title="Account deactivated" body="Finish any current delivery as normal. You won't receive new assignments." /> : null}
      {money ? (
        <Hearth onPress={() => navigation.navigate('Profile')}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View><Txt v="label" color={c.hmute}>Earned today</Txt><Txt v="monoLg" color={c.hink} style={{ fontSize: 26 }}>{naira(money.earned_today)}</Txt></View>
            <View style={{ alignItems: 'flex-end' }}><Txt v="label" color={c.hmute}>Wallet</Txt><Txt v="mono" color={c.hink}>{naira(money.balance)}</Txt></View>
          </View>
        </Hearth>
      ) : null}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
        <Pressable disabled={busy} onPress={() => goAvailable(!on)} accessibilityRole="switch" accessibilityState={{ checked: on }}
          style={{ width: 200, height: 200, borderRadius: 100, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: on ? c.sagebg : c.sf, borderWidth: 2, borderColor: on ? c.sage : c.line2 }}>
          <Icon name="power" size={48} color={on ? c.sage : c.mute} /><Txt v="h2">{on ? 'Go offline' : 'Go available'}</Txt>
        </Pressable>
        <Txt v="strong" color={on ? c.sage : c.mute}>{on ? '● Available · waiting for a pickup' : "● You're offline"}</Txt>
      </View>
    </Screen>
  );
}

const QC = ['Quantity matches the order', 'No damaged or below-grade items', 'Packed safely for transport'];
const QC_FAIL = ['Short quantity', 'Poor packaging', 'Damaged items', 'Not as listed'];

function QcCheck({ order, pickup, onDone, onBack }) {
  const { c } = useTheme();
  const [checks, setChecks] = useState([null, null, null]);
  const [reasons, setReasons] = useState([]); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false);
  const failing = checks.some((x) => x === false);
  const step = async (s, extra) => { setBusy(true); try { await rpc('rider_advance', { p_assignment: order.id, p_step: s, ...extra }); onDone(); } catch (e) { Alert.alert('Could not save', friendlyError(e)); } finally { setBusy(false); } };
  return (
    <Screen scroll footer={failing ? <Button variant="danger" title="Flag and leave this order" disabled={!reasons.length} loading={busy} onPress={() => step('qc_fail', { p_notes: notes, p_reasons: reasons })} />
      : <Button title="Passed · picked up" disabled={!checks.every((x) => x === true)} loading={busy} onPress={() => step('qc_pass', { p_notes: notes || null })} />}>
      <AppBar title="Check before pickup" subtitle={order.code} onBack={onBack} />
      <Card><Txt v="bold">{itemsText(order)}</Txt><Txt v="small">From {pickup.name} · for {order.dropoff.name}</Txt></Card>
      <Group>{QC.map((q, i) => (
        <View key={q} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: i < 2 ? 1 : 0, borderColor: c.line }}>
          <Txt v="strong" style={{ flex: 1 }}>{q}</Txt>
          {[true, false].map((v) => <Pressable key={String(v)} onPress={() => setChecks(checks.map((x, j) => (j === i ? v : x)))} accessibilityLabel={v ? 'Pass' : 'Fail'}
            style={{ width: 48, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: checks[i] === v ? (v ? c.sage : c.err) : 'transparent', borderWidth: checks[i] === v ? 0 : 1.5, borderColor: c.line2 }}>
            <Icon name={v ? 'check' : 'close'} color={checks[i] === v ? '#fff' : c.ink} /></Pressable>)}
        </View>))}</Group>
      {failing ? <><Banner tone="err" icon="cancel" title="Don't collect this order" body="The buyer is refunded. Your other orders on this trip carry on as normal." />
        <ChipRow options={QC_FAIL} value={reasons} onChange={setReasons} multi />
        <Input value={notes} onChangeText={setNotes} placeholder="What did you see?" multiline /></> : null}
    </Screen>
  );
}

function Proof({ order, onDone, onBack }) {
  const { c } = useTheme();
  const [photo, setPhoto] = useState(null); const [up, setUp] = useState(null); const [busy, setBusy] = useState(false);
  const capture = async () => {
    const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.5 }); if (r.canceled) return;
    setPhoto(r.assets[0].uri); setUp('uploading');
    try { const { data } = await supabase.auth.getUser(); setUp({ path: await uploadImage('proofs', data.user.id, r.assets[0].uri) }); } catch { setUp('failed'); }
  };
  const deliver = async () => {
    setBusy(true);
    try { await rpc('rider_advance', { p_assignment: order.id, p_step: 'delivered', p_proof: up.path }); onDone(order); }
    catch (e) { Alert.alert('Could not save', friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Mark delivered" disabled={!up?.path} loading={busy} onPress={deliver} />}>
      <AppBar title="Proof of delivery" subtitle={order.code + ' · ' + order.dropoff.name} onBack={onBack} />
      <Pressable onPress={capture} style={{ height: 300, borderRadius: 22, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} /> : <><Icon name="camera-outline" size={40} color={c.mute} /><Txt v="strong" color={c.mute}>Tap to photograph the handover</Txt></>}
      </Pressable>
      {up === 'uploading' ? <Banner tone="warn" icon="cloud-upload-outline" title="Uploading proof…" /> : up === 'failed' ? <Banner tone="err" icon="cloud-off-outline" title="Upload failed" body="The photo is saved on your phone." action="Retake" onAction={capture} /> : up?.path ? <Banner tone="ok" title="Proof uploaded" /> : null}
      <Txt v="small">"Mark delivered" stays off until the proof is uploaded.</Txt>
    </Screen>
  );
}

function Trip({ navigation, ctx }) {
  const { c } = useTheme();
  const { trip, reload } = ctx;
  const [busy, setBusy] = useState(false);
  const [qcFor, setQcFor] = useState(null);
  const [nextId, setNextId] = useState(null);
  const [me, setMe] = useState(null);
  const orders = (trip?.orders || []).filter((o) => LIVE.includes(o.status) && o.status !== 'offered');
  useEffect(() => { Location.getLastKnownPositionAsync().then((p) => p && setMe(p.coords)); }, [orders.length]);
  useEffect(() => { if (!orders.length) { stopTracking(); navigation.popTo('Home'); } }, [orders.length]);   // back to the existing Home, not a second copy
  if (!orders.length) return <Loading />;

  const step = async (o, s) => { setBusy(true); try { await rpc('rider_advance', { p_assignment: o.id, p_step: s }); await reload(); } catch (e) { Alert.alert('Could not update', friendlyError(e)); } finally { setBusy(false); } };
  const release = (o) => Alert.alert("Can't carry " + o.code + '?', 'It goes back to dispatch and another rider collects it.', [
    { text: 'Keep it', style: 'cancel' }, { text: "Can't carry it", style: 'destructive', onPress: () => step(o, 'release') }]);
  const toFarm = orders.filter((o) => o.status === 'accepted');
  const atFarm = orders.filter((o) => o.status === 'at_farm');
  const drops = orders.filter((o) => ['picked_up', 'at_buyer'].includes(o.status));

  // 1) Checking orders at the farm, one by one
  if (qcFor) {
    const o = atFarm.find((x) => x.id === qcFor);
    if (o) return <QcCheck order={o} pickup={trip.pickup} onBack={() => setQcFor(null)} onDone={() => { setQcFor(null); reload(); }} />;
  }
  if (atFarm.length && !toFarm.length) return (
    <Screen scroll footer={<Txt v="small" style={{ textAlign: 'center' }}>Check every order before you leave. Failed orders are refunded to the buyer.</Txt>}>
      <AppBar title={'At ' + trip.pickup.name} subtitle={atFarm.length + ' to check · ' + drops.length + ' picked up'} onBack={() => {}} />
      {atFarm.map((o) => (
        <Card key={o.id} onPress={() => setQcFor(o.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="clipboard-check-outline" color={c.acc} />
          <View style={{ flex: 1 }}><Txt v="bold">{itemsText(o)}</Txt><Txt v="small">{o.code} · for {o.dropoff.name}, {o.dropoff.area}</Txt></View>
          <Icon name="chevron-right" color={c.mute} />
        </Card>
      ))}
      {drops.map((o) => <Row key={o.id} icon="check-circle" iconColor={c.sage} title={itemsText(o)} subtitle={o.code + ' · checked and picked up'} />)}
      {atFarm.length > 1 ? <Txt v="bold" color={c.acc} onPress={() => release(atFarm[atFarm.length - 1])} style={{ textAlign: 'center' }}>I can't carry all of these</Txt> : null}
    </Screen>
  );

  // 2) Riding to the farm, or 3) delivering stop by stop
  const atBuyer = drops.find((o) => o.status === 'at_buyer');
  if (atBuyer) return <Proof order={atBuyer} onBack={() => {}} onDone={(o) => { Alert.alert('Delivered', naira(o.earning) + ' added to your wallet.'); reload(); }} />;
  const heading = toFarm.length > 0;
  const target = heading ? null : drops.find((o) => o.id === nextId) || drops[0];
  const dest = heading ? trip.pickup : target.dropoff;
  return (
    <Screen pad={false} edges={[]}>
      <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} showsUserLocation
        initialRegion={{ latitude: dest.lat || me?.latitude || PH.latitude, longitude: dest.lng || me?.longitude || PH.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }}>
        {dest.lat ? <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} title={dest.name} pinColor={heading ? '#F2B33D' : '#E9904A'} /> : null}
      </MapView>
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, padding: 20, paddingBottom: 32, gap: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="label" color={c.acc}>● {heading ? 'To pickup · ' + orders.length + ' order' + (orders.length === 1 ? '' : 's') : 'Drop-off ' + (drops.length > 1 ? '· ' + drops.length + ' left' : '')}</Txt>
          <Txt v="label">{heading ? '' : target.code}</Txt>
        </View>
        <View><Txt v="h1">{dest.name}</Txt><Txt v="small">{heading ? trip.pickup.location : target.dropoff.line + ', ' + target.dropoff.area}</Txt></View>
        {heading && orders.length > 1 ? <Txt v="small">{orders.map((o) => o.code).join(' · ')}</Txt> : null}
        {!heading && drops.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {drops.map((o) => <Pressable key={o.id} onPress={() => setNextId(o.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 100, borderWidth: 1.5, borderColor: o.id === target.id ? c.ember : c.line2, backgroundColor: o.id === target.id ? c.sf : 'transparent' }}>
              <Txt v="small" color={o.id === target.id ? c.ink : c.mute}>{o.dropoff.area || o.code}</Txt></Pressable>)}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button small variant="outline" icon="navigation-variant-outline" title="Navigate" onPress={() => navigateTo(dest)} style={{ flex: 1 }} />
          {!heading && target.dropoff.phone ? <Button small variant="outline" icon="phone" title="Call" onPress={() => Linking.openURL('tel:+' + target.dropoff.phone)} style={{ flex: 1 }} /> : null}
        </View>
        <Button icon="chevron-double-right" title={heading ? "I'm at the farm" : "I've arrived"} loading={busy} onPress={() => step(heading ? toFarm[0] : target, heading ? 'arrived_farm' : 'arrived_buyer')} style={{ height: 60 }} />
      </View>
    </Screen>
  );
}

function History() {
  const { c } = useTheme();
  const [rows, setRows] = useState(null);
  useEffect(() => { rpc('rider_history').then(setRows); }, []);
  const delivered = (rows || []).filter((r) => r.status === 'delivered');
  return (
    <Screen scroll>
      <AppBar title="History" />
      {rows && rows.length ? <View style={{ flexDirection: 'row', gap: 8 }}><Stat label="Delivered" value={delivered.length} /><Stat label="Earned" value={naira(delivered.reduce((s, r) => s + Number(r.earning || 0), 0))} /><Stat label="Flagged" value={rows.length - delivered.length} /></View> : null}
      {rows === null ? null : !rows.length ? <Empty icon="motorbike" title="No deliveries yet" body="Go available to get your first assignment." />
        : <Group>{rows.map((r, i) => <Row key={r.id} last={i === rows.length - 1} icon={r.status === 'delivered' ? 'check-circle' : 'flag'} iconColor={r.status === 'delivered' ? c.sage : c.err}
            title={r.from + ' → ' + (r.to || '')} subtitle={r.code + ' · ' + timeAgo(r.at) + (r.status === 'flagged' ? ' · flagged at pickup' : '')}
            right={r.status === 'delivered' ? <Txt v="mono" color={c.sage} style={{ fontSize: 13 }}>+{naira(r.earning)}</Txt> : null} />)}</Group>}
    </Screen>
  );
}

function useProfile() {
  const [p, setP] = useState(null);
  const load = useCallback(() => rpc('rider_profile').then(setP).catch(() => {}), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return [p, load];
}

function Profile({ navigation }) {
  const { c } = useTheme();
  const [p] = useProfile();
  if (!p) return <Screen><AppBar title="Profile" /><Loading /></Screen>;
  const r = p.rider;
  const initials = r.name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  return (
    <Screen scroll>
      <AppBar title="Profile" />
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.t2, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" color={c.t2i}>{initials}</Txt></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt v="h1">{r.name}</Txt>
          <Txt v="small">{r.vehicle}{r.plate ? ' · ' + r.plate : ''}{r.zone ? ' · ' + r.zone : ''}</Txt>
          <Pill tone={r.active ? 'ok' : 'err'} label={r.active ? 'Active rider' : 'Deactivated'} />
        </View>
      </View>

      <Hearth>
        <Txt v="label" color={c.hmute}>Wallet balance</Txt>
        <Txt v="monoLg" color={c.hink}>{naira(p.balance)}</Txt>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View><Txt v="label" color={c.hmute}>Today</Txt><Txt v="mono" color={c.hink}>{naira(p.earned_today)}</Txt></View>
          <View><Txt v="label" color={c.hmute}>This week</Txt><Txt v="mono" color={c.hink}>{naira(p.earned_week)}</Txt></View>
          <View><Txt v="label" color={c.hmute}>All time</Txt><Txt v="mono" color={c.hink}>{naira(p.earned_total)}</Txt></View>
        </View>
        <Button variant="hearth" icon="bank-transfer-out" title="Withdraw" disabled={!Number(p.balance)} onPress={() => navigation.navigate(r.bank_verified ? 'Withdraw' : 'Bank')} />
        <Txt v="small" color={c.hmute}>You earn 80% of the delivery fee on every order you deliver.</Txt>
      </Hearth>

      <Txt v="label">Your rating</Txt>
      <Card>
        {p.rating_count ? <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Txt v="monoLg" style={{ fontSize: 34 }}>{Number(p.rating).toFixed(1)}</Txt>
            <View style={{ gap: 4 }}><Stars value={Math.round(p.rating)} size={20} /><Txt v="small">{p.rating_count} rated deliver{p.rating_count === 1 ? 'y' : 'ies'} · {p.deliveries} total</Txt></View>
          </View>
          {p.reviews.map((v, i) => (
            <View key={i} style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 10, gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Stars value={v.rating} size={14} /><Txt v="small">{v.buyer} · {timeAgo(v.at)}</Txt></View>
              {v.comment ? <Txt v="body">{v.comment}</Txt> : null}
              {v.tags?.length ? <Txt v="small">{v.tags.join(' · ')}</Txt> : null}
            </View>
          ))}
        </> : <Txt v="small">No ratings yet. Buyers rate the delivery after each order.</Txt>}
      </Card>

      <Txt v="label">Recent activity</Txt>
      {p.transactions.length ? <Group>{p.transactions.map((t, i) => (
        <Row key={t.id} last={i === p.transactions.length - 1} icon={Number(t.amount) >= 0 ? 'arrow-bottom-left' : 'arrow-top-right'} iconColor={Number(t.amount) >= 0 ? c.sage : c.ink}
          title={t.label || t.type} subtitle={timeAgo(t.at) + (t.status === 'processing' ? ' · processing' : '')}
          right={<Txt v="mono" color={Number(t.amount) >= 0 ? c.sage : c.ink} style={{ fontSize: 13 }}>{Number(t.amount) >= 0 ? '+' : '−'}{naira(Math.abs(Number(t.amount)))}</Txt>} />))}</Group>
        : <Card><Txt v="small">Your earnings appear here after your first delivery.</Txt></Card>}

      <Txt v="label">Details</Txt>
      <Group>
        <Row icon="email-outline" title={r.email} subtitle="Sign-in email" />
        <Row icon="phone-outline" title={r.phone ? '+' + r.phone : 'No phone on file'} subtitle="Contact number" />
        <Row icon="bank-outline" title={r.bank_verified ? r.bank_name + ' •••• ' + r.bank_account_last4 : 'Add payout account'} subtitle="Payout account" onPress={() => navigation.navigate('Bank')} />
        <Row last icon="calendar-outline" title={'Rider since ' + new Date(r.since).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })} subtitle="Details are managed by Poultry360 ops" />
      </Group>
      <Button variant="ghost" icon="logout" title="Sign out" onPress={() => { stopTracking(); supabase.auth.signOut(); }} />
    </Screen>
  );
}

function Withdraw({ navigation }) {
  const { c } = useTheme();
  const [p, reload] = useProfile();
  const [amt, setAmt] = useState(''); const [code, setCode] = useState(''); const [testCode, setTestCode] = useState(null);
  const [sheet, setSheet] = useState(false); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  if (!p) return <Screen><AppBar title="Withdraw" close /><Loading /></Screen>;
  const r = p.rider; const bal = Number(p.balance || 0); const n = Number(amt || 0);
  if (done) return (
    <Screen scroll footer={<Button title="Done" onPress={() => navigation.goBack()} />}>
      <View style={{ height: 40 }} />
      <Txt v="display">Your payout is on its way</Txt>
      <Txt v="body" color={c.mute}><Txt v="mono">{naira(n)}</Txt> to {r.bank_name} •••• {r.bank_account_last4}</Txt>
    </Screen>
  );
  const start = async () => {
    if (n <= 0 || n > bal) return setErr("That's more than your available balance.");
    setErr(null); setCode('');
    // Payments are simulated, so the code is shown here. In production it's sent to the rider and the RPC returns null.
    try { const cd = await rpc('request_withdrawal_code'); setTestCode(cd || null); setSheet(true); } catch (e) { setErr(friendlyError(e)); }
  };
  const confirm = async () => {
    setBusy(true);
    try { await rpc('wallet_withdraw', { p_amount: n, p_code: code }); await reload(); setSheet(false); setDone(true); }
    catch (e) { setErr(friendlyError(e)); setCode(''); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Continue" disabled={!n} onPress={start} />}>
      <AppBar title="Withdraw" close />
      <Input label="Amount" prefix="₦" keyboardType="number-pad" value={amt} onChangeText={(t) => setAmt(t.replace(/\D/g, ''))} mono autoFocus error={!sheet ? err : null} hint={naira(bal) + ' available'} />
      <Button small variant="outline" title="Withdraw all" onPress={() => setAmt(String(Math.floor(bal)))} style={{ alignSelf: 'flex-start' }} />
      <Txt v="label">To</Txt>
      <Card onPress={() => navigation.replace('Bank')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="bank-outline" /><View style={{ flex: 1 }}><Txt v="bold">{r.bank_name} •••• {r.bank_account_last4}</Txt><Txt v="small">{r.name}</Txt></View><Txt v="small" color={c.acc}>Change</Txt></Card>
      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <Txt v="h1">Confirm it's you</Txt>
        <Txt v="small" style={{ fontSize: 14 }}>Enter your one-time code to send {naira(n)} to {r.bank_name} ••{r.bank_account_last4}.</Txt>
        {testCode ? <Banner tone="info" icon="test-tube" title={'Test mode · code ' + testCode} body="Payments are simulated. In production this code is sent to you." /> : null}
        <OtpBoxes value={code} onChange={setCode} error={!!err} />
        {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
        <Button title="Confirm withdrawal" disabled={code.length !== 6} loading={busy} onPress={confirm} />
      </Sheet>
    </Screen>
  );
}

const BANKS = ['GTBank', 'Access', 'Zenith', 'First Bank', 'UBA', 'Fidelity', 'Moniepoint', 'Opay', 'Palmpay'];
function Bank({ navigation }) {
  const [bank, setBank] = useState(null); const [acct, setAcct] = useState(''); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await rpc('add_bank', { p_bank: bank, p_account: acct }); navigation.replace('Withdraw'); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Verify and save" disabled={!bank || acct.length !== 10} loading={busy} onPress={save} />}>
      <AppBar title="Payout account" />
      <Txt v="strong" style={{ fontSize: 13 }}>Bank</Txt>
      <ChipRow options={BANKS} value={bank} onChange={setBank} />
      <Input label="Account number" keyboardType="number-pad" maxLength={10} value={acct} onChangeText={(t) => setAcct(t.replace(/\D/g, ''))} mono error={err} hint="10-digit NUBAN in your own name." />
    </Screen>
  );
}

function Root() {
  const [session, setSession] = useState(undefined);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setSession(data.session)); const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s)); return () => data.subscription.unsubscribe(); }, []);
  if (session === undefined) return <Loading />;
  if (!session) return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Email">{({ navigation }) => <EmailScreen title="Rider sign-in" subtitle="Use the email Poultry360 ops registered for you." onSent={(email) => navigation.navigate('Otp', { email })} />}</Stack.Screen>
      <Stack.Screen name="Otp">{({ navigation, route }) => <OtpScreen email={route.params.email} onEdit={() => navigation.goBack()} />}</Stack.Screen>
    </Stack.Navigator>
  );
  return <Signed />;
}
function Signed() {
  const ctx = useRider();
  if (ctx.rider === undefined) return <Loading />;
  if (ctx.rider === null) return <Screen style={{ justifyContent: 'center' }}><Empty icon="account-lock-outline" title="This email isn't a rider account" body="Rider accounts are created by Poultry360 ops. Ask your fleet lead to add this email." action="Sign out" onAction={() => supabase.auth.signOut()} /></Screen>;
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home">{(p) => <Home {...p} ctx={ctx} />}</Stack.Screen>
      <Stack.Screen name="Trip" options={{ gestureEnabled: false }}>{(p) => <Trip {...p} ctx={ctx} />}</Stack.Screen>
      <Stack.Screen name="History" component={History} />
      <Stack.Screen name="Profile" component={Profile} />
      <Stack.Screen name="Withdraw" component={Withdraw} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Bank" component={Bank} />
    </Stack.Navigator>
  );
}

export default function App() {
  const fonts = useP360Fonts();
  return <SafeAreaProvider><ThemeProvider>{fonts ? <ErrorBoundary><NavigationContainer><Root /></NavigationContainer></ErrorBoundary> : <Loading />}</ThemeProvider></SafeAreaProvider>;
}
