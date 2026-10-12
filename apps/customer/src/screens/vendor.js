import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Image, ScrollView, RefreshControl, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Skeleton, Sheet, useTick,
  naira, countdown, rpc, publicUrl, uploadImage, friendlyError, timeAgo, STATUS_LABEL, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { INVEST_ENABLED } from '../lib/roi';
import { CATEGORIES, WASTE_CATEGORIES, UNITS, catLabel } from '../lib/catalog';

function RoleSwitch() {
  const { c, f } = useTheme();
  const { multiRole, setActiveRole } = useAuth();
  if (!multiRole) return null;
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.sf, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: c.line }}>
      <Pressable onPress={() => setActiveRole('buyer')} style={{ paddingHorizontal: 14, height: 40, justifyContent: 'center' }}><Txt v="strong" color={c.mute} style={{ fontSize: 12 }}>Buy</Txt></Pressable>
      <View style={{ paddingHorizontal: 14, height: 40, justifyContent: 'center', borderRadius: 100, backgroundColor: c.yolk }}><Txt v="bold" color="#2A2119" style={{ fontSize: 12 }}>Sell</Txt></View>
    </View>
  );
}

function VerifyBanner({ navigation }) {
  const { vendor } = useAuth();
  if (!vendor || vendor.verification_status === 'approved') return null;
  return vendor.verification_status === 'rejected'
    ? <Banner tone="err" title="Action needed on your verification" body={vendor.rejection_reason} action="Fix" onAction={() => navigation.navigate('Pending')} />
    : <Banner tone="warn" icon="timer-sand" title="Verification in review" body="Farm Hub is open now. Listings unlock once you're approved." action="Status" onAction={() => navigation.navigate('Pending')} />;
}

