import React, { useState } from 'react';
import { View, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, useWide, Screen, AppBar, Txt, Button, Input, ChipRow, Segmented, Icon, Hearth, Steps, Card, Pill, PhotoBox, rpc, uploadImage, friendlyError, supabase, LOGO_FULL, pendingInviteNow, PhotoButtons,
  AuthTop, SelectCard, PlaceholderArt, SuccessMoment, TrustRow, LiveDot } from '@p360/shared';
import { getHere } from '../lib/spot';
import { useAuth } from '../context/AuthContext';
import { INVEST_ENABLED } from '../lib/roi';
import { ExploreOptions } from './explore';

export function Splash() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.logobg, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={LOGO_FULL} resizeMode="contain" style={{ width: 220, height: 215 }} />
    </View>
  );
}

const ROLES = [
  { id: 'buyer', title: 'Buy', body: 'Poultry for home, a restaurant or catering', art: 'eggs' },
  { id: 'vendor', title: 'Sell as a farm', body: 'List birds and eggs, run your flock records', art: 'bird' },
  { id: 'supplier', title: 'Supply farms', body: 'Sell feed, medicine or equipment to farmers', art: 'feed' },
  { id: 'vet', title: 'Work as a vet', body: 'Video consults and farm visits', art: 'vial' },
  { id: 'agent', title: 'Sell for a store', body: "Open your own shop with a store's products", art: 'feed' },
  ...(INVEST_ENABLED ? [{ id: 'investor', title: 'Invest in farms', body: 'Fund verified farms and track returns', icon: 'chart-line' }] : []),
];
const PLAIN = ['buyer', 'investor'];   // roles that need no business details
const SELLERS = ['vendor', 'supplier'];
// What a supplier sells: farm supplies only. Each maps to the supplier_type stored for the business.
const SUPPLIES = [{ label: 'Feed', type: 'feed' }, { label: 'Drugs & vaccines', type: 'medicine' }, { label: 'Equipment', type: 'equipment' }, { label: 'Packaging', type: 'equipment' }];
const OLD_SUPPLY = { 'Equipment & accessories': 'Equipment', 'Packaging & egg crates': 'Packaging' };

