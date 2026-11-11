import React, { useCallback, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, useWide, usePage, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Empty, Input, Chip, Pill, Skeleton, Sheet, DateInput,
  naira, isoDate, shortDate, timeAgo, rpc, supabase, friendlyError, HeaderBar, SectionHead, ActionRow, PlaceholderArt, MoneyLine } from '@p360/shared';
import { useCart } from '../context/CartContext';
import { CATEGORIES, SUBTYPES, catLabel, unitsFor, LISTING_SELECT } from '../lib/catalog';

// Wanted requests: a buyer posts what they need, verified sellers reply with a price, the buyer accepts one.
// An accepted offer is a listing reserved for that buyer, so it goes through the normal cart and checkout.

const STATUS = { open: { tone: 'live', label: 'Taking offers' }, accepted: { tone: 'ok', label: 'Offer accepted' }, closed: { tone: 'neutral', label: 'Closed' } };
const plural = (u, n) => (Number(n) === 1 || !u || u === 'kg' || u.endsWith('s') ? u : u + 's');
const qtyText = (n, u) => Number(n).toLocaleString() + ' ' + plural(u, n);

// Post a request.
export function WantedNewScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const [f, setF] = useState({ category: route.params?.category || 'chicken', type: '', title: '', quantity: '', unit: unitsFor(route.params?.category || 'chicken')[0], max: '', needed: '', notes: '' });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const setCategory = (k) => setF((x) => ({ ...x, category: k, type: '', unit: unitsFor(k).includes(x.unit) ? x.unit : unitsFor(k)[0] }));
  const types = SUBTYPES[f.category];
  const missing = !f.title.trim() && !f.type ? 'Say what you need' : !(parseInt(f.quantity, 10) > 0) ? 'Enter how many' : null;
  const post = async () => {
    setTried(true);
    if (missing) return;
    setBusy(true);
    try {
      await rpc('post_buy_request', { p_category: f.category, p_type: f.type || null, p_title: f.title.trim() || f.type, p_quantity: parseInt(f.quantity, 10), p_unit: f.unit,
        p_max_price: Number(f.max) > 0 ? Number(f.max) : null, p_needed_by: f.needed || null, p_notes: f.notes.trim() || null });
      navigation.replace('MyWanted', { posted: true });
    } catch (e) { Alert.alert("Couldn't post it", friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll style={wide ? { maxWidth: 760 } : null} footer={<Button title={missing || 'Post request'} disabled={!!missing && tried} loading={busy} onPress={post} />}>
      <AppBar title="Post what you need" close />
      <Txt v="body" color={c.mute}>Verified farms and stores near you reply with a price. You choose one.</Txt>
      <Card style={{ gap: 14, padding: 18 }}>
        <Txt v="strong" style={{ fontSize: 14 }}>Category</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{CATEGORIES.map((k) => <Chip key={k.id} label={k.label} selected={f.category === k.id} onPress={() => setCategory(k.id)} />)}</View>
        {types ? <>
          <Txt v="strong" style={{ fontSize: 14 }}>What kind</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{types.map((t) => <Chip key={t} label={t} selected={f.type === t} onPress={() => set('type')(f.type === t ? '' : t)} />)}</View>
        </> : null}
        <Input label="Describe it" value={f.title} onChangeText={set('title')} placeholder={f.type ? f.type + ', e.g. size or grade' : 'e.g. Frozen chicken wings'} error={tried && !f.title.trim() && !f.type ? 'Say what you need' : null} />
      </Card>
      <Card style={{ gap: 14, padding: 18 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Input label="How many" keyboardType="number-pad" value={f.quantity} onChangeText={(t) => set('quantity')(t.replace(/\D/g, ''))} mono error={tried && !(parseInt(f.quantity, 10) > 0) ? 'Enter how many' : null} /></View>
          <View style={{ flex: 1 }}><Input label={'Most you pay per ' + f.unit + ' (optional)'} prefix="₦" keyboardType="number-pad" value={f.max} onChangeText={(t) => set('max')(t.replace(/\D/g, ''))} mono /></View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{unitsFor(f.category).map((u) => <Chip key={u} label={'Per ' + u} selected={f.unit === u} onPress={() => set('unit')(u)} />)}</View>
        <DateInput label="Needed by (optional)" value={f.needed} onChange={set('needed')} min={isoDate()} clearable />
        <Input label="Notes (optional)" value={f.notes} onChangeText={set('notes')} multiline placeholder="Weekly supply, size, packing…" />
      </Card>
      <Txt v="small">Sellers see your area and business name, not your address or phone.</Txt>
    </Screen>
  );
}

// A buyer's requests.
export function MyWantedScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const [rows, setRows] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); try { setRows(await rpc('my_buy_requests')); } catch { setRows(null); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, gap: 16, paddingBottom: 40 }, page]} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        {wide ? <HeaderBar title="Wanted" subtitle="What you asked sellers for"><Button small icon="plus" title="Post what you need" onPress={() => navigation.navigate('WantedNew')} style={{ paddingHorizontal: 18 }} /></HeaderBar>
          : <AppBar title="Wanted" right={<Button small icon="plus" title="Post" onPress={() => navigation.navigate('WantedNew')} style={{ paddingHorizontal: 14 }} />} />}
        {route.params?.posted ? <Card tone="ok" style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Icon name="check-circle" color={c.sage} /><Txt v="strong" style={{ flex: 1 }}>Posted. Offers show here as sellers reply.</Txt></Card> : null}
        {rows === undefined ? <><Skeleton h={90} r={20} /><Skeleton h={90} r={20} /></>
          : !rows?.length ? <Empty art="eggs" title="No requests yet" body="Can't find it in the market? Post what you need and sellers reply with a price." action="Post what you need" onAction={() => navigation.navigate('WantedNew')} />
          : rows.map((r) => {
            const live = r.offers.filter((o) => o.status === 'pending' || o.status === 'accepted');
            const best = live.length ? Math.min(...live.map((o) => Number(o.price))) : null;
            return (
              <Card key={r.id} onPress={() => navigation.navigate('WantedDetail', { id: r.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
                <PlaceholderArt category={r.category} size={52} radius={14} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Txt v="bold" numberOfLines={1}>{r.title}</Txt>
                  <Txt v="small">{qtyText(r.quantity, r.unit) + (r.needed_by ? ' · by ' + shortDate(r.needed_by) : '') + ' · ' + timeAgo(r.created_at)}</Txt>
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                    <Pill tone={STATUS[r.status].tone} label={STATUS[r.status].label} />
                    {r.status === 'open' ? <Pill tone={live.length ? 'orange' : 'neutral'} label={live.length ? live.length + (live.length === 1 ? ' offer' : ' offers') : 'No offers yet'} /> : null}
                  </View>
                </View>
                {best ? <View style={{ alignItems: 'flex-end' }}><Txt v="small">from</Txt><Txt v="mono">{naira(best)}</Txt><Txt v="small">{'/ ' + r.unit}</Txt></View> : <Icon name="chevron-right" color={c.mute} />}
              </Card>
            );
          })}
      </ScrollView>
    </Screen>
  );
}

// One request with its offers: accept one (it goes to the cart), decline, or close the request.
export function WantedDetailScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const { add } = useCart();
  const [r, setR] = useState(undefined);
  const [busy, setBusy] = useState(null);
  const load = useCallback(async () => { try { setR((await rpc('my_buy_requests')).find((x) => x.id === route.params?.id) || null); } catch { setR(null); } }, [route.params?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (r === undefined) return <Screen><AppBar title="Request" /><Skeleton h={160} r={24} /></Screen>;
  if (!r) return <Screen><AppBar title="Request" /><Empty icon="file-search-outline" title="Request not found" /></Screen>;
  const toCart = async (listingId, qty) => {
    const { data: l } = await supabase.from('listings').select(LISTING_SELECT).eq('id', listingId).single();
    if (!l) throw new Error('OFFER_NOT_FOUND');
    add(l, Math.min(qty, Number(l.quantity)) || qty, false);
    navigation.navigate('Cart');
  };
  const accept = (o) => Alert.alert('Accept this offer?', qtyText(o.quantity, r.unit) + ' at ' + naira(o.price) + ' each from ' + o.seller + '. Other offers are declined, and it goes to your cart to pay.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Accept', onPress: async () => { setBusy(o.id); try { const res = await rpc('accept_offer', { p_offer: o.id }); await toCart(res.listing_id, res.quantity); } catch (e) { Alert.alert("Couldn't accept", friendlyError(e)); load(); } finally { setBusy(null); } } }]);
  const decline = async (o) => { setBusy(o.id); try { await rpc('decline_offer', { p_offer: o.id }); load(); } catch (e) { Alert.alert("Couldn't decline", friendlyError(e)); } finally { setBusy(null); } };
  const close = () => Alert.alert('Close this request?', 'Sellers stop seeing it and pending offers are declined.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Close', style: 'destructive', onPress: async () => { try { await rpc('close_buy_request', { p_request: r.id }); load(); } catch (e) { Alert.alert("Couldn't close it", friendlyError(e)); } } }]);
  const accepted = r.offers.find((o) => o.status === 'accepted');
  const shown = r.offers.filter((o) => o.status !== 'withdrawn');
  return (
    <Screen scroll style={wide ? { maxWidth: 820 } : null}>
      <AppBar title="Request" />
      <Card style={{ gap: 10, padding: 18 }}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <PlaceholderArt category={r.category} size={56} radius={16} />
          <View style={{ flex: 1, gap: 2 }}><Txt v="h2">{r.title}</Txt><Txt v="small">{catLabel(r.category) + (r.type && r.type !== r.title ? ' · ' + r.type : '')}</Txt></View>
          <Pill tone={STATUS[r.status].tone} label={STATUS[r.status].label} />
        </View>
        <MoneyLine label="Quantity" value={qtyText(r.quantity, r.unit)} />
        {r.max_price ? <MoneyLine label={'Most you pay per ' + r.unit} value={naira(r.max_price)} /> : null}
        {r.needed_by ? <MoneyLine label="Needed by" value={shortDate(r.needed_by)} /> : null}
        {r.notes ? <Txt v="body">{r.notes}</Txt> : null}
      </Card>
      {accepted ? (
        <Hearth>
          <Txt v="label" color={c.hmute}>Accepted · {accepted.seller}</Txt>
          <Txt v="monoLg" color={c.hink} style={{ fontSize: 34, lineHeight: 40 }}>{naira(Number(accepted.price) * accepted.quantity)}</Txt>
          <Txt v="small" color={c.hmute}>{qtyText(accepted.quantity, r.unit) + ' at ' + naira(accepted.price) + ' · delivery ' + naira(accepted.delivery_fee)}</Txt>
          <Button variant="onHearth" icon="cart-outline" title="Order now" loading={busy === accepted.id}
            onPress={async () => { setBusy(accepted.id); try { await toCart(accepted.listing_id, accepted.quantity); } catch (e) { Alert.alert("Couldn't open it", 'It may already be ordered. Check your orders.'); } finally { setBusy(null); } }} />
        </Hearth>
      ) : null}
      <SectionHead title="Offers" count={shown.length} />
      {!shown.length ? <Empty icon="timer-sand" title={r.status === 'open' ? 'No offers yet' : 'No offers'} body={r.status === 'open' ? 'Sellers near you see your request now. Offers show here.' : undefined} />
        : shown.map((o) => (
          <Card key={o.id} style={{ gap: 10, padding: 16, opacity: o.status === 'declined' ? 0.6 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.t1, alignItems: 'center', justifyContent: 'center' }}><Txt v="bold" color={c.t1i}>{(o.seller || 'S')[0]}</Txt></View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{o.seller}</Txt><Icon name="check-decagram" size={16} color={c.acc} /></View>
                <Txt v="small">{(o.rating ? '★ ' + Number(o.rating).toFixed(1) + ' · ' : '') + (o.km != null ? o.km + ' km · ' : '') + naira(o.delivery_fee) + ' delivery'}</Txt>
              </View>
              <View style={{ alignItems: 'flex-end' }}><Txt v="mono" style={{ fontSize: 20 }}>{naira(o.price)}</Txt><Txt v="small">{'per ' + r.unit}</Txt></View>
            </View>
            <Txt v="small">{qtyText(o.quantity, r.unit) + (o.quantity < r.quantity ? ' (of ' + r.quantity + ')' : '') + ' · total ' + naira(Number(o.price) * o.quantity)}</Txt>
            {o.note ? <Txt v="body">{'“' + o.note + '”'}</Txt> : null}
            {o.status === 'pending' && r.status === 'open' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button small title="Accept" loading={busy === o.id} onPress={() => accept(o)} style={{ flex: 1 }} />
                <Button small variant="outline" title="Decline" disabled={busy === o.id} onPress={() => decline(o)} style={{ flex: 1 }} />
              </View>
            ) : o.status === 'declined' ? <Pill tone="neutral" label="Declined" /> : null}
          </Card>
        ))}
      {r.status === 'open' ? <Button variant="ghost" title="Close this request" onPress={close} /> : null}
    </Screen>
  );
}

