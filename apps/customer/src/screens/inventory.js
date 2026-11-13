import React, { useMemo, useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { Press as Pressable } from '@p360/shared';
import { usePage, useWide, HeaderBar, DataTable, useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Stat, Group, Row, Sheet, isoDate, shortDate, naira, Fab } from '@p360/shared';
import { useFarm, save } from '../lib/offlineQueue';

const TABS = [{ value: 'health', label: 'Vaccines' }, { value: 'feed', label: 'Feeds' }, { value: 'other', label: 'Farm assets' }];
const CATEGORIES = [
  { id: 'feed', label: 'Feed', tab: 'feed', icon: 'sack', units: ['bags', 'kg', 'tonnes'], ideas: ['Starter', 'Grower', 'Finisher', 'Layer mash', 'Maize', 'Soya', 'Concentrate'] },
  { id: 'medicine', label: 'Drug', tab: 'health', icon: 'pill', units: ['sachets', 'bottles', 'litres', 'ml', 'tablets', 'kg'], ideas: ['Antibiotic', 'Coccidiostat', 'Dewormer', 'Vitamins', 'Disinfectant'] },
  { id: 'vaccine', label: 'Vaccine', tab: 'health', icon: 'needle', units: ['doses', 'vials', 'bottles'], ideas: ['Lasota', 'Gumboro', 'Fowl pox', "Marek's", 'Fowl typhoid'] },
  { id: 'equipment', label: 'Equipment', tab: 'other', icon: 'tools', units: ['pieces', 'sets'], ideas: ['Feeders', 'Drinkers', 'Egg crates', 'Battery cage', 'Brooder', 'Generator'] },
  { id: 'other', label: 'Supplies', tab: 'other', icon: 'package-variant-closed', units: ['pieces', 'bags', 'kg', 'litres'], ideas: ['Wood shavings', 'Charcoal', 'Diesel', 'Egg trays'] },
];
const cat = (id) => CATEGORIES.find((k) => k.id === id) || CATEGORIES[4];

// Feed maths. A bag is 25 kg unless the item says otherwise; stock can be kept in bags, kg or tonnes.
export const BAG_KG = 25;
const kgPerUnit = (it) => (it.unit === 'bags' ? Number(it.bag_kg || BAG_KG) : it.unit === 'tonnes' ? 1000 : 1);
export const perKg = (it) => (Number(it?.bag_price) > 0 ? Number(it.bag_price) / Number(it.bag_kg || BAG_KG) : null);   // ₦ per kg, or null without a price
export const stockKg = (it) => Number(it.quantity || 0) * kgPerUnit(it);
export const afterUsing = (it, kg) => Math.max(0, Math.round((Number(it.quantity || 0) - kg / kgPerUnit(it)) * 1000) / 1000);   // new quantity, in the item's own unit
const num = (n) => Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const daysTo = (d) => Math.ceil((new Date(d + 'T23:59:59') - Date.now()) / 864e5);

// What needs the farmer's attention about an item, most urgent first.
export function itemAlert(it) {
  if (it.expiry_date) {
    const d = daysTo(it.expiry_date);
    if (d < 0) return { tone: 'err', label: 'Expired' };
    if (d <= 30) return { tone: 'warn', label: d <= 1 ? 'Expires today' : 'Expires in ' + d + ' days' };
  }
  if (Number(it.quantity) === 0) return { tone: 'err', label: 'Out of stock' };
  if (it.low_at != null && Number(it.quantity) <= Number(it.low_at)) return { tone: 'warn', label: 'Running low' };
  return null;
}

// embedded: shown as a tab inside Farm Hub (no title bar of its own).
export function InventoryScreen({ navigation, route, embedded }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const { data } = useFarm();
  const [tab, setTab] = useState(route?.params?.tab || 'health');   // first tab: Vaccines (Vet care also opens it here)
  const [sel, setSel] = useState(null);       // item being adjusted
  const [amount, setAmount] = useState('');
  const items = useMemo(() => (data.farm_inventory || []).filter((x) => x.status !== 'removed').sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const shown = items.filter((x) => cat(x.category).tab === tab);
  const count = (t) => items.filter((x) => cat(x.category).tab === t).length;
  const current = sel ? items.find((x) => x.id === sel) : null;
  const n = Number(amount || 0);
  const adjust = async (dir) => {
    if (!(n > 0)) return;
    if (dir < 0 && n > Number(current.quantity)) return Alert.alert('More than you have', 'You only have ' + num(current.quantity) + ' ' + (current.unit || '') + ' of ' + current.name + '.');
    await save('farm_inventory', { ...current, _pending: undefined, _failed: undefined, quantity: Number(current.quantity) + dir * n });
    setSel(null); setAmount('');
  };
  const seg = <Segmented options={TABS.map((t) => ({ value: t.value, label: t.label + ' · ' + count(t.value) }))} value={tab} onChange={setTab} />;
  const shop = tab === 'health' ? { title: 'Shop for drugs & vaccines', cat: 'drugs' } : tab === 'feed' ? { title: 'Shop for feed', cat: 'feed' } : { title: 'Shop for equipment', cat: 'equipment' };
  const table = (
    <DataTable minWidth={640} columns={[{ label: 'Item', flex: 2 }, { label: 'In store', flex: 1.1 }, { label: 'Alert', flex: 1.2 }, { label: 'Price', flex: 1, right: true }, { label: '', width: 110, right: true }]}
      rows={shown.map((it) => {
        const a = itemAlert(it);
        const noPrice = it.category === 'feed' && !perKg(it);
        return { key: it.id, onPress: () => { setSel(it.id); setAmount(''); }, cells: [
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name={cat(it.category).icon} size={18} color={c.mute} /></View>
            <View style={{ flexShrink: 1 }}><Txt v="strong" numberOfLines={1}>{it.name}</Txt><Txt v="small">{cat(it.category).label + (it._pending ? ' · saving' : '')}</Txt></View></View>,
          <Txt v="mono">{num(it.quantity) + ' ' + (it.unit || '')}</Txt>,
          a ? <Pill tone={a.tone} icon={a.tone === 'warn' || a.tone === 'err' ? 'alert-outline' : undefined} label={a.label} /> : noPrice ? <Pill tone="warn" icon="tag-outline" label="No price" /> : <Pill tone="ok" label="OK" />,
          <Txt v="mono">{it.category === 'feed' && it.bag_price ? naira(it.bag_price) + ' / bag' : '–'}</Txt>,
          a || noPrice ? <Button small variant="outline" title={noPrice ? 'Add price' : 'Restock'} onPress={() => (noPrice ? navigation.navigate('InventoryForm', { id: it.id }) : (setSel(it.id), setAmount('')))} style={{ height: 40, paddingHorizontal: 14 }} /> : <Txt v="small"> </Txt>] };
      })}
      empty={<Empty art={tab === 'feed' ? 'feed' : tab === 'health' ? 'vial' : 'feed'} title={tab === 'feed' ? 'No feed recorded yet' : tab === 'health' ? 'No vaccines or drugs recorded yet' : 'No farm assets recorded yet'}
        body={tab === 'feed' ? 'Add the feed you have in store, with the price of a bag, so feed costs work themselves out.' : tab === 'health' ? 'Add what is in your store, with expiry dates, so nothing goes off unnoticed.' : 'Feeders, drinkers, crates, shavings and anything else you keep.'}
        action={tab === 'health' ? 'Add what you have' : 'Add an item'} onAction={() => navigation.navigate('InventoryForm', { tab })} style={{ borderWidth: 0 }} />} />
  );
  const guide = tab !== 'other' ? (
    <Card onPress={() => navigation.navigate('CareGuide', { view: tab === 'feed' ? 'feed' : 'health' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name={tab === 'feed' ? 'sack' : 'calendar-heart'} size={20} color={c.navactink} /></View>
      <View style={{ flex: 1 }}><Txt v="bold">{tab === 'feed' ? 'Feed chart' : 'Vaccination chart'}</Txt><Txt v="small">Broilers and layers, by age</Txt></View><Icon name="chevron-right" color={c.mute} />
    </Card>
  ) : null;
  const actions = <>
    <Button small variant="outline" icon="storefront-outline" title={shop.title} onPress={() => navigation.navigate('Listings', { category: shop.cat })} style={{ paddingHorizontal: 14 }} />
    <Button small icon="plus" title="Add item" onPress={() => navigation.navigate('InventoryForm', { tab })} style={{ paddingHorizontal: 18 }} />
  </>;
  const body = <>
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 12 }}>
      <View style={{ flex: wide ? 1 : undefined, maxWidth: wide ? 520 : undefined }}>{seg}</View>
      {wide ? <View style={{ flexDirection: 'row', gap: 10 }}>{actions}</View> : null}
    </View>
    {table}
    {guide}
    {!wide ? <Button variant="outline" icon="storefront-outline" title={shop.title} onPress={() => navigation.navigate('Listings', { category: shop.cat })} /> : null}
  </>;
  const sheet = (
    <Sheet visible={!!current} onClose={() => setSel(null)}>
      {current ? <>
        <Txt v="h1">{current.name}</Txt>
        <Txt v="body" color={c.mute}>You have <Txt v="mono">{num(current.quantity)}</Txt> {current.unit || ''}</Txt>
        <Input label={'How many ' + (current.unit || 'units') + '?'} keyboardType="decimal-pad" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))} mono autoFocus />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button variant="outline" icon="minus" title="Used" disabled={!(n > 0)} onPress={() => adjust(-1)} style={{ flex: 1 }} />
          <Button icon="plus" title="Added" disabled={!(n > 0)} onPress={() => adjust(1)} style={{ flex: 1 }} />
        </View>
        <Button variant="ghost" title="Edit details" onPress={() => { const id = current.id; setSel(null); navigation.navigate('InventoryForm', { id }); }} />
      </> : null}
    </Sheet>
  );
  if (embedded) return <View style={{ gap: 16 }}>{body}{!wide ? <Button icon="plus" title="Add item" onPress={() => navigation.navigate('InventoryForm', { tab })} /> : null}{sheet}</View>;
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 0, gap: 16, paddingBottom: 100 }, page]}>
        {wide ? <HeaderBar title="Inventory" subtitle="What you have on the farm" /> : <View style={{ marginHorizontal: -20 }}><AppBar title="Inventory" subtitle="What you have on the farm" /></View>}
        {body}
      </ScrollView>
      {!wide ? <Fab label="Add item" accessibilityLabel="Add an item" onPress={() => navigation.navigate('InventoryForm', { tab })} /> : null}
      {sheet}
    </Screen>
  );
}

