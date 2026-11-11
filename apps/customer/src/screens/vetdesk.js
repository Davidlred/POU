import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView, RefreshControl, Alert, Linking, BackHandler, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { usePage, useTheme, liveChannel, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Group, Row, Skeleton, Sheet, Steps, PhotoBox, Toggle,
  naira, isoDate, shortDate, clock, rpc, uploadImage, friendlyError, supabase, PhotoButtons, useWide, HeaderBar, SectionHead, DataTable, LiveDot } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { TopBar } from '../components/RoleSwitcher';

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
        if (navigation.getState().routeNames.includes('Tabs')) navigation.popTo('Tabs');
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
        <PhotoButtons onCamera={() => pick(true)} onGallery={() => pick(false)} />
      </Card>
    </Screen>
  );
}

// The vet's home (newdesign 6.5): header with the licence pill and Bookings / My hours / Profile.
export function VetDeskScreen({ navigation }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const [d, setD] = useState(undefined);
  const [tab, setTab] = useState('bookings');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { setD(await rpc('vet_desk')); } catch { setD(null); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { rpc('vet_refresh_slots').catch(() => {}).then(load); }, [load]));   // keeps 4 weeks of schedule slots open
  useEffect(() => {
    // New bookings and approval decisions appear without a refresh.
    const ch = liveChannel('vet-desk').on('postgres_changes', { event: '*', schema: 'public', table: 'vets' }, load).subscribe();
    const t = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, [load]);
  const v = d?.vet;
  const shell = (children) => (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: wide ? 24 : 18, paddingBottom: 48 }, page]} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        {!wide ? <TopBar navigation={navigation} cart={false} /> : null}
        {children}
      </ScrollView>
    </Screen>
  );
  if (d === undefined) return shell(<><Skeleton h={60} r={16} /><Skeleton h={180} r={24} /></>);
  if (!v) return shell(<Empty icon="stethoscope" title="Finish your vet registration" body="Add your details and licence so we can review them." action="Register" onAction={() => navigation.navigate('VetApply')} />);
  const header = (
    <HeaderBar lead={<View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.t2, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" color={c.t2i}>{(v.name || 'V').replace(/^Dr\.?\s*/i, '')[0]}</Txt></View>}
      title={v.name}
      subtitle={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {v.status === 'approved' ? <Pill tone="ok" label="Licence verified" /> : v.status === 'rejected' ? <Pill tone="err" label="Needs changes" /> : <Pill tone="warn" label="Licence in review" />}
        <Txt v="small" style={{ fontSize: 14 }}>{(v.specialty || 'Poultry vet') + (v.rating ? ' · ★ ' + Number(v.rating).toFixed(1) : '')}</Txt>
      </View>}>
      {v.status === 'approved' && wide ? <View style={{ width: 380 }}><Segmented options={TABS} value={tab} onChange={setTab} /></View> : null}
    </HeaderBar>
  );
  if (v.status !== 'approved') return shell(<>
    {header}
    {v.status === 'rejected' ? <>
      <Card tone="err" style={{ gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="alert-outline" color={c.err} /><Txt v="bold" color={c.err}>What to fix</Txt></View><Txt v="body">{v.rejection_reason || 'We could not verify your licence.'}</Txt></Card>
      <Button title="Update and resubmit" onPress={() => navigation.navigate('VetApply')} />
    </> : <>
      <Hearth>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><LiveDot /><Txt v="strong" color={c.hink}>We're checking your licence</Txt></View>
        <Txt v="small" color={c.hmute}>Usually within a working day. Farmers can book you as soon as you're approved. This page updates by itself.</Txt>
      </Hearth>
      <Card><Steps steps={[{ label: 'Details received', state: 'done' }, { label: 'Licence check', state: 'current' }, { label: 'Open for bookings', state: 'todo' }]} /></Card>
    </>}
  </>);
  const open = d.consultations.filter((k) => ['requested', 'proposed', 'confirmed'].includes(k.status)).sort((a, b) => ((a.at || a.requested_date || '') > (b.at || b.requested_date || '') ? 1 : -1));
  const past = d.consultations.filter((k) => ['completed', 'cancelled'].includes(k.status));
  const next = open.find((k) => k.status === 'confirmed' && k.at);
  const len = d.availability?.slot_minutes || 60;
  const nextCard = next ? (
    <Hearth style={wide ? { flex: 1.4 } : null}>
      <Txt v="label" color={c.hmute}>Next consult</Txt>
      <Txt v="monoLg" color={c.hink} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: wide ? 40 : 36, lineHeight: wide ? 46 : 42 }}>{when(next.at)}</Txt>
      <Txt v="body" color={c.hmute}>{next.farmer + (next.flock ? ' · ' + next.flock : '') + ' · ' + (next.type === 'video' ? len + '-minute video consult' : 'Farm visit')}</Txt>
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        {next.type === 'video' && next.meeting_url ? <Button small variant="onHearth" icon="video-outline" title="Join video call" onPress={() => Linking.openURL(next.meeting_url)} style={{ paddingHorizontal: 18 }} /> : null}
        <Button small variant="hearthOutline" title="Open" onPress={() => navigation.navigate('VetBooking', { id: next.id })} style={{ paddingHorizontal: 18 }} />
      </View>
    </Hearth>
  ) : (
    <Card style={[{ gap: 8, padding: 18 }, wide ? { flex: 1.4 } : null]}>
      <Txt v="label">Next consult</Txt>
      <Txt v="h2">Nothing booked yet</Txt>
      <Txt v="small">{d.availability?.windows?.length ? 'Farmers can book your open hours up to 4 weeks ahead.' : 'Set your working hours so farmers can book you.'}</Txt>
      {!d.availability?.windows?.length ? <Button small title="Set my hours" onPress={() => setTab('slots')} style={{ alignSelf: 'flex-start', paddingHorizontal: 18 }} /> : null}
    </Card>
  );
  const walletCard = (
    <Card style={[{ gap: 8, padding: 18 }, wide ? { flex: 1 } : null]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="wallet-outline" size={20} color={c.acc} /><Txt v="label">Wallet</Txt></View>
      <Txt v="mono" style={{ fontSize: 28, lineHeight: 34 }}>{naira(d.balance)}</Txt>
      <Txt v="small">{'Earned from consults ' + naira(d.earned) + ' · you keep 90% of each fee'}</Txt>
      <Button small variant="outline" icon="bank-transfer-out" title="Withdraw" disabled={!Number(d.balance)} onPress={() => navigation.navigate('Withdraw')} />
    </Card>
  );
  const upcoming = (
    <View style={{ gap: 12 }}>
      <SectionHead title="Upcoming" count={open.length} />
      <DataTable minWidth={620} columns={[{ label: 'When', flex: 1.2 }, { label: 'Farm', flex: 1.4 }, { label: 'Note', flex: 1.6 }, { label: 'Status', flex: 1 }, { label: '', width: 150, right: true }]}
        rows={open.map((k) => {
          const needsTime = k.type === 'onsite' && k.status === 'requested';
          return { key: k.id, onPress: () => navigation.navigate('VetBooking', { id: k.id }), cells: [
            <Txt v="strong">{k.status === 'requested' ? 'Asked ' + shortDate(k.requested_date) : k.at ? when(k.at) : 'No time yet'}</Txt>,
            <View><Txt v="strong" numberOfLines={1}>{k.farmer}</Txt><Txt v="small">{k.type === 'video' ? 'Video' : 'Farm visit'}{k.flock ? ' · ' + k.flock : ''}</Txt></View>,
            <Txt v="small" numberOfLines={2}>{k.notes || '–'}</Txt>,
            needsTime ? <Pill tone="warn" icon="clock-outline" label="Needs a time" /> : <Pill tone={K_TONE[k.status]} label={k.status === 'confirmed' && k.fee ? 'Paid' : K_LABEL[k.status]} />,
            <Button small variant={needsTime ? 'primary' : 'outline'} title={needsTime ? 'Propose a time' : 'Open'} onPress={() => navigation.navigate('VetBooking', { id: k.id })} style={{ height: 40, paddingHorizontal: 14 }} />] };
        })}
        empty={<Empty icon="calendar-blank-outline" title="No upcoming bookings" body="Video consults and farm-visit requests show here." style={{ borderWidth: 0 }} />} />
      {past.length ? <>
        <SectionHead title="Past" />
        <DataTable minWidth={480} columns={[{ label: 'When', flex: 1 }, { label: 'Farm', flex: 1.6 }, { label: 'Status', right: true }]}
          rows={past.slice(0, 12).map((k) => ({ key: k.id, onPress: () => navigation.navigate('VetBooking', { id: k.id }), cells: [
            <Txt v="small">{k.at ? shortDate(k.at) : '–'}</Txt>, <Txt v="strong" numberOfLines={1}>{k.farmer}</Txt>,
            <Pill tone={k.status === 'completed' ? 'ok' : 'neutral'} label={k.status === 'completed' ? 'Done' : 'Cancelled'} />] }))} />
      </> : null}
    </View>
  );
  return shell(<>
    {header}
    {!wide ? <Segmented options={TABS} value={tab} onChange={setTab} /> : null}
    {tab === 'bookings' ? <>
      {wide ? <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>{nextCard}{walletCard}</View> : <>{nextCard}{walletCard}</>}
      {upcoming}
    </> : tab === 'slots' ? <VetHours availability={d.availability} reload={load} /> : <VetProfileEdit vet={v} reload={load} />}
  </>);
}
const TABS = [{ value: 'bookings', label: 'Bookings' }, { value: 'slots', label: 'My hours' }, { value: 'profile', label: 'Profile' }];

const WEEK = [{ d: 1, l: 'Mon', full: 'Monday' }, { d: 2, l: 'Tue', full: 'Tuesday' }, { d: 3, l: 'Wed', full: 'Wednesday' }, { d: 4, l: 'Thu', full: 'Thursday' }, { d: 5, l: 'Fri', full: 'Friday' }, { d: 6, l: 'Sat', full: 'Saturday' }, { d: 0, l: 'Sun', full: 'Sunday' }];
const HOURS = Array.from({ length: 31 }, (_, i) => String(6 + Math.floor(i / 2)).padStart(2, '0') + (i % 2 ? ':30' : ':00'));   // 06:00 to 21:00, every half hour
const LENGTHS = [15, 30, 45, 60];
const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const slotsIn = (w, len) => Math.max(0, Math.floor((mins(w.to) - mins(w.from)) / len));
// The saved schedule as an editable week: every day present, on or off, with its own hours.
const toWeek = (availability) => Object.fromEntries(WEEK.map((w) => {
  const saved = (availability?.windows || []).find((x) => x.weekday === w.d);
  return [w.d, saved ? { on: true, from: saved.start, to: saved.end } : { on: false, from: '09:00', to: '15:00' }];
}));

// My hours: one row per weekday (switch, day, hours or Off), the consult length, and how many slots farmers can book a week.
function VetHours({ availability, reload }) {
  const { c } = useTheme();
  const wide = useWide();
  const [week, setWeek] = useState(() => toWeek(availability));
  const [len, setLen] = useState(availability?.slot_minutes || 30);
  const [hoursFor, setHoursFor] = useState(null);   // weekday whose hours are being picked
  const [saving, setSaving] = useState(false);
  const onDays = WEEK.filter((w) => week[w.d].on);
  const bad = onDays.filter((w) => slotsIn(week[w.d], len) < 1);
  const perWeek = onDays.reduce((n, w) => n + slotsIn(week[w.d], len), 0);
  const saved = JSON.stringify(toWeek(availability)) + (availability?.slot_minutes || 30);
  const changed = JSON.stringify(week) + len !== saved;
  const setDayHours = (d, patch) => setWeek((p) => ({ ...p, [d]: { ...p[d], ...patch } }));
  const save = async () => {
    setSaving(true);
    try { await rpc('vet_set_weekly', { p_windows: onDays.map((w) => ({ weekday: w.d, start: week[w.d].from, end: week[w.d].to })), p_slot_minutes: len }); await reload(); }
    catch (e) { Alert.alert("Couldn't save your hours", friendlyError(e)); } finally { setSaving(false); }
  };
  const missing = bad.length ? bad.map((w) => w.full).join(', ') + ': end after start, room for one consult' : null;
  const picking = hoursFor === null ? null : WEEK.find((w) => w.d === hoursFor);
  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 24 : 16, alignItems: wide ? 'flex-start' : 'stretch' }}>
      <View style={{ flex: wide ? 1.4 : undefined, gap: 12 }}>
        <View style={{ backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
          {WEEK.map((w, i) => {
            const x = week[w.d]; const n = slotsIn(x, len);
            return (
              <View key={w.d} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
                <Toggle value={x.on} onValueChange={(on) => setDayHours(w.d, { on })} accessibilityLabel={w.full} />
                <Txt v={x.on ? 'bold' : 'body'} color={x.on ? c.ink : c.mute} style={{ width: 100 }}>{w.full}</Txt>
                {x.on ? (
                  <Pressable onPress={() => setHoursFor(w.d)} accessibilityRole="button" accessibilityLabel={'Change ' + w.full + ' hours, ' + x.from + ' to ' + x.to}
                    style={({ hovered }) => ({ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1.5, borderColor: n < 1 ? c.err : hovered ? c.line2 : c.line, backgroundColor: c.sf2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 })}>
                    <Txt v="mono">{x.from + ' to ' + x.to}</Txt><Icon name="pencil-outline" size={16} color={c.acc} />
                  </Pressable>
                ) : <Txt v="small" style={{ flex: 1 }}>Off</Txt>}
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flex: wide ? 1 : undefined, gap: 14 }}>
        <Txt v="h2">Length of each consult</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[...new Set([...LENGTHS, len])].sort((a, b) => a - b).map((m) => <Chip key={m} label={m + ' min'} selected={len === m} onPress={() => setLen(m)} />)}</View>
        <View style={{ backgroundColor: c.t1, borderRadius: 20, padding: 18, gap: 4 }}>
          <Txt v="label" color={c.t1i}>Farmers can book</Txt>
          <Txt v="mono" style={{ fontSize: 30, lineHeight: 36 }}>{perWeek + (perWeek === 1 ? ' slot' : ' slots')}</Txt>
          <Txt v="small">{'a week · ' + onDays.length + (onDays.length === 1 ? ' working day' : ' working days') + ' · up to 4 weeks ahead'}</Txt>
        </View>
        {missing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="alert-outline" size={16} color={c.err} /><Txt v="small" color={c.err} style={{ flex: 1 }}>{missing}</Txt></View> : null}
        <Button title={!changed ? 'Saved' : missing ? 'Fix the hours to save' : !onDays.length ? 'Save · farmers can’t book you' : 'Save my hours'} loading={saving} disabled={!changed || !!missing} onPress={save} />
      </View>
      <Sheet visible={!!picking} onClose={() => setHoursFor(null)}>
        {picking ? <>
          <Txt v="h1">{picking.full + ' hours'}</Txt>
          <Txt v="strong" style={{ fontSize: 14 }}>From</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{HOURS.slice(0, -1).map((h) => <Chip key={h} label={h} selected={week[picking.d].from === h} onPress={() => setDayHours(picking.d, { from: h })} />)}</ScrollView>
          <Txt v="strong" style={{ fontSize: 14 }}>To</Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{HOURS.slice(1).map((h) => <Chip key={h} label={h} selected={week[picking.d].to === h} onPress={() => setDayHours(picking.d, { to: h })} />)}</ScrollView>
          {slotsIn(week[picking.d], len) < 1 ? <Txt v="small" color={c.err}>The end time must be after the start, with room for a {len}-minute consult.</Txt>
            : <Txt v="small">{week[picking.d].from + ' to ' + week[picking.d].to + ': ' + slotsIn(week[picking.d], len) + (slotsIn(week[picking.d], len) === 1 ? ' slot' : ' slots') + ' of ' + len + ' minutes.'}</Txt>}
          <Button title="Done" onPress={() => setHoursFor(null)} />
          {onDays.length > 1 ? <Button variant="ghost" title={'Use these hours for all ' + onDays.length + ' working days'} onPress={() => { const h = week[picking.d]; setWeek((p) => Object.fromEntries(Object.entries(p).map(([dd, x]) => [dd, x.on ? { ...x, from: h.from, to: h.to } : x]))); setHoursFor(null); }} /> : null}
        </> : null}
      </Sheet>
    </View>
  );
}

function VetProfileEdit({ vet, reload }) {
  const wide = useWide();
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
    <View style={{ gap: 14, maxWidth: wide ? 640 : undefined }}>
      <Card style={{ gap: 14, padding: 18 }}>
        <Input label="Fee per video consult" prefix="₦" keyboardType="number-pad" value={fee} onChangeText={(t) => setFee(t.replace(/\D/g, ''))} mono hint={Number(fee) > 0 ? 'You receive ' + naira(Math.round(Number(fee) * 0.9)) + ' per consult after the 10% Poultry360 fee.' : undefined} />
        <View style={{ gap: 2 }}><Txt v="label">Experience</Txt><Txt v="strong">{(vet.years != null ? vet.years + ' years · ' : '') + (vet.specialty || 'Poultry vet')}</Txt></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Txt v="strong">I also do farm visits</Txt><Txt v="small">Farmers can request an on-site visit.</Txt></View><Toggle value={onsite} onValueChange={setOnsite} accessibilityLabel="I also do farm visits" /></View>
        <Input label="About you" value={bio} onChangeText={setBio} multiline />
      </Card>
      <Button title={Number(fee) > 0 ? 'Save changes' : 'Enter your fee'} loading={busy} disabled={!(Number(fee) > 0)} onPress={save} />
      <Txt v="small">To change your name, specialty or licence, contact Poultry360 support.</Txt>
    </View>
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