// Sellers: what buyers want, nearest first, with a sheet to make or change an offer.
export function WantedBoardScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const page = usePage();
  const [rows, setRows] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null);
  const load = useCallback(async () => { setBusy(true); try { setRows(await rpc('open_buy_requests')); } catch { setRows(null); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, gap: 14, paddingBottom: 40 }, page]} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        {wide ? <HeaderBar title="Buyers want" subtitle="Reply with your price. The buyer picks one offer." /> : <AppBar title="Buyers want" />}
        {rows === undefined ? <><Skeleton h={110} r={20} /><Skeleton h={110} r={20} /></>
          : !rows?.length ? <Empty art="feed" title="No requests right now" body="When buyers post what they need, it shows here." />
          : rows.map((r) => <WantedRow key={r.id} r={r} onOffer={() => setSheet(r)} />)}
      </ScrollView>
      <OfferSheet r={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />
    </Screen>
  );
}

export function WantedRow({ r, onOffer }) {
  const { c } = useTheme();
  const mine = r.mine && r.mine.status !== 'withdrawn' ? r.mine : null;
  return (
    <ActionRow lead={<PlaceholderArt category={r.category} size={48} radius={14} />}
      title={qtyText(r.quantity, r.unit) + ' · ' + r.title}
      detail={[r.buyer, r.area ? r.area + (r.km != null ? ' (' + r.km + ' km)' : '') : null, r.needed_by ? 'by ' + shortDate(r.needed_by) : null, r.max_price ? 'up to ' + naira(r.max_price) + '/' + r.unit : null].filter(Boolean).join(' · ')}
      pill={mine ? <Pill tone={mine.status === 'declined' ? 'neutral' : 'ok'} label={mine.status === 'declined' ? 'Not picked' : 'You offered ' + naira(mine.price)} />
        : <Pill tone={r.offers ? 'orange' : 'neutral'} label={r.offers ? r.offers + (r.offers === 1 ? ' offer' : ' offers') : 'No offers yet'} />}
      action={{ title: mine ? 'Change offer' : 'Make offer', variant: mine ? 'outline' : 'primary', onPress: onOffer }}>
      {r.notes ? <Txt v="small" numberOfLines={2}>{'“' + r.notes + '”'}</Txt> : null}
    </ActionRow>
  );
}

