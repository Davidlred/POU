import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, FlatList, ScrollView, Image, Dimensions, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Chip, Sheet, Input, Skeleton, Pill, naira, rpc, publicUrl, STATUS_LABEL, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { INVEST_ENABLED } from '../lib/roi';
import { useCart } from '../context/CartContext';
import { CATEGORIES, catLabel, fetchListings, deliveryContext, deliveryEta, DELIVERY_FEE } from '../lib/catalog';

const img = (l) => publicUrl('listing-photos', l?.photos?.[0]);

export function ListingCard({ l, onPress, hideFarm, wide }) {
  const { c } = useTheme();
  const uri = img(l);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ backgroundColor: c.sf, borderRadius: 20, overflow: 'hidden', flex: wide ? undefined : 1, opacity: pressed ? 0.85 : 1 }]}>
      {uri ? <Image source={{ uri }} style={{ height: 120, backgroundColor: c.sf2 }} /> : <View style={{ height: 120, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-outline" color={c.mute} /></View>}
      <View style={{ padding: 12, gap: 4 }}>
        <Txt v="bold" numberOfLines={2} style={{ fontSize: 14 }}>{l.title}</Txt>
        <Txt v="small" numberOfLines={1} style={{ fontSize: 12 }}>{hideFarm ? 'Verified farm near you' : l.vendor?.business_name}</Txt>
        <Txt v="mono">{naira(l.price)}<Txt v="small" style={{ fontSize: 12 }}> / {l.unit}</Txt></Txt>
      </View>
    </Pressable>
  );
}

export function ListRow({ l, onPress, hideFarm }) {
  const { c } = useTheme();
  const uri = img(l);
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
      {uri ? <Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 14 }} /> : <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: c.sf2 }} />}
      <View style={{ flex: 1, gap: 3 }}>
        <Txt v="bold" numberOfLines={1}>{l.title}</Txt>
        <Txt v="small" numberOfLines={1}>{hideFarm ? 'Verified farm · ' + catLabel(l.category) : l.vendor?.business_name}</Txt>
      </View>
      <Txt v="mono" style={{ fontSize: 14 }}>{naira(l.price)}</Txt>
    </Card>
  );
}

function CartButton({ navigation }) {
  const { c, f } = useTheme();
  const { count } = useCart();
  return (
    <Pressable onPress={() => navigation.navigate('Cart')} accessibilityLabel={'Cart, ' + count + ' items'} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="shopping-outline" />
      {count ? <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.ember, alignItems: 'center', justifyContent: 'center' }}><Txt v="mono" style={{ fontSize: 10, color: '#17120E' }}>{count}</Txt></View> : null}
    </Pressable>
  );
}

function SearchBar({ onPress }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ height: 52, backgroundColor: c.sf, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
      <Icon name="magnify" color={c.mute} /><Txt v="body" color={c.mute}>Chicken, eggs, turkey…</Txt>
    </Pressable>
  );
}

