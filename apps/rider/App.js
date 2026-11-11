import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Pressable, Linking, Image, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { ThemeProvider, liveChannel, ErrorBoundary, useTheme, useP360Fonts, Loading, EmailScreen, OtpScreen, SignInScreen, PasswordScreen, usePasswordGate, startPasswordChange, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Group, Row, Pill, Stat, palettes, ProgressSegments, SuccessMoment,
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

// Straight-line km between two pins (null when either is missing).
const kmBetween = (a, b) => {
  if (!a?.lat || !b?.lat) return null;
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const BIG = { height: 64, borderRadius: 32 };

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

  // The offer screen is always dark (the dark palette's Hearth colours), whatever the phone's theme.
  if (offered.length) {
    const D = palettes.dark;
    const pay = offered.reduce((s, o) => s + Number(o.earning || 0), 0);
    let km = 0, known = true, prev = trip.pickup;
    for (const o of offered) { const k = kmBetween(prev, o.dropoff); if (k == null) known = false; else km += k; prev = o.dropoff; }
    const urgent = left <= 20;
    return (
      <Screen bg={D.hc} scroll style={{ paddingTop: 20, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: D.orange }} />
            <Txt v="h2" color={D.hink}>{offered.length > 1 ? offered.length + ' deliveries, one pickup' : 'New delivery'}</Txt>
          </View>
          <View accessibilityLabel={Math.max(0, left) + ' seconds to accept'} style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 6, borderColor: urgent ? D.orange : D.hbtn, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="mono" color={D.hink} style={{ fontSize: 20 }}>{Math.max(0, left)}</Txt>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Txt v="body" color={D.hmute}>You earn</Txt>
          <Txt v="monoLg" color={D.hink} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 64, lineHeight: 72 }}>{naira(pay)}</Txt>
          <Txt v="body" color={D.hmute}>{known && km > 0 ? km.toFixed(1) + ' km · about ' + Math.max(10, Math.round(km * 4 + 10)) + ' min' : offered.length + (offered.length === 1 ? ' drop-off' : ' drop-offs')}</Txt>
        </View>
        <View style={{ backgroundColor: D.sf, borderRadius: 24, padding: 18, gap: 0 }}>
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ alignItems: 'center', width: 16 }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: D.hbtn, marginTop: 4 }} />
              <View style={{ width: 2, flex: 1, backgroundColor: D.line2, marginVertical: 4 }} />
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: 16 }}>
              <Txt v="small" color={D.mute}>Pickup</Txt>
              <Txt v="bold" color={D.ink} style={{ fontSize: 17 }}>{trip.pickup.name}</Txt>
              <Txt v="small" color={D.mute}>{trip.pickup.location}</Txt>
            </View>
          </View>
          {offered.map((o, i) => (
            <View key={o.id} style={{ flexDirection: 'row', gap: 14 }}>
              <View style={{ alignItems: 'center', width: 16 }}>
                <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: D.orange, marginTop: 4 }} />
                {i < offered.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: D.line2, marginVertical: 4 }} /> : null}
              </View>
              <View style={{ flex: 1, gap: 2, paddingBottom: i < offered.length - 1 ? 16 : 0 }}>
                <Txt v="small" color={D.mute}>{'Drop-off' + (offered.length > 1 ? ' ' + (i + 1) : '') + ' · ' + o.code}</Txt>
                <Txt v="bold" color={D.ink} style={{ fontSize: 17 }}>{o.dropoff.area || o.dropoff.line}</Txt>
                <Txt v="small" color={D.mute}>{itemsText(o)}</Txt>
              </View>
            </View>
          ))}
        </View>
        <Button title={offered.length > 1 ? 'Accept all ' + offered.length : 'Accept delivery'} loading={busy} onPress={() => respond(true)}
          variant="onHearth" style={{ height: 68, borderRadius: 34 }} />
        <Pressable disabled={busy} onPress={() => respond(false)} accessibilityRole="button" style={{ height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <Txt v="bold" color={D.hmute} style={{ fontSize: 16 }}>Decline</Txt>
        </Pressable>
      </Screen>
    );
  }
  if (needLoc) return (
    <Screen scroll footer={<><Button title="Open settings" onPress={() => Linking.openSettings()} style={BIG} /><Button variant="ghost" title="Stay offline" onPress={() => setNeedLoc(false)} /></>}>
      <View style={{ height: 32 }} />
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.t1, alignItems: 'center', justifyContent: 'center' }}><Icon name="crosshairs-gps" size={36} color={c.t1i} /></View>
      <Txt v="display">Allow location to start your shift</Txt>
      <Txt v="body" color={c.mute} style={{ fontSize: 16 }}>Dispatch only sends pickups to riders it can locate. Location is shared only while you're available or on a delivery.</Txt>
    </Screen>
  );
  const on = rider.status !== 'offline';
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = (money?.transactions || []).filter((t) => t.type === 'earning' && new Date(t.at) >= todayStart).length;
  return (
    <Screen scroll style={{ gap: 18, paddingTop: 8 }} footer={
      <Button title={on ? 'Go offline' : 'Go available'} variant={on ? 'outline' : 'primary'} icon="power" loading={busy} onPress={() => goAvailable(!on)} style={BIG} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.t2, alignItems: 'center', justifyContent: 'center' }}><Txt v="h2" color={c.t2i}>{rider.name[0]}</Txt></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt v="h1">{rider.name.split(' ')[0]}</Txt>
          <View style={{ alignSelf: 'flex-start' }}>{on ? <Pill tone="ok" icon="circle" label="Available" /> : <Pill tone="neutral" label="Offline" />}</View>
        </View>
        <Pressable onPress={() => navigation.navigate('History')} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="History"><Icon name="history" /></Pressable>
        <Pressable onPress={() => navigation.navigate('Profile')} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Profile and wallet"><Icon name="account-circle-outline" /></Pressable>
      </View>
      {!rider.active ? <Banner tone="warn" title="Account deactivated" body="Finish any current delivery as normal. You won't receive new assignments." /> : null}
      <Hearth onPress={() => navigation.navigate('Profile')}>
        <Txt v="label" color={c.hmute}>Earned today</Txt>
        <Txt v="monoLg" color={c.hink} style={{ fontSize: 44, lineHeight: 50 }}>{naira(money?.earned_today || 0)}</Txt>
        <Txt v="body" color={c.hmute}>{todayCount === 1 ? '1 delivery' : todayCount + ' deliveries'}{rider.zone ? ' · ' + rider.zone : ''}</Txt>
      </Hearth>
      {on ? (
        <View style={{ alignItems: 'center', gap: 14, paddingVertical: 28 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.yolk, alignItems: 'center', justifyContent: 'center' }}><Icon name="motorbike" size={30} color={c.onyolk} /></View>
          </View>
          <Txt v="h2">Looking for deliveries</Txt>
          <Txt v="body" color={c.mute} style={{ textAlign: 'center', fontSize: 16 }}>Keep the app open. New pickups ring here.</Txt>
        </View>
      ) : <>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, padding: 16, gap: 4 }}><Txt v="small" style={{ fontSize: 15 }}>This week</Txt><Txt v="mono" style={{ fontSize: 22 }}>{naira(money?.earned_week || 0)}</Txt></View>
          <View style={{ flex: 1, backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, padding: 16, gap: 4 }}><Txt v="small" style={{ fontSize: 15 }}>Wallet</Txt><Txt v="mono" style={{ fontSize: 22 }}>{naira(money?.balance || 0)}</Txt></View>
        </View>
        <Txt v="body" color={c.mute} style={{ fontSize: 16 }}>Go available to get pickups near you. You earn 80% of each delivery fee.</Txt>
      </>}
    </Screen>
  );
}

