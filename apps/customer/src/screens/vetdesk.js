import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Alert, Linking, BackHandler } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Group, Row, Skeleton, Sheet, Steps, PhotoBox, Toggle,
  naira, isoDate, shortDate, clock, rpc, uploadImage, friendlyError, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';

const SPECIALTIES = ['Layer health', 'Broiler health', 'Biosecurity', 'Nutrition', 'Turkey & waterfowl', 'General poultry'];
const TIMES = ['09:00', '10:30', '12:00', '14:00', '16:00', '18:00'];
const K_TONE = { requested: 'warn', proposed: 'warn', confirmed: 'live', completed: 'ok', cancelled: 'neutral' };
const K_LABEL = { requested: 'Needs your reply', proposed: 'Waiting for farmer', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled' };
// Nigeria is UTC+1 all year, so a local date and time can be turned into an exact moment directly.
const lagos = (date, time) => date + 'T' + time + ':00+01:00';
const when = (d) => shortDate(d) + ' · ' + clock(d);

// Register as a vet: profile + licence, reviewed by Poultry360 before farmers can see it.
export function VetApplyScreen({ navigation }) {
  const { c } = useTheme();
  const { uid, profile, refresh, setActiveRole } = useAuth();
  const [f, setF] = useState({ name: profile?.full_name || '', specialty: SPECIALTIES[0], years: '', fee: '', bio: '', phone: '', onsite: true });
  const [photo, setPhoto] = useState(null);
  const [up, setUp] = useState({ state: 'empty' });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    rpc('vet_desk').then((d) => {
      if (!d?.vet) return;
      const v = d.vet;
      setF({ name: v.name || '', specialty: v.specialty || SPECIALTIES[0], years: v.years != null ? String(v.years) : '', fee: v.fee != null ? String(Math.round(v.fee)) : '', bio: v.bio || '', phone: v.phone || '', onsite: v.onsite !== false });
    }).catch(() => {});
  }, []);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: undefined })); };
  const send = async (uri) => {
    setUp({ state: 'uploading' });
    try { setUp({ state: 'done', path: await uploadImage('id-docs', uid, uri) }); } catch { setUp({ state: 'failed' }); }
  };
  const pick = async (camera) => {
    if (camera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Camera access is off', 'Allow the camera for Poultry360, or choose a photo from your gallery.', [...(p.canAskAgain ? [] : [{ text: 'Open settings', onPress: () => Linking.openSettings() }]), { text: 'OK' }]);
    }
    try {
      const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ quality: 0.6, mediaTypes: ['images'] });
      if (r.canceled) return;
      setPhoto(r.assets[0].uri); send(r.assets[0].uri);
    } catch (e) { Alert.alert("Couldn't open the " + (camera ? 'camera' : 'gallery'), friendlyError(e)); }
  };
  const submit = async () => {
    const e = {};
    if (f.name.trim().split(/\s+/).length < 2) e.name = 'Enter your full name';
    if (!(Number(f.years) >= 0) || f.years === '') e.years = 'Enter your years in practice';
    if (!(Number(f.fee) >= 500)) e.fee = 'Enter your fee per video consult';
    if (f.bio.trim().length < 20) e.bio = 'Tell farmers a little about your experience';
    if (up.state !== 'done') e.licence = 'Upload your VCN licence or certificate';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await rpc('submit_vet_application', { p_name: f.name.trim(), p_specialty: f.specialty, p_years: parseInt(f.years, 10), p_fee: Number(f.fee), p_bio: f.bio.trim(), p_phone: f.phone.trim() || null, p_licence_doc: up.path, p_onsite: f.onsite });
      const hasOtherHome = (profile?.roles || []).some((r) => r !== 'vet' && r !== 'investor');
      if (hasOtherHome) {
        // Stay in the role they were using. The vet desk is one tap away in Profile once they want it.
        await refresh();
        if (navigation.getState().routeNames.includes('Tabs')) navigation.navigate('Tabs');
        Alert.alert('Application sent', "We'll check your licence, usually within a working day. Open your vet desk any time from Profile → Vet.");
      } else {
        await setActiveRole('vet');   // vet-only account: the vet desk is their home (this also refreshes the profile)
      }
    } catch (er) { Alert.alert("Couldn't submit", friendlyError(er)); await refresh(); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Submit for review" loading={busy} disabled={up.state === 'uploading'} onPress={submit} />}>
      <AppBar title="Register as a vet" />
      <Txt v="small" style={{ fontSize: 14 }}>Poultry360 checks every vet's licence before farmers can book them.</Txt>
      <Input label="Full name" value={f.name} onChangeText={set('name')} placeholder="Dr. Ada Obi" autoCapitalize="words" error={errs.name} />
      <Txt v="strong" style={{ fontSize: 13 }}>Main specialty</Txt>
      <ChipRow options={SPECIALTIES} value={f.specialty} onChange={set('specialty')} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Input label="Years in practice" keyboardType="number-pad" value={f.years} onChangeText={(t) => set('years')(t.replace(/\D/g, ''))} mono error={errs.years} /></View>
        <View style={{ flex: 1.3 }}><Input label="Fee per video consult" prefix="₦" keyboardType="number-pad" value={f.fee} onChangeText={(t) => set('fee')(t.replace(/\D/g, ''))} mono error={errs.fee} hint="You keep 90%." /></View>
      </View>
      <Input label="Phone (optional)" value={f.phone} onChangeText={set('phone')} placeholder="0803 123 4567" keyboardType="phone-pad" mono />
      <Input label="About you" value={f.bio} onChangeText={set('bio')} multiline placeholder="What you treat, where you've worked, the size of farms you usually see" error={errs.bio} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Txt v="strong">I also do farm visits</Txt><Txt v="small">Farmers can request an on-site visit.</Txt></View><Toggle value={f.onsite} onValueChange={set('onsite')} /></Card>
      <Txt v="strong" style={{ fontSize: 13 }}>Practising licence</Txt>
      <Card tone={up.state === 'failed' ? 'err' : undefined}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <PhotoBox uri={photo} size={56} />
          <View style={{ flex: 1 }}><Txt v="strong">{up.state === 'done' ? 'Licence uploaded' : up.state === 'uploading' ? 'Uploading…' : up.state === 'failed' ? "Upload didn't finish" : 'VCN licence or certificate'}</Txt>
            <Txt v="small">{up.state === 'done' ? 'Tap below to replace' : up.state === 'failed' ? 'Your other details are kept.' : 'A clear photo with your name and number visible'}</Txt></View>
        </View>
        {errs.licence ? <Txt v="small" color={c.err}>{errs.licence}</Txt> : null}
        {up.state === 'failed' && photo ? <Button small variant="dark" icon="refresh" title="Retry upload" onPress={() => send(photo)} /> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" icon="camera-outline" title="Take photo" onPress={() => pick(true)} style={{ flex: 1 }} /><Button small variant="outline" icon="image-outline" title="Gallery" onPress={() => pick(false)} style={{ flex: 1 }} /></View>
      </Card>
    </Screen>
  );
}