export function VendorHomeScreen({ navigation }) {
  const { c } = useTheme();
  const { profile, vendor, wallet, refreshWallet } = useAuth();
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  useTick(1000);
  const load = useCallback(async () => { setBusy(true); try { setOrders(await rpc('vendor_orders')); refreshWallet(); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const need = (orders || []).filter((o) => o.status === 'placed' || o.status === 'confirmed');
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => navigation.navigate('Profile')} style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Txt v="h1" numberOfLines={1} style={{ flexShrink: 1 }}>{vendor?.business_name || 'Your farm'}</Txt>{vendor?.verification_status === 'approved' ? <Icon name="check-decagram" color={c.acc} /> : null}</View>
            <Txt v="small">Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {(profile?.full_name || '').split(' ')[0]}</Txt>
          </Pressable>
          <RoleSwitch />
        </View>
        <VerifyBanner navigation={navigation} />
        {!vendor ? <Card><Txt v="bold">Finish setting up your farm</Txt><Button small title="Add business details" onPress={() => navigation.navigate('Business')} /></Card> : null}
        <Hearth onPress={() => navigation.navigate('Wallet')}>
          <Txt v="label" color={c.hmute}>Available payout</Txt>
          <Txt v="monoLg" color={c.hink} style={{ fontSize: 34 }}>{naira(wallet?.balance)}</Txt>
          <Txt v="small" color={c.hmute}>Net after 10% commission · <Txt v="bold" color={c.yolk} style={{ fontSize: 13 }}>Withdraw</Txt></Txt>
        </Hearth>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt v="h2">Needs your action</Txt>{need.length ? <Pill tone="live" label={String(need.length)} /> : null}</View>
        {orders === null ? <Skeleton h={110} r={20} /> : !need.length ? <Card><Txt v="small">You're all caught up. New orders appear here with a 24-hour timer.</Txt></Card>
          : need.slice(0, 3).map((o) => {
            const cd = countdown(o.sla_deadline);
            return (
              <Card key={o.id} onPress={() => navigation.navigate('VendorOrder', { id: o.id })} style={{ borderWidth: 2, borderColor: o.status === 'placed' && cd.ms < 3 * 3.6e6 ? c.err : c.ember }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="bold" numberOfLines={1} style={{ flex: 1 }}>{(o.items || []).map((i) => i.qty + ' × ' + i.title).join(', ')}</Txt>
                  {o.status === 'placed' ? <Txt v="mono" color={c.acc} style={{ fontSize: 13 }}>{cd.text}</Txt> : <Pill tone="warn" label="Prepare" />}</View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="small">{o.buyer}{o.area ? ', ' + o.area : ''}</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(o.items_total)}</Txt></View>
              </Card>
            );
          })}
        <Txt v="h2">Run your farm</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[['Farm Hub', 'barn', 't4', () => navigation.navigate('FarmHome')], ['Vet care', 'stethoscope', 't2', () => navigation.navigate('VetHome')], ['Sell waste', 'sprout-outline', 't3', () => navigation.navigate('WasteHome')],
            ...(INVEST_ENABLED ? [['Raise funds', 'cash-plus', 't1', () => navigation.navigate('RaiseHome')]] : [])].map(([l, i, t, fn]) => (
            <Pressable key={l} onPress={fn} style={{ flexBasis: '45%', flexGrow: 1, minHeight: 88, borderRadius: 18, backgroundColor: c[t], padding: 12, gap: 10, justifyContent: 'space-between' }}><Icon name={i} color={c[t + 'i']} /><Txt v="bold" style={{ fontSize: 13 }}>{l}</Txt></Pressable>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function MyListingsScreen({ navigation }) {
  const { c } = useTheme();
  const { uid, vendor } = useAuth();
  const [tab, setTab] = useState('live');
  const [rows, setRows] = useState(null);
  const load = useCallback(async () => { const { data } = await supabase.from('listings').select('*').eq('vendor_id', uid).order('updated_at', { ascending: false }); setRows(data || []); }, [uid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (vendor?.verification_status !== 'approved') return (
    <Screen><Txt v="display" style={{ fontSize: 28, marginTop: 8 }}>My listings</Txt>
      <View style={{ flex: 1, justifyContent: 'center' }}><Empty icon="lock-clock" title="Listings unlock once you're verified" body={vendor ? 'We are reviewing ' + vendor.business_name + '. You can still save drafts.' : 'Add your business details to apply.'}
        action={vendor ? 'Save a draft listing' : 'Add business details'} onAction={() => navigation.navigate(vendor ? 'ListingForm' : 'Business')} /></View></Screen>
  );
  const groups = { live: (rows || []).filter((r) => r.status === 'live' && r.quantity > 0), draft: (rows || []).filter((r) => r.status !== 'live'), out: (rows || []).filter((r) => r.status === 'live' && r.quantity === 0) };
  const list = groups[tab];
  const toggle = async (r) => { const { error } = await supabase.from('listings').update({ status: r.status === 'live' ? 'unpublished' : 'live' }).eq('id', r.id); if (error) alert(friendlyError(error)); load(); };
  const menu = (r) => Alert.alert(r.title, null, [
    { text: 'Edit', onPress: () => navigation.navigate('ListingForm', { id: r.id, waste: r.is_waste }) },
    { text: r.status === 'live' ? 'Unpublish' : 'Publish', onPress: () => toggle(r) },
    { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('listings').delete().eq('id', r.id); load(); } },
    { text: 'Cancel', style: 'cancel' },
  ]);
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 100 }}>
        <Txt v="display" style={{ fontSize: 28 }}>My listings</Txt>
        <Segmented options={[{ value: 'live', label: 'Live · ' + groups.live.length }, { value: 'draft', label: 'Drafts · ' + groups.draft.length }, { value: 'out', label: 'Sold out · ' + groups.out.length }]} value={tab} onChange={setTab} />
        {rows === null ? <Skeleton h={84} r={20} /> : !list.length ? <Empty icon="package-variant" title={tab === 'live' ? 'Nothing live yet' : tab === 'draft' ? 'No drafts' : 'Nothing sold out'} body="Add a listing and it goes live in under a minute." />
          : list.map((r) => (
            <Card key={r.id} onPress={() => navigation.navigate('ListingForm', { id: r.id, waste: r.is_waste })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
              {r.photos?.[0] ? <Image source={{ uri: publicUrl('listing-photos', r.photos[0]) }} style={{ width: 60, height: 60, borderRadius: 14 }} /> : <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: c.sf2 }} />}
              <View style={{ flex: 1, gap: 3 }}><Txt v="bold" numberOfLines={1}>{r.title}</Txt><Txt v="label">{naira(r.price)} · {r.quantity} in stock</Txt>
                <Pill tone={r.status !== 'live' ? 'neutral' : r.quantity === 0 ? 'err' : r.quantity < 15 ? 'warn' : 'ok'} label={r.status !== 'live' ? (r.status === 'draft' ? 'Draft' : 'Unpublished') : r.quantity === 0 ? 'Sold out · hidden' : r.quantity < 15 ? 'Low stock' : 'Live'} /></View>
              <Pressable onPress={() => menu(r)} hitSlop={10} accessibilityLabel="More"><Icon name="dots-vertical" color={c.mute} /></Pressable>
            </Card>
          ))}
      </ScrollView>
      <Pressable onPress={() => navigation.navigate('ListingForm')} style={{ position: 'absolute', right: 20, bottom: 20, height: 56, paddingHorizontal: 20, borderRadius: 18, backgroundColor: c.yolk, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4 }}>
        <Icon name="plus" color="#2A2119" /><Txt v="bold" color="#2A2119">Add listing</Txt>
      </Pressable>
    </Screen>
  );
}

export function ListingFormScreen({ navigation, route }) {
  const { c } = useTheme();
  const { uid, vendor } = useAuth();
  const id = route.params?.id; const waste = !!route.params?.waste;
  const cats = waste ? WASTE_CATEGORIES : CATEGORIES;
  const [f, setF] = useState({ category: cats[0].id, title: '', price: '', unit: waste ? 'bag' : 'crate', quantity: '', description: '', moisture: '' });
  const [photos, setPhotos] = useState([]); // { uri, path, state }
  const [errs, setErrs] = useState({});
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => {
    if (!id) return;
    supabase.from('listings').select('*').eq('id', id).single().then(({ data: l }) => {
      if (!l) return;
      setF({ category: l.category, title: l.title, price: String(l.price), unit: l.unit, quantity: String(l.quantity), description: l.description || '', moisture: l.attributes?.moisture ? String(l.attributes.moisture) : '' });
      setPhotos((l.photos || []).map((p) => ({ uri: publicUrl('listing-photos', p), path: p, state: 'done' })));
    });
  }, [id]);
  const addPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 4 - photos.length });
    if (r.canceled) return;
    r.assets.forEach(async (a) => {
      setPhotos((p) => [...p, { uri: a.uri, state: 'uploading' }]);
      try { const path = await uploadImage('listing-photos', uid, a.uri); setPhotos((p) => p.map((x) => (x.uri === a.uri ? { ...x, path, state: 'done' } : x))); }
      catch { setPhotos((p) => p.map((x) => (x.uri === a.uri ? { ...x, state: 'failed' } : x))); }
    });
  };
  const validate = () => {
    const e = {};
    if (!photos.some((p) => p.state === 'done')) e.photos = 'Add at least 1 photo';
    if (!f.title.trim()) e.title = 'Add a title';
    if (!(Number(f.price) > 0)) e.price = 'Enter a price';
    if (!(parseInt(f.quantity, 10) > 0)) e.quantity = 'Must be at least 1';
    setErrs(e); return !Object.keys(e).length;
  };
  const save = async (status) => {
    if (status === 'live' && !validate()) return setPreview(false);
    setBusy(true);
    const row = { vendor_id: uid, category: f.category, is_waste: waste, title: f.title.trim() || 'Untitled draft', description: f.description || null,
      price: Number(f.price) || 1, unit: f.unit, quantity: parseInt(f.quantity, 10) || 0, status,
      photos: photos.filter((p) => p.path).map((p) => p.path), attributes: waste && f.moisture ? { moisture: Number(f.moisture) } : {} };
    const { error } = id ? await supabase.from('listings').update(row).eq('id', id) : await supabase.from('listings').insert(row);
    setBusy(false);
    if (error) return alert(friendlyError(error));
    navigation.goBack();
  };
  const uploading = photos.some((p) => p.state === 'uploading');
  if (preview) return (
    <Screen scroll footer={<><Button title="Publish listing" loading={busy} onPress={() => save('live')} disabled={vendor?.verification_status !== 'approved'} /><Button variant="ghost" title="Save as draft" onPress={() => save('draft')} /></>}>
      <AppBar title="Preview" onBack={() => setPreview(false)} />
      <Txt v="small">This is how buyers will see your listing.</Txt>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {photos[0] ? <Image source={{ uri: photos[0].uri }} style={{ height: 200 }} /> : <View style={{ height: 200, backgroundColor: c.sf2 }} />}
        <View style={{ padding: 16, gap: 6 }}><Txt v="small">{vendor?.business_name}</Txt><Txt v="h1">{f.title}</Txt><Txt v="monoLg" style={{ fontSize: 22 }}>{naira(f.price)} <Txt v="small">/ {f.unit}</Txt></Txt>
          <Txt v="small">{f.quantity} available · Delivered by Poultry360</Txt></View>
      </Card>
      {vendor?.verification_status !== 'approved' ? <Banner tone="warn" title="Publishing unlocks after verification" body="Save as a draft for now. It's ready to publish once you're approved." /> : <Banner tone="info" icon="lightning-bolt-outline" body={'Goes live in under a minute. It can also fill nearby "' + catLabel(f.category).toLowerCase() + '" searches.'} />}
    </Screen>
  );
  return (
    <Screen scroll footer={<View style={{ flexDirection: 'row', gap: 10 }}><Button variant="outline" title="Save draft" onPress={() => save('draft')} style={{ flex: 1 }} /><Button title="Preview" disabled={uploading} onPress={() => validate() && setPreview(true)} style={{ flex: 1 }} /></View>}>
      <AppBar title={id ? 'Edit listing' : waste ? 'Sell waste' : 'New listing'} close />
      {Object.keys(errs).length ? <Banner tone="err" title={'Fix ' + Object.keys(errs).length + ' thing' + (Object.keys(errs).length > 1 ? 's' : '') + ' before previewing'} /> : null}
      <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
        {photos.map((p, i) => (
          <Pressable key={p.uri} onPress={() => setPhotos(photos.filter((_, j) => j !== i))} style={{ width: 84, height: 84, borderRadius: 16, overflow: 'hidden', backgroundColor: c.sf2 }}>
            <Image source={{ uri: p.uri }} style={{ width: 84, height: 84, opacity: p.state === 'done' ? 1 : 0.4 }} />
            {p.state !== 'done' ? <View style={{ position: 'absolute', inset: 0, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><Icon name={p.state === 'failed' ? 'alert-circle' : 'cloud-upload-outline'} color={p.state === 'failed' ? c.err : c.ink} /></View> : null}
          </Pressable>
        ))}
        {photos.length < 4 ? <Pressable onPress={addPhoto} style={{ width: 84, height: 84, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: errs.photos ? c.err : c.line2, alignItems: 'center', justifyContent: 'center' }}><Icon name="camera-plus-outline" color={errs.photos ? c.err : c.acc} /></Pressable> : null}
      </ScrollView>
      {errs.photos ? <Txt v="small" color={c.err}>{errs.photos}</Txt> : null}
      <Txt v="strong" style={{ fontSize: 13 }}>{waste ? 'Type' : 'Category'}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{cats.map((k) => <Chip key={k.id} label={k.label} selected={f.category === k.id} onPress={() => set('category')(k.id)} />)}</View>
      <Input label="Title" value={f.title} onChangeText={set('title')} placeholder={waste ? 'Dry layer manure, 50 kg bag' : 'Jumbo eggs, crate of 30'} error={errs.title} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Input label="Price" prefix="₦" keyboardType="number-pad" value={f.price} onChangeText={(t) => set('price')(t.replace(/[^\d.]/g, ''))} mono error={errs.price} /></View>
        <View style={{ flex: 1 }}><Input label="Quantity" keyboardType="number-pad" value={f.quantity} onChangeText={(t) => set('quantity')(t.replace(/\D/g, ''))} mono error={errs.quantity} /></View>
      </View>
      <Txt v="strong" style={{ fontSize: 13 }}>Sold per</Txt>
      <ChipRow options={waste ? ['bag', 'tonne'] : UNITS.filter((u) => u !== 'tonne')} value={f.unit} onChange={set('unit')} />
      {waste ? <Input label="Moisture % (optional)" keyboardType="number-pad" value={f.moisture} onChangeText={(t) => set('moisture')(t.replace(/\D/g, '').slice(0, 2))} mono /> : null}
      <Input label="Description (optional)" value={f.description} onChangeText={set('description')} multiline placeholder="How it's raised, graded or packed" />
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="truck-delivery-outline" size={16} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>{waste ? 'Orders over 1 tonne may need a scheduled truck pickup. We confirm the time with you.' : 'No delivery setup needed. Poultry360 riders collect from your farm.'}</Txt></View>
    </Screen>
  );
}

export function VendorOrdersScreen({ navigation }) {
  const { c } = useTheme();
  const [tab, setTab] = useState('new');
  const [rows, setRows] = useState(null);
  useTick(1000);
  const load = useCallback(async () => setRows((await rpc('vendor_orders')) || []), []);
  useFocusEffect(useCallback(() => { load(); const ch = supabase.channel('vo').on('postgres_changes', { event: '*', schema: 'public', table: 'sub_orders' }, load).on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, load).subscribe(); return () => { supabase.removeChannel(ch); }; }, [load]));
  const g = { new: (rows || []).filter((r) => r.status === 'placed'), active: (rows || []).filter((r) => ['confirmed', 'ready', 'picked_up', 'out_for_delivery'].includes(r.status)), past: (rows || []).filter((r) => ['delivered', 'refunded', 'cancelled', 'flagged'].includes(r.status)) };
  const list = g[tab];
  return (
    <Screen scroll>
      <Txt v="display" style={{ fontSize: 28 }}>Orders</Txt>
      <Segmented options={[{ value: 'new', label: 'New · ' + g.new.length }, { value: 'active', label: 'Active · ' + g.active.length }, { value: 'past', label: 'Past' }]} value={tab} onChange={setTab} />
      {rows === null ? <Skeleton h={100} r={20} /> : !list.length ? <Empty icon="receipt-text-outline" title={tab === 'new' ? 'No new orders' : 'Nothing here yet'} body="New orders appear here with a 24-hour timer. We'll also notify you." />
        : list.map((o) => {
          const cd = countdown(o.sla_deadline); const urgent = o.status === 'placed' && cd.ms < 3 * 3.6e6;
          return (
            <Card key={o.id} onPress={() => navigation.navigate('VendorOrder', { id: o.id })} style={o.status === 'placed' ? { borderWidth: 2, borderColor: urgent ? c.err : c.ember } : null}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="label">{o.code}</Txt>
                {o.status === 'placed' ? <Txt v="mono" color={urgent ? c.err : c.acc} style={{ fontSize: 12 }}>{cd.text} LEFT</Txt> : <Pill tone={o.status === 'delivered' ? 'ok' : ['refunded', 'flagged'].includes(o.status) ? 'err' : 'warn'} label={STATUS_LABEL[o.status]} />}</View>
              <Txt v="bold">{(o.items || []).map((i) => i.qty + ' × ' + i.title).join(', ')}</Txt>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="small">{o.buyer}{o.area ? ', ' + o.area : ''}</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(o.items_total)}</Txt></View>
              {urgent ? <Txt v="small" color={c.err}>If you don't respond, this order will be refunded to the buyer.</Txt> : null}
            </Card>
          );
        })}
    </Screen>
  );
}

