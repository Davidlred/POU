import React, { useCallback, useState } from 'react';
import { View, Pressable, BackHandler, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Empty, Input, Chip, Segmented, Pill, Group, Row, Skeleton, Sheet, Stat,
  naira, shortDate, timeAgo, rpc, friendlyError, shareText } from '@p360/shared';
import { useAuth } from '../context/AuthContext';

// Store agents: people who sell for a store (the "mother store") and earn a commission set per product.
// Agent side: AgentJoin, AgentDesk (root screen in agent mode), AgentSale.
// Store side: StoreAgents (invite code + leaderboard), StoreAgent (one agent: sales, payouts).

const plural = (u, q) => (Number(q) === 1 || !u || u === 'kg' || u.endsWith('s') ? u : u + 's');
const itemsText = (items) => (items || []).map((i) => Number(i.qty).toLocaleString() + ' ' + plural(i.unit || 'unit', i.qty) + ' ' + i.name).join(', ');

// ---------- Agent side ----------
export function AgentJoinScreen({ navigation }) {
  const { refresh, profile } = useAuth();
  const [onboarding] = useState(() => !(profile?.roles || []).length);   // first sign-up: the app opens on its own once the role exists
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const join = async () => {
    if (code.trim().length < 4) return setErr("Enter the store's code");
    setBusy(true);
    try {
      const r = await rpc('agent_join', { p_code: code.trim() });
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
  const share = () => shareText('Buying from ' + d.store.name + ' on Poultry360? Enter my agent code ' + d.code + ' at checkout.');
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
        <Button small variant="outline" icon="share-variant-outline" title="Share" onPress={share} />
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

// ---------- Store side ----------
const PERIODS = [{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All time' }];

export function StoreAgentsScreen({ navigation }) {
  const { c } = useTheme();
  const [period, setPeriod] = useState('30');
  const [d, setD] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      await rpc('store_invite_code');   // makes sure the store has a code
      setD(await rpc('store_agents_dashboard', { p_days: period === 'all' ? null : Number(period) }));
    } catch (e) { setD(null); Alert.alert("Couldn't load agents", friendlyError(e)); } finally { setBusy(false); }
  }, [period]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const share = () => shareText('Join my store as an agent on Poultry360: open the app, choose "Sell for a store" and enter the code ' + d.invite_code + '.');
  const newCode = () => Alert.alert('Make a new code?', 'The old code stops working. Agents who already joined stay.', [{ text: 'Cancel', style: 'cancel' },
    { text: 'New code', onPress: async () => { try { await rpc('store_new_invite_code'); load(); } catch (e) { Alert.alert("Couldn't change it", friendlyError(e)); } } }]);
  const active = (d?.agents || []).filter((a) => a.status === 'active');
  return (
    <Screen scroll>
      <AppBar title="Agents" />
      {d === undefined ? <Skeleton h={160} r={24} /> : d === null ? null : <>
        <Card>
          <Txt v="label">Invite code</Txt>
          <Txt v="mono" style={{ fontSize: 24 }}>{d.invite_code}</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small icon="share-variant-outline" title="Share" onPress={share} style={{ flex: 1 }} />
            <Button small variant="outline" title="New code" onPress={newCode} style={{ flex: 1 }} />
          </View>
        </Card>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Stat label="Agent sales" value={naira(d.totals.total)} sub={d.totals.sales + ' sale' + (d.totals.sales === 1 ? '' : 's')} />
          <Stat label="Commission owed" value={naira(d.owed)} sub="All time" />
        </View>
        <Txt v="h2">Top agents</Txt>
        {!active.length ? <Empty icon="account-group-outline" title="No agents yet" body="Share your invite code. Agents join in the Poultry360 app." /> : (
          <Group>{active.map((a, i) => (
            <Row key={a.agent_id} last={i === active.length - 1}
              icon={i === 0 && Number(a.period_total) > 0 ? 'trophy-outline' : 'account-outline'} iconColor={i === 0 && Number(a.period_total) > 0 ? c.warn : undefined}
              title={(i + 1) + '. ' + a.name}
              subtitle={naira(a.period_total) + ' · ' + a.period_sales + ' sale' + (Number(a.period_sales) === 1 ? '' : 's') + ' · owed ' + naira(Number(a.earned) - Number(a.paid))}
              onPress={() => navigation.navigate('StoreAgent', { agentId: a.agent_id })} />
          ))}</Group>
        )}
        <Txt v="small">Set each product's agent commission when you add or edit a listing.</Txt>
      </>}
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
