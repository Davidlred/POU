import React, { useCallback, useEffect, useState } from 'react';
import { View, Pressable, BackHandler, Alert, Image, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Empty, Input, Chip, Segmented, Pill, Group, Row, Skeleton, Sheet, Stat,
  naira, shortDate, timeAgo, rpc, friendlyError, shareText, useWide, inviteLink, agentLink, pendingInviteNow, clearPendingInvite, PLAY_STORE_URL, LOGO_MARK } from '@p360/shared';
import { useAuth } from '../context/AuthContext';

// Store agents: people who sell for a store (the "mother store") and earn a commission set per product.
// Agent side: AgentJoin, AgentDesk (root screen in agent mode), AgentSale.
// Store side: StoreAgents (invite code + leaderboard), StoreAgent (one agent: sales, payouts).

// Share a link: copy it, or send it with the phone's / browser's share options (WhatsApp, SMS…).
// Either choice closes the pop-up; onCopied lets the screen say "Link copied".
function ShareLinkSheet({ visible, onClose, onCopied, title, link, message }) {
  const { c } = useTheme();
  const copy = async () => {
    onClose();
    try { await Clipboard.setStringAsync(link); onCopied?.(); } catch { Alert.alert("Couldn't copy", link); }
  };
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Txt v="h2">{title}</Txt>
      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, backgroundColor: c.sf }}>
        <Txt v="body" selectable numberOfLines={2}>{link}</Txt>
      </View>
      <Button icon="content-copy" title="Copy link" onPress={copy} />
      <Button variant="outline" icon="share-variant-outline" title="Share" onPress={() => { onClose(); shareText(message); }} />
    </Sheet>
  );
}

// true for a moment after flash(): the "Link copied" confirmation
function useFlash(ms = 2500) {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return undefined; const t = setTimeout(() => setOn(false), ms); return () => clearTimeout(t); }, [on, ms]);
  return [on, () => setOn(true)];
}

const plural = (u, q) => (Number(q) === 1 || !u || u === 'kg' || u.endsWith('s') ? u : u + 's');
const itemsText = (items) => (items || []).map((i) => Number(i.qty).toLocaleString() + ' ' + plural(i.unit || 'unit', i.qty) + ' ' + i.name).join(', ');

// ---------- Agent side ----------
export function AgentJoinScreen({ navigation, route }) {
  const { refresh, profile } = useAuth();
  const [onboarding] = useState(() => !(profile?.roles || []).length);   // first sign-up: the app opens on its own once the role exists
  const [code, setCode] = useState(() => route?.params?.code || pendingInviteNow() || '');   // filled in when they came from an invite link
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    if (code.trim().length < 4) return setErr("Enter the store's code");
    setBusy(true);
    try {
      const r = await rpc('agent_join', { p_code: code.trim() });
      await clearPendingInvite();
      await refresh();
      Alert.alert("You're in", 'You now sell for ' + r.store + '.');
      if (!onboarding) navigation.popTo('Tabs');
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Join store" loading={busy} onPress={join} />}>
      <AppBar title="Sell for a store" />
      <Txt v="body">Enter the code the store gave you.</Txt>
      <Input label="Store code" value={code} onChangeText={(t) => { setCode(t.toUpperCase()); setErr(null); }} placeholder="ST4K9QXR" autoCapitalize="characters" autoCorrect={false} mono autoFocus error={err} />
    </Screen>
  );
}

