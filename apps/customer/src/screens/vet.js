import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Linking, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Pill, Stat, Group, Row, Skeleton,
  naira, isoDate, shortDate, clock, rpc, uploadImage, friendlyError, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { useFarm, save } from '../lib/offlineQueue';
import { TEST_CARDS, chargeCard } from '../lib/payments';
import { SIGNS, triage } from '../lib/triage';

const Avatar = ({ v, size = 56 }) => { const { c } = useTheme(); return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.t2, alignItems: 'center', justifyContent: 'center' }}><Txt v="h2" color={c.t2i}>{v.initials}</Txt></View>; };

export function VetHomeScreen({ navigation }) {
  const { c } = useTheme();
  const [up, setUp] = useState(null);
  useFocusEffect(useCallback(() => { supabase.from('consultations').select('*, vet:vets(name,initials)').in('status', ['requested', 'proposed', 'confirmed']).order('created_at', { ascending: false }).then(({ data }) => setUp(data || [])); }, []));
  return (
    <Screen scroll>
      <AppBar title="Vet care" />
      <Hearth>
        <Txt v="h1" color={c.hink}>Birds looking unwell?</Txt>
        <Txt v="small" color={c.hmute}>Upload a photo for a quick triage note, then talk to a vet if needed.</Txt>
        <Button icon="camera-outline" title="Check symptoms" onPress={() => navigation.navigate('Symptom')} />
      </Hearth>
      {up && up.length ? <><Txt v="label">Upcoming</Txt>{up.map((k) => (
        <Card key={k.id} onPress={() => navigation.navigate('Consultation', { id: k.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar v={k.vet} size={48} /><View style={{ flex: 1 }}><Txt v="bold">{k.vet.name}</Txt><Txt v="small">{k.type === 'video' ? 'Video · ' + (k.proposed_at ? shortDate(k.proposed_at) + ' ' + clock(k.proposed_at) : '') : 'On-site · ' + (k.status === 'requested' ? 'awaiting vet' : k.status)}</Txt></View>
          <Pill tone={k.status === 'confirmed' ? 'ok' : 'warn'} label={k.status === 'confirmed' ? 'Confirmed' : k.status === 'proposed' ? 'New time' : 'Requested'} />
        </Card>))}</> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[['Find a vet', 'stethoscope', 't2', () => navigation.navigate('VetList')], ['On-site visit', 'home-heart', 't4', () => navigation.navigate('VetList', { onsite: true })],
          ['Drugs & vaccines', 'pill', 't1', () => navigation.navigate('Listings', { category: 'drugs' })], ['Health records', 'folder-heart-outline', 't3', () => navigation.navigate('HealthRecords')]].map(([l, i, t, fn]) => (
          <Pressable key={l} onPress={fn} style={{ flexBasis: '45%', flexGrow: 1, minHeight: 96, borderRadius: 20, backgroundColor: c[t], padding: 14, gap: 10, justifyContent: 'space-between' }}><Icon name={i} size={26} color={c[t + 'i']} /><Txt v="bold" style={{ fontSize: 14 }}>{l}</Txt></Pressable>))}
      </View>
    </Screen>
  );
}

export function VetListScreen({ navigation, route }) {
  const { c } = useTheme();
  const [vets, setVets] = useState(null);
  const [today, setToday] = useState(false);
  const [onsite, setOnsite] = useState(!!route.params?.onsite);
  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: s }] = await Promise.all([supabase.from('vets').select('*').order('rating', { ascending: false }),
        supabase.from('vet_slots').select('vet_id,starts_at').eq('booked', false).gt('starts_at', new Date().toISOString()).order('starts_at')]);
      setVets((v || []).map((x) => ({ ...x, next: (s || []).find((y) => y.vet_id === x.id)?.starts_at })));
    })();
  }, []);
  const list = (vets || []).filter((v) => (!today || (v.next && isoDate(new Date(v.next)) === isoDate())) && (!onsite || v.onsite));
  return (
    <Screen scroll>
      <AppBar title="Verified vets" />
      <View style={{ flexDirection: 'row', gap: 8 }}><Chip label="Available today" selected={today} onPress={() => setToday(!today)} /><Chip label="On-site" selected={onsite} onPress={() => setOnsite(!onsite)} /></View>
      {vets === null ? <Skeleton h={90} r={20} /> : !list.length ? <Empty icon="map-search-outline" title="No vets match right now" body="Video consults are available nationwide. Try removing a filter." />
        : list.map((v) => (
          <Card key={v.id} onPress={() => navigation.navigate(onsite ? 'Onsite' : 'VetProfile', { id: v.id })} style={{ flexDirection: 'row', gap: 12 }}>
            <Avatar v={v} />
            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt v="bold">{v.name}</Txt><Icon name="check-decagram" size={15} color={c.acc} /></View>
              <Txt v="small">{v.specialty} · {v.years} yrs · ★ {v.rating}</Txt>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="small" color={v.next ? c.sage : c.mute}>{v.next ? 'Next ' + shortDate(v.next) + ' ' + clock(v.next) : 'Fully booked this week'}</Txt><Txt v="mono" style={{ fontSize: 13 }}>{naira(v.fee)}</Txt></View>
            </View>
          </Card>))}
    </Screen>
  );
}

