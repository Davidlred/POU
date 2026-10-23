import React, { useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Alert } from 'react-native';
import { useTheme, DateInput, Screen, AppBar, Txt, Button, Card, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Stat, Group, Row, Sheet, isoDate, shortDate } from '@p360/shared';
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

export function InventoryScreen({ navigation, route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const [tab, setTab] = useState(route.params?.tab || 'health');   // first tab: Vaccines (Vet care also opens it here)
  const [sel, setSel] = useState(null);       // item being adjusted
  const [amount, setAmount] = useState('');
  const items = useMemo(() => (data.farm_inventory || []).filter((x) => x.status !== 'removed').sort((a, b) => a.name.localeCompare(b.name)), [data]);
  const shown = items.filter((x) => cat(x.category).tab === tab);
  const alerts = items.map(itemAlert).filter(Boolean);
  const current = sel ? items.find((x) => x.id === sel) : null;
  const n = Number(amount || 0);
  const adjust = async (dir) => {
    if (!(n > 0)) return;
    if (dir < 0 && n > Number(current.quantity)) return Alert.alert('More than you have', 'You only have ' + num(current.quantity) + ' ' + (current.unit || '') + ' of ' + current.name + '.');
    await save('farm_inventory', { ...current, _pending: undefined, _failed: undefined, quantity: Number(current.quantity) + dir * n });
    setSel(null); setAmount('');
  };
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 14, paddingBottom: 100 }}>
        <View style={{ marginHorizontal: -20 }}><AppBar title="Inventory" subtitle="What you have on the farm" /></View>
        {items.length ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Stat label="Items" value={items.length} />
            <Stat label="Need attention" value={alerts.length} sub={alerts.length ? 'Low, out or expiring' : 'All good'} subColor={alerts.length ? c.err : c.sage} />
          </View>
        ) : null}
        <Segmented options={TABS} value={tab} onChange={setTab} />
        {tab === 'health' ? <Card onPress={() => navigation.navigate('CareGuide', { view: 'health' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="calendar-heart" size={26} color={c.acc} /><View style={{ flex: 1 }}><Txt v="bold">Vaccination chart</Txt><Txt v="small">Broilers and layers, by age</Txt></View><Icon name="chevron-right" color={c.mute} /></Card> : null}
        {tab === 'feed' ? <Card onPress={() => navigation.navigate('CareGuide', { view: 'feed' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="sack" size={26} color={c.acc} /><View style={{ flex: 1 }}><Txt v="bold">Feed chart</Txt><Txt v="small">Broilers and layers, by age</Txt></View><Icon name="chevron-right" color={c.mute} /></Card> : null}
        {!shown.length ? <Empty icon={tab === 'feed' ? 'sack' : tab === 'health' ? 'pill' : 'tools'}
          title={tab === 'feed' ? 'No feed recorded yet' : tab === 'health' ? 'No vaccines or drugs recorded yet' : 'No farm assets recorded yet'}
          body={tab === 'feed' ? 'Add the feed you have in store so you know when to restock.' : tab === 'health' ? 'Add what is in your store, with expiry dates, so nothing goes off unnoticed.' : 'Feeders, drinkers, crates, shavings and anything else you keep.'}
          action={tab === 'health' ? 'Add what you have' : 'Add an item'} onAction={() => navigation.navigate('InventoryForm', { tab })} />
          : <Group>{shown.map((it, i) => { const a = itemAlert(it); return (
            <Row key={it.id} last={i === shown.length - 1} icon={cat(it.category).icon} title={it.name}
              subtitle={cat(it.category).label + (it.expiry_date ? ' · expires ' + shortDate(it.expiry_date) : '') + (it._pending ? ' · saving' : '')}
              onPress={() => { setSel(it.id); setAmount(''); }}
              right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Txt v="mono" style={{ fontSize: 15 }}>{num(it.quantity)} <Txt v="small">{it.unit || ''}</Txt></Txt>{a ? <Pill tone={a.tone} label={a.label} /> : null}</View>} />); })}</Group>}
        {tab === 'health' ? <Button variant="outline" icon="storefront-outline" title="Shop for drugs & vaccines" onPress={() => navigation.navigate('Listings', { category: 'drugs' })} /> : null}
        {tab === 'feed' ? <Button variant="outline" icon="storefront-outline" title="Shop for feed" onPress={() => navigation.navigate('Listings', { category: 'feed' })} /> : null}
      </ScrollView>
      <Pressable accessibilityLabel="Add an item" onPress={() => navigation.navigate('InventoryForm', { tab })} style={{ position: 'absolute', right: 20, bottom: 20, height: 56, paddingHorizontal: 20, borderRadius: 18, backgroundColor: c.yolk, flexDirection: 'row', gap: 8, alignItems: 'center', elevation: 4 }}>
        <Icon name="plus" size={24} color={c.onyolk} /><Txt v="bold" color={c.onyolk}>Add item</Txt></Pressable>
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
    </Screen>
  );
}

export function InventoryFormScreen({ navigation, route }) {
  const { c } = useTheme();
  const { data } = useFarm();
  const existing = route.params?.id ? (data.farm_inventory || []).find((x) => x.id === route.params.id) : null;
  const startCat = existing?.category || (route.params?.tab === 'health' ? 'medicine' : route.params?.tab === 'other' ? 'equipment' : 'feed');
  const [f, setF] = useState({ category: startCat, name: existing?.name || '', quantity: existing ? String(Number(existing.quantity)) : '', unit: existing?.unit || cat(startCat).units[0],
    low_at: existing?.low_at != null ? String(Number(existing.low_at)) : '', expiry_date: existing?.expiry_date || '', notes: existing?.notes || '' });
  const [errs, setErrs] = useState({});
  const k = cat(f.category);
  const set = (key) => (v) => { setF((x) => ({ ...x, [key]: v })); setErrs((e) => ({ ...e, [key]: undefined })); };
  const dated = f.category === 'medicine' || f.category === 'vaccine';
  const submit = async () => {
    const e = {};
    if (!f.name.trim()) e.name = 'Enter a name';
    if (f.quantity === '' || !(Number(f.quantity) >= 0)) e.quantity = 'Enter how much you have';
    if (f.low_at !== '' && !(Number(f.low_at) >= 0)) e.low_at = 'Enter a number, or leave it empty';
    if (dated && f.expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(f.expiry_date)) e.expiry_date = 'Use YYYY-MM-DD, or leave it empty';
    setErrs(e); if (Object.keys(e).length) return;
    await save('farm_inventory', { ...(existing ? { ...existing, _pending: undefined, _failed: undefined } : {}), category: f.category, name: f.name.trim(), quantity: Number(f.quantity), unit: f.unit,
      low_at: f.low_at === '' ? null : Number(f.low_at), expiry_date: dated && f.expiry_date ? f.expiry_date : null, notes: f.notes.trim() || null, status: 'active' });
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
      <Input label="Warn me when it drops to (optional)" keyboardType="decimal-pad" value={f.low_at} onChangeText={(t) => set('low_at')(t.replace(/[^\d.]/g, ''))} suffix={f.unit} mono error={errs.low_at} hint="You'll see it marked Running low." />
      {dated ? <DateInput label="Expiry date (optional)" value={f.expiry_date} onChange={set('expiry_date')} clearable placeholder="No expiry date" error={errs.expiry_date} hint="You'll be warned 30 days before it expires." /> : null}
      <Input label="Notes (optional)" value={f.notes} onChangeText={set('notes')} multiline placeholder="Supplier, batch number, where it's stored" />
      <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="cloud-check-outline" size={16} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Saves on your phone first and syncs when you're online.</Txt></View>
      {existing ? <Button variant="ghost" title="Remove from inventory" onPress={remove} /> : null}
    </Screen>
  );
}