export function AgentDeskScreen({ navigation }) {
  const { c } = useTheme();
  const { setActiveRole, homeRole } = useAuth();
  const home = homeRole();
  const leaveMode = useCallback(() => { if (home) setActiveRole(home); }, [home]);
  // The desk is the root screen in agent mode, so Back returns to the role they came from instead of closing the app.
  useFocusEffect(useCallback(() => {
    if (!home) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { leaveMode(); return true; });
    return () => sub.remove();
  }, [home, leaveMode]));
  const [d, setD] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, flashCopied] = useFlash();
  const load = useCallback(async () => { setBusy(true); try { setD(await rpc('agent_home')); } catch { setD(null); } finally { setBusy(false); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <View style={{ flex: 1 }}><Txt v="display" style={{ fontSize: 28 }}>Agent</Txt>{d?.store ? <Txt v="small">{d.store.name}</Txt> : null}</View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {home ? <Button small variant="outline" icon="arrow-left" title={home === 'buyer' ? 'Shop' : 'My farm'} onPress={leaveMode} style={{ height: 44 }} /> : null}
        <Pressable onPress={() => navigation.navigate('Profile')} accessibilityLabel="Profile" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.sf, alignItems: 'center', justifyContent: 'center' }}><Icon name="account-outline" /></Pressable>
      </View>
    </View>
  );
  if (d === undefined) return <Screen style={{ paddingTop: 8, gap: 14 }}>{header}<Skeleton h={160} r={24} /></Screen>;
  if (!d?.store) return (
    <Screen scroll style={{ paddingTop: 8 }}>
      {header}
      <Empty icon="storefront-outline" title="You're not with a store" body="Ask a store for its code to sell for them." action="Join a store" onAction={() => navigation.navigate('AgentJoin')} />
    </Screen>
  );
  const owed = Number(d.earned) - Number(d.paid);

  const leaveStore = () => Alert.alert('Leave ' + d.store.name + '?', 'You will stop selling for this store. Your past sales stay on record.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: async () => { try { await rpc('agent_leave'); load(); } catch (e) { Alert.alert("Couldn't leave", friendlyError(e)); } } }]);
  const cancel = (s) => Alert.alert('Cancel this sale?', 'The stock goes back to the store.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Cancel sale', style: 'destructive', onPress: async () => { try { await rpc('agent_cancel_sale', { p_sale: s.id }); load(); } catch (e) { Alert.alert("Couldn't cancel", friendlyError(e)); } } }]);
  return (
    <Screen scroll style={{ paddingTop: 8 }}>
      {header}
      <Hearth>
        <Txt v="label" color={c.hmute}>Commission owed to you</Txt>
        <Txt v="monoLg" color={c.hink}>{naira(owed)}</Txt>
        <Txt v="small" color={c.hmute}>This month: {naira(d.month.total)} sold · {naira(d.month.commission)} earned</Txt>
      </Hearth>
      <Button icon="plus" title="Log a sale" onPress={() => navigation.navigate('AgentSale')} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}><Txt v="label">Your agent code</Txt><Txt v="mono" style={{ fontSize: 22 }}>{d.code}</Txt></View>
        <Button small variant="outline" icon={copied ? 'check' : 'share-variant-outline'} title={copied ? 'Link copied' : 'Share'} onPress={() => setSharing(true)} />
      </Card>
      <Txt v="h2">Recent sales</Txt>
      {!d.recent.length ? <Card><Txt v="small">No sales yet.</Txt></Card> : (
        <Group>{d.recent.map((s, i) => {
          const canCancel = s.source === 'logged' && s.status === 'recorded' && Date.now() - new Date(s.created_at).getTime() < 864e5;
          return (
            <Row key={s.id} last={i === d.recent.length - 1} icon={s.source === 'order' ? 'cart-outline' : 'receipt-text-outline'}
              title={naira(s.total) + (s.buyer_name ? ' · ' + s.buyer_name : '')}
              subtitle={itemsText(s.items) + ' · ' + timeAgo(s.created_at)}
              onPress={canCancel ? () => cancel(s) : undefined}
              right={s.status === 'cancelled' ? <Pill label="Cancelled" /> : <Txt v="mono" color={c.sage} style={{ fontSize: 14 }}>{'+' + naira(s.commission)}</Txt>} />
          );
        })}</Group>
      )}
      <Button variant="ghost" title="Leave this store" onPress={leaveStore} />
      <ShareLinkSheet visible={sharing} onClose={() => setSharing(false)} onCopied={flashCopied} title="Your shop link" link={agentLink(d.code)}
        message={'Shop ' + d.store.name + ' on Poultry360 with my agent code ' + d.code + ': ' + agentLink(d.code)} />
    </Screen>
  );
}