const QC = ['Count is right', 'Good condition', 'Packed well'];
const QC_FAIL = ['Short quantity', 'Poor packaging', 'Damaged items', 'Not as listed'];

// Step header for the trip: four segments and "Step n of 4".
function TripTop({ step, title, sub, onBack }) {
  return (
    <View style={{ gap: 12, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {onBack ? <AppBar bare onBack={onBack} /> : null}
        <ProgressSegments total={4} done={step - 1} style={{ flex: 1 }} />
        <Txt v="small" style={{ fontSize: 15 }}>{'Step ' + step + ' of 4'}</Txt>
      </View>
      <View style={{ gap: 2 }}><Txt v="display">{title}</Txt>{sub ? <Txt v="body" color={undefined} style={{ fontSize: 16 }}>{sub}</Txt> : null}</View>
    </View>
  );
}

function QcCheck({ order, pickup, onDone, onBack }) {
  const { c } = useTheme();
  const [checks, setChecks] = useState([false, false, false]);
  const [failing, setFailing] = useState(false);
  const [reasons, setReasons] = useState([]); const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false);
  const step = async (s, extra) => { setBusy(true); try { await rpc('rider_advance', { p_assignment: order.id, p_step: s, ...extra }); onDone(); } catch (e) { Alert.alert('Could not save', friendlyError(e)); } finally { setBusy(false); } };
  const all = checks.every(Boolean);
  return (
    <Screen scroll footer={failing
      ? <><Button variant="danger" title={reasons.length ? 'Flag and leave this order' : 'Pick what is wrong'} disabled={!reasons.length} loading={busy} onPress={() => step('qc_fail', { p_notes: notes, p_reasons: reasons })} style={BIG} />
        <Button variant="ghost" title="Back to the checks" onPress={() => setFailing(false)} /></>
      : <><Button title={all ? 'Passed · picked up' : 'Tick all three to continue'} disabled={!all} loading={busy} onPress={() => step('qc_pass', { p_notes: notes || null })} style={BIG} />
        <Pressable onPress={() => setFailing(true)} accessibilityRole="button" style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.err} style={{ fontSize: 16 }}>Something is wrong: flag and leave</Txt></Pressable></>}>
      <TripTop step={2} title="Quality check" sub={order.code + ' · ' + itemsText(order)} onBack={onBack} />
      <Txt v="small" style={{ fontSize: 15 }}>{'From ' + pickup.name + ' · for ' + order.dropoff.name}</Txt>
      {failing ? <>
        <Card tone="err" style={{ gap: 6 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="alert-outline" color={c.err} /><Txt v="bold" color={c.err}>Don't collect this order</Txt></View>
          <Txt v="body">The buyer is refunded. Other orders on this trip carry on.</Txt></Card>
        <ChipRow options={QC_FAIL} value={reasons} onChange={setReasons} multi />
        <Input value={notes} onChangeText={setNotes} placeholder="What did you see?" multiline />
      </> : (
        <View style={{ gap: 12 }}>
          {QC.map((q, i) => (
            <Pressable key={q} onPress={() => setChecks(checks.map((x, j) => (j === i ? !x : x)))} accessibilityRole="checkbox" accessibilityState={{ checked: checks[i] }}
              style={{ minHeight: 72, borderRadius: 20, borderWidth: 2, borderColor: checks[i] ? c.yolk : c.line, backgroundColor: checks[i] ? c.navact : c.sf, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: checks[i] ? c.yolk : 'transparent', borderWidth: checks[i] ? 0 : 2, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>
                {checks[i] ? <Icon name="check" size={24} color={c.onyolk} /> : null}
              </View>
              <Txt v="bold" style={{ fontSize: 18, flex: 1 }}>{q}</Txt>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

function Proof({ order, onDone }) {
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
    <Screen scroll footer={<Button title={up?.path ? 'Mark delivered' : up === 'uploading' ? 'Uploading photo' : 'Take a photo first'} disabled={!up?.path} loading={busy} onPress={deliver} style={BIG} />}>
      <TripTop step={4} title="Proof of delivery" sub={order.code + ' · ' + order.dropoff.name} />
      <Pressable onPress={capture} accessibilityRole="button" accessibilityLabel="Take a photo of the handover"
        style={{ height: 320, borderRadius: 24, borderWidth: photo ? 0 : 2, borderStyle: 'dashed', borderColor: c.line2, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 10 }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} /> : <><Icon name="camera-outline" size={48} color={c.acc} /><Txt v="bold" style={{ fontSize: 18 }}>Photo of the handover</Txt><Txt v="small" style={{ fontSize: 15 }}>Tap to open the camera</Txt></>}
      </Pressable>
      {up === 'uploading' ? <Pill tone="neutral" label="Uploading photo" /> : up === 'failed' ? <Banner tone="err" icon="cloud-off-outline" title="Upload failed" body="The photo is saved on your phone." action="Retake" onAction={capture} /> : up?.path ? <View style={{ alignSelf: 'flex-start' }}><Pill tone="ok" label="Photo uploaded" /></View> : null}
      {photo && up?.path ? <Button variant="ghost" title="Retake" onPress={capture} /> : null}
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
  const [done, setDone] = useState(null);   // the order just delivered: shows the payout before moving on
  const orders = (trip?.orders || []).filter((o) => LIVE.includes(o.status) && o.status !== 'offered');
  useEffect(() => { Location.getLastKnownPositionAsync().then((p) => p && setMe(p.coords)); }, [orders.length]);
  useEffect(() => { if (!orders.length && !done) { stopTracking(); navigation.popTo('Home'); } }, [orders.length, done]);   // back to the existing Home, not a second copy
  if (done) {
    const fee = Math.round(Number(done.earning || 0) / 0.8);
    return (
      <Screen scroll style={{ justifyContent: 'center', flexGrow: 1 }} footer={<Button title={orders.length ? 'Next drop-off' : 'Back to home'} onPress={() => setDone(null)} style={BIG} />}>
        <SuccessMoment title="Delivered" value={'+' + naira(done.earning)} body={'80% of the ' + naira(fee) + ' delivery fee. It is in your wallet.'} />
      </Screen>
    );
  }
  if (!orders.length) return <Loading />;

  const step = async (o, s) => { setBusy(true); try { await rpc('rider_advance', { p_assignment: o.id, p_step: s }); await reload(); } catch (e) { Alert.alert('Could not update', friendlyError(e)); } finally { setBusy(false); } };
  const release = (o) => Alert.alert("Can't carry " + o.code + '?', 'It goes back to dispatch and another rider collects it.', [
    { text: 'Keep it', style: 'cancel' }, { text: "Can't carry it", style: 'destructive', onPress: () => step(o, 'release') }]);
  const toFarm = orders.filter((o) => o.status === 'accepted');
  const atFarm = orders.filter((o) => o.status === 'at_farm');
  const drops = orders.filter((o) => ['picked_up', 'at_buyer'].includes(o.status));

  // Step 2: checking orders at the farm, one by one
  if (qcFor) {
    const o = atFarm.find((x) => x.id === qcFor);
    if (o) return <QcCheck order={o} pickup={trip.pickup} onBack={() => setQcFor(null)} onDone={() => { setQcFor(null); reload(); }} />;
  }
  if (atFarm.length && !toFarm.length) {
    if (atFarm.length === 1 && !drops.length) return <QcCheck order={atFarm[0]} pickup={trip.pickup} onDone={reload} />;
    return (
      <Screen scroll footer={atFarm.length > 1 ? <Pressable onPress={() => release(atFarm[atFarm.length - 1])} style={{ height: 48, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.acc} style={{ fontSize: 16 }}>I can't carry all of these</Txt></Pressable> : null}>
        <TripTop step={2} title={'At ' + trip.pickup.name} sub={atFarm.length + ' to check · ' + drops.length + ' picked up'} />
        {atFarm.map((o) => (
          <Card key={o.id} onPress={() => setQcFor(o.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 }}>
            <Icon name="clipboard-check-outline" color={c.acc} size={26} />
            <View style={{ flex: 1 }}><Txt v="bold" style={{ fontSize: 16 }}>{itemsText(o)}</Txt><Txt v="small" style={{ fontSize: 15 }}>{o.code} · for {o.dropoff.name}, {o.dropoff.area}</Txt></View>
            <Icon name="chevron-right" color={c.mute} />
          </Card>
        ))}
        {drops.map((o) => <Row key={o.id} icon="check-circle" iconColor={c.sage} title={itemsText(o)} subtitle={o.code + ' · checked and picked up'} />)}
      </Screen>
    );
  }

  // Step 4: proof at the buyer
  const atBuyer = drops.find((o) => o.status === 'at_buyer');
  if (atBuyer) return <Proof order={atBuyer} onDone={(o) => { setDone(o); reload(); }} />;
  // Step 1: riding to the farm, or step 3: delivering stop by stop
  const heading = toFarm.length > 0;
  const target = heading ? null : drops.find((o) => o.id === nextId) || drops[0];
  const dest = heading ? trip.pickup : target.dropoff;
  return (
    <Screen pad={false} edges={[]}>
      <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} showsUserLocation
        initialRegion={{ latitude: dest.lat || me?.latitude || PH.latitude, longitude: dest.lng || me?.longitude || PH.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }}>
        {dest.lat ? <Marker coordinate={{ latitude: dest.lat, longitude: dest.lng }} title={dest.name} pinColor={heading ? c.yolk : c.orange} /> : null}
      </MapView>
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -24, padding: 20, paddingBottom: 32, gap: 14 }}>
        <TripTop step={heading ? 1 : 3} title={heading ? 'Pickup' : 'Delivery'} />
        <View style={{ gap: 2 }}>
          <Txt v="h1">{dest.name}</Txt>
          <Txt v="body" style={{ fontSize: 16 }}>{heading ? trip.pickup.location : target.dropoff.line + ', ' + target.dropoff.area}</Txt>
          {heading && orders.length > 1 ? <Txt v="small" style={{ fontSize: 15 }}>{orders.length + ' orders · ' + orders.map((o) => o.code).join(' · ')}</Txt> : !heading ? <Txt v="small" style={{ fontSize: 15 }}>{target.code + (drops.length > 1 ? ' · ' + drops.length + ' drop-offs left' : '')}</Txt> : null}
        </View>
        {!heading && drops.length > 1 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {drops.map((o) => <Chip key={o.id} label={o.dropoff.area || o.code} selected={o.id === target.id} onPress={() => setNextId(o.id)} />)}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="outline" icon="navigation-variant-outline" title="Navigate" onPress={() => navigateTo(dest)} style={{ flex: 1, height: 56 }} />
          {!heading && target.dropoff.phone ? <Button variant="outline" icon="phone" title="Call buyer" onPress={() => Linking.openURL('tel:+' + target.dropoff.phone)} style={{ flex: 1, height: 56 }} /> : null}
        </View>
        <Button icon="chevron-double-right" title={heading ? "I'm at the farm" : "I've arrived"} loading={busy} onPress={() => step(heading ? toFarm[0] : target, heading ? 'arrived_farm' : 'arrived_buyer')} style={BIG} />
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
        <Row icon="lock-outline" title="Change password" subtitle="The password you sign in with" onPress={startPasswordChange} />
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
  const gate = usePasswordGate(session);
  if (session === undefined) return <Loading />;
  if (session && gate) return <PasswordScreen mode={gate} email={session.user?.email} />;
  if (!session) return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn">{({ navigation }) => <SignInScreen title="Rider sign-in" tagline="Deliveries for Poultry360." subtitle="Use the email ops registered for you." createLabel="First time? Set up with a code"
        onCreate={() => navigation.navigate('Email', { mode: 'signup' })} onForgot={(email) => navigation.navigate('Email', { mode: 'reset', email })} />}</Stack.Screen>
      <Stack.Screen name="Email">{({ navigation, route }) => <EmailScreen mode={route.params?.mode} initialEmail={route.params?.email} onBack={() => navigation.goBack()}
        title={route.params?.mode === 'reset' ? undefined : 'Set up your rider account'} subtitle={route.params?.mode === 'reset' ? undefined : "Enter the email Poultry360 ops registered for you. We'll send a 6-digit code, then you'll create a password."}
        onSent={(email) => navigation.navigate('Otp', { email })} />}</Stack.Screen>
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
  return <SafeAreaProvider><ThemeProvider initial="light">{fonts ? <ErrorBoundary><NavigationContainer><Root /></NavigationContainer></ErrorBoundary> : <Loading />}</ThemeProvider></SafeAreaProvider>;
}
