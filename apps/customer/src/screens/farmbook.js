import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, ScrollView, Image, RefreshControl, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Group, Row, Skeleton, Sheet,
  naira, isoDate, shortDate, rpc, uploadImage, friendlyError, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';

const THRESHOLD = { individual: 50000, business: 300000 };
const entryPill = (e) => (e.status === 'paid' ? { tone: 'ok', label: 'Payment completed' } : e.overdue ? { tone: 'err', label: 'Overdue' } : { tone: 'warn', label: 'Payment pending' });
const typeLabel = (t) => (t === 'business' ? 'Business' : 'Individual');

// ---------- Farm side ----------
export function FarmBookScreen({ navigation }) {
  const { c } = useTheme();
  const [book, setBook] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('pending');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setBook(await rpc('farm_book')); setErr(null); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const pending = (book?.entries || []).filter((e) => e.status === 'pending');
  const paid = (book?.entries || []).filter((e) => e.status === 'paid');
  const qualifying = (book?.eligible || []).filter((x) => x.qualifies);
  const rows = tab === 'pending' ? pending : paid;
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14, paddingBottom: 100 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <View style={{ marginHorizontal: -20 }}><AppBar title="Farm Book" subtitle="Sales on credit" /></View>
        {err ? <Banner tone="err" title="Couldn't load your book" body={err} action="Retry" onAction={load} /> : null}
        {book === null && !err ? <Skeleton h={140} r={24} /> : null}
        {book ? <>
          <Hearth>
            <Txt v="label" color={c.hmute}>Customers owe you</Txt>
            <Txt v="monoLg" color={c.hink} style={{ fontSize: 34 }}>{naira(book.outstanding)}</Txt>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <View><Txt v="label" color={c.hmute}>Overdue</Txt><Txt v="mono" color={Number(book.overdue) ? c.ember : c.hink}>{naira(book.overdue)}</Txt></View>
              <View><Txt v="label" color={c.hmute}>Collected · 30 days</Txt><Txt v="mono" color={c.hink}>{naira(book.collected_30d)}</Txt></View>
            </View>
          </Hearth>
          {qualifying.length ? <Banner tone="info" icon="account-star-outline" title={qualifying.length + ' customer' + (qualifying.length === 1 ? ' has' : 's have') + ' bought enough to qualify for credit'} body="Choose who you trust to pay later." action="Review" onAction={() => setTab('customers')} /> : null}
          <Segmented options={[{ value: 'pending', label: 'Pending' + (pending.length ? ' · ' + pending.length : '') }, { value: 'paid', label: 'Paid' }, { value: 'customers', label: 'Customers' }]} value={tab} onChange={setTab} />
          {tab !== 'customers' ? (
            !rows.length ? <Empty icon={tab === 'pending' ? 'check-circle-outline' : 'receipt-text-outline'} title={tab === 'pending' ? 'Nobody owes you right now' : 'No payments recorded yet'}
              body={tab === 'pending' ? 'When a customer takes goods without paying, write it down here so nothing is forgotten.' : 'Paid entries appear here once you upload a receipt or a buyer pays in the app.'} />
              : <Group>{rows.map((e, i) => { const p = entryPill(e); return (
                <Row key={e.id} last={i === rows.length - 1} icon={e.on_app ? 'cellphone-check' : 'account-outline'} title={e.customer}
                  subtitle={e.description + (e.status === 'pending' && e.due_date ? ' · due ' + shortDate(e.due_date) : '')} onPress={() => navigation.navigate('CreditEntry', { id: e.id })}
                  right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Txt v="mono" style={{ fontSize: 14 }}>{naira(e.amount)}</Txt><Pill tone={p.tone} label={p.label} /></View>} />); })}</Group>
          ) : <>
            {book.customers.length ? <Group>{book.customers.map((k, i) => (
              <Row key={k.id} last={i === book.customers.length - 1} icon={k.on_app ? 'cellphone-check' : 'account-outline'} title={k.name}
                subtitle={typeLabel(k.customer_type) + (k.on_app ? ' · on the app · limit ' + naira(k.credit_limit) : ' · not on the app') + (k.status === 'blocked' ? ' · blocked' : '')}
                onPress={() => navigation.navigate('CreditCustomer', { id: k.id })}
                right={<Txt v="mono" color={Number(k.outstanding) ? c.ink : c.mute} style={{ fontSize: 14 }}>{naira(k.outstanding)}</Txt>} />))}</Group>
              : <Card><Txt v="small">Customers appear here when you log a credit sale or allow an app buyer to pay later.</Txt></Card>}
            <Txt v="label">App buyers · credit eligibility</Txt>
            <Txt v="small">A buyer qualifies after buying {naira(THRESHOLD.individual)} from your farm, or {naira(THRESHOLD.business)} if they are a business.</Txt>
            {book.eligible.length ? <Group>{book.eligible.map((x, i) => (
              <Row key={x.buyer_id} last={i === book.eligible.length - 1} icon={x.qualifies ? 'account-star-outline' : 'account-clock-outline'} iconColor={x.qualifies ? c.sage : c.mute} title={x.name}
                subtitle={typeLabel(x.buyer_type) + ' · bought ' + naira(x.bought) + ' of ' + naira(x.threshold)}
                onPress={x.qualifies ? () => navigation.navigate('CreditAllow', { buyer: x }) : undefined}
                right={x.qualifies ? <Pill tone="ok" label="Qualifies" /> : <Txt v="small">{Math.floor((Number(x.bought) / Number(x.threshold)) * 100)}%</Txt>} />))}</Group>
              : <Card><Txt v="small">No app buyers yet. They show up here after their first delivered order from you.</Txt></Card>}
          </>}
        </> : null}
      </ScrollView>
      <Pressable accessibilityLabel="Log a credit sale" onPress={() => navigation.navigate('CreditLog')} style={{ position: 'absolute', right: 20, bottom: 20, height: 56, paddingHorizontal: 20, borderRadius: 18, backgroundColor: c.yolk, flexDirection: 'row', gap: 8, alignItems: 'center', elevation: 4 }}>
        <Icon name="plus" size={24} color={c.onyolk} /><Txt v="bold" color={c.onyolk}>Log credit sale</Txt></Pressable>
    </Screen>
  );
}

