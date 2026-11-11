import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, FlatList, ScrollView, Dimensions, RefreshControl, TextInput, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usePage, useWide, useTheme, Screen, AppBar, BackButton, Txt, Button, Card, Hearth, Icon, Banner, Empty, Chip, Skeleton, Pill, Segmented,
  naira, rpc, publicUrl, supabase, HeaderBar, SectionHead, LiveDot, ProgressSegments, ArtPanel, PlaceholderArt, Thumb, TrustRow, MoneyLine, artTint, MAX_FONT_SCALE } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { INVEST_ENABLED } from '../lib/roi';
import { useCart } from '../context/CartContext';
import { CATEGORIES, catLabel, fetchListings, deliveryContext, SUPPLY_CATEGORIES } from '../lib/catalog';
import { distanceKm, deliveryFee, kmLabel, byDistance } from '../lib/nearby';
import { useSpot } from '../lib/spot';
import { liveOrder, ACTIVE, deliveryWindow } from '../lib/eta';
import { TopBar } from '../components/RoleSwitcher';

const img = (l) => publicUrl('listing-photos', l?.photos?.[0]);
// The word for a hidden seller: farm supplies come from stores (and their agents), birds and eggs from farms.
export const sellerWord = (category) => (SUPPLY_CATEGORIES.includes(category) ? 'store' : 'farm');
const isFresh = (l) => l?.created_at && Date.now() - new Date(l.created_at).getTime() < 864e5;
const hello = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

// Product grids: 2 across on phones, 4 on the website.
export function useGridCols(desk = 4) { return useWide() ? desk : 2; }
// Pads the last row with blanks so a lone card keeps its width instead of stretching across the row.
export const padRows = (items, cols) => { const n = (cols - (items.length % cols)) % cols; return n ? [...items, ...Array.from({ length: n }, (_, i) => ({ id: '_pad' + i, _pad: true }))] : items; };

// "2.9 km · ₦1,100 delivery" from where the buyer is to the seller (nothing if either isn't pinned).
const nearText = (vendor, spot) => { const km = distanceKm(vendor, spot); return km == null ? null : kmLabel(km) + ' · ' + naira(deliveryFee(vendor, spot)) + ' delivery'; };