// Step 3 of 4 (or "Add a role" from Profile): what the account is for.
export function RoleScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const { profile, refresh } = useAuth();
  const adding = !!route.params?.adding;
  const [sel, setSel] = useState(adding ? [] : pendingInviteNow() ? ['agent'] : []);   // came from a store's invite link
  const [name, setName] = useState(profile?.full_name || '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);   // buyer-only sign-up: show the success moment before the app opens
  const [buyerType, setBuyerType] = useState(profile?.buyer_type || 'individual');
  const [bizName, setBizName] = useState(profile?.buyer_business_name || '');
  const owned = profile?.roles || [];
  const toggle = (id) => setSel((s) => {
    if (s.includes(id)) return s.filter((x) => x !== id);
    // vet, agent and the seller roles each have their own setup step, so only one of them at a time
    if (id === 'vet' || id === 'agent') return [...s.filter((x) => !SELLERS.includes(x) && x !== 'vet' && x !== 'agent'), id];
    if (SELLERS.includes(id)) return [...s.filter((x) => x !== 'vet' && x !== 'agent'), id];
    return [...s, id];
  });
  const needsBizName = sel.includes('buyer') && buyerType === 'business' && !bizName.trim();
  const needsName = !adding && !name.trim();
  // The button stays tappable and says why, instead of sitting greyed out.
  const problem = !sel.length ? 'Pick one to continue' : needsName ? 'Type your name to continue' : needsBizName ? 'Type your business name to continue' : null;
  const [tried, setTried] = useState(false);
  const go = async () => {
    if (problem) { setTried(true); return; }
    setBusy(true);
    try {
      const sellers = sel.filter((r) => SELLERS.includes(r));
      const plain = sel.filter((r) => PLAIN.includes(r));
      if (plain.length) await rpc('set_roles', { p_roles: plain, p_name: name.trim() || null });
      else if (name.trim()) await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id);
      if (sel.includes('buyer')) await rpc('set_buyer_type', { p_type: buyerType, p_business_name: buyerType === 'business' ? bizName.trim() : null });
      if (sellers.length) navigation.navigate('Business', { roles: sellers });
      else if (sel.includes('vet')) navigation.navigate('VetApply');   // the vet role is added when the application is submitted
      else if (sel.includes('agent')) navigation.navigate('AgentJoin');   // the agent role is added when they join a store
      else if (adding) { await refresh(); navigation.goBack(); }
      else setDone(true);
    } catch (e) { alert(friendlyError(e)); } finally { setBusy(false); }
  };
  if (done) return (
    <Screen scroll style={{ justifyContent: 'center', flexGrow: 1, maxWidth: 520, width: '100%', alignSelf: 'center' }} footer={<Button title="Start shopping" onPress={refresh} />}>
      <SuccessMoment title={"You're all set" + (name.trim() ? ', ' + name.trim().split(' ')[0] : '')} body="Browse verified farms near you. Delivery is by Poultry360 riders." />
    </Screen>
  );
  const visible = ROLES.filter((r) => !owned.includes(r.id) && !(owned.includes('agent') && SELLERS.includes(r.id)) && !(r.id === 'agent' && owned.some((x) => SELLERS.includes(x))));
  const footer = <>
    {problem && (tried || !sel.length) ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.warnbg, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
        <Icon name="alert-outline" size={18} color={c.warn} /><Txt v="strong" color={c.warn} style={{ flex: 1 }}>{problem}</Txt>
      </View>
    ) : null}
    <Button title={sel.length === 1 && sel[0] === 'buyer' ? 'Continue as a buyer' : 'Continue'} onPress={go} loading={busy} />
  </>;
  return (
    <Screen pad={false}>
      {adding ? <View style={{ paddingHorizontal: 16 }}><AppBar title="Add a role" /></View> : <AuthTop step={3} />}
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 14, width: '100%', maxWidth: wide ? 460 : undefined, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Txt v="display">{adding ? 'Add a role' : 'How will you use Poultry360?'}</Txt>
        {!adding ? <Input label="Your name" value={name} onChangeText={setName} placeholder="Adaeze Okafor" autoCapitalize="words" error={tried && needsName ? 'Enter your name' : null} /> : null}
        {visible.map((r) => (
          <SelectCard key={r.id} selected={sel.includes(r.id)} onPress={() => toggle(r.id)} title={r.title} subtitle={r.body} error={tried && !sel.length}
            lead={r.art ? <PlaceholderArt kind={r.art} size={52} radius={14} /> : <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: c.t3, alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={26} color={c.t3i} /></View>}>
            {r.id === 'buyer' && sel.includes('buyer') ? (
              <View style={{ gap: 10, paddingTop: 4 }}>
                <Segmented options={[{ value: 'individual', label: 'For myself' }, { value: 'business', label: 'For a business' }]} value={buyerType} onChange={setBuyerType} />
                {buyerType === 'business' ? <Input label="Business name" value={bizName} onChangeText={setBizName} placeholder="Mama T's Kitchen" autoCapitalize="words" error={tried && needsBizName ? 'Enter your business name' : null} /> : null}
              </View>
            ) : null}
          </SelectCard>
        ))}
        <TrustRow icon="shield-check-outline" text="Farms, stores and vets are checked before anyone can buy from them." />
        {!wide ? null : <View style={{ gap: 10, marginTop: 6 }}>{footer}</View>}
      </ScrollView>
      {!wide ? <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderColor: c.line, backgroundColor: c.bg }}>{footer}</View> : null}
    </Screen>
  );
}

const CATS = ['Eggs', 'Broilers', 'Layers', 'Turkey', 'Live birds'];   // what a farm sells

