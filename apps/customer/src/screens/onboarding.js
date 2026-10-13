import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, Screen, AppBar, Txt, Button, Input, ChipRow, Segmented, Icon, Banner, Hearth, Steps, Card, PhotoBox, rpc, uploadImage, friendlyError, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { INVEST_ENABLED } from '../lib/roi';

export function Splash() {
  const { c, mode } = useTheme();
  const dark = mode === 'dark';
  return (
    <View style={{ flex: 1, backgroundColor: dark ? c.bg : c.yolk, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
      <View style={{ width: 104, height: 128, borderRadius: 52, backgroundColor: dark ? c.ember : c.onyolk, alignItems: 'center', justifyContent: 'center', paddingTop: 16 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: dark ? c.bg : c.yolk }} />
      </View>
      <Txt v="display" color={dark ? c.ink : c.onyolk} style={{ fontSize: 40, lineHeight: 46 }}>Poultry360</Txt>
      <Txt v="strong" color={dark ? c.mute : c.onyolk}>Farm to table, verified.</Txt>
    </View>
  );
}

const ROLES = [
  { id: 'buyer', title: 'Buy', body: 'Order poultry for home, a restaurant or catering', icon: 'basket-outline', tone: 't1' },
  { id: 'vendor', title: 'Sell as a farm', body: 'List birds and eggs, and manage your flock', icon: 'barn', tone: 't2' },
  { id: 'supplier', title: 'Supply farms', body: 'Sell feed, medicine or poultry equipment to farmers', icon: 'package-variant', tone: 't4' },
  { id: 'vet', title: 'Work as a vet', body: 'Offer video consults and farm visits to poultry farmers', icon: 'stethoscope', tone: 't2' },
  ...(INVEST_ENABLED ? [{ id: 'investor', title: 'Invest in farms', body: 'Fund verified farms and track your returns', icon: 'chart-line', tone: 't3' }] : []),
];
const PLAIN = ['buyer', 'investor'];   // roles that need no business details
const SELLERS = ['vendor', 'supplier'];
const SUPPLIER_TYPES = [{ id: 'feed', label: 'Feed' }, { id: 'equipment', label: 'Accessories & equipment' }, { id: 'medicine', label: 'Medicine' }];

export function RoleScreen({ navigation, route }) {
  const { c } = useTheme();
  const { profile, refresh } = useAuth();
  const adding = !!route.params?.adding;
  const [sel, setSel] = useState(adding ? [] : ['buyer']);
  const [name, setName] = useState(profile?.full_name || '');
  const [busy, setBusy] = useState(false);
  const [buyerType, setBuyerType] = useState(profile?.buyer_type || 'individual');
  const [bizName, setBizName] = useState(profile?.buyer_business_name || '');
  const owned = profile?.roles || [];
  // A vet registers with a licence and a farm/supplier with business details, so those are set up one at a time.
  const toggle = (id) => setSel((s) => {
    if (s.includes(id)) return s.filter((x) => x !== id);
    if (id === 'vet') return [...s.filter((x) => !SELLERS.includes(x)), id];
    if (SELLERS.includes(id)) return [...s.filter((x) => x !== 'vet'), id];
    return [...s, id];
  });
  const needsBizName = sel.includes('buyer') && buyerType === 'business' && !bizName.trim();
  const needsName = !adding && !name.trim();
  // What is stopping them, in plain words. The button stays tappable and says why, instead of sitting greyed out.
  const problem = !sel.length ? 'Tick at least one option above to continue.' : needsName ? 'Type your name in the box at the top to continue.' : needsBizName ? 'Type your business name to continue.' : null;
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
      else { await refresh(); if (adding) navigation.goBack(); }
    } catch (e) { alert(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<>
      {problem ? <Txt v="small" color={tried ? c.err : undefined} style={{ textAlign: 'center', fontSize: 14 }}>{problem}</Txt> : null}
      <Button title={sel.length === 1 && sel[0] === 'buyer' ? 'Continue as a buyer' : 'Continue'} onPress={go} loading={busy} />
    </>}>
      {adding ? <AppBar title="Add a role" /> : <View style={{ height: 56 }} />}
      <Txt v="display">How will you use Poultry360?</Txt>
      <Txt v="small" style={{ fontSize: 15 }}>{adding ? 'Choose what to add.' : 'Pick one or more. Just buying is fine: you can add other roles later from your profile.'}</Txt>
      {!adding ? <Input label="Your name" value={name} onChangeText={setName} placeholder="Adaeze Okafor" autoCapitalize="words" error={tried && needsName ? 'Enter your name' : null} /> : null}
      {ROLES.filter((r) => !owned.includes(r.id)).map((r) => {
        const on = sel.includes(r.id);
        return (
          <Pressable key={r.id} onPress={() => toggle(r.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={{ backgroundColor: c.sf, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', borderWidth: on ? 2 : 1.5, borderColor: on ? c.ember : c.line2 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c[r.tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={r.icon} size={26} color={c[r.tone + 'i']} /></View>
            <View style={{ flex: 1, gap: 2 }}><Txt v="bold" style={{ fontSize: 16 }}>{r.title}</Txt><Txt v="small">{r.body}</Txt></View>
            <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: on ? c.ember : 'transparent', borderWidth: on ? 0 : 2, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>{on ? <Icon name="check" size={18} color={c.onember} /> : null}</View>
          </Pressable>
        );
      })}
      {sel.includes('buyer') ? (
        <View style={{ gap: 10 }}>
          <Txt v="strong" style={{ fontSize: 13 }}>Are you buying for yourself or a business?</Txt>
          <Segmented options={[{ value: 'individual', label: 'Myself' }, { value: 'business', label: 'A business' }]} value={buyerType} onChange={setBuyerType} />
          {buyerType === 'business' ? <Input label="Business name" value={bizName} onChangeText={setBizName} placeholder="Mama T's Kitchen" autoCapitalize="words" error={tried && needsBizName ? 'Enter your business name' : null} hint="Restaurants, caterers, hotels, retailers and other resellers." /> : null}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="shield-check-outline" size={18} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Farms, suppliers and vets are verified before buyers and farmers can see them.</Txt></View>
    </Screen>
  );
}

const CATS = ['Eggs', 'Broilers', 'Turkey', 'Live birds', 'Feed & supplies', 'Drugs'];

export function BusinessScreen({ navigation, route }) {
  const { uid, vendor, refresh } = useAuth();
  const [biz, setBiz] = useState(vendor?.business_name || '');
  const [cats, setCats] = useState(vendor?.categories || []);
  const [loc, setLoc] = useState(vendor?.location || '');
  const [photo, setPhoto] = useState(null);
  const [upload, setUpload] = useState({ state: vendor?.id_doc_path ? 'done' : 'empty', path: vendor?.id_doc_path });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const isSupplier = (route.params?.roles || []).includes('supplier') || !!vendor?.supplier_type;
  const [supType, setSupType] = useState(vendor?.supplier_type || null);

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
  const submit = async () => {
    const e = {};
    if (!biz.trim()) e.biz = 'Enter your business name';
    if (!cats.length) e.cats = 'Pick at least one';
    if (isSupplier && !supType) e.sup = 'Choose what you supply';
    if (!loc.trim()) e.loc = 'Enter your farm location';
    if (upload.state !== 'done') e.id = 'Upload a photo of your ID';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await rpc('submit_vendor_application', { p_business_name: biz.trim(), p_categories: cats, p_location: loc.trim(), p_id_doc_path: upload.path, p_supplier_type: isSupplier ? supType : null });
      const roles = route.params?.roles || ['vendor'];
      await rpc('set_roles', { p_roles: roles });
      await rpc('set_active_role', { p_role: 'vendor' });
      const inMain = navigation.getState().routeNames.includes('Pending');
      await refresh();
      if (inMain) navigation.replace('Pending');
    } catch (er) { alert(friendlyError(er)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Submit for review" onPress={submit} loading={busy} disabled={upload.state === 'uploading' || upload.state === 'failed'} />}>
      <AppBar title="About your farm" subtitle="Step 2 of 2" />
      <Input label="Business name" value={biz} onChangeText={setBiz} placeholder="Garden City Poultry" error={errs.biz} />
      {isSupplier ? (
        <View style={{ gap: 8 }}><Txt v="strong" style={{ fontSize: 13 }}>What do you supply?</Txt>
          <ChipRow options={SUPPLIER_TYPES.map((t) => t.label)} value={SUPPLIER_TYPES.find((t) => t.id === supType)?.label} onChange={(l) => { setSupType(SUPPLIER_TYPES.find((t) => t.label === l).id); setErrs((x) => ({ ...x, sup: undefined })); }} />
          {errs.sup ? <Txt v="small" color={c.err}>{errs.sup}</Txt> : null}</View>
      ) : null}
      <View style={{ gap: 8 }}><Txt v="strong" style={{ fontSize: 13 }}>What do you sell?</Txt><ChipRow options={CATS} value={cats} onChange={setCats} multi />{errs.cats ? <Txt v="small" color={c.err}>{errs.cats}</Txt> : null}</View>
      <Input label="Farm location" value={loc} onChangeText={setLoc} placeholder="Igwuruta, Rivers State" error={errs.loc} />
      <Txt v="strong" style={{ fontSize: 13 }}>Government-issued ID</Txt>
      {upload.state === 'failed' ? (
        <Card tone="err">
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><PhotoBox uri={photo} size={56} /><View style={{ flex: 1 }}><Txt v="bold">Upload didn't finish</Txt><Txt v="small">Your other details are saved. Only the photo needs another try.</Txt></View></View>
          <View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="dark" icon="refresh" title="Retry upload" onPress={() => doUpload(photo)} style={{ flex: 1 }} /><Button small variant="outline" title="Retake" onPress={() => pick(true)} style={{ flex: 1 }} /></View>
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <PhotoBox uri={photo} size={56} />
            <View style={{ flex: 1 }}><Txt v="strong">{upload.state === 'done' ? 'ID uploaded' : upload.state === 'uploading' ? 'Uploading…' : "NIN slip, voter card or driver's licence"}</Txt>
              <Txt v="small">{upload.state === 'done' ? 'Tap to replace' : 'All four corners in frame, good light'}</Txt></View>
          </View>
          {errs.id ? <Txt v="small" color={c.err}>{errs.id}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" icon="camera-outline" title="Take photo" onPress={() => pick(true)} style={{ flex: 1 }} /><Button small variant="outline" icon="image-outline" title="Gallery" onPress={() => pick(false)} style={{ flex: 1 }} /></View>
        </Card>
      )}
    </Screen>
  );
}

export function PendingScreen({ navigation }) {
  const { c } = useTheme();
  const { vendor, refresh } = useAuth();
  const st = vendor?.verification_status;
  const dev = async (s) => { await rpc('dev_set_verification', { p_status: s, p_reason: s === 'rejected' ? 'ID photo unclear. Retake it in good light with all four corners in frame.' : null }); refresh(); };
  if (st === 'rejected') return (
    <Screen scroll footer={<Button title="Retake ID photo" onPress={() => navigation.navigate('Business')} />}>
      <AppBar />
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.errbg, alignItems: 'center', justifyContent: 'center' }}><Icon name="card-account-details-outline" size={32} color={c.err} /></View>
      <Txt v="display">One thing to fix before you can sell</Txt>
      <Card><Txt v="label" color={c.err}>Reason</Txt><Txt v="body">{vendor?.rejection_reason || 'We could not verify your ID.'}</Txt></Card>
      <Txt v="small">You won't need to start over. Only the ID step reopens.</Txt>
    </Screen>
  );
  if (st === 'approved') return (
    <Screen scroll footer={<Button title="Add your first listing" onPress={() => navigation.replace('ListingForm')} />}>
      <AppBar />
      <Banner tone="ok" icon="check-decagram" title="You're verified" body="Your listings can now go live on the Marketplace." />
      <Txt v="display">{vendor.business_name} is approved</Txt>
    </Screen>
  );
  return (
    <Screen scroll>
      <AppBar />
      <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.warnbg, alignItems: 'center', justifyContent: 'center' }}><Icon name="timer-sand" size={32} color={c.warn} /></View>
      <Txt v="display">We're reviewing {vendor?.business_name || 'your farm'}</Txt>
      <Txt v="small" style={{ fontSize: 15 }}>We'll notify you as soon as it's approved. Then you can publish listings.</Txt>
      <Steps steps={[{ label: 'Application submitted', state: 'done' }, { label: 'ID and business review', state: 'current' }, { label: 'Approved. Listings unlocked', state: 'todo' }]} />
      <Hearth>
        <Txt v="label" color={c.ember}>Available now</Txt>
        <Txt v="h2" color={c.hink}>Run your farm in Farm Hub while you wait</Txt>
        <Txt v="small" color={c.hmute}>Track flocks, feed, mortality and production. No approval needed.</Txt>
        <Button title="Open Farm Hub" onPress={() => navigation.popTo('Tabs', { screen: 'FarmHome' })} />
      </Hearth>
      {__DEV__ ? <Card><Txt v="label">Developer only</Txt><View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" title="Approve" onPress={() => dev('approved')} style={{ flex: 1 }} /><Button small variant="outline" title="Reject" onPress={() => dev('rejected')} style={{ flex: 1 }} /></View></Card> : null}
    </Screen>
  );
}