// Product card: tinted ground with the photo or drawing, freshness badge, title, verified seller line, distance and fee,
// price large with "/ unit". The website adds a round add button.
export function ListingCard({ l, onPress, hideFarm, wide: fixed, spot, onAdd }) {
  const { c } = useTheme();
  const site = useWide();
  const [added, setAdded] = useState(false);
  if (l._pad) return <View style={{ flex: 1 }} />;
  const near = nearText(l.vendor, spot);
  const add = () => { onAdd(l); setAdded(true); setTimeout(() => setAdded(false), 1500); };
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={l.title + ', ' + naira(l.price) + ' per ' + l.unit}
      style={({ pressed, hovered }) => [{ backgroundColor: c.sf, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: hovered ? c.line2 : c.line, opacity: pressed ? 0.9 : 1 },
        fixed ? { width: 236 } : { flex: 1 }]}>
      <View>
        <ArtPanel uri={img(l)} category={l.category} height={site ? 156 : 104} />
        {isFresh(l) ? <View style={{ position: 'absolute', top: 10, left: 10 }}><Pill tone="orange" icon="leaf" label="Listed today" /></View> : null}
      </View>
      <View style={{ padding: 12, gap: 4, flex: 1 }}>
        <Txt v="bold" numberOfLines={2} style={{ fontSize: 15 }}>{l.title}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="check-decagram" size={14} color={c.acc} />
          <Txt v="small" color={c.acc} numberOfLines={1} style={{ flexShrink: 1 }}>{hideFarm ? 'Verified ' + sellerWord(l.category) + ' near you' : l.vendor?.business_name}</Txt>
        </View>
        {near ? <Txt v="small" numberOfLines={1}>{near}</Txt> : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
          <Txt v="mono" numberOfLines={1} style={{ fontSize: site ? 20 : 17, lineHeight: site ? 26 : 22, flexShrink: 1 }}>{naira(l.price)}<Txt v="small"> / {l.unit}</Txt></Txt>
          {site && onAdd ? (
            <Pressable onPress={add} accessibilityRole="button" accessibilityLabel={'Add ' + l.title + ' to cart'} hitSlop={4}
              style={({ hovered }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: added ? c.sagebg : c.yolk, alignItems: 'center', justifyContent: 'center', opacity: hovered ? 0.9 : 1 })}>
              <Icon name={added ? 'check' : 'plus'} size={22} color={added ? c.sage : c.onyolk} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// A compact row (waste listings, phone lists): thumbnail, title, seller line, price.
export function ListRow({ l, onPress, hideFarm, spot }) {
  const near = nearText(l.vendor, spot);
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
      <Thumb uri={img(l)} category={l.category} size={64} radius={14} />
      <View style={{ flex: 1, gap: 3 }}>
        <Txt v="bold" numberOfLines={1}>{l.title}</Txt>
        <Txt v="small" numberOfLines={1}>{hideFarm ? 'Verified ' + sellerWord(l.category) + ' · ' + catLabel(l.category) : l.vendor?.business_name}</Txt>
        {near ? <Txt v="small" numberOfLines={1}>{near}</Txt> : null}
      </View>
      <Txt v="mono">{naira(l.price)}</Txt>
    </Card>
  );
}

// A grid of product cards inside a scrolling page (rows of equal-width cards).
function ProductGrid({ items, cols, hideFarm, spot, onOpen, onAdd }) {
  const rows = []; const all = padRows(items, cols);
  for (let i = 0; i < all.length; i += cols) rows.push(all.slice(i, i + cols));
  return <View style={{ gap: 12 }}>{rows.map((r, i) => <View key={i} style={{ flexDirection: 'row', gap: 12 }}>{r.map((l) => <ListingCard key={l.id} l={l} hideFarm={hideFarm} spot={spot} onAdd={onAdd} onPress={() => onOpen(l)} />)}</View>)}</View>;
}

function SearchButton({ onPress }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="search" style={({ hovered }) => ({ height: 56, backgroundColor: c.sf, borderRadius: 16, borderWidth: 1, borderColor: hovered ? c.line2 : c.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 })}>
      <Icon name="magnify" color={c.mute} /><Txt v="body" color={c.mute}>Search eggs, chicken, turkey, feed…</Txt>
    </Pressable>
  );
}

// Category tile: tint + drawing + label.
function CategoryTile({ k, onPress, wide }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={k.label}
      style={({ hovered, pressed }) => [{ backgroundColor: c[artTint(k.id)], borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 8, opacity: pressed ? 0.85 : hovered ? 0.92 : 1 },
        wide ? { flex: 1, minHeight: 128 } : { width: 104, minHeight: 112 }]}>
      <PlaceholderArt category={k.id} size={wide ? 64 : 56} bare />
      <Txt v="bold" numberOfLines={2} style={{ fontSize: 14, textAlign: 'center' }}>{k.label}</Txt>
    </Pressable>
  );
}

// The live order: orange dot + status, arrival time large, one line, Track order, six progress segments.
function LiveHearth({ live, onTrack, style }) {
  const { c } = useTheme();
  const wide = useWide();
  return (
    <Hearth style={style} onPress={onTrack}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <LiveDot />
        <Txt v="strong" color={c.hink} numberOfLines={1} style={{ flex: 1 }}>{'Order ' + live.code + ' · ' + live.title.toLowerCase()}</Txt>
      </View>
      <View style={{ gap: 2 }}>
        <Txt v="label" color={c.hmute}>{live.label}</Txt>
        <Txt v="monoLg" color={c.hink} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: wide ? 44 : 38, lineHeight: wide ? 50 : 44 }}>{live.big}</Txt>
        <Txt v="body" color={c.hmute} numberOfLines={2}>{live.line}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Button small variant="onHearth" icon="map-marker-path" title="Track order" onPress={onTrack} style={{ paddingHorizontal: 20 }} />
        <ProgressSegments total={6} done={live.step} onDark style={{ flex: 1 }} />
      </View>
    </Hearth>
  );
}