// Step 4 of 4: name, what you sell, then location and ID as one checklist card.
export function BusinessScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const { uid, vendor, refresh } = useAuth();
  const [biz, setBiz] = useState(vendor?.business_name || '');
  const roles = route.params?.roles || [];
  const isSupplier = roles.includes('supplier') || (!roles.length && !!vendor?.supplier_type);
  const isFarm = roles.includes('vendor') || (!roles.length && !vendor?.supplier_type);
  const supplyLabels = SUPPLIES.map((x) => x.label);
  const saved = (vendor?.categories || []).map((x) => OLD_SUPPLY[x] || x);
  const farmOptions = [...CATS, ...saved.filter((x) => !CATS.includes(x) && !supplyLabels.includes(x))];
  const [cats, setCats] = useState(saved.filter((x) => farmOptions.includes(x)));
  const [supplies, setSupplies] = useState(saved.filter((x) => supplyLabels.includes(x)));
  const [loc, setLoc] = useState(vendor?.location || '');
  const [geo, setGeo] = useState(vendor?.lat != null ? { lat: vendor.lat, lng: vendor.lng } : null);   // nearby buyers see pinned sellers first
  const [pinning, setPinning] = useState(false);
  const pin = async () => { setPinning(true); try { const h = await getHere(); if (h) setGeo(h); } finally { setPinning(false); } };
  const [photo, setPhoto] = useState(null);
  const [upload, setUpload] = useState({ state: vendor?.id_doc_path ? 'done' : 'empty', path: vendor?.id_doc_path });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const word = isFarm ? 'farm' : 'store';

  const pick = async (camera) => {
    const fn = camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    if (camera) { const p = await ImagePicker.requestCameraPermissionsAsync(); if (!p.granted) return; }
    const r = await fn({ quality: 0.6, mediaTypes: ['images'] });
    if (r.canceled) return;
    const uri = r.assets[0].uri; setPhoto(uri); doUpload(uri);
  };
  const doUpload = async (uri) => {
    setUpload({ state: 'uploading' });
    try { const path = await uploadImage('id-docs', uid, uri); setUpload({ state: 'done', path }); }
    catch (e) { setUpload({ state: 'failed', error: friendlyError(e) }); }
  };
  // What is still missing, in order; the submit button names the first one.
  const missing = [
    !biz.trim() && 'your ' + word + ' name',
    isSupplier && !supplies.length && 'what you supply',
    isFarm && !cats.length && 'what you sell',
    !loc.trim() && 'your ' + word + "'s address",
    upload.state !== 'done' && 'a photo of your ID',
  ].filter(Boolean);
  const submit = async () => {
    setTried(true);
    if (missing.length || upload.state === 'uploading') return;
    setBusy(true);
    try {
      const supType = isSupplier ? SUPPLIES.find((x) => x.label === supplies[0])?.type || null : null;
      const app = { p_business_name: biz.trim(), p_categories: [...(isFarm ? cats : []), ...(isSupplier ? supplies : [])], p_location: loc.trim(), p_id_doc_path: upload.path, p_supplier_type: supType, p_lat: geo?.lat ?? null, p_lng: geo?.lng ?? null };
      // p_is_farm needs migration 016; a database without it still accepts the older call.
      await rpc('submit_vendor_application', { ...app, p_is_farm: isFarm }).catch((e) => (/p_is_farm|PGRST202|function/i.test(String(e?.message || e?.code)) ? rpc('submit_vendor_application', app) : Promise.reject(e)));
      // The server adds the farm and/or supplier role and makes the right one active.
      const inMain = navigation.getState().routeNames.includes('Pending');
      await refresh();
      if (inMain) navigation.replace('Pending');
    } catch (er) { alert(friendlyError(er)); } finally { setBusy(false); }
  };
  const status = (ok, busyNow) => busyNow ? <Pill tone="neutral" label="Uploading" /> : ok ? <Pill tone="ok" label="Done" /> : <Pill tone="warn" label="Needed" />;
  const checkRow = (ok, icon, title, detail, right, last) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: last ? 0 : 1, borderColor: c.line }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: ok ? c.yolk : c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name={ok ? 'check' : icon} size={22} color={ok ? c.onyolk : c.ink} /></View>
      <View style={{ flex: 1, gap: 2 }}><Txt v="bold">{title}</Txt><Txt v="small">{detail}</Txt></View>
      {right}
    </View>
  );
  const button = <Button title={busy ? 'Sending' : missing.length ? 'Add ' + missing[0] : 'Submit for review'} onPress={submit} loading={busy} disabled={upload.state === 'uploading'} />;
  const missingNote = tried && missing.length ? <Txt v="small" color={c.err} style={{ fontSize: 14 }}>{'Still needed: ' + missing.join(', ') + '.'}</Txt> : null;
  return (
    <Screen pad={false}>
      {roles.length || !vendor ? <AuthTop onBack={navigation.canGoBack() ? () => navigation.goBack() : null} step={4} /> : <View style={{ paddingHorizontal: 16 }}><AppBar title={isFarm ? 'Farm details' : 'Store details'} /></View>}
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16, width: '100%', maxWidth: wide ? 460 : undefined, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Txt v="display">{isFarm ? 'About your farm' : 'About your store'}</Txt>
        <Input label={isFarm ? 'Farm name' : 'Store name'} value={biz} onChangeText={setBiz} placeholder={isFarm ? 'Garden City Poultry' : 'Rivers Agro Supplies'} error={tried && !biz.trim() ? 'Enter your ' + word + ' name' : null} />
        {isSupplier ? (
          <View style={{ gap: 8 }}><Txt v="strong" style={{ fontSize: 14 }}>What you supply</Txt>
            <ChipRow options={supplyLabels} value={supplies} multi onChange={setSupplies} />
            {tried && !supplies.length ? <Txt v="small" color={c.err}>Pick at least one</Txt> : null}</View>
        ) : null}
        {isFarm ? (
          <View style={{ gap: 8 }}><Txt v="strong" style={{ fontSize: 14 }}>{isSupplier ? 'What your farm sells' : 'What you sell'}</Txt>
            <ChipRow options={farmOptions} value={cats} onChange={setCats} multi />
            {tried && !cats.length ? <Txt v="small" color={c.err}>Pick at least one</Txt> : null}</View>
        ) : null}
        <Input label={isFarm ? 'Farm address' : 'Store address'} value={loc} onChangeText={setLoc} placeholder={isFarm ? 'Igwuruta, Rivers State' : 'Trans-Amadi, Port Harcourt'} error={tried && !loc.trim() ? 'Enter the address riders collect from' : null} />
        <View style={{ backgroundColor: c.sf, borderRadius: 20, borderWidth: 1, borderColor: tried && upload.state !== 'done' ? c.err : c.line, overflow: 'hidden' }}>
          {checkRow(!!geo, 'crosshairs-gps', 'Pin my location', geo ? 'Pinned. Nearby buyers see you first.' : "Do it at the " + word + ': nearby buyers pay less delivery.',
            <Button small variant={geo ? 'ghost' : 'outline'} title={geo ? 'Again' : 'Pin'} loading={pinning} onPress={pin} style={{ height: 40, paddingHorizontal: 14 }} />)}
          {checkRow(upload.state === 'done', 'card-account-details-outline', 'Photo of your ID',
            upload.state === 'failed' ? "Upload didn't finish. Try again." : upload.state === 'done' ? 'Uploaded' : "NIN slip, voter card or driver's licence",
            status(upload.state === 'done', upload.state === 'uploading'), true)}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}>
            {photo ? <PhotoBox uri={photo} size={72} /> : null}
            {upload.state === 'failed' ? <Button small variant="dark" icon="refresh" title="Retry upload" onPress={() => doUpload(photo)} />
              : <PhotoButtons onCamera={() => pick(true)} onGallery={() => pick(false)} />}
          </View>
        </View>
        {missingNote}
        {wide ? button : null}
      </ScrollView>
      {!wide ? <View style={{ padding: 16, borderTopWidth: 1, borderColor: c.line, backgroundColor: c.bg }}>{button}</View> : null}
    </Screen>
  );
}