// Write down a sale someone took without paying. Works for people who aren't on the app.
export function CreditLogScreen({ navigation, route }) {
  const [customers, setCustomers] = useState(null);
  const [sel, setSel] = useState(route.params?.customerId || 'new');
  const [f, setF] = useState({ name: '', phone: '', type: 'individual', description: '', amount: '', due: isoDate(new Date(Date.now() + 7 * 864e5)) });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { rpc('farm_book').then((b) => setCustomers(b.customers)).catch(() => setCustomers([])); }, []);
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: undefined })); };
  const isNew = sel === 'new';
  const save = async () => {
    const e = {};
    if (isNew && !f.name.trim()) e.name = "Enter the customer's name";
    if (!f.description.trim()) e.description = 'Say what they took';
    if (!(Number(f.amount) > 0)) e.amount = 'Enter the amount they owe';
    if (f.due && !/^\d{4}-\d{2}-\d{2}$/.test(f.due)) e.due = 'Use YYYY-MM-DD, or leave it empty';
    setErrs(e); if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await rpc('farm_book_log_credit', { p_customer: isNew ? null : sel, p_name: isNew ? f.name.trim() : null, p_phone: isNew ? f.phone.trim() || null : null, p_type: f.type,
        p_description: f.description.trim(), p_amount: Number(f.amount), p_due: f.due || null });
      navigation.goBack();
    } catch (er) { Alert.alert("Couldn't save", friendlyError(er)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Save as payment pending" loading={busy} onPress={save} />}>
      <AppBar title="Log a credit sale" close />
      <Txt v="small" style={{ fontSize: 14 }}>For goods a customer took and will pay for later. They don't need to have the app.</Txt>
      <Txt v="strong" style={{ fontSize: 13 }}>Customer</Txt>
      {customers === null ? <Skeleton h={44} r={22} /> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="New customer" icon="plus" selected={isNew} onPress={() => setSel('new')} />
          {customers.map((k) => <Chip key={k.id} label={k.name} selected={sel === k.id} onPress={() => setSel(k.id)} />)}
        </ScrollView>
      )}
      {isNew ? <>
        <Input label="Customer name" value={f.name} onChangeText={set('name')} placeholder="Mama Nkechi" autoCapitalize="words" error={errs.name} />
        <Input label="Phone (optional)" value={f.phone} onChangeText={set('phone')} placeholder="0803 123 4567" keyboardType="phone-pad" mono />
        <Segmented options={[{ value: 'individual', label: 'Individual' }, { value: 'business', label: 'Business' }]} value={f.type} onChange={set('type')} />
      </> : null}
      <Input label="What did they take?" value={f.description} onChangeText={set('description')} placeholder="10 crates of eggs" error={errs.description} />
      <Input label="Amount owed" prefix="₦" keyboardType="number-pad" value={f.amount} onChangeText={(t) => set('amount')(t.replace(/\D/g, ''))} mono error={errs.amount} />
      <DateInput label="Pay by (optional)" value={f.due} onChange={set('due')} min={isoDate()} clearable placeholder="No date" error={errs.due} hint="You'll see it marked overdue after this date." />
    </Screen>
  );
}