// Wallet balance, what's owed on pay later and when, Open wallet.
function WalletCard({ wallet, owed, navigation, style }) {
  const { c } = useTheme();
  const overdue = owed?.due && new Date(owed.due + 'T23:59:59') < new Date();
  return (
    <Card style={[{ gap: 12, padding: 18 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="wallet-outline" size={20} color={c.acc} /><Txt v="label">Wallet</Txt></View>
      <Txt v="mono" style={{ fontSize: 28, lineHeight: 34, letterSpacing: -0.6 }}>{naira(wallet?.balance)}</Txt>
      {owed?.amount > 0 ? (
        <View style={{ borderTopWidth: 1, borderColor: c.line, paddingTop: 10, gap: 4 }}>
          <Txt v="label">Pay later</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Txt v="mono">{naira(owed.amount)}</Txt>
            {owed.due ? <Pill tone={overdue ? 'err' : 'neutral'} label={(overdue ? 'Overdue · ' : 'Due ') + new Date(owed.due + 'T12:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} /> : null}
          </View>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      <Button small variant="outline" title="Open wallet" onPress={() => navigation.navigate('Wallet')} />
    </Card>
  );
}

export function HomeScreen({ navigation }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const { profile, wallet, refreshWallet } = useAuth();
  const { count, add } = useCart();
  const { spot } = useSpot();
  const [ctx, setCtx] = useState(null);
  const [live, setLive] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [owed, setOwed] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [d, orders, l, credit] = await Promise.all([deliveryContext(), rpc('buyer_orders'), fetchListings({ limit: 24 }), rpc('my_credit').catch(() => [])]);
      setCtx(d); setFresh(l); refreshWallet();
      const pending = (credit || []).flatMap((f) => (f.entries || []).filter((e) => e.status === 'pending'));
      setOwed({ amount: (credit || []).reduce((s, f) => s + Number(f.outstanding || 0), 0), due: pending.map((e) => e.due_date).sort()[0] || null });
      const active = (orders || []).find((o) => (o.subs || []).some((s) => ACTIVE.includes(s.status)));
      if (active) {
        const detail = await rpc('order_detail', { p_order: active.id });
        const lv = liveOrder(detail);
        setLive(lv ? { ...lv, id: active.id, code: active.code } : null);
      } else setLive(null);
    } catch (e) { console.warn(e); } finally { setBusy(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const first = (profile?.full_name || '').split(' ')[0];
  const area = ctx?.primary?.area;
  const near = fresh ? byDistance(fresh, spot).slice(0, wide ? 8 : 6) : null;
  const addToCart = (l) => add(l, 1, true);
  const openProduct = (l) => navigation.navigate('Product', { id: l.id, viaSearch: true });
  const track = () => live && navigation.navigate('Tracking', { orderId: live.id });
  const outside = ctx && ctx.primary && !ctx.covered
    ? <Banner tone="warn" icon="map-marker-off-outline" title={"We don't deliver to " + ctx.primary.area + ' yet'} body="Switch to an address in our delivery area to order." action="Change" onAction={() => navigation.navigate('Checkout', { manageOnly: true })} /> : null;
  const freshList = (
    <View style={{ gap: 14 }}>
      <SectionHead title="Fresh today, nearest first" action="See all" onAction={() => navigation.navigate('Market')} />
      {near === null ? <View style={{ flexDirection: 'row', gap: 12 }}><Skeleton h={260} r={20} w="auto" style={{ flex: 1 }} /><Skeleton h={260} r={20} w="auto" style={{ flex: 1 }} /></View>
        : near.length ? <ProductGrid items={near} cols={wide ? 4 : 2} hideFarm spot={spot} onOpen={openProduct} onAdd={addToCart} />
        : <Empty art="eggs" title="Nothing listed near you yet" body="Verified farms add eggs, birds and feed every day. Check back this afternoon." action="Open the market" onAction={() => navigation.navigate('Market')} />}
    </View>
  );
  const categories = wide
    ? <View style={{ flexDirection: 'row', gap: 12 }}>{CATEGORIES.map((k) => <CategoryTile key={k.id} k={k} wide onPress={() => navigation.navigate('Market', { category: k.id })} />)}</View>
    : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} style={{ marginRight: -20 }}>
        {CATEGORIES.map((k) => <CategoryTile key={k.id} k={k} onPress={() => navigation.navigate('Market', { category: k.id })} />)}</ScrollView>;
  const invest = INVEST_ENABLED && !(profile?.roles || []).includes('investor') ? (
    <Card onPress={() => navigation.navigate('InvestHome')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.t3, alignItems: 'center', justifyContent: 'center' }}><Icon name="chart-line" color={c.t3i} /></View>
      <View style={{ flex: 1 }}><Txt v="bold">Invest in verified farms</Txt><Txt v="small">Fund a farm or a pool and track what it returns.</Txt></View>
      <Icon name="chevron-right" color={c.mute} />
    </Card>
  ) : null;

  if (wide) return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, gap: 28 }, page]} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <HeaderBar title={hello() + (first ? ', ' + first : '')}>
          <Button small variant="outline" icon="map-marker-outline" title={area ? 'Deliver to ' + area : 'Add an address'} onPress={() => navigation.navigate('Checkout', { manageOnly: true })} style={{ paddingHorizontal: 16 }} />
          <Button small variant="outline" icon="shopping-outline" title={'Cart · ' + count} onPress={() => navigation.navigate('Cart')} style={{ paddingHorizontal: 16 }} />
        </HeaderBar>
        {outside}
        {live ? (
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>
            <LiveHearth live={live} onTrack={track} style={{ flex: 2 }} />
            <WalletCard wallet={wallet} owed={owed} navigation={navigation} style={{ flex: 1 }} />
          </View>
        ) : null}
        <SearchButton onPress={() => navigation.navigate('Market', { search: true })} />
        <View style={{ gap: 14 }}><SectionHead title="Shop by category" />{categories}</View>
        {freshList}
        {!live ? <WalletCard wallet={wallet} owed={owed} navigation={navigation} style={{ maxWidth: 420 }} /> : null}
        {invest}
      </ScrollView>
    </Screen>
  );
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 20 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <TopBar navigation={navigation} />
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => navigation.navigate('Checkout', { manageOnly: true })} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 32 }}>
            <Icon name="map-marker-outline" size={18} color={c.acc} />
            <Txt v="small">Deliver to</Txt>
            <Txt v="bold" style={{ fontSize: 14 }}>{area || 'Add an address'}</Txt>
            <Icon name="chevron-down" size={18} color={c.mute} />
          </Pressable>
          <Txt v="display">What's on the table today{first ? ', ' + first : ''}?</Txt>
        </View>
        {outside}
        {live ? <LiveHearth live={live} onTrack={track} /> : null}
        <SearchButton onPress={() => navigation.navigate('Market', { search: true })} />
        <View style={{ gap: 12 }}><SectionHead title="Shop by category" />{categories}</View>
        {freshList}
        {invest}
      </ScrollView>
    </Screen>
  );
}