export function OfferSheet({ r, onClose, onDone }) {
  const { c } = useTheme();
  const mine = r?.mine && r.mine.status === 'pending' ? r.mine : null;
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [for_, setFor] = useState(null);
  if (r && for_ !== r.id) { setFor(r.id); setPrice(mine ? String(Math.round(mine.price)) : ''); setQty(String(mine ? mine.quantity : r.quantity)); setNote(mine?.note || ''); setErr(null); }
  const n = parseInt(qty, 10) || 0; const p = Number(price) || 0;
  const send = async () => {
    setBusy(true); setErr(null);
    try { await rpc('make_offer', { p_request: r.id, p_price: p, p_quantity: n, p_note: note.trim() || null }); onDone(); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const withdraw = async () => { setBusy(true); try { await rpc('withdraw_offer', { p_offer: mine.id }); onDone(); } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); } };
  return (
    <Sheet visible={!!r} onClose={onClose}>
      {r ? <>
        <Txt v="h1">{mine ? 'Change your offer' : 'Make an offer'}</Txt>
        <Txt v="small">{qtyText(r.quantity, r.unit) + ' · ' + r.title + (r.max_price ? ' · up to ' + naira(r.max_price) + '/' + r.unit : '')}</Txt>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Input label={'Your price per ' + r.unit} prefix="₦" keyboardType="number-pad" value={price} onChangeText={(t) => setPrice(t.replace(/\D/g, ''))} mono autoFocus /></View>
          <View style={{ flex: 1 }}><Input label="How many you can supply" keyboardType="number-pad" value={qty} onChangeText={(t) => setQty(t.replace(/\D/g, ''))} mono hint={'Up to ' + r.quantity} /></View>
        </View>
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Ready Thursday, frozen, packed in 1 kg bags" />
        {p > 0 && n > 0 ? <Txt v="small">{'Total ' + naira(p * Math.min(n, r.quantity)) + '. You get 90% when it is delivered.'}</Txt> : null}
        {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
        <Button title={!p ? 'Enter your price' : !n ? 'Enter how many' : mine ? 'Update offer' : 'Send offer'} disabled={!p || !n} loading={busy} onPress={send} />
        {mine ? <Button variant="ghost" title="Withdraw my offer" onPress={withdraw} /> : null}
      </> : null}
    </Sheet>
  );
}