const DECLINE = ['Out of stock', "Can't prepare in time", 'Other'];
export function VendorOrderScreen({ navigation, route }) {
  const { c } = useTheme();
  const [o, setO] = useState(null);
  const [busy, setBusy] = useState(false);
  const [decl, setDecl] = useState(false);
  const [reason, setReason] = useState(null);
  const [checks, setChecks] = useState([false, false, false]);
  const [pickup, setPickup] = useState({ riders: [], available_now: 0 });
  const [choose, setChoose] = useState(false);
  useTick(1000);
  const load = useCallback(async () => {
    const [list, opts] = await Promise.all([rpc('vendor_orders'), rpc('vendor_pickup_riders').catch(() => null)]);
    setO((list || []).find((x) => x.id === route.params.id));
    if (opts) setPickup(opts);
  }, [route.params.id]);
  useEffect(() => {
    load();
    // Live: rider accepted / arrived / picked up shows here without reopening the order.
    const ch = supabase.channel('vorder-' + route.params.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_assignments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sub_orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);
  const markReady = (riderId) => act(async () => {
    setChoose(false);
    const r = await rpc('vendor_mark_ready', { p_sub: o.id, p_rider: riderId || null });
    if (r.joined) Alert.alert('Added to ' + r.rider + "'s pickup", 'They will collect it with your other orders.');
    else if (!r.assigned) Alert.alert('Finding a rider', "Every rider is busy right now. The next rider who finishes a delivery gets this order straight away.");
  });
  const act = async (fn) => { setBusy(true); try { await fn(); await load(); } catch (e) { alert(friendlyError(e)); } finally { setBusy(false); } };
  if (!o) return <Screen><AppBar /><Skeleton h={200} r={20} /></Screen>;
  const cd = countdown(o.sla_deadline);
  const summary = (o.items || []).map((i) => i.qty + ' × ' + i.title).join(', ');
  const money = (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body">Gross</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(o.items_total)}</Txt></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body" color={c.mute}>Commission · 10%</Txt><Txt v="mono" color={c.mute} style={{ fontSize: 14 }}>−{naira(o.commission)}</Txt></View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}><Txt v="bold">You receive</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(o.net)}</Txt></View>
    </Card>
  );
  if (o.status === 'placed') return (
    <Screen scroll footer={<View style={{ flexDirection: 'row', gap: 10 }}><Button variant="outline" title="Decline" onPress={() => setDecl(true)} style={{ width: 120 }} /><Button title="Accept order" loading={busy} onPress={() => act(() => rpc('vendor_respond', { p_sub: o.id, p_accept: true }))} style={{ flex: 1 }} /></View>}>
      <AppBar title={o.code} />
      <Hearth><View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}><Icon name="timer-outline" size={30} color={c.ember} /><View><Txt v="monoLg" color={c.hink} style={{ fontSize: 26 }}>{cd.text}</Txt><Txt v="small" color={c.hmute}>left to accept · auto-refunds after 24 h</Txt></View></View></Hearth>
      <Txt v="h1">{summary}</Txt>
      <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name="account-outline" /><View><Txt v="bold">{o.buyer}</Txt><Txt v="small">{o.area}</Txt></View></Card>
      {money}
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="motorbike" size={18} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Once you mark it ready, a Poultry360 rider collects it. Your part ends at handoff.</Txt></View>
      <Sheet visible={decl} onClose={() => setDecl(false)}>
        <Txt v="h1">Why are you declining?</Txt>
        <ChipRow options={DECLINE} value={reason} onChange={setReason} />
        <Txt v="small">The buyer is refunded straight away.</Txt>
        <Button variant="danger" title="Decline order" disabled={!reason} loading={busy} onPress={() => { setDecl(false); act(() => rpc('vendor_respond', { p_sub: o.id, p_accept: false, p_reason: reason })); }} />
      </Sheet>
    </Screen>
  );
  if (o.status === 'confirmed') return (
    <Screen scroll footer={<Button title="Mark ready for pickup" icon="check-all" disabled={!checks.every(Boolean)} loading={busy}
      onPress={() => (pickup.riders.length ? setChoose(true) : markReady(null))} />}>
      <AppBar title={o.code} />
      <Pill tone="ok" label="Accepted" />
      <Txt v="display">Prepare {summary} for pickup</Txt>
      <Card style={{ padding: 0 }}>{['Count the items against the order', 'Remove anything damaged or below grade', 'Pack and place by the farm gate'].map((t, i) => (
        <Pressable key={t} onPress={() => setChecks(checks.map((v, j) => (j === i ? !v : v)))} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 16, borderBottomWidth: i < 2 ? 1 : 0, borderColor: c.line }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: checks[i] ? c.ember : 'transparent', borderWidth: checks[i] ? 0 : 2, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>{checks[i] ? <Icon name="check" size={18} color="#17120E" /> : null}</View>
          <Txt v="body" style={{ flex: 1 }}>{t}</Txt></Pressable>))}</Card>
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="clipboard-check-outline" size={18} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>The rider checks quantity and condition against your listing at pickup.</Txt></View>
      <Sheet visible={choose} onClose={() => setChoose(false)}>
        <Txt v="h1">Who should collect it?</Txt>
        <Txt v="small" style={{ fontSize: 14 }}>A rider is already coming for your other orders. They can carry up to 4 orders per trip.</Txt>
        {pickup.riders.map((r) => (
          <Card key={r.id} onPress={() => markReady(r.id)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icon name="motorbike" color={c.acc} />
            <View style={{ flex: 1 }}>
              <Txt v="bold">Add to {r.name.split(' ')[0]}'s pickup</Txt>
              <Txt v="small">{r.at_farm ? 'At your farm now' : r.awaiting_accept ? 'Waiting for them to accept' : 'On the way to you'} · {r.orders} of 4 orders · {r.vehicle}{r.plate ? ' ' + r.plate : ''}</Txt>
            </View>
            <Icon name="chevron-right" color={c.mute} />
          </Card>
        ))}
        <Button variant="outline" icon="plus" title="Request a new rider" loading={busy} onPress={() => markReady(null)} />
        <Txt v="small" style={{ textAlign: 'center' }}>{pickup.available_now ? pickup.available_now + ' rider' + (pickup.available_now === 1 ? '' : 's') + ' free right now' : 'No riders free right now. The next one to finish a delivery gets it.'}</Txt>
      </Sheet>
    </Screen>
  );
  return (
    <Screen scroll>
      <AppBar title={o.code} />
      <Pill tone={o.status === 'delivered' ? 'ok' : ['refunded', 'flagged'].includes(o.status) ? 'err' : 'live'} label={STATUS_LABEL[o.status]} />
      <Txt v="h1">{summary}</Txt>
      {o.rider ? <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Icon name="motorbike" />
          <View style={{ flex: 1 }}><Txt v="bold">{o.rider.name}{o.status === 'ready' ? ({ offered: ' · waiting to accept', accepted: ' is on the way', at_farm: ' is at your farm' }[o.rider.status] || '') : ''}</Txt>
            <Txt v="label">{o.rider.vehicle}{o.rider.plate ? ' · ' + o.rider.plate : ''}</Txt></View>
          {o.status === 'ready' && o.rider.phone ? <Button small variant="outline" icon="phone" title="Call" onPress={() => Linking.openURL('tel:+' + o.rider.phone)} /> : null}</Card>
        : o.status === 'ready' ? <Banner tone="warn" icon="motorbike" title="Finding a rider"
            body={pickup.available_now ? pickup.available_now + ' rider' + (pickup.available_now === 1 ? ' is' : 's are') + ' free nearby. This updates as soon as one accepts.' : 'All riders are on deliveries. The next one to finish gets your order straight away.'} /> : null}
      {money}
      {o.on_credit ? <Banner tone="info" icon="credit-card-clock-outline" title="Sold on credit" body={'The buyer chose pay later, so ' + naira(o.items_total) + ' is in your Farm Book as payment pending. You are not paid at delivery for this order.'} action="Open Farm Book" onAction={() => navigation.navigate('FarmBook')} />
        : o.status === 'delivered' ? <Banner tone="ok" title={naira(o.net) + ' added to your wallet'} /> : null}
    </Screen>
  );
}