// After submitting: what happens next, and what they can do while they wait.
export function PendingScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const { vendor, refresh, supplierOnly } = useAuth();
  const st = vendor?.verification_status;
  const word = supplierOnly ? 'store' : 'farm';
  const dev = async (s) => { await rpc('dev_set_verification', { p_status: s, p_reason: s === 'rejected' ? 'ID photo unclear. Retake it in good light with all four corners in frame.' : null }); refresh(); };
  const col = { padding: 20, gap: 18, width: '100%', maxWidth: wide ? 620 : undefined, alignSelf: 'center' };
  if (st === 'rejected') return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: 16 }}><AppBar /></View>
      <ScrollView contentContainerStyle={col}>
        <Txt v="display">One thing to fix</Txt>
        <Card tone="err" style={{ gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="alert-outline" color={c.err} /><Txt v="bold" color={c.err}>Reason</Txt></View><Txt v="body">{vendor?.rejection_reason || 'We could not verify your ID.'}</Txt></Card>
        <Txt v="small">Your other details are kept.</Txt>
        <Button title="Update and resubmit" onPress={() => navigation.navigate('Business')} />
      </ScrollView>
    </Screen>
  );
  if (st === 'approved') return (
    <Screen scroll style={{ justifyContent: 'center', flexGrow: 1, maxWidth: 520, width: '100%', alignSelf: 'center' }} footer={<Button title={supplierOnly ? 'Add your first product' : 'Add your first listing'} onPress={() => navigation.replace('ListingForm')} />}>
      <SuccessMoment title={(vendor.business_name || 'You') + ' is verified'} body={supplierOnly ? 'Your products can go live now.' : 'Your listings can go live now.'} />
    </Screen>
  );
  return (
    <Screen pad={false}>
      <View style={{ paddingHorizontal: 16 }}><AppBar /></View>
      <ScrollView contentContainerStyle={col}>
        <Hearth>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><LiveDot size={10} /><Txt v="label" color={c.hmute}>In review</Txt></View>
          <Txt v="display" color={c.hink}>We're checking your details</Txt>
          <Txt v="small" color={c.hmute}>{(vendor?.business_name || 'Your ' + word) + ' · usually within a working day'}</Txt>
        </Hearth>
        <Card style={{ padding: 18 }}>
          <Steps steps={[
            { label: 'Details received', state: 'done' },
            { label: 'ID check', state: 'current' },
            { label: 'Location check', state: 'todo', detail: vendor?.lat != null ? 'Pinned' : 'Not pinned yet' },
            { label: 'Verified', state: 'todo' },
          ]} />
        </Card>
        <View style={{ backgroundColor: c.t1, borderRadius: 20, padding: 18, gap: 10 }}>
          <Txt v="h2" color={c.t1i}>{supplierOnly ? 'Add products while you wait' : 'Farm Hub is open while you wait'}</Txt>
          <Txt v="small">{supplierOnly ? 'They go live when you are verified.' : 'Flocks, feed, mortality and output. No approval needed.'}</Txt>
          <Button small title={supplierOnly ? 'Add a product' : 'Open Farm Hub'} style={{ alignSelf: 'flex-start', paddingHorizontal: 18 }}
            onPress={() => (supplierOnly ? navigation.navigate('ListingForm') : navigation.popTo('Tabs', { screen: 'FarmHome' }))} />
        </View>
        {supplierOnly ? <>
          <Txt v="h2">More while you wait</Txt>
          <ExploreOptions navigation={navigation} />
        </> : null}
        {__DEV__ ? <Card><Txt v="label">Developer only</Txt><View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" title="Approve" onPress={() => dev('approved')} style={{ flex: 1 }} /><Button small variant="outline" title="Reject" onPress={() => dev('rejected')} style={{ flex: 1 }} /></View></Card> : null}
      </ScrollView>
    </Screen>
  );
}