// The vet's home: bookings, time slots and profile. Shown in place of the buyer tabs when the active role is vet.
export function VetDeskScreen({ navigation }) {
  const { c } = useTheme();
  const { profile, setActiveRole, homeRole } = useAuth();
  const home = homeRole();   // null for a vet-only account
  const leave = useCallback(() => { if (home) setActiveRole(home); }, [home]);
  // Back (button or swipe) returns to the role they came from. Without this it would close the app, because the desk is the root screen.
  useFocusEffect(useCallback(() => {
    if (!home) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leave(); return true; });
    return () => sub.remove();
  }, [home, leave]));
  const [d, setD] = useState(undefined);
  const [tab, setTab] = useState('bookings');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { setD(await rpc('vet_desk')); } catch { setD(null); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    // New bookings and approval decisions appear without a refresh.
    const ch = supabase.channel('vet-desk').on('postgres_changes', { event: '*', schema: 'public', table: 'vets' }, load).subscribe();
    const t = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load]);
  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1 }}><Txt v="display" style={{ fontSize: 28 }}>Vet desk</Txt>{d?.vet ? <Txt v="small">{d.vet.name}</Txt> : null}</View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {home ? <Button small variant="outline" icon="arrow-left" title={home === 'buyer' ? 'Shop' : 'My farm'} onPress={leave} style={{ height: 44 }} /> : null}
        <Pressable onPress={() => navigation.navigate('Profile')} accessibilityLabel="Profile" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }}><Icon name="account-circle-outline" /></Pressable>
      </View>
    </View>
  );
  if (d === undefined) return <Screen style={{ paddingTop: 8, gap: 14 }}>{header}<Skeleton h={160} r={24} /></Screen>;
  const v = d?.vet;
  if (!v) return <Screen scroll style={{ paddingTop: 8 }}>{header}<Empty icon="stethoscope" title="Finish your vet registration" body="Add your details and licence so we can review them." action="Register" onAction={() => navigation.navigate('VetApply')} /></Screen>;
  if (v.status !== 'approved') return (
    <Screen scroll style={{ paddingTop: 8 }}>
      {header}
      {v.status === 'rejected' ? <>
        <Card tone="err"><Txt v="label" color={c.err}>What to fix</Txt><Txt v="body">{v.rejection_reason || 'We could not verify your licence.'}</Txt></Card>
        <Button title="Update and resubmit" onPress={() => navigation.navigate('VetApply')} />
      </> : <>
        <Hearth><Icon name="shield-check-outline" size={32} color={c.ember} /><Txt v="h2" color={c.hink}>We're checking your licence</Txt><Txt v="small" color={c.hmute}>This usually takes a working day. Farmers will be able to book you as soon as you're approved. This screen updates by itself.</Txt></Hearth>
        <Card><Steps steps={[{ label: 'Details submitted', state: 'done' }, { label: 'Licence under review', state: 'current' }, { label: 'Open for bookings', state: 'todo' }]} /></Card>
      </>}
      {home ? <Button variant="outline" icon="arrow-left" title={home === 'buyer' ? 'Back to shopping' : 'Back to my farm'} onPress={leave} /> : null}
    </Screen>
  );
  const open = d.consultations.filter((k) => ['requested', 'proposed', 'confirmed'].includes(k.status));
  const past = d.consultations.filter((k) => ['completed', 'cancelled'].includes(k.status));
  const free = d.slots.filter((s) => !s.booked);
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        {header}
        <Hearth>
          <Txt v="label" color={c.hmute}>Wallet balance</Txt>
          <Txt v="monoLg" color={c.hink} style={{ fontSize: 30 }}>{naira(d.balance)}</Txt>
          <Txt v="small" color={c.hmute}>Earned from consults {naira(d.earned)} · you keep 90% of each fee, paid when you complete the consult</Txt>
          <Button variant="hearth" icon="bank-transfer-out" title="Withdraw" disabled={!Number(d.balance)} onPress={() => navigation.navigate('Withdraw')} />
        </Hearth>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <StatBox label="Upcoming" value={open.length} /><StatBox label="Open slots" value={free.length} /><StatBox label="Completed" value={past.filter((k) => k.status === 'completed').length} />
        </View>
        {!free.length ? <Banner tone="warn" icon="calendar-plus" title="You have no open slots" body="Farmers can only book times you've opened." action="Add slots" onAction={() => setTab('slots')} /> : null}
        <Segmented options={[{ value: 'bookings', label: 'Bookings' }, { value: 'slots', label: 'My slots' }, { value: 'profile', label: 'Profile' }]} value={tab} onChange={setTab} />
        {tab === 'bookings' ? <>
          {!open.length ? <Empty icon="calendar-blank-outline" title="No upcoming bookings" body="New video consults and farm-visit requests appear here." /> : <Group>{open.map((k, i) => (
            <Row key={k.id} last={i === open.length - 1} icon={k.type === 'video' ? 'video-outline' : 'map-marker-outline'} title={k.farmer}
              subtitle={(k.type === 'video' ? 'Video' : 'Farm visit') + ' · ' + (k.status === 'requested' ? 'asked for ' + shortDate(k.requested_date) : when(k.at))}
              onPress={() => navigation.navigate('VetBooking', { id: k.id })} right={<Pill tone={K_TONE[k.status]} label={K_LABEL[k.status]} />} />))}</Group>}
          {past.length ? <><Txt v="label">Past</Txt><Group>{past.slice(0, 15).map((k, i, a) => (
            <Row key={k.id} last={i === a.length - 1} icon={k.status === 'completed' ? 'check-circle-outline' : 'close-circle-outline'} iconColor={k.status === 'completed' ? c.sage : c.mute} title={k.farmer}
              subtitle={(k.type === 'video' ? 'Video' : 'Farm visit') + (k.at ? ' · ' + shortDate(k.at) : '')} onPress={() => navigation.navigate('VetBooking', { id: k.id })} />))}</Group></> : null}
        </> : null}
        {tab === 'slots' ? <Slots slots={d.slots} reload={load} /> : null}
        {tab === 'profile' ? <VetProfileEdit vet={v} reload={load} /> : null}
      </ScrollView>
    </Screen>
  );
}