export function AgentSaleScreen({ navigation }) {
  const { c } = useTheme();
  const [d, setD] = useState(null);
  const [lines, setLines] = useState({});   // listing id -> qty text
  const [buyer, setBuyer] = useState(''); const [phone, setPhone] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { rpc('agent_home').then(setD).catch(() => setD({ products: [] })); }, []));
  const products = d?.products || [];
  const chosen = products.filter((p) => lines[p.id] !== undefined);
  const qty = (p) => parseInt(lines[p.id] || '0', 10) || 0;
  const total = chosen.reduce((t, p) => t + qty(p) * Number(p.price), 0);
  const commission = chosen.reduce((t, p) => t + Math.round(qty(p) * Number(p.price) * Number(p.pct)) / 100, 0);
  const save = async () => {
    if (!chosen.length) return setErr('Pick what you sold');
    if (chosen.some((p) => qty(p) < 1)) return setErr('Enter how many for each item');
    const over = chosen.find((p) => qty(p) > Number(p.quantity));
    if (over) return setErr('Only ' + over.quantity + ' ' + plural(over.unit, over.quantity) + ' of ' + over.title + ' in stock');
    setBusy(true);
    try {
      await rpc('agent_log_sale', { p_items: chosen.map((p) => ({ listing_id: p.id, qty: qty(p) })), p_buyer_name: buyer.trim() || null, p_buyer_phone: phone.trim() || null });
      navigation.goBack();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title={'Save sale · ' + naira(total)} loading={busy} disabled={!chosen.length} onPress={save} />}>
      <AppBar title="Log a sale" close />
      <Txt v="strong" style={{ fontSize: 13 }}>What did you sell?</Txt>
      {d === null ? <Skeleton h={44} r={22} /> : !products.length ? <Card><Txt v="small">The store has no products listed yet.</Txt></Card> : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {products.map((p) => <Chip key={p.id} label={p.title + ' · ' + naira(p.price) + '/' + p.unit} selected={lines[p.id] !== undefined}
            onPress={() => { setLines((l) => { const n = { ...l }; if (n[p.id] !== undefined) delete n[p.id]; else n[p.id] = ''; return n; }); setErr(null); }} />)}
        </View>
      )}
      {chosen.map((p) => (
        <Card key={p.id}>
          <Txt v="bold">{p.title}</Txt>
          <Input label={'How many ' + plural(p.unit, 2) + '?'} keyboardType="number-pad" value={lines[p.id]} onChangeText={(t) => { setLines((l) => ({ ...l, [p.id]: t.replace(/\D/g, '') })); setErr(null); }} mono autoFocus
            hint={p.quantity + ' in stock'} />
          {qty(p) > 0 ? <Txt v="small">{qty(p) + ' × ' + naira(p.price) + ' = '}<Txt v="mono" style={{ fontSize: 13 }}>{naira(qty(p) * Number(p.price))}</Txt></Txt> : null}
        </Card>
      ))}
      <Input label="Buyer (optional)" value={buyer} onChangeText={setBuyer} placeholder="Mama Joy" autoCapitalize="words" />
      <Input label="Buyer's phone (optional)" value={phone} onChangeText={setPhone} placeholder="0803 123 4567" keyboardType="phone-pad" mono />
      {chosen.length ? <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="bold">Total</Txt><Txt v="mono" style={{ fontSize: 18 }}>{naira(total)}</Txt></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body" color={c.mute}>Your commission</Txt><Txt v="mono" color={c.sage} style={{ fontSize: 14 }}>{naira(commission)}</Txt></View>
      </Card> : null}
      {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
    </Screen>
  );
}