const SORTS = [{ value: 'nearest', label: 'Nearest' }, { value: 'cheapest', label: 'Lowest price' }];
const EXTRA = [{ id: 'vet', label: 'Vet care', icon: 'stethoscope' }, { id: 'waste', label: 'Waste & manure', icon: 'sprout-outline' }];

// The market: search, category chips (selected = ink fill), "n listings near <area>" with Nearest / Lowest price, the product grid.
// Also opened as "Listings" (a category or a search from elsewhere).
function Browse({ navigation, route, tab: tabRoute }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const cols = useGridCols(4);
  const { session } = useAuth();
  const { count, add } = useCart();
  const tab = tabRoute && !!session;   // the Market tab (signed-out website visitors get the plain page)
  const p = route.params || {};
  const [category, setCategory] = useState(p.category || null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('nearest');
  const [items, setItems] = useState(null);
  const [area, setArea] = useState(null);
  const { spot, locate } = useSpot();
  useEffect(() => { if (p.category !== undefined) setCategory(p.category || null); }, [p.category]);
  useEffect(() => { if (session) deliveryContext().then((d) => setArea(d.primary?.area || null)).catch(() => {}); }, [session]);
  const load = useCallback(async () => {
    setItems(null);
    try { setItems(await fetchListings({ category: category || undefined, q: q.trim() || undefined, waste: !!p.waste, sort: sort === 'cheapest' ? 'cheapest' : 'newest', limit: 60 })); }
    catch { setItems([]); }
  }, [category, q, sort, p.waste]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load]);
  const shown = items && sort === 'nearest' && spot ? byDistance(items, spot) : items;
  const where = area || (spot ? 'you' : null);
  const openExtra = (id) => (!session ? navigation.navigate('SignIn') : navigation.navigate(id === 'vet' ? 'VetHome' : 'WasteHome'));
  const title = p.waste ? 'Waste & manure' : tab ? 'Market' : category ? catLabel(category) : 'Market';
  const searchBox = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, borderRadius: 16, backgroundColor: c.sf, borderWidth: 1, borderColor: c.line2, paddingHorizontal: 16, flex: wide || tab ? undefined : 1, width: wide ? 360 : undefined }}>
      <Icon name="magnify" color={c.mute} />
      <TextInput value={q} onChangeText={setQ} autoFocus={!!p.search} placeholder="Search eggs, chicken, feed…" placeholderTextColor={c.mute} returnKeyType="search" maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ flex: 1, color: c.ink, fontSize: 15, minHeight: 44 }} accessibilityLabel="Search the market" />
      {q ? <Pressable onPress={() => setQ('')} accessibilityLabel="Clear search" hitSlop={8}><Icon name="close-circle" size={20} color={c.mute} /></Pressable> : null}
    </View>
  );
  const chips = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: wide ? 0 : 20 }} style={wide ? null : { marginRight: -20 }}>
      <Chip label="All" selected={!category} onPress={() => setCategory(null)} />
      {CATEGORIES.map((k) => <Chip key={k.id} label={k.label} selected={category === k.id} onPress={() => setCategory(k.id)} />)}
      {tab && !p.waste ? EXTRA.map((k) => <Chip key={k.id} icon={k.icon} label={k.label} onPress={() => openExtra(k.id)} />) : null}
    </ScrollView>
  );
  const summary = (
    <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 10 }}>
      <Txt v="strong" style={{ flex: wide ? 1 : undefined }}>{items ? (items.length === 1 ? '1 listing' : items.length + ' listings') + (where ? ' near ' + where : '') : 'Loading…'}</Txt>
      {spot ? <View style={{ width: wide ? 300 : undefined }}><Segmented options={SORTS} value={sort} onChange={setSort} /></View>
        : <Pressable onPress={locate} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.navact }}>
            <Icon name="crosshairs-gps" size={18} color={c.navactink} /><Txt v="strong" color={c.navactink} style={{ fontSize: 14 }}>Use my location to see the nearest sellers</Txt></Pressable>}
    </View>
  );
  const kind = category || (p.waste ? 'feed' : 'eggs');
  const empty = items && !shown.length ? (
    <Empty art={kind} title={q ? 'Nothing for "' + q + '"' : 'No ' + (category ? catLabel(category).toLowerCase() : 'products') + ' listed' + (where ? ' near ' + where : '') + ' yet'}
      body={q ? 'Try a shorter word, or pick a category.' : 'Verified sellers add stock every day. Try another category for now.'}
      action={category || q ? 'See everything' : undefined} onAction={() => { setCategory(null); setQ(''); }} />
  ) : null;
  const header = wide ? (
    <HeaderBar title={title}>{searchBox}<Button small variant="outline" icon="shopping-outline" title={'Cart · ' + count} onPress={() => navigation.navigate('Cart')} style={{ paddingHorizontal: 16 }} /></HeaderBar>
  ) : tab ? (<>
    <TopBar navigation={navigation} />
    <Txt v="display">Market</Txt>
    {searchBox}
  </>) : (<>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {navigation.canGoBack() ? <BackButton onPress={() => navigation.goBack()} /> : null}
      {searchBox}
    </View>
    {!p.search ? <Txt v="display">{title}</Txt> : null}
  </>);
  return (
    <Screen pad={false}>
      <FlatList key={cols} data={items && shown.length ? padRows(shown, cols) : []} keyExtractor={(x) => x.id} numColumns={cols} columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: 12 }, page]} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<View style={{ gap: 16, marginBottom: 6 }}>{header}{chips}{summary}</View>}
        ListEmptyComponent={items === null ? <View style={{ flexDirection: 'row', gap: 12 }}><Skeleton h={250} r={20} w="auto" style={{ flex: 1 }} /><Skeleton h={250} r={20} w="auto" style={{ flex: 1 }} /></View> : empty}
        renderItem={({ item }) => <ListingCard l={item} hideFarm spot={spot} onAdd={(l) => add(l, 1, true)} onPress={() => navigation.navigate('Product', { id: item.id, viaSearch: true })} />} />
    </Screen>
  );
}