export function HomeScreen({ navigation }) {
  const { c } = useTheme();
  const { profile, multiRole, setActiveRole } = useAuth();
  const [ctx, setCtx] = useState(null);
  const [live, setLive] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d, orders, l] = await Promise.all([deliveryContext(), rpc('buyer_orders'), fetchListings({ limit: 6 })]);
      setCtx(d); setFresh(l);
      const active = (orders || []).map((o) => ({ o, s: (o.subs || []).find((s) => ['confirmed', 'ready', 'picked_up', 'out_for_delivery', 'placed'].includes(s.status)) })).find((x) => x.s);
      setLive(active || null);
    } catch (e) { console.warn(e); } finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const first = (profile?.full_name || '').split(' ')[0];
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => navigation.navigate('Checkout', { manageOnly: true })} style={{ gap: 2 }}>
            <Txt v="small" style={{ fontSize: 12 }}>Deliver to</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt v="bold">{ctx?.primary ? ctx.primary.area : 'Add an address'}</Txt><Icon name="chevron-down" size={20} /></View>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {multiRole ? <Button small variant="outline" title="Sell" onPress={() => setActiveRole('vendor')} style={{ height: 44, paddingHorizontal: 14 }} /> : null}
            <CartButton navigation={navigation} />
            <Pressable onPress={() => navigation.navigate('Profile')} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color="#fff">{(first || 'P')[0]}</Txt></Pressable>
          </View>
        </View>
        <Txt v="display">What's on the table today{first ? ', ' + first : ''}?</Txt>
        {ctx && ctx.primary && !ctx.covered ? <Banner tone="warn" icon="map-marker-off-outline" title={"We don't deliver to " + ctx.primary.area + ' yet'} body="Switch to an address in our coverage area to order." /> : null}
        {live ? (
          <Hearth onPress={() => navigation.navigate('Tracking', { orderId: live.o.id })}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="label" color={c.ember}>● {STATUS_LABEL[live.s.status]}</Txt><Txt v="label" color={c.hmute}>{live.o.code}</Txt></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt v="h2" color={c.hink} style={{ flex: 1 }}>{live.s.vendor}</Txt><View style={{ height: 36, paddingHorizontal: 14, borderRadius: 100, backgroundColor: c.yolk, justifyContent: 'center' }}><Txt v="bold" color="#2A2119" style={{ fontSize: 13 }}>Track</Txt></View></View>
          </Hearth>
        ) : null}
        <SearchBar onPress={() => navigation.navigate('Listings', { search: true })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {CATEGORIES.slice(0, 4).map((k) => (
            <Pressable key={k.id} onPress={() => navigation.navigate('Listings', { category: k.id })} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View style={{ width: '100%', aspectRatio: 1, borderRadius: 18, backgroundColor: c[k.tone], alignItems: 'center', justifyContent: 'center' }}><Icon name={k.icon} size={28} color={c[k.tone + 'i']} /></View>
              <Txt v="strong" style={{ fontSize: 12 }}>{k.label}</Txt>
            </Pressable>
          ))}
        </View>
        {INVEST_ENABLED && !(profile?.roles || []).includes('investor') ? (
          <Hearth onPress={() => navigation.navigate('InvestHome')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Icon name="chart-line" size={30} color={c.ember} />
              <View style={{ flex: 1, gap: 2 }}><Txt v="h2" color={c.hink}>Invest in verified farms</Txt><Txt v="small" color={c.hmute}>Fund a farm or a pool and track what it returns.</Txt></View>
              <Icon name="chevron-right" color={c.hmute} />
            </View>
          </Hearth>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="h2">Fresh today</Txt><Txt v="bold" color={c.acc} onPress={() => navigation.navigate('Market')} style={{ fontSize: 13 }}>See all</Txt></View>
        {fresh === null ? <><Skeleton h={88} r={20} /><Skeleton h={88} r={20} /></>
          : fresh.length ? fresh.map((l) => <ListRow key={l.id} l={l} hideFarm onPress={() => navigation.navigate('Product', { id: l.id, viaSearch: true })} />)
          : <Empty icon="egg-outline" title="No listings yet" body="Verified farms near you will appear here." />}
      </ScrollView>
    </Screen>
  );
}

export function MarketScreen({ navigation }) {
  const { c } = useTheme();
  const [farms, setFarms] = useState(null);
  useEffect(() => { supabase.from('vendor_profiles').select('user_id,business_name,rating,rating_count,categories,created_at').eq('verification_status', 'approved').limit(12).then(({ data }) => setFarms(data || [])); }, []);
  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt v="display" style={{ fontSize: 28 }}>Market</Txt><CartButton navigation={navigation} /></View>
      <SearchBar onPress={() => navigation.navigate('Listings', { search: true })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {[...CATEGORIES, { id: 'vet', label: 'Vet care', icon: 'stethoscope', tone: 'sf' }, { id: 'waste', label: 'Waste & manure', icon: 'sprout-outline', tone: 'sf' }].map((k) => (
          <Pressable key={k.id} onPress={() => (k.id === 'vet' ? navigation.navigate('VetHome') : k.id === 'waste' ? navigation.navigate('WasteHome') : navigation.navigate('Listings', { category: k.id }))}
            style={{ flexBasis: '45%', flexGrow: 1, minHeight: 84, borderRadius: 20, backgroundColor: c[k.tone], padding: 14, justifyContent: 'space-between' }}>
            <Icon name={k.icon} size={26} color={c[k.tone + 'i'] || c.acc} /><Txt v="bold" style={{ fontSize: 14 }}>{k.label}</Txt>
          </Pressable>
        ))}
      </View>
      {farms && farms.length ? <>
        <Txt v="h2">Verified farms</Txt>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
          {farms.map((fm) => (
            <Card key={fm.user_id} onPress={() => navigation.navigate('Store', { vendorId: fm.user_id })} style={{ width: 200 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="h2" color={c.yolk}>{fm.business_name.slice(0, 2).toUpperCase()}</Txt></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{fm.business_name}</Txt><Icon name="check-decagram" size={16} color={c.acc} /></View>
              <Txt v="small" style={{ fontSize: 12 }}>{fm.rating_count ? '★ ' + Number(fm.rating).toFixed(1) + ' · ' + fm.rating_count + ' reviews' : 'New seller'}</Txt>
            </Card>
          ))}
        </ScrollView>
      </> : null}
    </Screen>
  );
}

export function ListingsScreen({ navigation, route }) {
  const { c } = useTheme();
  const { category, search, waste } = route.params || {};
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [filters, setFilters] = useState({ min: '', max: '', sort: 'newest' });
  const [open, setOpen] = useState(false);
  const active = (filters.min ? 1 : 0) + (filters.max ? 1 : 0) + (filters.sort !== 'newest' ? 1 : 0);
  const load = useCallback(async () => {
    if (search && !q.trim()) return setItems([]);
    setItems(null);
    try { setItems(await fetchListings({ category, q: q || undefined, waste: !!waste, minPrice: Number(filters.min) || undefined, maxPrice: Number(filters.max) || undefined, sort: filters.sort })); }
    catch (e) { setItems([]); }
  }, [category, q, filters, waste, search]);
  useEffect(() => { const t = setTimeout(load, search ? 350 : 0); return () => clearTimeout(t); }, [load]);
  return (
    <Screen pad={false}>
      {search ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
          <Pressable onPress={() => navigation.goBack()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-left" size={24} /></Pressable>
          <View style={{ flex: 1, height: 48, borderRadius: 14, backgroundColor: c.sf, borderWidth: 2, borderColor: c.ember, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }}>
            <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Search the market" placeholderTextColor={c.mute} style={{ flex: 1, color: c.ink, fontSize: 15 }} returnKeyType="search" />
            {q ? <Icon name="close" color={c.mute} /> : null}
          </View>
        </View>
      ) : <AppBar title={waste ? catLabel(category) || 'Waste & manure' : catLabel(category)} right={
        <Pressable onPress={() => setOpen(true)} style={{ height: 40, paddingHorizontal: 14, marginRight: 8, borderRadius: 100, backgroundColor: c.hc, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="tune-variant" size={18} color={c.hink} /><Txt v="strong" color={c.hink} style={{ fontSize: 13 }}>Filters</Txt>
          {active ? <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.yolk, alignItems: 'center', justifyContent: 'center' }}><Txt v="mono" style={{ fontSize: 11, color: '#2A2119' }}>{active}</Txt></View> : null}
        </Pressable>} />}
      {items === null ? <View style={{ padding: 20, gap: 12 }}><Skeleton h={180} r={20} /><Skeleton h={180} r={20} /></View>
        : !items.length ? (search && !q ? <Empty icon="magnify" title="Search 2,000+ listings" body="Try eggs, broilers, turkey or feed." />
          : search ? <View style={{ padding: 20 }}><Empty icon="magnify-close" title={'Nothing for "' + q + '"'} body="Try a shorter word, or browse a category instead." />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>{CATEGORIES.slice(0, 4).map((k) => <Chip key={k.id} label={k.label} onPress={() => navigation.replace('Listings', { category: k.id })} />)}</View></View>
          : <View style={{ padding: 20 }}><Empty icon="basket-off-outline" title={'No ' + (catLabel(category) || 'listings').toLowerCase() + ' near you yet'} body="Try a related category." />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>{CATEGORIES.filter((k) => k.id !== category).slice(0, 3).map((k) => <Chip key={k.id} label={k.label} onPress={() => navigation.replace('Listings', { category: k.id })} />)}</View></View>)
        : <FlatList data={items} keyExtractor={(x) => x.id} numColumns={2} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ padding: 20, gap: 12 }}
            ListHeaderComponent={search ? <Txt v="small" style={{ marginBottom: 4 }}>{items.length} results</Txt> : null}
            renderItem={({ item }) => <ListingCard l={item} hideFarm onPress={() => navigation.navigate('Product', { id: item.id, viaSearch: true })} />} />}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="h1">Filters</Txt><Txt v="bold" color={c.acc} onPress={() => setFilters({ min: '', max: '', sort: 'newest' })}>Clear all</Txt></View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Input label="Min price" prefix="₦" keyboardType="number-pad" value={filters.min} onChangeText={(t) => setFilters({ ...filters, min: t.replace(/\D/g, '') })} mono /></View>
          <View style={{ flex: 1 }}><Input label="Max price" prefix="₦" keyboardType="number-pad" value={filters.max} onChangeText={(t) => setFilters({ ...filters, max: t.replace(/\D/g, '') })} mono /></View>
        </View>
        <Txt v="strong" style={{ fontSize: 13 }}>Sort</Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>{[['newest', 'Newest'], ['cheapest', 'Lowest price']].map(([v, l]) => <Chip key={v} label={l} selected={filters.sort === v} onPress={() => setFilters({ ...filters, sort: v })} />)}</View>
        <Button title="Show results" onPress={() => setOpen(false)} />
      </Sheet>
    </Screen>
  );
}

export function ProductScreen({ navigation, route }) {
  const { c } = useTheme();
  const { add } = useCart();
  const { id, viaSearch } = route.params;
  const [l, setL] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [qty, setQty] = useState(1);
  const [page, setPage] = useState(0);
  const W = Dimensions.get('window').width;
  useEffect(() => {
    supabase.from('listings').select('*, vendor:vendor_profiles(user_id,business_name,rating,rating_count,location)').eq('id', id).maybeSingle().then(({ data }) => setL(data));
    deliveryContext().then(setCtx);
  }, [id]);
  if (!l) return <Screen><AppBar /><Skeleton h={260} r={20} /></Screen>;
  const out = l.quantity <= 0 || l.status !== 'live';
  const outside = ctx?.primary && !ctx.covered;
  const photos = (l.photos || []).map((p) => publicUrl('listing-photos', p));
  return (
    <Screen pad={false} edges={[]} footer={out
      ? <Button variant="dark" icon="bell-outline" title="Notify me when available" onPress={() => alert("We'll let you know when it's back.")} />
      : <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ height: 52, borderRadius: 100, backgroundColor: c.sf2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 }}>
            <Pressable accessibilityLabel="Decrease" onPress={() => setQty(Math.max(1, qty - 1))} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" /></Pressable>
            <Txt v="mono" style={{ width: 28, textAlign: 'center' }}>{qty}</Txt>
            <Pressable accessibilityLabel="Increase" onPress={() => setQty(Math.min(l.quantity, qty + 1))} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" /></Pressable>
          </View>
          <Button title={'Add · ' + naira(l.price * qty)} disabled={!!outside} onPress={() => { add(l, qty, !!viaSearch); navigation.navigate('Cart'); }} style={{ flex: 1 }} />
        </View>}>
      <ScrollView>
        <View>
          {photos.length ? <FlatList horizontal pagingEnabled data={photos} keyExtractor={(u) => u} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
            renderItem={({ item }) => <Image source={{ uri: item }} style={{ width: W, height: 300, backgroundColor: c.sf2, opacity: out ? 0.5 : 1 }} />} />
            : <View style={{ height: 300, backgroundColor: c.sf2, alignItems: 'center', justifyContent: 'center' }}><Icon name="image-outline" size={40} color={c.mute} /></View>}
          <Pressable onPress={() => navigation.goBack()} style={{ position: 'absolute', top: 44, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-left" /></Pressable>
          {photos.length > 1 ? <View style={{ position: 'absolute', bottom: 34, alignSelf: 'center', flexDirection: 'row', gap: 6 }}>{photos.map((_, i) => <View key={i} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: c.ink, opacity: i === page ? 1 : 0.3 }} />)}</View> : null}
        </View>
        <View style={{ marginTop: -24, backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 12 }}>
          {viaSearch ? <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="map-search-outline" size={18} color={c.acc} /><Txt v="small">Sourced from a verified farm near you</Txt></View>
            : <Pressable onPress={() => navigation.navigate('Store', { vendorId: l.vendor_id })} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Txt v="strong" color={c.mute} style={{ fontSize: 13 }}>{l.vendor?.business_name}</Txt><Icon name="check-decagram" size={16} color={c.acc} />
                <Txt v="small">{l.vendor?.rating_count ? '· ★ ' + Number(l.vendor.rating).toFixed(1) + ' (' + l.vendor.rating_count + ')' : '· New seller'}</Txt></Pressable>}
          {out ? <Pill label="Sold out" /> : null}
          <Txt v="h1" style={{ fontSize: 26, lineHeight: 30 }}>{l.title}</Txt>
          <Txt v="monoLg" style={{ fontSize: 26 }}>{naira(l.price)}<Txt v="small"> / {l.unit}</Txt></Txt>
          {outside ? <Banner tone="warn" icon="map-marker-off-outline" title={"We can't deliver to " + ctx.primary.area + ' yet'} body="Switch to an address in our coverage area to add this to your cart." />
            : <Card style={{ flexDirection: 'row', gap: 10 }}><Icon name="truck-delivery-outline" color={c.acc} /><View style={{ flex: 1 }}><Txt v="strong" style={{ fontSize: 14 }}>Delivered by Poultry360 {deliveryEta()}</Txt><Txt v="small">Delivery {naira(DELIVERY_FEE)} per farm{ctx?.primary ? ' to ' + ctx.primary.area : ''}</Txt></View></Card>}
          {!out ? <Pill tone="ok" label={'In stock · ' + l.quantity + ' ' + l.unit + (l.quantity === 1 ? '' : 's')} /> : null}
          {l.attributes?.moisture ? <Txt v="small">Moisture content: {l.attributes.moisture}%</Txt> : null}
          {l.description ? <Txt v="body" color={c.mute}>{l.description}</Txt> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

export function StoreScreen({ navigation, route }) {
  const { c } = useTheme();
  const { vendorId } = route.params;
  const [v, setV] = useState(null);
  const [items, setItems] = useState(null);
  useEffect(() => {
    supabase.from('vendor_profiles').select('*').eq('user_id', vendorId).maybeSingle().then(({ data }) => setV(data));
    fetchListings({ vendorId, limit: 60 }).then(setItems).catch(() => setItems([]));
  }, [vendorId]);
  return (
    <Screen pad={false}>
      <AppBar />
      <FlatList data={items || []} keyExtractor={(x) => x.id} numColumns={2} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 12 }}
        ListHeaderComponent={v ? <View style={{ gap: 12, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" color={c.yolk}>{v.business_name.slice(0, 2).toUpperCase()}</Txt></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Txt v="h1" style={{ flexShrink: 1 }}>{v.business_name}</Txt>{v.verification_status === 'approved' ? <Icon name="check-decagram" color={c.acc} /> : null}</View>
          <Txt v="small">{v.location}</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {v.rating_count ? <Card style={{ flex: 1, gap: 2 }}><Txt v="mono" style={{ fontSize: 20 }}>{Number(v.rating).toFixed(1)}</Txt><Txt v="small">Product quality · {v.rating_count}</Txt></Card>
              : <Card style={{ flex: 1 }}><Pill tone="warn" label="New seller" /><Txt v="small">No ratings yet</Txt></Card>}
            <Card style={{ flex: 1, gap: 2 }}><Txt v="mono" style={{ fontSize: 20 }}>{items ? items.length : '–'}</Txt><Txt v="small">Active listings</Txt></Card>
          </View>
        </View> : <Skeleton h={160} r={20} />}
        ListEmptyComponent={items ? <Empty icon="store-off-outline" title="No active listings" body="This farm has nothing for sale right now. Check back soon." /> : null}
        renderItem={({ item }) => <ListingCard l={item} onPress={() => navigation.navigate('Product', { id: item.id })} />} />
    </Screen>
  );
}
