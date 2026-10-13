import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, ChipRow, Segmented, Pill, Skeleton,
  naira, pct, isoDate, INVEST_STATUS, rpc, publicUrl, uploadImage, friendlyError, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { OfferingCard } from './invest';
import { ESTIMATE_COPY } from '../lib/roi';

const TONE = { draft: 'neutral', pending_review: 'warn', open: 'live', funded: 'ok', active: 'ok', matured: 'neutral', refunded: 'neutral', suspended: 'warn', rejected: 'err' };

// Photo strip shared by the badge documents and the offering photos (same pattern as ListingForm).
function PhotoStrip({ photos, setPhotos, bucket, max = 4, error }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const add = async () => {
    let r;
    try { r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max - photos.length }); }
    catch (e) { return Alert.alert("Couldn't open your photos", friendlyError(e)); }
    if (r.canceled) return;
    r.assets.forEach(async (a) => {
      setPhotos((p) => [...p, { uri: a.uri, state: 'uploading' }]);
      try { const path = await uploadImage(bucket, uid, a.uri); setPhotos((p) => p.map((x) => (x.uri === a.uri ? { ...x, path, state: 'done' } : x))); }
      catch { setPhotos((p) => p.map((x) => (x.uri === a.uri ? { ...x, state: 'failed' } : x))); }
    });
  };
  return (
    <>
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {photos.map((p, i) => (
          <Pressable key={p.uri || p.path} onPress={() => setPhotos(photos.filter((_, j) => j !== i))} accessibilityLabel="Remove photo" style={{ width: 84, height: 84, borderRadius: 16, overflow: 'hidden', backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}>
            {p.uri ? <Image source={{ uri: p.uri }} style={{ width: 84, height: 84, opacity: p.state === 'done' ? 1 : 0.4 }} /> : <Icon name="file-check-outline" color={c.sage} />}
            {p.state !== 'done' ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><Icon name={p.state === 'failed' ? 'alert-circle' : 'cloud-upload-outline'} color={p.state === 'failed' ? c.err : c.ink} /></View> : null}
          </Pressable>
        ))}
        {photos.length < max ? <Pressable onPress={add} accessibilityLabel="Add photos" style={{ width: 84, height: 84, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: error ? c.err : c.line2, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera-plus-outline" color={error ? c.err : c.acc} /></Pressable> : null}
      </ScrollView>
      {error ? <Txt v="small" color={c.err}>{error}</Txt> : null}
    </>
  );
}

export function RaiseHomeScreen({ navigation }) {
  const { c } = useTheme();
  const { uid, vendor, refresh } = useAuth();
  const [list, setList] = useState(null);
  useFocusEffect(useCallback(() => {
    refresh();
    supabase.from('investment_offerings').select('*').eq('vendor_id', uid).order('created_at', { ascending: false }).then(({ data }) => setList(data || []));
  }, [uid]));
  const badge = vendor?.investment_badge || 'none';
  if (vendor?.verification_status !== 'approved') return (
    <Screen scroll><AppBar title="Raise funds" />
      <Empty icon="shield-check-outline" title="Get verified to sell first" body="Your farm needs marketplace verification before it can apply to raise funds." action="Check verification" onAction={() => navigation.navigate('Pending')} />
    </Screen>
  );
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14 }}>
        <View style={{ marginHorizontal: -20 }}><AppBar title="Raise funds" /></View>
        {badge === 'none' ? (
          <Hearth onPress={() => navigation.navigate('Badge')}>
            <Icon name="check-decagram-outline" size={32} color={c.ember} />
            <Txt v="h2" color={c.hink}>Apply for an investment badge</Txt>
            <Txt v="small" color={c.hmute}>Investors only fund farms we've reviewed for fundraising. It's separate from your seller verification.</Txt>
            <Button variant="hearth" title="Start application" onPress={() => navigation.navigate('Badge')} />
          </Hearth>
        ) : badge === 'pending' ? <Banner tone="warn" icon="clock-outline" title="Badge application in review" body="We're checking your documents. You can create offerings once it's approved." action="View" onAction={() => navigation.navigate('Badge')} />
          : badge === 'rejected' ? <Banner tone="err" title="Badge application needs changes" body={vendor.investment_badge_reason || 'We could not approve your documents.'} action="Reapply" onAction={() => navigation.navigate('Badge')} />
          : <Banner tone="ok" icon="check-decagram" title="Investment badge approved" body="You can publish offerings for investors to fund." />}
        <Txt v="h2">My offerings</Txt>
        {list === null ? <Skeleton h={120} r={20} /> : !list.length ? <Card><Txt v="small">{badge === 'approved' ? 'No offerings yet. Create your first one to start raising.' : 'Your offerings will appear here.'}</Txt></Card>
          : list.map((o) => (
            <Card key={o.id} onPress={() => navigation.navigate('OfferingForm', { id: o.id })}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><Txt v="bold" numberOfLines={1} style={{ flex: 1, fontSize: 16 }}>{o.title}</Txt><Pill tone={TONE[o.status]} label={INVEST_STATUS[o.status]} /></View>
              <Txt v="mono" style={{ fontSize: 13 }}>{naira(o.raised_amount)} <Txt v="small">of {naira(o.target_amount)} · {pct(o.projected_roi_pct, 1)} over {o.duration_months} mo</Txt></Txt>
              {o.status === 'rejected' && o.review_note ? <Txt v="small" color={c.err}>{o.review_note}</Txt> : null}
            </Card>
          ))}
        <View style={{ height: 64 }} />
      </ScrollView>
      {badge === 'approved' ? <Pressable accessibilityLabel="New offering" onPress={() => navigation.navigate('OfferingForm')} style={{ position: 'absolute', right: 20, bottom: 20, height: 56, paddingHorizontal: 20, borderRadius: 18, backgroundColor: c.yolk, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', elevation: 4 }}><Icon name="plus" size={24} color={c.onyolk} /><Txt v="bold" color={c.onyolk}>New offering</Txt></Pressable> : null}
    </Screen>
  );
}

export function BadgeScreen({ navigation }) {
  const { c } = useTheme();
  const { vendor, refresh } = useAuth();
  const badge = vendor?.investment_badge || 'none';
  const [docs, setDocs] = useState((vendor?.investment_docs || []).map((p) => ({ path: p, state: 'done' })));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(badge === 'none');
  const submit = async () => {
    const paths = docs.filter((d) => d.state === 'done').map((d) => d.path);
    if (!paths.length) return setErr('Upload at least one document');
    if (docs.some((d) => d.state === 'uploading')) return setErr('Wait for the uploads to finish');
    setBusy(true); setErr(null);
    try { await rpc('apply_investment_badge', { p_docs: paths }); await refresh(); setEditing(false); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const dev = async (status) => { await rpc('dev_set_badge', { p_status: status, p_reason: status === 'rejected' ? 'Please add your CAC certificate and clearer farm photos.' : null }); await refresh(); };
  if (!editing) return (
    <Screen scroll footer={badge === 'rejected' ? <Button title="Update documents and reapply" onPress={() => setEditing(true)} /> : badge === 'approved' ? <Button title="Back to Raise funds" onPress={() => navigation.goBack()} /> : null}>
      <AppBar title="Investment badge" />
      {badge === 'approved' ? <Banner tone="ok" icon="check-decagram" title="Your farm holds an investment badge" body="Investors see this badge next to your farm name." />
        : badge === 'rejected' ? <Card tone="err"><Txt v="label" color={c.err}>What to fix</Txt><Txt v="body">{vendor.investment_badge_reason || 'We could not approve your documents.'}</Txt></Card>
        : <Hearth><Icon name="clock-outline" size={32} color={c.hacc} /><Txt v="h2" color={c.hink}>Application submitted</Txt><Txt v="small" color={c.hmute}>We review badge applications within a few working days. This screen updates by itself.</Txt></Hearth>}
      <Card><Txt v="label">Documents on file</Txt><Txt v="bold">{(vendor?.investment_docs || []).length} uploaded</Txt></Card>
      {__DEV__ && badge === 'pending' ? <Card><Txt v="label">Developer only</Txt><View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" title="Approve" onPress={() => dev('approved')} style={{ flex: 1 }} /><Button small variant="outline" title="Reject" onPress={() => dev('rejected')} style={{ flex: 1 }} /></View></Card> : null}
    </Screen>
  );
  return (
    <Screen scroll footer={<Button title="Submit application" loading={busy} onPress={submit} />}>
      <AppBar title="Investment badge" />
      <Txt v="display" style={{ fontSize: 26, lineHeight: 30 }}>Show investors your farm is ready</Txt>
      <Txt v="body" color={c.mute}>We review these before any farm can raise money:</Txt>
      <Card>
        {[['certificate-outline', 'CAC certificate or business registration'], ['image-multiple-outline', 'Recent photos of your pens and birds'], ['notebook-outline', 'Your last 6 months of farm records']].map(([i, l]) => (
          <View key={l} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name={i} color={c.acc} /><Txt v="body" style={{ flex: 1 }}>{l}</Txt></View>))}
      </Card>
      <Txt v="strong" style={{ fontSize: 13 }}>Upload photos of your documents (up to 8)</Txt>
      <PhotoStrip photos={docs} setPhotos={(x) => { setDocs(x); setErr(null); }} bucket="id-docs" max={8} error={err} />
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="lock-outline" size={16} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Documents are stored privately and only seen by the Poultry360 review team.</Txt></View>
    </Screen>
  );
}

const BLANK = { title: '', summary: '', use_of_funds: '', target_amount: '', min_ticket: '10000', projected_roi_pct: '', duration_months: 6, payout_schedule: 'end_of_term', closes_at: isoDate(new Date(Date.now() + 14 * 864e5)) };

export function OfferingFormScreen({ navigation, route }) {
  const { c } = useTheme();
  const { vendor } = useAuth();
  const [id, setId] = useState(route.params?.id || null);
  const [o, setO] = useState(id ? undefined : null);   // the saved row, if any
  const [f, setF] = useState(BLANK);
  const [photos, setPhotos] = useState([]);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(null);
  const [count, setCount] = useState(null);
  const load = useCallback(async (oid) => {
    const { data } = await supabase.from('investment_offerings').select('*').eq('id', oid).maybeSingle();
    setO(data || null);
    if (!data) return;
    setF({ title: data.title || '', summary: data.summary || '', use_of_funds: data.use_of_funds || '', target_amount: String(Math.round(data.target_amount)), min_ticket: String(Math.round(data.min_ticket)),
      projected_roi_pct: String(Number(data.projected_roi_pct)), duration_months: data.duration_months, payout_schedule: data.payout_schedule, closes_at: data.closes_at ? isoDate(new Date(data.closes_at)) : BLANK.closes_at });
    setPhotos((data.photos || []).map((p) => ({ uri: publicUrl('listing-photos', p), path: p, state: 'done' })));
    rpc('investor_count', { p_kind: 'offering', p_target: oid }).then(setCount).catch(() => {});
  }, []);
  useEffect(() => { if (id) load(id); }, [id]);
  if (o === undefined) return <Screen><AppBar title="Offering" /><Skeleton h={200} r={20} /></Screen>;
  const status = o?.status || 'draft';
  const editable = status === 'draft' || status === 'rejected';
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: undefined })); };
  const num = (k) => (v) => set(k)(v.replace(k === 'projected_roi_pct' ? /[^\d.]/g : /\D/g, ''));
  const preview = { ...f, target_amount: Number(f.target_amount || 0), raised_amount: o?.raised_amount || 0, projected_roi_pct: Number(f.projected_roi_pct || 0), status: 'open',
    closes_at: f.closes_at + 'T23:59:00+01:00', vendor: { business_name: vendor?.business_name, investment_badge: vendor?.investment_badge }, _photoUri: photos.find((p) => p.state === 'done')?.uri };

  const validate = (strict) => {
    const e = {};
    if (!f.title.trim()) e.title = 'Add a title';
    if (strict) {
      if (!(Number(f.target_amount) >= 100000)) e.target_amount = 'Target must be at least ₦100,000';
      if (!(Number(f.min_ticket) > 0)) e.min_ticket = 'Enter a minimum';
      else if (Number(f.min_ticket) > Number(f.target_amount)) e.min_ticket = "Can't be more than the target";
      if (f.projected_roi_pct === '' || !(Number(f.projected_roi_pct) >= 0 && Number(f.projected_roi_pct) <= 100)) e.projected_roi_pct = 'Between 0 and 100';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.closes_at)) e.closes_at = 'Use YYYY-MM-DD';
      else if (new Date(f.closes_at + 'T23:59:00+01:00').getTime() < Date.now() + 3 * 864e5) e.closes_at = 'Must be at least 3 days away';
      if (!f.summary.trim()) e.summary = 'Tell investors about your farm';
      if (!f.use_of_funds.trim()) e.use_of_funds = 'Say what the money will pay for';
    }
    setErrs(e); return !Object.keys(e).length;
  };
  const payload = () => ({ title: f.title.trim(), summary: f.summary.trim(), use_of_funds: f.use_of_funds.trim(), photos: photos.filter((p) => p.state === 'done').map((p) => p.path),
    target_amount: Number(f.target_amount || 0) || 1, min_ticket: Number(f.min_ticket || 0) || 10000, projected_roi_pct: Number(f.projected_roi_pct || 0), duration_months: f.duration_months,
    payout_schedule: f.payout_schedule, closes_at: /^\d{4}-\d{2}-\d{2}$/.test(f.closes_at) ? f.closes_at + 'T23:59:00+01:00' : null });
  const save = async (thenSubmit) => {
    if (!validate(thenSubmit)) return;
    if (photos.some((p) => p.state === 'uploading')) return Alert.alert('Photos are still uploading', 'Give them a moment, then try again.');
    setBusy(thenSubmit ? 'submit' : 'save');
    try {
      const oid = await rpc('save_offering', { p_id: id, p: payload() });
      setId(oid);
      if (thenSubmit) { await rpc('submit_offering', { p_id: oid }); await load(oid); }
      else navigation.goBack();
    } catch (e) { Alert.alert("Couldn't save", friendlyError(e)); } finally { setBusy(null); }
  };
  const devApprove = async () => { await rpc('dev_review_offering', { p_id: id, p_approve: true }); load(id); };

  if (!editable) return (
    <Screen scroll>
      <AppBar title="Offering" />
      <Pill tone={TONE[status]} label={INVEST_STATUS[status]} />
      {status === 'pending_review' ? <Banner tone="warn" icon="clock-outline" title="In review" body="We check every offering before investors see it. You can't edit it while it's in review." /> : null}
      {status === 'suspended' ? <Banner tone="warn" title="New investment paused" body="This offering is paused while we review your farm's verification or badge." /> : null}
      {status === 'refunded' ? <Banner tone="info" title="Closed without reaching its target" body="Investors were refunded in full. You can create a new offering." /> : null}
      <OfferingCard o={{ ...o, vendor: { business_name: vendor?.business_name, investment_badge: vendor?.investment_badge } }} />
      {status !== 'pending_review' ? <Card><Txt v="label">Investors</Txt><Txt v="mono" style={{ fontSize: 20 }}>{count ?? '—'}</Txt>
        <Txt v="small">{status === 'funded' ? 'Fully funded. Poultry360 will start the term and release the money to your wallet.' : status === 'active' ? 'The term is running. Returns are paid to investors from your wallet.' : ''}</Txt></Card> : null}
      {o.summary ? <><Txt v="label">About</Txt><Txt v="body">{o.summary}</Txt></> : null}
      {o.use_of_funds ? <><Txt v="label">Use of funds</Txt><Txt v="body">{o.use_of_funds}</Txt></> : null}
      {__DEV__ && status === 'pending_review' ? <Card><Txt v="label">Developer only</Txt><Button small variant="outline" title="Approve (dev)" onPress={devApprove} /></Card> : null}
    </Screen>
  );
  return (
    <Screen scroll footer={<View style={{ flexDirection: 'row', gap: 10 }}><Button variant="outline" title="Save draft" loading={busy === 'save'} disabled={!!busy} onPress={() => save(false)} style={{ flex: 1 }} /><Button title="Submit for review" loading={busy === 'submit'} disabled={!!busy} onPress={() => save(true)} style={{ flex: 1.3 }} /></View>}>
      <AppBar title={id ? 'Edit offering' : 'New offering'} close />
      {status === 'rejected' && o?.review_note ? <Card tone="err"><Txt v="label" color={c.err}>Changes needed</Txt><Txt v="body">{o.review_note}</Txt></Card> : null}
      {vendor?.investment_badge !== 'approved' ? <Banner tone="info" title="You can save a draft now" body="Submitting for review unlocks once your investment badge is approved." /> : null}
      <PhotoStrip photos={photos} setPhotos={setPhotos} bucket="listing-photos" />
      <Input label="Title" value={f.title} onChangeText={set('title')} placeholder="Expand our layer house to 5,000 birds" error={errs.title} />
      <Input label="About your farm" value={f.summary} onChangeText={set('summary')} multiline placeholder="How long you've farmed, what you produce, who buys from you" error={errs.summary} />
      <Input label="Use of funds" value={f.use_of_funds} onChangeText={set('use_of_funds')} multiline placeholder="e.g. 2,000 point-of-lay birds, feed for 3 months, a second battery cage" error={errs.use_of_funds} />
      <Input label="Target amount" prefix="₦" keyboardType="number-pad" value={f.target_amount} onChangeText={num('target_amount')} mono error={errs.target_amount} hint="At least ₦100,000" />
      <Input label="Minimum investment" prefix="₦" keyboardType="number-pad" value={f.min_ticket} onChangeText={num('min_ticket')} mono error={errs.min_ticket} />
      <Input label="Projected return over the whole term" suffix="%" keyboardType="decimal-pad" value={f.projected_roi_pct} onChangeText={num('projected_roi_pct')} mono error={errs.projected_roi_pct}
        hint="Total profit as a % of what's invested, not a yearly rate. Be realistic: investors see projected against actual." />
      <Txt v="strong" style={{ fontSize: 13 }}>Term</Txt>
      <ChipRow options={['3 months', '6 months', '9 months', '12 months']} value={f.duration_months + ' months'} onChange={(v) => set('duration_months')(parseInt(v, 10))} />
      <Txt v="strong" style={{ fontSize: 13 }}>Payout schedule</Txt>
      <Segmented options={[{ value: 'end_of_term', label: 'End of term' }, { value: 'monthly', label: 'Monthly' }]} value={f.payout_schedule} onChange={set('payout_schedule')} />
      <DateInput label="Closing date" value={f.closes_at} onChange={set('closes_at')} min={isoDate(new Date(Date.now() + 3 * 864e5))} error={errs.closes_at} hint="If the target isn't reached by this date, investors are refunded in full." />
      <Txt v="label">How investors will see it</Txt>
      <OfferingCard o={preview} />
      <Txt v="small">{ESTIMATE_COPY}</Txt>
    </Screen>
  );
}