// One entry: upload the receipt to mark it paid.
export function CreditEntryScreen({ navigation, route }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const [e, setE] = useState(undefined);
  const [photo, setPhoto] = useState(null);
  const [up, setUp] = useState(null);   // null | 'uploading' | 'failed' | { path }
  const [busy, setBusy] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [farmWallet, setFarmWallet] = useState(0);
  const load = useCallback(async () => {
    const b = await rpc('farm_book').catch(() => null);
    const row = b?.entries.find((x) => x.id === route.params.id) || null;
    setE(row); setFarmWallet(Number(b?.wallet || 0));
    if (row?.receipt_path) supabase.storage.from('id-docs').createSignedUrl(row.receipt_path, 600).then(({ data }) => setReceiptUrl(data?.signedUrl || null));
  }, [route.params.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));   // refreshes the wallet balance after a top-up
  if (e === undefined) return <Screen><AppBar title="Credit sale" /><Skeleton h={160} r={20} /></Screen>;
  if (!e) return <Screen><AppBar title="Credit sale" /><Empty icon="receipt-text-outline" title="Entry not found" /></Screen>;
  const send = async (uri) => {
    setUp('uploading');
    try { setUp({ path: await uploadImage('id-docs', uid, uri) }); } catch { setUp('failed'); }
  };
  const pick = async (camera) => {
    if (camera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Camera access is off', 'Allow the camera for Poultry360, or choose the receipt from your gallery.', [...(p.canAskAgain ? [] : [{ text: 'Open settings', onPress: () => Linking.openSettings() }]), { text: 'OK' }]);
    }
    try {
      const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ quality: 0.6, mediaTypes: ['images'] });
      if (r.canceled) return;
      setPhoto(r.assets[0].uri); send(r.assets[0].uri);
    } catch (er) { Alert.alert("Couldn't open the " + (camera ? 'camera' : 'gallery'), friendlyError(er)); }
  };
  const settle = async () => {
    setBusy(true);
    try { await rpc('farm_book_settle', { p_entry: e.id, p_receipt: up.path }); setUp(null); setPhoto(null); await load(); }
    catch (er) { Alert.alert("Couldn't mark it paid", friendlyError(er)); } finally { setBusy(false); }
  };
  const remove = () => Alert.alert('Remove this entry?', 'Use this only if it was written by mistake.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await rpc('farm_book_cancel', { p_entry: e.id }); navigation.goBack(); } catch (er) { Alert.alert("Couldn't remove", friendlyError(er)); } } }]);
  const p = entryPill(e);
  const pending = e.status === 'pending';
  const commission = Number(e.commission || 0);   // only app orders carry commission; it is collected when the money comes back
  const short = pending && commission > farmWallet ? commission - farmWallet : 0;
  return (
    <Screen scroll footer={pending ? <Button title="Mark payment completed" icon="check-all" disabled={!up?.path || short > 0} loading={busy} onPress={settle} /> : null}>
      <AppBar title="Credit sale" />
      <Pill tone={p.tone} label={p.label} />
      <Txt v="monoLg" style={{ fontSize: 36 }}>{naira(e.amount)}</Txt>
      <Group>
        <Row icon={e.on_app ? 'cellphone-check' : 'account-outline'} title={e.customer} subtitle={e.on_app ? 'Customer · on the app' : 'Customer · not on the app'} onPress={() => navigation.navigate('CreditCustomer', { id: e.customer_id })} />
        <Row icon="package-variant-closed" title={e.description} subtitle={e.from_order ? 'Pay-later order from the app' : 'Written in by you'} />
        <Row icon="calendar-outline" title={shortDate(e.created_at)} subtitle="Taken on" />
        <Row last icon={pending ? 'calendar-clock' : 'calendar-check'} title={pending ? (e.due_date ? shortDate(e.due_date) : 'No date set') : shortDate(e.paid_at)} subtitle={pending ? 'Pay by' : e.paid_via === 'wallet' ? 'Paid in the app from their wallet' : 'Paid · receipt uploaded'} />
      </Group>
      {pending ? <>
        <Txt v="label">Payment receipt</Txt>
        <Card tone={up === 'failed' ? 'err' : undefined}>
          <Pressable onPress={() => pick(true)} style={{ height: 180, borderRadius: 16, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%', opacity: up?.path ? 1 : 0.5 }} resizeMode="contain" />
              : <><Icon name="receipt-text-plus-outline" size={36} color={c.mute} /><Txt v="strong" color={c.mute}>Photograph the receipt or transfer alert</Txt></>}
          </Pressable>
          <Txt v="small">{up === 'uploading' ? 'Uploading…' : up === 'failed' ? "Upload didn't finish. Try again." : up?.path ? 'Receipt uploaded. Tap the button below to finish.' : 'When they pay, add the receipt here and this entry becomes Payment completed.'}</Txt>
          {up === 'failed' && photo ? <Button small variant="dark" icon="refresh" title="Retry upload" onPress={() => send(photo)} /> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" icon="camera-outline" title="Take photo" onPress={() => pick(true)} style={{ flex: 1 }} /><Button small variant="outline" icon="image-outline" title="Gallery" onPress={() => pick(false)} style={{ flex: 1 }} /></View>
        </Card>
        {commission > 0 ? (short > 0
          ? <Banner tone="warn" icon="wallet-plus-outline" title={'Add ' + naira(short) + ' to your wallet first'} body={'This was an app order, so Poultry360\'s 10% commission (' + naira(commission) + ') is due now that the customer has paid you. Your wallet holds ' + naira(farmWallet) + '.'} action="Add funds" onAction={() => navigation.navigate('TopUp', { amount: Math.ceil(short), returnTo: 'CreditEntry' })} />
          : <Banner tone="info" icon="percent-outline" title={naira(commission) + ' commission will be taken from your wallet'} body="This was an app order. Poultry360's 10% is collected when the customer pays you back, not before." />) : null}
        {e.on_app ? <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="information-outline" size={18} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>This customer can also pay in the app. If they do, this entry completes by itself and you receive the amount less the 10% commission.</Txt></View> : null}
        {!e.from_order ? <Button variant="ghost" title="Remove entry (written by mistake)" onPress={remove} /> : null}
      </> : <>
        {e.receipt_path ? <><Txt v="label">Receipt</Txt>
          {receiptUrl ? <Pressable onPress={() => Linking.openURL(receiptUrl)}><Image source={{ uri: receiptUrl }} style={{ width: '100%', height: 260, borderRadius: 16, backgroundColor: c.sf2 }} resizeMode="contain" /></Pressable> : <Skeleton h={260} r={16} />}</> : null}
        <Banner tone="ok" title="Payment completed" body={e.paid_via === 'wallet' ? 'Paid in the app. The money is in your wallet.' : 'You recorded this payment with a receipt.'} />
      </>}
    </Screen>
  );
}

// One customer: what they owe, their history, and (for app buyers) their credit limit.
export function CreditCustomerScreen({ navigation, route }) {
  const { c } = useTheme();
  const [book, setBook] = useState(undefined);
  const [limit, setLimit] = useState('');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => rpc('farm_book').then(setBook).catch(() => setBook(null)), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (book === undefined) return <Screen><AppBar title="Customer" /><Skeleton h={160} r={20} /></Screen>;
  const k = book?.customers.find((x) => x.id === route.params.id);
  if (!k) return <Screen><AppBar title="Customer" /><Empty icon="account-outline" title="Customer not found" /></Screen>;
  const entries = book.entries.filter((e) => e.customer_id === k.id);
  const update = async (args, after) => {
    setBusy(true);
    try { await rpc('farm_book_update_customer', { p_customer: k.id, ...args }); await load(); after?.(); }
    catch (er) { Alert.alert("Couldn't update", friendlyError(er)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Log a credit sale" icon="plus" onPress={() => navigation.navigate('CreditLog', { customerId: k.id })} />}>
      <AppBar title={k.name} subtitle={typeLabel(k.customer_type) + (k.on_app ? ' · on the app' : ' · not on the app')} />
      <Hearth>
        <Txt v="label" color={c.hmute}>Owes you</Txt>
        <Txt v="monoLg" color={c.hink} style={{ fontSize: 34 }}>{naira(k.outstanding)}</Txt>
        {k.on_app ? <Txt v="small" color={c.hmute}>Pay-later limit {naira(k.credit_limit)} · {naira(Math.max(0, Number(k.credit_limit) - Number(k.outstanding)))} still available to them</Txt> : null}
      </Hearth>
      {k.status === 'blocked' ? <Banner tone="warn" icon="cancel" title="Blocked from new credit" body="They can still pay what they owe." action="Unblock" onAction={() => update({ p_status: 'active' })} /> : null}
      {k.phone ? <Button variant="outline" icon="phone" title={'Call ' + k.name.split(' ')[0]} onPress={() => Linking.openURL('tel:' + k.phone)} /> : null}
      {k.on_app ? (
        <Group>
          <Row icon="credit-card-clock-outline" title={'Pay-later limit · ' + naira(k.credit_limit)} subtitle="The most they can owe you at once" onPress={() => { setLimit(String(Math.round(k.credit_limit))); setSheet(true); }} />
          {k.status !== 'blocked' ? <Row last icon="cancel" iconColor={c.err} title="Block from new credit" subtitle="Stops Pay later at checkout" onPress={() => Alert.alert('Block ' + k.name + '?', "They won't be able to pay later until you unblock them.", [{ text: 'Cancel', style: 'cancel' }, { text: 'Block', style: 'destructive', onPress: () => update({ p_status: 'blocked' }) }])} /> : null}
        </Group>
      ) : null}
      <Txt v="label">History</Txt>
      {entries.length ? <Group>{entries.map((e, i) => { const p = entryPill(e); return (
        <Row key={e.id} last={i === entries.length - 1} icon="receipt-text-outline" title={e.description} subtitle={shortDate(e.created_at)} onPress={() => navigation.navigate('CreditEntry', { id: e.id })}
          right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Txt v="mono" style={{ fontSize: 14 }}>{naira(e.amount)}</Txt><Pill tone={p.tone} label={p.label} /></View>} />); })}</Group>
        : <Card><Txt v="small">Nothing on credit yet.</Txt></Card>}
      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <Txt v="h1">Pay-later limit</Txt>
        <Txt v="small" style={{ fontSize: 14 }}>The most {k.name} can owe you at any time through the app.</Txt>
        <Input prefix="₦" keyboardType="number-pad" value={limit} onChangeText={(t) => setLimit(t.replace(/\D/g, ''))} mono autoFocus />
        <Button title="Save limit" loading={busy} disabled={limit === ''} onPress={() => update({ p_limit: Number(limit) }, () => setSheet(false))} />
      </Sheet>
    </Screen>
  );
}

// Give a qualifying app buyer permission to pay later, with a limit.
export function CreditAllowScreen({ navigation, route }) {
  const { c } = useTheme();
  const { buyer } = route.params;
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const n = Number(limit || 0);
  const go = async () => {
    setBusy(true);
    try { await rpc('farm_book_allow_buyer', { p_buyer: buyer.buyer_id, p_limit: n }); navigation.goBack(); }
    catch (e) { Alert.alert("Couldn't allow credit", friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title={n > 0 ? 'Allow up to ' + naira(n) + ' on credit' : 'Allow credit'} disabled={!(n > 0)} loading={busy} onPress={go} />}>
      <AppBar title="Allow pay later" close />
      <Txt v="display" style={{ fontSize: 26, lineHeight: 30 }}>{buyer.name}</Txt>
      <Banner tone="ok" icon="account-star-outline" title={typeLabel(buyer.buyer_type) + ' buyer · qualifies'} body={'They have bought ' + naira(buyer.bought) + ' from your farm. The requirement is ' + naira(buyer.threshold) + '.'} />
      <Input label="Credit limit" prefix="₦" keyboardType="number-pad" value={limit} onChangeText={(t) => setLimit(t.replace(/\D/g, ''))} mono autoFocus hint="The most they can owe you at once. You can change or block this any time." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[20000, 50000, 100000, 250000].map((v) => <Chip key={v} label={naira(v)} selected={n === v} onPress={() => setLimit(String(v))} />)}</View>
      <Card>
        <Txt v="label">How pay later works</Txt>
        {['They choose "Pay later" at checkout, up to this limit.', 'They still pay the delivery fee up front, so the rider is paid.', 'The order shows in your Farm Book as payment pending.', 'It completes when they pay in the app, or when you upload their receipt.', "Poultry360's 10% commission is only taken when they pay you back."].map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: 10 }}><Icon name="check" size={18} color={c.sage} /><Txt v="body" style={{ flex: 1 }}>{t}</Txt></View>))}
      </Card>
      <Txt v="small">You carry the risk if a customer doesn't pay. Poultry360 doesn't guarantee credit sales.</Txt>
    </Screen>
  );
}