// Where a store's invite link lands: "Join <store> as an agent".
// Signed out (website): create an account or sign in, and the code is filled in afterwards.
// Signed in: one tap joins.
export function JoinStoreScreen({ navigation, route }) {
  const { c } = useTheme();
  const { session, refresh } = useAuth();
  const [code] = useState(() => route.params?.code || pendingInviteNow());
  const [store, setStore] = useState(undefined);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) { setStore(null); return; }
    // An invalid link is forgotten, so the next visit opens the normal home page.
    rpc('store_by_invite', { p_code: code }).then((r) => { setStore(r || null); if (!r) clearPendingInvite(); }).catch(() => { setStore(null); clearPendingInvite(); });
  }, [code]);
  const join = async () => {
    setBusy(true); setErr(null);
    try {
      await rpc('agent_join', { p_code: code });
      await clearPendingInvite();
      await refresh();
      navigation.popTo('Tabs');
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const later = async () => { await clearPendingInvite(); if (navigation.canGoBack()) navigation.goBack(); else navigation.navigate(session ? 'Tabs' : 'Landing'); };
  return (
    <Screen scroll style={{ flexGrow: 1, justifyContent: 'center', gap: 18, maxWidth: 520, width: '100%', alignSelf: 'center' }}>
      <View style={{ alignSelf: 'center', width: 96, height: 96, borderRadius: 28, backgroundColor: c.logobg, alignItems: 'center', justifyContent: 'center' }}><Image source={LOGO_MARK} style={{ width: 80, height: 80 }} /></View>
      {store === undefined ? <Skeleton h={80} r={20} /> : !store ? <>
        <Txt v="display" style={{ textAlign: 'center' }}>This invite link isn't valid</Txt>
        <Txt v="body" color={c.mute} style={{ textAlign: 'center' }}>Ask the store for a new link.</Txt>
        <Button variant="outline" title="Go to Poultry360" onPress={later} />
      </> : <>
        <Txt v="display" style={{ textAlign: 'center' }}>{'Join ' + store.name + ' as an agent'}</Txt>
        <Txt v="body" color={c.mute} style={{ textAlign: 'center' }}>Sell their products and earn commission on every sale.</Txt>
        {err ? <Txt v="small" color={c.err} style={{ textAlign: 'center' }}>{err}</Txt> : null}
        {session ? <Button title="Join store" loading={busy} onPress={join} />
          : <>
            <Button title="Create an account" onPress={() => navigation.navigate('Email', { mode: 'signup' })} />
            <Button variant="outline" title="I have an account" onPress={() => navigation.navigate('SignIn')} />
          </>}
        {PLAY_STORE_URL ? <Button variant="ghost" icon="google-play" title="Get the Android app" onPress={() => Linking.openURL(PLAY_STORE_URL)} /> : null}
        <Pressable onPress={later} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: 8 }}><Txt v="small">Not now</Txt></Pressable>
      </>}
    </Screen>
  );
}

// ---------- Store side ----------
const PERIODS = [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }];