export function InventoryFormScreen({ navigation, route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const existing = route.params?.id ? (data.farm_inventory || []).find((x) => x.id === route.params.id) : null;
  const startCat = existing?.category || (route.params?.tab === 'health' ? 'medicine' : route.params?.tab === 'other' ? 'equipment' : 'feed');
  const [f, setF] = useState({ category: startCat, name: existing?.name || '', quantity: existing ? String(Number(existing.quantity)) : '', unit: existing?.unit || cat(startCat).units[0],
    low_at: existing?.low_at != null ? String(Number(existing.low_at)) : '', expiry_date: existing?.expiry_date || '', notes: existing?.notes || '',
    bag_price: existing?.bag_price != null ? String(Number(existing.bag_price)) : '' });
  const [errs, setErrs] = useState({});
  const k = cat(f.category);
  const set = (key) => (v) => { setF((x) => ({ ...x, [key]: v })); setErrs((e) => ({ ...e, [key]: undefined })); };
  const dated = f.category === 'medicine' || f.category === 'vaccine';
  const submit = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Enter a name';
    if (f.quantity === '' || !(Number(f.quantity) >= 0)) e.quantity = 'Enter how much you have';
    if (f.low_at !== '' && !(Number(f.low_at) >= 0)) e.low_at = 'Enter a number, or leave it empty';
    if (f.category === 'feed' && !(Number(f.bag_price) > 0)) e.bag_price = 'Enter the price of one 25 kg bag';
    if (dated && f.expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.expiry_date)) e.expiry_date = 'Use YYYY-MM-DD, or leave it empty';
    setErrs(e); if (Object.keys(e).length) return;
    await save('farm_inventory', { ...(existing ? { ...existing, _pending: undefined, _failed: undefined } : {}), category: f.category, name: f.name.trim(), quantity: Number(f.quantity), unit: f.unit,
      low_at: f.low_at === '' ? null : Number(f.low_at), expiry_date: dated && f.expiry_date ? f.expiry_date : null, notes: f.notes.trim() || null, status: 'active',
      bag_price: f.category === 'feed' ? Number(f.bag_price) : null, bag_kg: Number(existing?.bag_kg || BAG_KG) });
    if (route.params?.from === 'log') return navigation.goBack();
    navigation.goBack();
  };
  const remove = () => Alert.alert('Remove ' + existing.name + '?', 'It will be taken off your inventory.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { await save('farm_inventory', { ...existing, _pending: undefined, _failed: undefined, status: 'removed' }); navigation.goBack(); } }]);
  return (
    <Screen scroll footer={<Button title={existing ? 'Save changes' : 'Add to inventory'} onPress={submit} />}>
      <AppBar title={existing ? 'Edit item' : 'Add an item'} close />
      <Txt v="strong" style={{ fontSize: 13 }}>What is it?</Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CATEGORIES.map((x) => <Chip key={x.id} label={x.label} icon={x.icon} selected={f.category === x.id} onPress={() => setF((p) => ({ ...p, category: x.id, unit: x.units.includes(p.unit) ? p.unit : x.units[0] }))} />)}
      </ScrollView>
      <Input label="Name" value={f.name} onChangeText={set('name')} placeholder={k.ideas[0]} autoCapitalize="sentences" error={errs.name} />
      {!f.name ? <ChipRow options={k.ideas} value={null} onChange={set('name')} /> : null}
      <Input label="How much do you have?" keyboardType="decimal-pad" value={f.quantity} onChangeText={(t) => set('quantity')(t.replace(/[^\d.]/g, ''))} suffix={f.unit} mono error={errs.quantity} />
      <ChipRow options={k.units} value={f.unit} onChange={set('unit')} />
      {f.category === 'feed' ? <Input label="Price of one bag (25 kg)" prefix="₦" keyboardType="number-pad" value={f.bag_price} onChangeText={(t) => set('bag_price')(t.replace(/\D/g, ''))} mono error={errs.bag_price}
        hint="Used to work out the cost of feed you log." /> : null}
      <Input label="Warn me when it drops to (optional)" keyboardType="decimal-pad" value={f.low_at} onChangeText={(t) => set('low_at')(t.replace(/[^\d.]/g, ''))} suffix={f.unit} mono error={errs.low_at} hint="You'll see it marked Running low." />
      {dated ? <DateInput label="Expiry date (optional)" value={f.expiry_date} onChange={set('expiry_date')} clearable placeholder="No expiry date" error={errs.expiry_date} hint="You'll be warned 30 days before it expires." /> : null}
      <Input label="Notes (optional)" value={f.notes} onChangeText={set('notes')} multiline placeholder="Supplier, batch number, where it's stored" />
      <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="cloud-check-outline" size={16} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Saves on your phone first and syncs when you're online.</Txt></View>
      {existing ? <Button variant="ghost" title="Remove from inventory" onPress={remove} /> : null}
    </Screen>
  );
}