function StatBox({ label, value }) {
  const { c } = useTheme();
  return <View style={{ flex: 1, backgroundColor: c.sf, borderRadius: 16, padding: 12, gap: 2 }}><Txt v="label">{label}</Txt><Txt v="mono" style={{ fontSize: 20 }}>{value}</Txt></View>;
}

function Slots({ slots, reload }) {
  const { c } = useTheme();
  const days = Array.from({ length: 7 }).map((_, i) => isoDate(new Date(Date.now() + i * 864e5)));
  const [day, setDay] = useState(days[1]);
  const [busy, setBusy] = useState(null);
  const taken = (t) => slots.some((s) => new Date(s.starts_at).getTime() === new Date(lagos(day, t)).getTime());
  const past = (t) => new Date(lagos(day, t)).getTime() < Date.now() + 30 * 60000;
  const add = async (t) => {
    setBusy(t);
    try { await rpc('vet_add_slot', { p_starts_at: lagos(day, t) }); await reload(); } catch (e) { Alert.alert("Couldn't add that slot", friendlyError(e)); } finally { setBusy(null); }
  };
  const remove = async (s) => { try { await rpc('vet_remove_slot', { p_slot: s.id }); await reload(); } catch (e) { Alert.alert("Couldn't remove", friendlyError(e)); } };
  return (
    <>
      <Txt v="label">Open a time for video consults</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((dd, i) => <Chip key={dd} label={i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : shortDate(dd)} selected={day === dd} onPress={() => setDay(dd)} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TIMES.map((t) => {
          const on = taken(t); const off = past(t);
          return <Pressable key={t} disabled={on || off || busy === t} onPress={() => add(t)} accessibilityLabel={'Open ' + t}
            style={{ minWidth: 96, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, backgroundColor: on ? c.sagebg : c.sf, borderWidth: 1.5, borderColor: on ? c.sage : c.line2, opacity: off && !on ? 0.4 : 1 }}>
            {on ? <Icon name="check" size={16} color={c.sage} /> : <Icon name="plus" size={16} color={c.acc} />}<Txt v="mono" style={{ fontSize: 14 }}>{t}</Txt></Pressable>;
        })}
      </View>
      <Txt v="label">Your upcoming slots</Txt>
      {!slots.length ? <Card><Txt v="small">No slots yet. Tap a time above to open it for booking.</Txt></Card> : <Group>{slots.map((s, i) => (
        <Row key={s.id} last={i === slots.length - 1} icon={s.booked ? 'calendar-check' : 'calendar-blank-outline'} iconColor={s.booked ? c.sage : undefined} title={when(s.starts_at)} subtitle={s.booked ? 'Booked by a farmer' : 'Open for booking'}
          right={s.booked ? <Pill tone="ok" label="Booked" /> : <Pressable onPress={() => remove(s)} hitSlop={10} accessibilityLabel="Remove slot" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" color={c.mute} /></Pressable>} />))}</Group>}
    </>
  );
}

function VetProfileEdit({ vet, reload }) {
  const [fee, setFee] = useState(String(Math.round(vet.fee || 0)));
  const [bio, setBio] = useState(vet.bio || '');
  const [onsite, setOnsite] = useState(vet.onsite !== false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await rpc('vet_update_profile', { p_fee: Number(fee), p_bio: bio, p_onsite: onsite }); await reload(); Alert.alert('Saved', 'Farmers see your updated profile straight away.'); }
    catch (e) { Alert.alert("Couldn't save", friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Card><Txt v="bold">{vet.name}</Txt><Txt v="small">{vet.specialty}{vet.years != null ? ' · ' + vet.years + ' years' : ''}</Txt><Pill tone="ok" label="Verified vet" /></Card>
      <Input label="Fee per video consult" prefix="₦" keyboardType="number-pad" value={fee} onChangeText={(t) => setFee(t.replace(/\D/g, ''))} mono hint={Number(fee) > 0 ? 'You receive ' + naira(Math.round(Number(fee) * 0.9)) + ' per consult after the 10% Poultry360 fee.' : undefined} />
      <Input label="About you" value={bio} onChangeText={setBio} multiline />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Txt v="strong">I also do farm visits</Txt><Txt v="small">Farmers can request an on-site visit.</Txt></View><Toggle value={onsite} onValueChange={setOnsite} /></Card>
      <Button title="Save changes" loading={busy} disabled={!(Number(fee) > 0)} onPress={save} />
      <Txt v="small">To change your name, specialty or licence, contact Poultry360 support.</Txt>
    </>
  );
}

// One booking, from the vet's side.
export function VetBookingScreen({ navigation, route }) {
  const { c } = useTheme();
  const [k, setK] = useState(undefined);
  const [sheet, setSheet] = useState(null);   // 'propose' | 'complete'
  const [date, setDate] = useState(''); const [time, setTime] = useState(TIMES[0]);
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => rpc('vet_desk').then((d) => { const row = d?.consultations.find((x) => x.id === route.params.id) || null; setK(row); if (row && !date) setDate(row.requested_date || isoDate(new Date(Date.now() + 864e5))); }).catch(() => setK(null)), [route.params.id]);
  useEffect(() => { load(); }, [load]);
  if (k === undefined) return <Screen><AppBar title="Booking" /><Skeleton h={160} r={20} /></Screen>;
  if (!k) return <Screen><AppBar title="Booking" /><Empty icon="calendar-remove-outline" title="Booking not found" /></Screen>;
  const run = async (fn, args, done) => {
    setBusy(true);
    try { await rpc(fn, args); setSheet(null); await load(); done?.(); } catch (e) { Alert.alert("Couldn't update", friendlyError(e)); } finally { setBusy(false); }
  };
  const decline = () => Alert.alert('Decline this visit?', 'The farmer is told you are not available.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Decline', style: 'destructive', onPress: () => run('vet_respond_onsite', { p_consultation: k.id, p_accept: false }) }]);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  return (
    <Screen scroll footer={k.status === 'confirmed' ? <Button title="Write summary and complete" icon="check-all" onPress={() => setSheet('complete')} />
      : k.type === 'onsite' && k.status === 'requested' ? <View style={{ flexDirection: 'row', gap: 10 }}><Button variant="outline" title="Decline" onPress={decline} style={{ width: 120 }} /><Button title="Propose a time" onPress={() => setSheet('propose')} style={{ flex: 1 }} /></View> : null}>
      <AppBar title={k.type === 'video' ? 'Video consult' : 'Farm visit'} />
      <Pill tone={K_TONE[k.status]} label={K_LABEL[k.status]} />
      <Txt v="display" style={{ fontSize: 26, lineHeight: 30 }}>{k.farmer}</Txt>
      <Group>
        <Row icon="calendar-clock" title={k.status === 'requested' ? 'Asked for ' + shortDate(k.requested_date) : k.at ? when(k.at) : 'No time set'} subtitle={k.status === 'proposed' ? 'You proposed this time' : 'When'} />
        {k.flock ? <Row icon="egg-outline" title={k.flock} subtitle="Flock" /> : null}
        {k.location ? <Row icon="map-marker-outline" title={k.location} subtitle="Farm location" onPress={() => Linking.openURL('geo:0,0?q=' + encodeURIComponent(k.location + ', Rivers State'))} /> : null}
        {k.fee ? <Row icon="cash" title={'You receive ' + naira(k.net)} subtitle={'Farmer paid ' + naira(k.fee) + ' · Poultry360 keeps 10% · ' + (k.status === 'completed' ? 'paid to your wallet' : 'paid when you complete it')} /> : null}
        <Row last icon="phone-outline" title={k.farmer_phone ? '+' + k.farmer_phone : 'No phone on file'} subtitle="Farmer" onPress={k.farmer_phone ? () => Linking.openURL('tel:+' + k.farmer_phone) : undefined} />
      </Group>
      {k.notes ? <><Txt v="label">Farmer's notes</Txt><Card><Txt v="body">{k.notes}</Txt></Card></> : null}
      {k.type === 'video' && k.status === 'confirmed' && k.meeting_url ? <Button variant="dark" icon="video-outline" title="Join video call" onPress={() => Linking.openURL(k.meeting_url)} /> : null}
      {k.status === 'proposed' ? <Banner tone="info" icon="clock-outline" title="Waiting for the farmer to confirm" body="They see your proposed time in their app." action="Change time" onAction={() => setSheet('propose')} /> : null}
      {k.summary ? <><Txt v="label">Your summary</Txt><Card><Txt v="body">{k.summary}</Txt></Card></> : null}
      <Sheet visible={sheet === 'propose'} onClose={() => setSheet(null)}>
        <Txt v="h1">Propose a visit time</Txt>
        <DateInput label="Date" value={date} onChange={setDate} min={isoDate()} />
        <ChipRow options={TIMES} value={time} onChange={setTime} />
        <Button title="Send to farmer" loading={busy} disabled={!validDate} onPress={() => run('vet_respond_onsite', { p_consultation: k.id, p_accept: true, p_at: lagos(date, time) })} />
      </Sheet>
      <Sheet visible={sheet === 'complete'} onClose={() => setSheet(null)}>
        <Txt v="h1">Consult summary</Txt>
        <Txt v="small" style={{ fontSize: 14 }}>The farmer keeps this in their flock's health records.</Txt>
        <Input value={summary} onChangeText={setSummary} multiline placeholder="What you found, what you advised, any medication and dose, when to follow up" autoFocus />
        <Button title="Save and complete" loading={busy} disabled={summary.trim().length < 10} onPress={() => run('vet_complete', { p_consultation: k.id, p_summary: summary.trim() }, () => navigation.goBack())} />
      </Sheet>
    </Screen>
  );
}