export function StoreAgentsScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const [period, setPeriod] = useState('30');
  const [d, setD] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, flashCopied] = useFlash();
  const load = useCallback(async () => {
    setBusy(true);
    try {
      await rpc('store_invite_code');   // makes sure the store has a code
      setD(await rpc('store_agents_dashboard', { p_days: period === 'all' ? null : Number(period) }));
    } catch (e) { setD(null); Alert.alert("Couldn't load agents", friendlyError(e)); } finally { setBusy(false); }
  }, [period]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const newCode = () => Alert.alert('Make a new code?', 'The old code and link stop working. Agents who already joined stay.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'New code', onPress: async () => { try { await rpc('store_new_invite_code'); load(); } catch (e) { Alert.alert("Couldn't change it", friendlyError(e)); } } }]);
  const active = (d?.agents || []).filter((a) => a.status === 'active');
  const periodLabel = PERIODS.find((x) => x.value === period).label;
  const count = (n, one) => n + ' ' + one + (Number(n) === 1 ? '' : 's');

  if (d === undefined) return <Screen scroll><AppBar title="Agents" /><Skeleton h={140} r={26} /><Skeleton h={180} r={22} /></Screen>;
  if (d === null) return <Screen scroll><AppBar title="Agents" /><Empty icon="wifi-off" title="Couldn't load agents" action="Try again" onAction={load} /></Screen>;

  const money = (
    <Hearth>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, columnGap: 24 }}>
        <View style={{ flexBasis: '40%', flexGrow: 1, minWidth: 220, gap: 2 }}>
          <Txt v="label" color={c.hmute}>Commission owed</Txt>
          <Txt v="monoLg" color={c.hink}>{naira(d.owed)}</Txt>
          <Txt v="small" color={c.hmute}>All time</Txt>
        </View>
        <View style={{ flexBasis: '40%', flexGrow: 1, minWidth: 220, gap: 2 }}>
          <Txt v="label" color={c.hmute}>Agent sales</Txt>
          <Txt v="monoLg" color={c.hink}>{naira(d.totals.total)}</Txt>
          <Txt v="small" color={c.hmute}>{periodLabel + ' · ' + count(d.totals.sales, 'sale')}</Txt>
        </View>
      </View>
    </Hearth>
  );

  const invite = (
    <Card style={{ gap: 14, padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="account-plus-outline" size={22} color={c.navactink} /></View>
        <Txt v="strong" style={{ flex: 1 }}>Invite agents</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.sf2, borderRadius: 16, paddingVertical: 10, paddingLeft: 16, paddingRight: 8 }}>
        <View style={{ flex: 1 }}>
          <Txt v="label">Invite code</Txt>
          <Txt v="mono" selectable style={{ fontSize: 22, letterSpacing: 1 }}>{d.invite_code}</Txt>
        </View>
        <Pressable onPress={newCode} accessibilityRole="button" hitSlop={6} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 }}>
          <Txt v="bold" color={c.navactink} style={{ fontSize: 14 }}>New code</Txt>
        </Pressable>
      </View>
      <Button small icon={copied ? 'check' : 'share-variant-outline'} title={copied ? 'Link copied' : 'Share invite link'} onPress={() => setSharing(true)} />
    </Card>
  );

  const note = (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
      <Icon name="information-outline" size={18} color={c.mute} />
      <Txt v="small" style={{ flex: 1 }}>Set each product's agent commission when you add or edit a listing.</Txt>
    </View>
  );

  const board = (
    <View style={{ gap: 12 }}>
      <View style={wide ? { flexDirection: 'row', alignItems: 'center', gap: 10 } : { gap: 10 }}>
        <Txt v="h2" style={wide ? { flex: 1 } : null}>Top agents</Txt>
        <View style={wide ? { width: 320 } : null}><Segmented options={PERIODS} value={period} onChange={setPeriod} /></View>
      </View>
      {!active.length ? (
        <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.navact, alignItems: 'center', justifyContent: 'center' }}><Icon name="account-group-outline" size={26} color={c.navactink} /></View>
          <Txt v="strong">No agents yet</Txt>
          <Txt v="small" style={{ textAlign: 'center' }}>Share your invite link to add your first agent.</Txt>
        </Card>
      ) : (
        <Group style={{ opacity: busy ? 0.6 : 1 }}>{active.map((a, i) => {
          const lead = i === 0 && Number(a.period_total) > 0;
          return (
            <Pressable key={a.agent_id} onPress={() => navigation.navigate('StoreAgent', { agentId: a.agent_id })} accessibilityRole="button"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, minHeight: 64,
                borderBottomWidth: i === active.length - 1 ? 0 : 1, borderColor: c.line, opacity: pressed ? 0.8 : 1 })}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: lead ? c.navact : c.sf2 }}>
                {lead ? <Icon name="trophy-outline" size={18} color={c.navactink} /> : <Txt v="bold" color={c.mute} style={{ fontSize: 14 }}>{i + 1}</Txt>}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="strong" numberOfLines={1}>{a.name}</Txt>
                <Txt v="small" numberOfLines={1}>{count(a.period_sales, 'sale') + ' · owed ' + naira(Number(a.earned) - Number(a.paid))}</Txt>
              </View>
              <Txt v="mono" style={{ fontSize: 16 }}>{naira(a.period_total)}</Txt>
              <Icon name="chevron-right" size={20} color={c.mute} />
            </Pressable>
          );
        })}</Group>
      )}
    </View>
  );

  return (
    <Screen scroll>
      <AppBar title="Agents" subtitle={active.length ? count(active.length, 'agent') : undefined} />
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.6, gap: 20 }}>{money}{board}</View>
          <View style={{ flex: 1, gap: 14 }}>{invite}{note}</View>
        </View>
      ) : <>{money}{invite}{board}{note}</>}
      <ShareLinkSheet visible={sharing} onClose={() => setSharing(false)} onCopied={flashCopied} title="Agent invite link" link={inviteLink(d.invite_code)}
        message={'Join my store as an agent on Poultry360: ' + inviteLink(d.invite_code)} />
    </Screen>
  );
}