export function VetProfileScreen({ navigation, route }) {
  const { c } = useTheme();
  const { wallet, refreshWallet } = useAuth();
  const { data } = useFarm();
  const [v, setV] = useState(null); const [slots, setSlots] = useState(null);
  const [day, setDay] = useState(null); const [slot, setSlot] = useState(null); const [flock, setFlock] = useState(null);
  const [method, setMethod] = useState('wallet'); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.from('vets').select('*').eq('id', route.params.id).single().then(({ data: d }) => setV(d));
    supabase.from('vet_slots').select('*').eq('vet_id', route.params.id).eq('booked', false).gt('starts_at', new Date().toISOString()).order('starts_at').then(({ data: d }) => { setSlots(d || []); if (d?.length) setDay(isoDate(new Date(d[0].starts_at))); });
  }, []);
  const days = useMemo(() => [...new Set((slots || []).map((s) => isoDate(new Date(s.starts_at))))].slice(0, 6), [slots]);
  const flocks = data.flocks.filter((f) => f.status !== 'inactive');
  if (!v) return <Screen><AppBar /><Skeleton h={200} r={20} /></Screen>;
  const book = async () => {
    setBusy(true); setErr(null);
    try {
      if (method !== 'wallet') { const r = await chargeCard(method, v.fee); if (!r.ok) throw new Error(r.reason); }
      const id = await rpc('book_consultation', { p_slot: slot, p_flock: flock, p_method: method === 'wallet' ? 'wallet' : 'card' });
      refreshWallet(); navigation.replace('Consultation', { id });
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={slots?.length ? <><Button icon="video-outline" title={'Pay ' + naira(v.fee) + ' & confirm'} disabled={!slot || (method === 'wallet' && Number(wallet?.balance || 0) < v.fee)} loading={busy} onPress={book} />
      <Txt v="small" style={{ textAlign: 'center', fontSize: 12 }}>The slot is booked once payment succeeds.</Txt></> : <Button variant="outline" icon="home-heart" title="Request an on-site visit instead" onPress={() => navigation.replace('Onsite', { id: v.id })} />}>
      <AppBar />
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}><Avatar v={v} size={72} /><View style={{ flex: 1, gap: 4 }}><Txt v="h1">{v.name}</Txt><View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name="check-decagram" size={15} color={c.acc} /><Txt v="small" color={c.acc}>Verified vet · {v.specialty}</Txt></View></View></View>
      <View style={{ flexDirection: 'row', gap: 8 }}><Stat label="Rating" value={v.rating} sub={v.reviews + ' reviews'} /><Stat label="Practice" value={v.years + ' yrs'} /><Stat label="Session" value="30 min" /></View>
      <Txt v="body" color={c.mute}>{v.bio}</Txt>
      {err ? <Banner tone="err" title="Booking didn't go through" body={err} /> : null}
      {slots === null ? <Skeleton h={120} r={20} /> : !slots.length ? <Banner tone="warn" icon="calendar-remove-outline" title="Fully booked this week" body="Try another vet, or request an on-site visit." /> : <>
        <Txt v="label">Choose a time</Txt>
        <ScrollView horizontal contentContainerStyle={{ gap: 6 }}>{days.map((d) => (
          <Pressable key={d} onPress={() => { setDay(d); setSlot(null); }} style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: d === day ? c.hc : c.sf, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="label" color={d === day ? c.hmute : c.mute}>{new Date(d).toLocaleDateString('en-NG', { weekday: 'short' })}</Txt><Txt v="mono" color={d === day ? c.hink : c.ink} style={{ fontSize: 18 }}>{Number(d.slice(8))}</Txt></Pressable>))}</ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{slots.filter((s) => isoDate(new Date(s.starts_at)) === day).map((s) => (
          <Pressable key={s.id} onPress={() => setSlot(s.id)} style={{ width: '31.5%', height: 48, borderRadius: 14, backgroundColor: c.sf, borderWidth: slot === s.id ? 2 : 0, borderColor: c.ember, alignItems: 'center', justifyContent: 'center' }}><Txt v="mono" style={{ fontSize: 14 }}>{clock(s.starts_at)}</Txt></Pressable>))}</View>
        {flocks.length ? <><Txt v="label">Which flock is this about?</Txt><ChipRow options={flocks.map((f) => f.code)} value={flocks.find((f) => f.id === flock)?.code} onChange={(cd) => setFlock(flocks.find((f) => f.code === cd)?.id)} /></> : null}
        <Txt v="label">Pay with</Txt>
        <Group>
          <Row icon="wallet-outline" title="Wallet" subtitle={naira(wallet?.balance) + ' available'} onPress={() => setMethod('wallet')} right={<View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: method === 'wallet' ? 6 : 2, borderColor: method === 'wallet' ? c.ember : c.line2 }} />} />
          <Row icon="credit-card-outline" title={TEST_CARDS[0].label} subtitle="Test card" last onPress={() => setMethod('ok')} right={<View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: method === 'ok' ? 6 : 2, borderColor: method === 'ok' ? c.ember : c.line2 }} />} />
        </Group>
      </>}
    </Screen>
  );
}