export function MarketScreen(props) { return <Browse {...props} tab={props.route?.name === 'Market'} />; }
export function ListingsScreen(props) { return <Browse {...props} />; }

// Quantity stepper.
function Stepper({ qty, setQty, max }) {
  const { c } = useTheme();
  const btn = (icon, label, onPress, disabled) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}><Icon name={icon} /></Pressable>
  );
  return (
    <View style={{ height: 56, borderRadius: 100, backgroundColor: c.sf2, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 4 }}>
      {btn('minus', 'Fewer', () => setQty(Math.max(1, qty - 1)), qty <= 1)}
      <Txt v="mono" style={{ minWidth: 32, textAlign: 'center', fontSize: 17 }}>{qty}</Txt>
      {btn('plus', 'More', () => setQty(Math.min(max, qty + 1)), qty >= max)}
    </View>
  );
}

export function ProductScreen({ navigation, route }) {
  const { c } = useTheme();
  const { add } = useCart();
  const { id, viaSearch } = route.params;
  const wide = useWide();
  const { spot } = useSpot();
  const [l, setL] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [more, setMore] = useState([]);
  const [qty, setQty] = useState(1);
  const [page, setPage] = useState(0);
  const W = Math.min(Dimensions.get('window').width, 1080);
  useEffect(() => {
    setQty(1); setPage(0);
    supabase.from('listings').select('*, vendor:vendor_profiles(user_id,business_name,rating,rating_count,location,lat,lng,parent_id)').eq('id', id).maybeSingle().then(({ data }) => {
      setL(data);
      if (data) fetchListings({ category: data.category, limit: 12 }).then((r) => setMore((r || []).filter((x) => x.id !== data.id))).catch(() => {});
    });
    deliveryContext().then(setCtx).catch(() => {});
  }, [id]);
  if (!l) return <Screen><AppBar /><Skeleton h={300} r={24} /><Skeleton h={120} r={20} /></Screen>;
  const out = l.quantity <= 0 || l.status !== 'live';
  const outside = ctx?.primary && !ctx.covered;
  const photos = (l.photos || []).map((p) => publicUrl('listing-photos', p));
  const km = distanceKm(l.vendor, spot);
  const win = deliveryWindow();
  const word = sellerWord(l.category);
  const nearby = byDistance(more, spot).slice(0, 4);
  const buy = out
    ? <Button variant="outline" icon="bell-outline" title="Sold out · check back soon" disabled />
    : <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Stepper qty={qty} setQty={setQty} max={l.quantity} />
        <Button title={'Add · ' + naira(l.price * qty)} disabled={!!outside} onPress={() => { add(l, qty, !!viaSearch); navigation.navigate('Cart'); }} style={{ flex: 1 }} />
      </View>;
  const details = <>
    <Txt v="display" style={{ fontSize: wide ? 32 : 26, lineHeight: wide ? 37 : 31 }}>{l.title}</Txt>
    <Txt v="mono" style={{ fontSize: 34, lineHeight: 40, letterSpacing: -0.6 }}>{naira(l.price)}<Txt v="small" style={{ fontSize: 15 }}> / {l.unit}</Txt></Txt>
    {out ? <Pill tone="err" label="Sold out" /> : <Pill tone="ok" label={'In stock · ' + Number(l.quantity).toLocaleString() + ' ' + l.unit + (l.quantity === 1 ? '' : 's')} />}
    {outside ? <Banner tone="warn" icon="map-marker-off-outline" title={"We can't deliver to " + ctx.primary.area + ' yet'} body="Switch to an address in our delivery area to add this to your cart." />
      : <Hearth style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="truck-delivery-outline" size={20} color={c.hacc} /><Txt v="label" color={c.hmute}>Delivered by Poultry360</Txt></View>
          <Txt v="h2" color={c.hink}>{win.day + ', ' + win.time}</Txt>
          <View style={{ borderTopWidth: 1, borderColor: c.hline, paddingTop: 6 }}>
            <MoneyLine onDark label="Delivery fee" value={naira(deliveryFee(l.vendor, spot))} />
            <MoneyLine onDark label="Distance" value={km != null ? kmLabel(km) : 'Pin your address'} />
          </View>
        </Hearth>}
    {wide ? <View style={{ marginTop: 4 }}>{buy}</View> : null}
    <View>
      {viaSearch ? <TrustRow icon="check-decagram" text={'Sourced from a verified ' + word + ' near you'} sub="You see the seller's name after checkout" />
        : <Pressable onPress={() => navigation.navigate('Store', { vendorId: l.vendor_id })} accessibilityRole="link"><TrustRow icon="check-decagram" text={l.vendor?.business_name} sub={l.vendor?.rating_count ? '★ ' + Number(l.vendor.rating).toFixed(1) + ' · ' + l.vendor.rating_count + ' reviews' : 'Verified seller · new'} /></Pressable>}
      <TrustRow icon="clipboard-check-outline" text="Quality checked at pickup" />
      <TrustRow icon="shield-check-outline" text="The seller is paid only after delivery" />
    </View>
    {l.attributes?.moisture ? <Txt v="small">Moisture content: {l.attributes.moisture}%</Txt> : null}
    {l.description ? <Txt v="body" color={c.mute}>{l.description}</Txt> : null}
  </>;
  const moreNear = nearby.length ? (
    <View style={{ gap: 14 }}>
      <SectionHead title="More near you" />
      <ProductGrid items={nearby.slice(0, wide ? 4 : 2)} cols={wide ? 4 : 2} hideFarm spot={spot} onOpen={(x) => navigation.push('Product', { id: x.id, viaSearch: true })} />
    </View>
  ) : null;
  if (wide) return (
    <Screen pad={false} column>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 32, paddingTop: 20, paddingBottom: 48, gap: 36 }}>
        {navigation.canGoBack() ? <BackButton onPress={() => navigation.goBack()} style={{ alignSelf: 'flex-start' }} /> : null}
        <View style={{ flexDirection: 'row', gap: 40, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.1, gap: 12 }}>
            <ArtPanel uri={photos[Math.min(page, Math.max(0, photos.length - 1))]} category={l.category} height={420} radius={28} dim={out} />
            {photos.length > 1 ? <View style={{ flexDirection: 'row', gap: 10 }}>{photos.map((u, i) => (
              <Pressable key={u} onPress={() => setPage(i)} accessibilityLabel={'Photo ' + (i + 1)} style={{ borderRadius: 14, borderWidth: 2, borderColor: i === page ? c.yolk : 'transparent' }}>
                <Thumb uri={u} size={76} radius={12} /></Pressable>))}</View> : null}
          </View>
          <View style={{ flex: 1, gap: 16 }}>{details}</View>
        </View>
        {moreNear}
      </ScrollView>
    </Screen>
  );
  return (
    <Screen pad={false} column edges={[]} footer={buy}>
      <ScrollView>
        <View>
          {photos.length ? <FlatList horizontal pagingEnabled data={photos} keyExtractor={(u) => u} onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
            renderItem={({ item }) => <ArtPanel uri={item} category={l.category} height={320} style={{ width: W }} dim={out} />} />
            : <ArtPanel category={l.category} height={300} />}
          {Platform.OS !== 'web' ? <Pressable onPress={() => navigation.goBack()} accessibilityLabel="Back" style={{ position: 'absolute', top: 44, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name="arrow-left" /></Pressable>
            : navigation.canGoBack() ? <BackButton onPress={() => navigation.goBack()} style={{ position: 'absolute', top: 8, left: 8 }} /> : null}
          {photos.length > 1 ? <View style={{ position: 'absolute', bottom: 34, alignSelf: 'center', flexDirection: 'row', gap: 6 }}>{photos.map((_, i) => <View key={i} style={{ width: i === page ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: c.ink, opacity: i === page ? 1 : 0.3 }} />)}</View> : null}
        </View>
        <View style={{ marginTop: -24, backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, gap: 14 }}>
          {details}
          {moreNear}
        </View>
      </ScrollView>
    </Screen>
  );
}

// A seller's page (also an agent's shop, reached from a product).
export function StoreScreen({ navigation, route }) {
  const page = usePage();
  const { c } = useTheme();
  const { vendorId } = route.params;
  const cols = useGridCols(4);
  const { spot } = useSpot();
  const { add } = useCart();
  const [v, setV] = useState(null);
  const [parent, setParent] = useState(null);
  const [items, setItems] = useState(null);
  useEffect(() => {
    supabase.from('vendor_profiles').select('*').eq('user_id', vendorId).maybeSingle().then(({ data }) => {
      setV(data);
      if (data?.parent_id) supabase.from('vendor_profiles').select('business_name').eq('user_id', data.parent_id).maybeSingle().then((r) => setParent(r.data?.business_name || null));
    });
    fetchListings({ vendorId, limit: 60 }).then(setItems).catch(() => setItems([]));
  }, [vendorId]);
  const km = v ? distanceKm(v, spot) : null;
  const initials = (v?.business_name || '').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  return (
    <Screen pad={false}>
      <AppBar />
      <FlatList key={cols} data={padRows(items || [], cols)} keyExtractor={(x) => x.id} numColumns={cols} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={[{ padding: 20, paddingTop: 0, gap: 12 }, page]}
        ListHeaderComponent={v ? <View style={{ gap: 16, marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: c.hc, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" color={c.hink}>{initials}</Txt></View>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="display" style={{ fontSize: 28 }}>{v.business_name}</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {v.verification_status === 'approved' ? <Pill tone="ok" label="Verified" /> : null}
                <Txt v="small">{v.parent_id ? (parent ? 'Agent for ' + parent : 'Agent') : v.location}{km != null ? ' · ' + kmLabel(km) + ' from you' : ''}</Txt>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Card style={{ flex: 1, gap: 2 }}><Txt v="label">Rating</Txt><Txt v="mono" style={{ fontSize: 22 }}>{v.rating_count ? Number(v.rating).toFixed(1) + ' ★' : 'New'}</Txt><Txt v="small">{v.rating_count ? v.rating_count + ' reviews' : 'No ratings yet'}</Txt></Card>
            <Card style={{ flex: 1, gap: 2 }}><Txt v="label">For sale</Txt><Txt v="mono" style={{ fontSize: 22 }}>{items ? items.length : '–'}</Txt><Txt v="small">Products</Txt></Card>
          </View>
        </View> : <Skeleton h={160} r={20} />}
        ListEmptyComponent={items ? <Empty art="eggs" title="Nothing for sale right now" body="This seller adds stock often. Check back soon." /> : null}
        renderItem={({ item }) => <ListingCard l={item} spot={spot} onAdd={(l) => add(l, 1, false)} onPress={() => navigation.navigate('Product', { id: item.id })} />} />
    </Screen>
  );
}