export function StoreAgentScreen({ navigation, route }) {
  const { c } = useTheme();
  const [d, setD] = useState(undefined);
  const [pay, setPay] = useState(false);
  const [amount, setAmount] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setD(await rpc('store_agents_dashboard', { p_days: null })); } catch { setD(null); } }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const a = d?.agents.find((x) => x.agent_id === route.params.agentId);
  if (d === undefined) return <Screen><AppBar /><Skeleton h={160} r={24} /></Screen>;
  if (!a) return <Screen><AppBar /><Empty icon="account-off-outline" title="Agent not found" /></Screen>;
  const owed = Number(a.earned) - Number(a.paid);
  const sales = d.recent.filter((s) => s.agent_id === a.agent_id);
  const payouts = d.payouts.filter((p) => p.agent_id === a.agent_id);
  const record = async () => {
    if (!(Number(amount) > 0)) return;
    setBusy(true);
    try { await rpc('store_record_payout', { p_agent: a.agent_id, p_amount: Number(amount), p_note: note.trim() || null }); setPay(false); setAmount(''); setNote(''); load(); }
    catch (e) { Alert.alert("Couldn't record it", friendlyError(e)); } finally { setBusy(false); }
  };
  const remove = () => Alert.alert('Remove ' + a.name + '?', 'They stop selling for you. Their past sales stay on record.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await rpc('store_remove_agent', { p_agent: a.agent_id }); navigation.goBack(); } catch (e) { Alert.alert("Couldn't remove", friendlyError(e)); } } }]);
  const cancel = (s) => Alert.alert('Cancel this sale?', 'The stock goes back and the commission is removed.', [{ text: 'Keep it', style: 'cancel' },
    { text: 'Cancel sale', style: 'destructive', onPress: async () => { try { await rpc('agent_cancel_sale', { p_sale: s.id }); load(); } catch (e) { Alert.alert("Couldn't cancel", friendlyError(e)); } } }]);
  return (
    <Screen scroll>
      <AppBar title={a.name} subtitle={'Code ' + a.code + ' · joined ' + shortDate(a.joined_at)} />
      <Hearth>
        <Txt v="label" color={c.hmute}>Commission owed</Txt>
        <Txt v="monoLg" color={c.hink}>{naira(owed)}</Txt>
        <Txt v="small" color={c.hmute}>Earned {naira(a.earned)} · paid {naira(a.paid)}</Txt>
      </Hearth>
      {a.status === 'active' ? <Button icon="cash-check" title="Record a payout" onPress={() => { setAmount(owed > 0 ? String(Math.round(owed)) : ''); setPay(true); }} /> : <Pill label="Removed" />}
      <Txt v="h2">Sales</Txt>
      {!sales.length ? <Card><Txt v="small">No sales yet.</Txt></Card> : (
        <Group>{sales.map((s, i) => (
          <Row key={s.id} last={i === sales.length - 1} icon={s.source === 'order' ? 'cart-outline' : 'receipt-text-outline'}
            title={naira(s.total) + (s.buyer_name ? ' · ' + s.buyer_name : '')} subtitle={itemsText(s.items) + ' · ' + shortDate(s.created_at)}
            onPress={s.source === 'logged' && s.status === 'recorded' ? () => cancel(s) : undefined}
            right={s.status === 'cancelled' ? <Pill label="Cancelled" /> : <Txt v="mono" style={{ fontSize: 14 }}>{naira(s.commission)}</Txt>} />
        ))}</Group>
      )}
      {payouts.length ? <>
        <Txt v="h2">Payouts</Txt>
        <Group>{payouts.map((p, i) => <Row key={p.id} last={i === payouts.length - 1} icon="cash-check" title={naira(p.amount)} subtitle={shortDate(p.created_at) + (p.note ? ' · ' + p.note : '')} />)}</Group>
      </> : null}
      {a.status === 'active' ? <Button variant="ghost" title="Remove agent" onPress={remove} /> : null}
      <Sheet visible={pay} onClose={() => setPay(false)}>
        <Txt v="h1">Record a payout</Txt>
        <Input label="Amount paid" prefix="₦" keyboardType="number-pad" value={amount} onChangeText={(t) => setAmount(t.replace(/\D/g, ''))} mono autoFocus />
        <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Bank transfer, 12 Nov" />
        <Button title="Save" loading={busy} disabled={!(Number(amount) > 0)} onPress={record} />
      </Sheet>
    </Screen>
  );
}