export function ConsultationScreen({ navigation, route }) {
  const { c } = useTheme();
  const [k, setK] = useState(null);
  const load = useCallback(() => supabase.from('consultations').select('*, vet:vets(*)').eq('id', route.params.id).single().then(({ data }) => setK(data)), [route.params.id]);
  useEffect(() => { load(); }, [load]);
  if (!k) return <Screen><AppBar /><Skeleton h={200} r={20} /></Screen>;
  const video = k.type === 'video';
  const accept = async () => { await supabase.from('consultations').update({ status: 'confirmed' }).eq('id', k.id); load(); };
  return (
    <Screen scroll footer={video && k.status === 'confirmed' ? <Button icon="video-outline" title="Join video call" onPress={() => Linking.openURL(k.meeting_url)} /> : k.status === 'proposed' ? <Button title={'Accept ' + shortDate(k.proposed_at) + ' ' + clock(k.proposed_at)} onPress={accept} /> : null}>
      <AppBar title={video ? 'Video consultation' : 'On-site visit'} />
      <Pill tone={k.status === 'confirmed' || k.status === 'completed' ? 'ok' : 'warn'} label={{ requested: 'Waiting for vet to confirm', proposed: 'New time proposed', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' }[k.status]} />
      <Txt v="display">{k.vet.name}</Txt>
      <Card>
        {video ? <Row icon="calendar-clock" title={shortDate(k.proposed_at) + ' · ' + clock(k.proposed_at)} subtitle="30 minutes" last /> : <>
          <Row icon="calendar" title={k.proposed_at ? shortDate(k.proposed_at) + ' ' + clock(k.proposed_at) : 'Requested for ' + shortDate(k.requested_date)} subtitle={k.status === 'proposed' ? 'The vet proposed a different time' : null} />
          <Row icon="map-marker-outline" title={k.location} last /></>}
      </Card>
      {video && k.status === 'confirmed' ? <Banner icon="information-outline" body="If the video drops, rejoin from this screen. If video won't recover, use the chat in the call window." /> : null}
      {!video ? <Banner icon="cash" body="The visit fee is paid to the vet on-site. It's only scheduled once you both confirm." /> : null}
      {k.summary ? <Card><Txt v="label">Summary from {k.vet.name}</Txt><Txt v="body">{k.summary}</Txt></Card> : null}
    </Screen>
  );
}

export function OnsiteScreen({ navigation, route }) {
  const { vendor } = useAuth();
  const { data } = useFarm();
  const [date, setDate] = useState(isoDate(new Date(Date.now() + 864e5))); const [loc, setLoc] = useState(vendor?.location || ''); const [notes, setNotes] = useState(''); const [flock, setFlock] = useState(null); const [busy, setBusy] = useState(false);
  const flocks = data.flocks.filter((f) => f.status !== 'inactive');
  const send = async () => {
    setBusy(true);
    try { const id = await rpc('request_onsite', { p_vet: route.params.id, p_date: date, p_location: loc, p_notes: notes || null, p_flock: flock }); navigation.replace('Consultation', { id }); }
    catch (e) { alert(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Send request" disabled={!loc || !date} loading={busy} onPress={send} />}>
      <AppBar title="Request an on-site visit" />
      <DateInput label="Preferred date" value={date} onChange={setDate} min={isoDate()} hint="The vet will confirm or propose another time." />
      <Input label="Farm location" value={loc} onChangeText={setLoc} />
      {flocks.length ? <><Txt v="strong" style={{ fontSize: 13 }}>Flock</Txt><ChipRow options={flocks.map((f) => f.code)} value={flocks.find((f) => f.id === flock)?.code} onChange={(cd) => setFlock(flocks.find((f) => f.code === cd)?.id)} /></> : null}
      <Input label="What's happening?" value={notes} onChangeText={setNotes} multiline />
    </Screen>
  );
}

export function SymptomScreen({ navigation }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const { data } = useFarm();
  const flocks = data.flocks.filter((f) => f.status !== 'inactive');
  const [photos, setPhotos] = useState([]); const [signs, setSigns] = useState([]); const [flock, setFlock] = useState(flocks[0]?.id || null);
  const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const [upErr, setUpErr] = useState(false);
  const keep = (r) => { if (r && !r.canceled) setPhotos((p) => [...p, r.assets[0].uri].slice(0, 4)); };
  const fromGallery = async () => {
    try { keep(await ImagePicker.launchImageLibraryAsync({ quality: 0.5, mediaTypes: ['images'] })); }
    catch (e) { Alert.alert("Couldn't open your photos", friendlyError(e)); }
  };
  const fromCamera = async () => {
    // Android refuses to open the camera unless the permission was requested first.
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) {
      return Alert.alert('Camera access is off', 'Allow the camera for Poultry360 to photograph your birds, or pick a photo you already have.', [
        { text: 'Choose a photo', onPress: fromGallery },
        ...(p.canAskAgain ? [] : [{ text: 'Open settings', onPress: () => Linking.openSettings() }]),
        { text: 'Cancel', style: 'cancel' }]);
    }
    try { keep(await ImagePicker.launchCameraAsync({ quality: 0.5, mediaTypes: ['images'] })); }
    catch (e) { Alert.alert("Couldn't open the camera", friendlyError(e), [{ text: 'Choose a photo instead', onPress: fromGallery }, { text: 'Cancel', style: 'cancel' }]); }
  };
  const add = () => Alert.alert('Add a photo', 'Clear, close-up photos of the affected birds work best.', [
    { text: 'Take photo', onPress: fromCamera }, { text: 'Choose from gallery', onPress: fromGallery }, { text: 'Cancel', style: 'cancel' }]);
  const run = async () => {
    setBusy(true); setUpErr(false);
    let paths = [];
    try { paths = await Promise.all(photos.map((u) => uploadImage('symptom-photos', uid, u))); } catch { setUpErr(true); }
    const t = triage(signs, photos.length);
    await supabase.from('symptom_checks').insert({ flock_id: flock, signs, photo_paths: paths, result: t, confidence: t.confidence });
    setRes(t); setBusy(false);
  };
  const saveRecord = async () => {
    if (!flock) return;
    await save('health_records', { flock_id: flock, source: 'triage', author: 'Symptom checker', title: 'Triage note (not a diagnosis)', notes: res.summary + (res.concerns.length ? ' Worth asking a vet about: ' + res.concerns.join('; ') + '.' : '') });
    setSaved(true);
  };
  if (res) return (
    <Screen scroll footer={<><Button icon="stethoscope" title="Book a vet" onPress={() => navigation.replace('VetList')} /><Button variant="ghost" title={saved ? 'Saved to health record' : 'Save to health record'} disabled={saved || !flock} onPress={saveRecord} /></>}>
      <AppBar title="Triage note" />
      <Banner tone="warn" icon="shield-alert-outline" title="This is not a diagnosis" body="It's a starting point to discuss with a vet. Only a vet can diagnose." />
      {res.urgent ? <Banner tone="err" title="Speak to a vet today" body={res.advice} /> : null}
      <Txt v="label">What you reported</Txt><Txt v="body">{res.summary}</Txt>
      {res.confidence === 'low' || !res.concerns.length ? <Card><Txt v="bold">We can't tell from this information</Txt><Txt v="small">The signs aren't clear enough to suggest anything. A vet can look properly.</Txt></Card> : (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="label">Worth asking a vet about</Txt><Txt v="label" color={c.warn}>{res.confidence} confidence</Txt></View>
          {res.concerns.map((x) => <Txt key={x} v="strong">{x}</Txt>)}
          {!res.urgent ? <Txt v="small">Until then: {res.advice}</Txt> : null}
        </Card>
      )}
    </Screen>
  );
  return (
    <Screen scroll footer={<Button title="Get triage note" disabled={!signs.length && !photos.length} loading={busy} onPress={run} />}>
      <AppBar title="Symptom checker" close />
      <Banner icon="information-outline" body="You'll get a preliminary triage note, not a diagnosis. Only a vet can diagnose." />
      {upErr ? <Banner tone="err" title="Photos didn't upload" body="Your note still works from the signs you picked." /> : null}
      <Txt v="strong" style={{ fontSize: 13 }}>Photos of affected birds</Txt>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 84, height: 84, borderRadius: 16 }} />)}
        {photos.length < 4 ? <Pressable onPress={add} style={{ width: 84, height: 84, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera-plus-outline" color={c.acc} /></Pressable> : null}
      </View>
      <Txt v="small" style={{ fontSize: 12 }}>Close-ups in daylight work best. Photos that don't show poultry are ignored.</Txt>
      {flocks.length ? <><Txt v="strong" style={{ fontSize: 13 }}>Flock</Txt><ChipRow options={flocks.map((f) => f.code)} value={flocks.find((f) => f.id === flock)?.code} onChange={(cd) => setFlock(flocks.find((f) => f.code === cd)?.id)} /></> : null}
      <Txt v="strong" style={{ fontSize: 13 }}>What are you seeing?</Txt>
      <ChipRow options={SIGNS} value={signs} onChange={setSigns} multi />
    </Screen>
  );
}

export function HealthRecordsScreen({ route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const [flockId, setFlockId] = useState(route.params?.flockId || data.flocks[0]?.id);
  const [rows, setRows] = useState(null); const [note, setNote] = useState('');
  const load = useCallback(() => flockId && supabase.from('health_records').select('*').eq('flock_id', flockId).order('created_at', { ascending: false }).then(({ data: d }) => setRows(d || [])), [flockId]);
  useEffect(() => { load(); }, [load]);
  const add = async () => { if (!note.trim()) return; await save('health_records', { flock_id: flockId, source: 'self', author: 'Self', title: note.trim() }); setNote(''); setTimeout(load, 800); };
  const ICON = { vet: ['stethoscope', 't2'], triage: ['robot-outline', 't1'], self: ['note-edit-outline', 't3'], vaccination: ['needle', 't4'] };
  const flock = data.flocks.find((f) => f.id === flockId);
  if (!data.flocks.length) return <Screen><AppBar title="Health records" /><Empty icon="folder-heart-outline" title="No flocks yet" body="Health records are kept per flock in Farm Hub." /></Screen>;
  return (
    <Screen scroll>
      <AppBar title="Health record" subtitle={flock ? flock.code + ' · ' + (flock.breed || flock.type) : null} />
      <ChipRow options={data.flocks.map((f) => f.code)} value={flock?.code} onChange={(cd) => setFlockId(data.flocks.find((f) => f.code === cd)?.id)} />
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}><View style={{ flex: 1 }}><Input value={note} onChangeText={setNote} placeholder="Add a note, e.g. sneezing in pen 2" /></View><Button small title="Add" onPress={add} style={{ height: 52 }} /></View>
      {rows === null ? <Skeleton h={80} r={20} /> : !rows.length ? <Empty icon="folder-heart-outline" title="No records yet" body="Vet consults, vaccinations and triage notes for this flock appear here." />
        : rows.map((r) => { const [ic, t] = ICON[r.source] || ICON.self; return (
          <View key={r.id} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c[t], alignItems: 'center', justifyContent: 'center' }}><Icon name={ic} size={20} color={c[t + 'i']} /></View>
            <View style={{ flex: 1, gap: 2, paddingBottom: 12 }}><Txt v="label">{shortDate(r.created_at)} · {r.author || r.source}</Txt><Txt v="bold" style={{ fontSize: 14 }}>{r.title}</Txt>{r.notes ? <Txt v="small">{r.notes}</Txt> : null}</View>
          </View>); })}
    </Screen>
  );
}