// ---------- Buyer side: what I owe ----------
export function MyCreditScreen({ navigation }) {
  const { c } = useTheme();
  const { wallet, refreshWallet } = useAuth();
  const [list, setList] = useState(null);
  const [paying, setPaying] = useState(null);
  const load = useCallback(() => { rpc('my_credit').then(setList).catch(() => setList([])); refreshWallet(); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const bal = Number(wallet?.balance || 0);
  const owed = (list || []).reduce((s, f) => s + Number(f.outstanding), 0);
  const pay = (e, farm) => {
    if (bal < Number(e.amount)) return Alert.alert('Top up to pay', 'You need ' + naira(Number(e.amount) - bal) + ' more in your wallet.', [{ text: 'Cancel', style: 'cancel' },
      { text: 'Top up', onPress: () => navigation.navigate('TopUp', { amount: Math.ceil(Number(e.amount) - bal), returnTo: 'MyCredit' }) }]);
    Alert.alert('Pay ' + naira(e.amount) + '?', 'To ' + farm + ' from your wallet, for ' + e.description + '.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Pay now', onPress: async () => {
      setPaying(e.id);
      try { await rpc('credit_pay', { p_entry: e.id }); load(); } catch (er) { Alert.alert("Payment didn't go through", friendlyError(er)); } finally { setPaying(null); }
    } }]);
  };
  return (
    <Screen scroll>
      <AppBar title="Pay later" subtitle="Credit with farms" />
      {list === null ? <Skeleton h={140} r={24} /> : !list.length ? <Empty icon="credit-card-clock-outline" title="No credit yet"
        body={'Farms can let you pay later once you have bought ' + naira(THRESHOLD.individual) + ' from them (' + naira(THRESHOLD.business) + ' for a business). Keep ordering from the farms you like.'} /> : <>
        <Hearth>
          <Txt v="label" color={c.hmute}>You owe</Txt>
          <Txt v="monoLg" color={c.hink} style={{ fontSize: 34 }}>{naira(owed)}</Txt>
          <Txt v="small" color={c.hmute}>Wallet balance {naira(bal)}</Txt>
        </Hearth>
        {list.map((f) => (
          <View key={f.customer_id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt v="h2" style={{ flex: 1 }}>{f.farm}</Txt>{f.status === 'blocked' ? <Pill tone="warn" label="Paused" /> : <Txt v="small">{naira(f.available)} of {naira(f.limit)} left</Txt>}</View>
            {f.entries.length ? <Group>{f.entries.map((e, i) => (
              <Row key={e.id} last={i === f.entries.length - 1} icon="receipt-text-outline" title={e.description} subtitle={e.status === 'paid' ? 'Paid ' + shortDate(e.paid_at) : e.due_date ? (e.overdue ? 'Overdue · was due ' : 'Pay by ') + shortDate(e.due_date) : 'Payment pending'}
                right={e.status === 'paid' ? <View style={{ alignItems: 'flex-end', gap: 4 }}><Txt v="mono" color={c.mute} style={{ fontSize: 14 }}>{naira(e.amount)}</Txt><Pill tone="ok" label="Paid" /></View>
                  : <Button small title={'Pay ' + naira(e.amount)} loading={paying === e.id} onPress={() => pay(e, f.farm)} />} />))}</Group>
              : <Card><Txt v="small">Nothing owed. Choose "Pay later" at checkout when you order from this farm.</Txt></Card>}
          </View>
        ))}
      </>}
    </Screen>
  );
}
