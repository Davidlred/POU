import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Pressable, ScrollView, Image, RefreshControl, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, liveChannel, DateInput, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Segmented, Pill, Stat, Group, Row, Skeleton, Steps, PhotoBox,
  naira, pct, isoDate, shortDate, timeAgo, INVEST_STATUS, rpc, publicUrl, uploadImage, friendlyError, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { projectReturn, daysLeft, progress, ESTIMATE_COPY } from '../lib/roi';
import { track } from '../lib/analytics';

const OFFERING_COLS = '*, vendor:vendor_profiles(user_id, business_name, location, investment_badge, verification_status)';
const POOL_COLS = '*, pool_farms(allocation_pct, vendor:vendor_profiles(user_id, business_name, investment_badge, verification_status))';
const STATUS_TONE = { open: 'live', funded: 'ok', active: 'ok', matured: 'neutral', refunded: 'neutral', suspended: 'warn', pending_review: 'warn', rejected: 'err', draft: 'neutral' };
const fullDate = (d) => new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const addMonths = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

const fetchTarget = async (kind, id) => {
  const q = kind === 'pool' ? supabase.from('investment_pools').select(POOL_COLS) : supabase.from('investment_offerings').select(OFFERING_COLS);
  const { data } = await q.eq('id', id).maybeSingle();
  return data;
};

// The signed-in user's KYC record, live: undefined = loading, null = never submitted.
function useKyc() {
  const { uid } = useAuth();
  const [kyc, setKyc] = useState(undefined);
  const load = useCallback(async () => { const { data } = await supabase.from('kyc_records').select('*').eq('user_id', uid).maybeSingle(); setKyc(data || null); }, [uid]);
  useEffect(() => {
    load();
    const ch = liveChannel('kyc-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kyc_records', filter: 'user_id=eq.' + uid }, (p) => {
        if (p.new?.status && p.new.status !== 'pending') track('kyc_' + p.new.status);
        load();
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, uid]);
  return [kyc, load];
}

function Estimate({ color }) { return <Txt v="small" color={color}>{ESTIMATE_COPY}</Txt>; }

function ProgressBar({ value, dark }) {
  const { c } = useTheme();
  return <View style={{ height: 8, borderRadius: 4, backgroundColor: dark ? c.hline : c.sf2, overflow: 'hidden' }}><View style={{ width: Math.round(value * 100) + '%', height: 8, borderRadius: 4, backgroundColor: c.ember }} /></View>;
}

export function OfferingCard({ o, kind = 'offering', onPress }) {
  const { c } = useTheme();
  const farms = o.pool_farms || [];
  const badge = kind === 'offering' && o.vendor?.investment_badge === 'approved';
  const photo = o._photoUri || (o.photos?.[0] ? publicUrl('listing-photos', o.photos[0]) : null);
  return (
    <Card onPress={onPress} style={{ padding: 0, overflow: 'hidden', gap: 0 }}>
      {kind === 'offering' ? (photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: 132, backgroundColor: c.sf2 }} />
        : <View style={{ height: 84, backgroundColor: c.t1, alignItems: 'center', justifyContent: 'center' }}><Icon name="barn" size={32} color={c.t1i} /></View>) : null}
      <View style={{ padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{kind === 'pool' ? 'Pool · ' + farms.length + ' farm' + (farms.length === 1 ? '' : 's') : o.vendor?.business_name || 'Your farm'}</Txt>
          {badge ? <Icon name="check-decagram" size={16} color={c.acc} /> : null}
          <View style={{ flex: 1 }} />
          {o.status === 'funded' ? <Pill tone="ok" label="Fully funded" /> : o.status === 'suspended' ? <Pill tone="warn" label="Paused" /> : o.status && o.status !== 'open' ? <Pill tone={STATUS_TONE[o.status]} label={INVEST_STATUS[o.status]} /> : null}
        </View>
        <Txt v="bold" style={{ fontSize: 16 }}>{o.title || 'Untitled offering'}</Txt>
        <ProgressBar value={progress(o.raised_amount, o.target_amount)} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="mono" style={{ fontSize: 13 }}>{naira(o.raised_amount)} <Txt v="small">of {naira(o.target_amount)}</Txt></Txt>
          {o.closes_at ? <Txt v="small">{daysLeft(o.closes_at)} days left</Txt> : null}
        </View>
        <Txt v="small"><Txt v="mono" color={c.acc} style={{ fontSize: 14 }}>{pct(o.projected_roi_pct, 1)}</Txt> projected over {o.duration_months} month{o.duration_months === 1 ? '' : 's'}</Txt>
      </View>
    </Card>
  );
}

function KycBanner({ kyc, navigation }) {
  if (kyc === undefined || kyc?.status === 'approved') return null;
  if (!kyc) return <Banner tone="info" icon="shield-account-outline" title="Verify your identity to invest" body="It takes a few minutes. You need a government ID and proof of address." action="Start" onAction={() => navigation.navigate('Kyc')} />;
  if (kyc.status === 'pending') return <Banner tone="warn" icon="clock-outline" title="Verification in review" body="We'll let you know here as soon as it's approved." action="View" onAction={() => navigation.navigate('Kyc')} />;
  return <Banner tone="err" title="Verification needs another look" body={kyc.rejection_reason || 'We could not verify your details.'} action="Resubmit" onAction={() => navigation.navigate('Kyc')} />;
}

export function InvestHomeScreen({ navigation, route }) {
  const { c } = useTheme();
  const [kyc] = useKyc();
  const [port, setPort] = useState(null);
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const [p, o] = await Promise.all([rpc('my_portfolio').catch(() => null),
      supabase.from('investment_offerings').select(OFFERING_COLS).eq('status', 'open').order('closes_at')]);
    setPort(p); setList(o.data || []); setBusy(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const has = port && port.items.length > 0;
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        {route.name === 'Invest' ? <Txt v="display" style={{ fontSize: 28 }}>Invest</Txt> : <View style={{ marginHorizontal: -20, marginTop: -20 }}><AppBar title="Invest" /></View>}
        <KycBanner kyc={kyc} navigation={navigation} />
        <Hearth onPress={() => navigation.navigate('Portfolio')}>
          {has ? <>
            <Txt v="label" color={c.hmute}>Total invested</Txt>
            <Txt v="monoLg" color={c.hink} style={{ fontSize: 34 }}>{naira(port.total_invested)}</Txt>
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <View><Txt v="label" color={c.hmute}>Current value</Txt><Txt v="mono" color={c.hink}>{naira(port.current_value)}</Txt></View>
              <View><Txt v="label" color={c.hmute}>Returns to date</Txt><Txt v="mono" color={c.yolk}>{naira(port.returns_to_date, { sign: true })}</Txt></View>
            </View>
          </> : <>
            <Icon name="chart-line" size={30} color={c.ember} />
            <Txt v="h2" color={c.hink}>No investments yet</Txt>
            <Txt v="small" color={c.hmute}>Fund a verified farm and track what it returns, right here.</Txt>
          </>}
        </Hearth>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[['Pools', 'chart-donut', 't1', 'Pools'], ['ROI calculator', 'calculator-variant-outline', 't2', 'RoiCalc'], ['My investments', 'briefcase-outline', 't3', 'Portfolio']].map(([l, i, t, to]) => (
            <Pressable key={l} onPress={() => navigation.navigate(to)} style={{ flex: 1, minHeight: 88, borderRadius: 18, backgroundColor: c[t], padding: 12, gap: 10, justifyContent: 'space-between' }}><Icon name={i} color={c[t + 'i']} /><Txt v="bold" style={{ fontSize: 13 }}>{l}</Txt></Pressable>
          ))}
        </View>
        <Txt v="h2">Open opportunities</Txt>
        {list === null ? <><Skeleton h={220} r={20} /><Skeleton h={220} r={20} /></>
          : !list.length ? <Empty icon="sprout-outline" title="No open opportunities right now" body="New farms are reviewed every week." />
          : list.map((o) => <OfferingCard key={o.id} o={o} onPress={() => navigation.navigate('Offering', { id: o.id })} />)}
        <Estimate />
      </ScrollView>
    </Screen>
  );
}

export function PoolsScreen({ navigation }) {
  const [list, setList] = useState(null);
  useFocusEffect(useCallback(() => { supabase.from('investment_pools').select(POOL_COLS).eq('status', 'open').order('closes_at').then(({ data }) => setList(data || [])); }, []));
  return (
    <Screen scroll>
      <AppBar title="Investment pools" />
      <Txt v="small" style={{ fontSize: 14 }}>A pool spreads your money across several verified farms, so no single farm carries all of it.</Txt>
      {list === null ? <><Skeleton h={150} r={20} /><Skeleton h={150} r={20} /></>
        : !list.length ? <Empty icon="chart-donut" title="No open pools right now" body="Pools are put together by Poultry360. Check back soon." />
        : list.map((p) => <OfferingCard key={p.id} o={p} kind="pool" onPress={() => navigation.navigate('Pool', { id: p.id })} />)}
      {list?.length ? <Estimate /> : null}
    </Screen>
  );
}

// Offering (one farm) and Pool (several farms) share a page.
function TargetScreen({ navigation, route, kind }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const { id } = route.params;
  const [t, setT] = useState(undefined);
  const [count, setCount] = useState(null);
  const load = useCallback(async () => {
    setT(await fetchTarget(kind, id));
    rpc('investor_count', { p_kind: kind, p_target: id }).then(setCount).catch(() => {});
  }, [kind, id]);
  useEffect(() => {
    load();
    // Live raised amount while people invest.
    const ch = liveChannel('target-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: kind === 'pool' ? 'investment_pools' : 'investment_offerings', filter: 'id=eq.' + id }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load, id, kind]);
  if (t === undefined) return <Screen><AppBar /><Skeleton h={200} r={20} /></Screen>;
  if (!t) return <Screen><AppBar /><Empty icon="sprout-off-outline" title="This opportunity isn't available" body="It may have closed or been withdrawn." /></Screen>;
  const farms = t.pool_farms || [];
  const badge = kind === 'pool' || (t.vendor?.investment_badge === 'approved' && t.vendor?.verification_status === 'approved');
  const own = kind === 'offering' && t.vendor_id === uid;
  const open = t.status === 'open';
  const sample = projectReturn(Number(t.min_ticket), Number(t.projected_roi_pct), t.duration_months);
  return (
    <Screen scroll footer={open ? <Button title="Invest now" icon="chart-line" disabled={!badge || own} onPress={() => navigation.navigate('InvestAmount', { kind, id })} /> : null}>
      <AppBar title={kind === 'pool' ? 'Pool' : 'Farm opportunity'} />
      {kind === 'offering' && t.photos?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -20 }} contentInset={{ left: 20, right: 20 }}>
          <View style={{ width: 12 }} />
          {t.photos.map((p) => <Image key={p} source={{ uri: publicUrl('listing-photos', p) }} style={{ width: 280, height: 180, borderRadius: 20, backgroundColor: c.sf2 }} />)}
          <View style={{ width: 12 }} />
        </ScrollView>
      ) : null}
      {kind === 'offering' ? (
        <Pressable onPress={() => navigation.navigate('Store', { vendorId: t.vendor_id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt v="strong" color={c.acc}>{t.vendor?.business_name}</Txt>{badge ? <Icon name="check-decagram" size={18} color={c.acc} /> : null}
          <Txt v="small">{t.vendor?.location ? ' · ' + t.vendor.location : ''}</Txt>
        </Pressable>
      ) : <Txt v="strong" color={c.acc}>Pool · {farms.length} verified farm{farms.length === 1 ? '' : 's'}</Txt>}
      <Txt v="display" style={{ fontSize: 26, lineHeight: 30 }}>{t.title}</Txt>
      {t.status === 'suspended' ? <Banner tone="warn" icon="pause-circle-outline" title="New investment paused" body={kind === 'pool' ? "We're reviewing a farm in this pool. Existing investments are not affected." : "We're reviewing this farm. Existing investments are not affected."} /> : null}
      {['funded', 'active', 'matured'].includes(t.status) ? <Banner tone="ok" title="Fully funded" body={t.status === 'funded' ? 'The term starts shortly.' : t.status === 'active' ? 'This raise is closed and the term is running.' : 'This term has finished and investors were paid out.'} /> : null}
      {t.status === 'refunded' ? <Banner tone="info" title="Closed without reaching its target" body="Everyone who invested was refunded in full." /> : null}
      {open && !badge ? <Banner tone="warn" title="Not open for investment" body="This farm doesn't currently hold an investment badge." /> : null}
      {own ? <Banner tone="info" title="This is your own offering" body="You can't invest in your own farm." /> : null}
      <Hearth>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View><Txt v="label" color={c.hmute}>Raised</Txt><Txt v="monoLg" color={c.hink} style={{ fontSize: 28 }}>{naira(t.raised_amount)}</Txt></View>
          <Txt v="mono" color={c.hmute} style={{ fontSize: 13 }}>of {naira(t.target_amount)}</Txt>
        </View>
        <ProgressBar value={progress(t.raised_amount, t.target_amount)} dark />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="small" color={c.hmute}>{count === null ? ' ' : count + ' investor' + (count === 1 ? '' : 's')}</Txt>
          <Txt v="small" color={c.hmute}>{open ? daysLeft(t.closes_at) + ' days left' : INVEST_STATUS[t.status]}</Txt>
        </View>
      </Hearth>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Projected return" value={pct(t.projected_roi_pct, 1)} sub={'over ' + t.duration_months + ' mo'} />
        <Stat label="Term" value={t.duration_months + ' mo'} />
        <Stat label="Min ticket" value={naira(t.min_ticket)} />
      </View>
      <Txt v="small">{naira(t.min_ticket)} is projected to return {naira(sample.profit)} profit by the end of the term ({pct(sample.annualised, 1)} a year).</Txt>
      <Estimate />
      {t.summary ? <><Txt v="label">About</Txt><Txt v="body">{t.summary}</Txt></> : null}
      {t.use_of_funds ? <><Txt v="label">Use of funds</Txt><Txt v="body">{t.use_of_funds}</Txt></> : null}
      {kind === 'pool' ? <>
        <Txt v="label">Participating farms</Txt>
        <Group>{farms.map((f, i) => (
          <Row key={f.vendor?.user_id || i} last={i === farms.length - 1} icon="barn" title={f.vendor?.business_name || 'Farm'}
            subtitle={f.vendor?.investment_badge === 'approved' ? 'Investment badge' : 'Badge under review'} onPress={() => navigation.navigate('Store', { vendorId: f.vendor?.user_id })}
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{f.vendor?.investment_badge === 'approved' ? <Icon name="check-decagram" size={18} color={c.acc} /> : null}<Txt v="mono" style={{ fontSize: 14 }}>{pct(f.allocation_pct)}</Txt></View>} />))}</Group>
      </> : null}
      <Txt v="label">Payout schedule</Txt>
      <Card><Txt v="body">{(t.payout_schedule || 'end_of_term') === 'monthly' ? 'Returns are paid into your wallet monthly. Your principal comes back with the final payout.' : 'Returns and your principal are paid into your wallet together at the end of the term.'}</Txt></Card>
      <Txt v="bold" color={c.acc} onPress={() => navigation.navigate('RoiCalc', { kind, id })}>Run the numbers →</Txt>
    </Screen>
  );
}
export const OfferingScreen = (p) => <TargetScreen {...p} kind="offering" />;
export const PoolScreen = (p) => <TargetScreen {...p} kind="pool" />;

export function RoiCalcScreen({ navigation, route }) {
  const { c } = useTheme();
  const [kind, setKind] = useState(route.params?.kind || 'offering');
  const [lists, setLists] = useState(null);
  const [sel, setSel] = useState(route.params?.id || null);
  const [amt, setAmt] = useState(route.params?.amount ? String(route.params.amount) : '');
  useEffect(() => {
    Promise.all([supabase.from('investment_offerings').select('id,title,projected_roi_pct,duration_months,min_ticket').eq('status', 'open'),
      supabase.from('investment_pools').select('id,title,projected_roi_pct,duration_months,min_ticket').eq('status', 'open')])
      .then(([o, p]) => setLists({ offering: o.data || [], pool: p.data || [] }));
  }, []);
  const options = lists ? lists[kind] : [];
  const t = options.find((x) => x.id === sel) || null;
  const n = Number(amt || 0);
  const r = t && n > 0 ? projectReturn(n, Number(t.projected_roi_pct), t.duration_months) : null;
  return (
    <Screen scroll footer={<Button title={n > 0 ? 'Invest ' + naira(n) : 'Invest'} disabled={!t || !(n > 0)} onPress={() => navigation.navigate('InvestAmount', { kind, id: t.id, amount: n })} />}>
      <AppBar title="ROI calculator" />
      <Segmented options={[{ value: 'offering', label: 'Farms' }, { value: 'pool', label: 'Pools' }]} value={kind} onChange={(k) => { setKind(k); setSel(null); }} />
      {lists === null ? <Skeleton h={44} r={22} /> : !options.length ? <Card><Txt v="small">Nothing is open to invest in right now.</Txt></Card>
        : <ChipRow options={options.map((x) => x.title)} value={t?.title} onChange={(title) => setSel(options.find((x) => x.title === title)?.id)} />}
      <Input label="Amount" prefix="₦" keyboardType="number-pad" value={amt} onChangeText={(x) => setAmt(x.replace(/\D/g, ''))} mono hint={t ? 'Minimum ' + naira(t.min_ticket) : 'Pick a farm or pool above'} />
      {r ? <>
        <Hearth>
          <Txt v="label" color={c.hmute}>Projected total at maturity</Txt>
          <Txt v="monoLg" color={c.hink} style={{ fontSize: 34 }}>{naira(r.total)}</Txt>
          <View style={{ flexDirection: 'row', gap: 20 }}>
            <View><Txt v="label" color={c.hmute}>Profit</Txt><Txt v="mono" color={c.yolk}>{naira(r.profit, { sign: true })}</Txt></View>
            <View><Txt v="label" color={c.hmute}>Per month</Txt><Txt v="mono" color={c.hink}>{naira(r.monthly)}</Txt></View>
            <View><Txt v="label" color={c.hmute}>Term</Txt><Txt v="mono" color={c.hink}>{t.duration_months} mo</Txt></View>
          </View>
          <Txt v="small" color={c.hmute}>{pct(t.projected_roi_pct, 1)} over the term · {pct(r.annualised, 1)} a year</Txt>
        </Hearth>
        <Banner tone="warn" icon="alert-outline" title="This is an estimate" body={ESTIMATE_COPY} />
      </> : <Card><Txt v="small">Enter an amount to see what it's projected to return.</Txt></Card>}
    </Screen>
  );
}

export function InvestAmountScreen({ navigation, route }) {
  const { c } = useTheme();
  const { wallet, refreshWallet } = useAuth();
  const { kind, id } = route.params;
  const [kyc] = useKyc();
  const [t, setT] = useState(undefined);
  const [amt, setAmt] = useState(route.params.amount ? String(route.params.amount) : '');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { fetchTarget(kind, id).then(setT); refreshWallet(); }, [kind, id]);
  // KYC is a hard gate: there is no way past it to the amount screen.
  useEffect(() => { if (kyc !== undefined && kyc?.status !== 'approved') navigation.replace('Kyc', { then: { kind, id, amount: Number(amt || 0) || undefined } }); }, [kyc]);
  if (t === undefined || kyc === undefined || kyc?.status !== 'approved') return <Screen><AppBar title="Invest" close /><Skeleton h={160} r={20} /></Screen>;
  if (!t) return <Screen><AppBar title="Invest" close /><Empty icon="sprout-off-outline" title="This opportunity isn't available" /></Screen>;
  const n = Number(amt || 0); const bal = Number(wallet?.balance || 0);
  const min = Number(t.min_ticket); const remaining = Number(t.target_amount) - Number(t.raised_amount);
  const fieldErr = !n ? null : n < min ? 'The minimum is ' + naira(min) : n > remaining ? 'Only ' + naira(remaining) + ' is still being raised' : null;
  const short = n > bal ? n - bal : 0;
  const r = n > 0 ? projectReturn(n, Number(t.projected_roi_pct), t.duration_months) : null;
  const chips = [...new Set([min, min * 2, min * 5].filter((v) => v <= remaining))];
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      await rpc('invest', { p_kind: kind, p_target: id, p_amount: n });
      await refreshWallet();
      track(kind === 'pool' ? 'pool_joined' : 'investment_made', { amount: n, target: id });
      navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'InvestSuccess', params: { amount: n, title: t.title, profit: r.profit, months: t.duration_months } }] });
    } catch (e) { setErr(friendlyError(e)); setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title={n > 0 ? 'Invest ' + naira(n) : 'Invest'} disabled={!n || !!fieldErr || !!short || !agree} loading={busy} onPress={go} />}>
      <AppBar title="Invest" close />
      {err ? <Banner tone="err" title="Your investment didn't go through" body={err} /> : null}
      <Card>
        <Txt v="small">{kind === 'pool' ? 'Pool · ' + (t.pool_farms || []).length + ' farms' : t.vendor?.business_name}</Txt>
        <Txt v="bold" style={{ fontSize: 16 }}>{t.title}</Txt>
        <Txt v="small"><Txt v="mono" color={c.acc} style={{ fontSize: 13 }}>{pct(t.projected_roi_pct, 1)}</Txt> projected over {t.duration_months} months · {naira(remaining)} still open</Txt>
      </Card>
      <Input label="Amount" prefix="₦" keyboardType="number-pad" value={amt} onChangeText={(x) => { setAmt(x.replace(/\D/g, '')); setErr(null); }} mono autoFocus={!route.params.amount} error={fieldErr} hint={'Minimum ' + naira(min)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chips.map((v) => <Chip key={v} label={naira(v)} selected={n === v} onPress={() => setAmt(String(v))} />)}      </View>
      {r ? <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body">Projected profit</Txt><Txt v="mono" color={c.sage} style={{ fontSize: 14 }}>{naira(r.profit, { sign: true })}</Txt></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}><Txt v="bold">Projected total at maturity</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(r.total)}</Txt></View>
        <Estimate />
      </Card> : null}
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="wallet-outline" /><View style={{ flex: 1 }}><Txt v="strong">Pay from wallet</Txt><Txt v="small">Balance <Txt v="mono" style={{ fontSize: 13 }}>{naira(bal)}</Txt></Txt></View></Card>
      {short && !fieldErr ? <Banner tone="warn" icon="wallet-plus-outline" title={'You need ' + naira(short) + ' more'} body="Top up and you'll come straight back here with your amount kept."
        action={'Top up ' + naira(short)} onAction={() => navigation.navigate('TopUp', { amount: Math.ceil(short), returnTo: 'InvestAmount' })} /> : null}
      <Pressable onPress={() => setAgree(!agree)} accessibilityRole="checkbox" accessibilityState={{ checked: agree }} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44 }}>
        <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: agree ? c.ember : 'transparent', borderWidth: agree ? 0 : 2, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>{agree ? <Icon name="check" size={18} color={c.onyolk} /> : null}</View>
        <Txt v="body" style={{ flex: 1 }}>I understand returns are not guaranteed and I could lose some or all of this money.</Txt>
      </Pressable>
    </Screen>
  );
}

export function InvestSuccessScreen({ navigation, route }) {
  const { c } = useTheme();
  const { amount, title, profit, months } = route.params;
  return (
    <Screen style={{ justifyContent: 'center', gap: 14 }}>
      <View style={{ alignSelf: 'center', width: 88, height: 88, borderRadius: 44, backgroundColor: c.yolk, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={48} color={c.onyolk} /></View>
      <Txt v="display" style={{ textAlign: 'center' }}>You've invested {naira(amount)}</Txt>
      <Txt v="body" color={c.mute} style={{ textAlign: 'center' }}>in {title}</Txt>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body">Projected profit over {months} months</Txt><Txt v="mono" color={c.sage} style={{ fontSize: 14 }}>{naira(profit, { sign: true })}</Txt></View>
        <Estimate />
      </Card>
      <Txt v="small" style={{ textAlign: 'center' }}>Track it in your portfolio. The term starts once the raise is fully funded.</Txt>
      <Button title="View portfolio" onPress={() => navigation.replace('Portfolio')} style={{ marginTop: 12 }} />
      <Button variant="ghost" title="Done" onPress={() => navigation.popTo('Tabs')} />
    </Screen>
  );
}

function DocUpload({ title, hint, value, onChange, error }) {
  const { c } = useTheme();
  const { uid } = useAuth();
  const [photo, setPhoto] = useState(null);
  const [st, setSt] = useState(value ? 'done' : 'empty');
  const send = async (uri) => {
    setSt('uploading');
    try { onChange(await uploadImage('id-docs', uid, uri)); setSt('done'); } catch { setSt('failed'); }
  };
  const pick = async (camera) => {
    if (camera) {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) return Alert.alert('Camera access is off', 'Allow the camera for Poultry360, or choose a photo from your gallery.', [...(p.canAskAgain ? [] : [{ text: 'Open settings', onPress: () => Linking.openSettings() }]), { text: 'OK' }]);
    }
    try {
      const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ quality: 0.6, mediaTypes: ['images'] });
      if (r.canceled) return;
      setPhoto(r.assets[0].uri); send(r.assets[0].uri);
    } catch (e) { Alert.alert("Couldn't open the " + (camera ? 'camera' : 'gallery'), friendlyError(e)); }
  };
  return (
    <Card tone={st === 'failed' ? 'err' : undefined}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <PhotoBox uri={photo} size={56} />
        <View style={{ flex: 1 }}><Txt v="strong">{title}</Txt>
          <Txt v="small">{st === 'done' ? 'Uploaded. Tap below to replace.' : st === 'uploading' ? 'Uploading…' : st === 'failed' ? "Upload didn't finish. Your other details are kept." : hint}</Txt></View>
        {st === 'done' ? <Icon name="check-circle" color={c.sage} /> : null}
      </View>
      {error ? <Txt v="small" color={c.err}>{error}</Txt> : null}
      {st === 'failed' && photo ? <Button small variant="dark" icon="refresh" title="Retry upload" onPress={() => send(photo)} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" icon="camera-outline" title="Take photo" onPress={() => pick(true)} style={{ flex: 1 }} /><Button small variant="outline" icon="image-outline" title="Gallery" onPress={() => pick(false)} style={{ flex: 1 }} /></View>
    </Card>
  );
}

export function KycScreen({ navigation, route }) {
  const { c } = useTheme();
  const { profile, refresh } = useAuth();
  const [kyc, reload] = useKyc();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState(null);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const then = route.params?.then;
  useEffect(() => {
    if (kyc === undefined || f) return;
    setF({ name: kyc?.full_name || profile?.full_name || '', dob: kyc?.date_of_birth || '', address: kyc?.address || '', bvn: kyc?.bvn_last4 || '', idDoc: kyc?.id_doc_path || null, addrDoc: kyc?.address_doc_path || null });
  }, [kyc]);
  if (kyc === undefined || !f) return <Screen><AppBar title="Verify your identity" /><Skeleton h={200} r={20} /></Screen>;
  const set = (k) => (v) => { setF((x) => ({ ...x, [k]: v })); setErrs((e) => ({ ...e, [k]: undefined })); };
  const submit = async () => {
    const e = {};
    if (f.name.trim().split(/\s+/).length < 2) e.name = 'Enter your full legal name';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.dob) || isNaN(new Date(f.dob).getTime())) e.dob = 'Use YYYY-MM-DD';
    else if (addMonths(f.dob, 216) > new Date()) e.dob = 'You must be 18 or older to invest';
    if (f.address.trim().length < 8) e.address = 'Enter your residential address';
    if (f.bvn && !/^\d{4}$/.test(f.bvn)) e.bvn = 'Enter the last 4 digits only';
    if (!f.idDoc) e.idDoc = 'Upload a photo of your ID';
    if (!f.addrDoc) e.addrDoc = 'Upload proof of address';
    setErrs(e); if (Object.values(e).some(Boolean)) return;
    setBusy(true);
    try {
      await rpc('submit_kyc', { p_full_name: f.name.trim(), p_dob: f.dob, p_address: f.address.trim(), p_bvn_last4: f.bvn || null, p_id_doc: f.idDoc, p_address_doc: f.addrDoc });
      track('kyc_submitted');
      setEditing(false); await Promise.all([reload(), refresh()]);
    } catch (er) { Alert.alert("Couldn't submit", friendlyError(er)); } finally { setBusy(false); }
  };
  const dev = async (status) => { await rpc('dev_set_kyc', { p_status: status, p_reason: status === 'rejected' ? 'The ID photo is unclear. Please retake it in good light.' : null }); reload(); };

  if (kyc?.status === 'approved') return (
    <Screen scroll footer={<Button title={then ? 'Continue to invest' : 'Browse opportunities'} onPress={() => (then ? navigation.replace('InvestAmount', then) : navigation.goBack())} />}>
      <AppBar title="Identity verified" />
      <Banner tone="ok" title="You're verified" body="You can now invest in any open farm or pool." />
      <Card><Txt v="label">Verified as</Txt><Txt v="bold">{kyc.full_name}</Txt><Txt v="small">{kyc.address}</Txt></Card>
    </Screen>
  );
  if (kyc?.status === 'pending' && !editing) return (
    <Screen scroll>
      <AppBar title="Verification in review" />
      <Hearth><Icon name="shield-account-outline" size={32} color={c.hacc} /><Txt v="h2" color={c.hink}>We're checking your details</Txt><Txt v="small" color={c.hmute}>This usually takes less than a day. This screen updates by itself when it's done{then ? ', and you can then finish your investment' : ''}.</Txt></Hearth>
      <Card><Steps steps={[{ label: 'Details submitted', state: 'done' }, { label: 'Documents under review', state: 'current' }, { label: 'Approved to invest', state: 'todo' }]} /></Card>
      {__DEV__ ? <Card><Txt v="label">Developer only</Txt><View style={{ flexDirection: 'row', gap: 8 }}><Button small variant="outline" title="Approve" onPress={() => dev('approved')} style={{ flex: 1 }} /><Button small variant="outline" title="Reject" onPress={() => dev('rejected')} style={{ flex: 1 }} /></View></Card> : null}
    </Screen>
  );
  if (kyc?.status === 'rejected' && !editing) return (
    <Screen scroll footer={<Button title="Fix and resubmit" onPress={() => setEditing(true)} />}>
      <AppBar title="Verification needs another look" />
      <Card tone="err"><Txt v="label" color={c.err}>Reason</Txt><Txt v="body">{kyc.rejection_reason || 'We could not verify your details.'}</Txt></Card>
      <Txt v="small">Everything you entered is kept. Change only what's mentioned above, then resubmit.</Txt>
    </Screen>
  );
  return (
    <Screen scroll footer={<Button title="Submit for verification" loading={busy} onPress={submit} />}>
      <AppBar title="Verify your identity" />
      <Txt v="small" style={{ fontSize: 14 }}>Required once before your first investment. Your documents are stored privately and only seen by the Poultry360 review team.</Txt>
      <Txt v="label">1 · Your details</Txt>
      <Input label="Full legal name" value={f.name} onChangeText={set('name')} placeholder="Adaeze Okafor" autoCapitalize="words" error={errs.name} />
      <DateInput label="Date of birth" value={f.dob} onChange={set('dob')} max={isoDate(addMonths(new Date(), -216))} error={errs.dob} hint="Tap the month and year at the top of the calendar to jump to your birth year." />
      <Input label="Residential address" value={f.address} onChangeText={set('address')} placeholder="12 Aba Road, Port Harcourt" multiline error={errs.address} />
      <Input label="BVN, last 4 digits (optional)" value={f.bvn} onChangeText={(x) => set('bvn')(x.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" mono maxLength={4} error={errs.bvn} hint="We never ask for your full BVN." />
      <Txt v="label">2 · Your documents</Txt>
      <DocUpload title="Government-issued ID" hint="NIN slip, voter card, passport or driver's licence" value={f.idDoc} onChange={set('idDoc')} error={errs.idDoc} />
      <DocUpload title="Proof of address" hint="A utility bill or bank statement from the last 3 months" value={f.addrDoc} onChange={set('addrDoc')} error={errs.addrDoc} />
      <Txt v="label">3 · Review</Txt>
      <Txt v="small">Check that your name matches your ID exactly, then submit.</Txt>
    </Screen>
  );
}

export function PortfolioScreen({ navigation }) {
  const { c } = useTheme();
  const [port, setPort] = useState(null);
  const [tab, setTab] = useState('active');
  useFocusEffect(useCallback(() => { rpc('my_portfolio').then(setPort).catch(() => setPort({ items: [], total_invested: 0, current_value: 0, returns_to_date: 0 })); }, []));
  if (!port) return <Screen><AppBar title="My investments" /><Skeleton h={150} r={24} /></Screen>;
  const rows = port.items.filter((i) => i.status === tab);
  return (
    <Screen scroll>
      <AppBar title="My investments" />
      <Hearth>
        <Txt v="label" color={c.hmute}>Total invested</Txt>
        <Txt v="monoLg" color={c.hink} style={{ fontSize: 34 }}>{naira(port.total_invested)}</Txt>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <View><Txt v="label" color={c.hmute}>Current value</Txt><Txt v="mono" color={c.hink}>{naira(port.current_value)}</Txt></View>
          <View><Txt v="label" color={c.hmute}>Returns to date</Txt><Txt v="mono" color={c.yolk}>{naira(port.returns_to_date, { sign: true })}</Txt></View>
        </View>
      </Hearth>
      {!port.items.length ? <Empty icon="briefcase-outline" title="No investments yet" body="Fund a verified farm to start your portfolio." action="Browse opportunities" onAction={() => navigation.navigate('InvestHome')} /> : <>
        <Segmented options={[{ value: 'active', label: 'Active' }, { value: 'matured', label: 'Matured' }, { value: 'refunded', label: 'Refunded' }]} value={tab} onChange={setTab} />
        {!rows.length ? <Card><Txt v="small">Nothing {tab} yet.</Txt></Card> : <Group>{rows.map((i, n) => (
          <Row key={i.id} last={n === rows.length - 1} icon={i.kind === 'pool' ? 'chart-donut' : 'barn'} title={i.title}
            subtitle={(i.kind === 'pool' ? 'Pool · ' + i.pool_farm_count + ' farms' : i.farm_name) + ' · returns ' + naira(i.returns_paid)}
            onPress={() => navigation.navigate('InvestmentDetail', { id: i.id })}
            right={<View style={{ alignItems: 'flex-end', gap: 4 }}><Txt v="mono" style={{ fontSize: 14 }}>{naira(i.amount)}</Txt><Pill tone={i.status === 'active' ? 'live' : i.status === 'matured' ? 'ok' : 'neutral'} label={INVEST_STATUS[i.status]} /></View>} />))}</Group>}
      </>}
    </Screen>
  );
}

// Two bars per snapshot: projected (muted) next to actually paid (ember).
function RoiBars({ rows }) {
  const { c } = useTheme();
  const max = Math.max(1, ...rows.map((r) => Math.max(Number(r.projected_return), Number(r.actual_return))));
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110 }}>
        {rows.map((r) => (
          <View key={r.id} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
            <View style={{ flex: 1, height: Math.max(4, (Number(r.projected_return) / max) * 110), borderRadius: 4, backgroundColor: c.sf2 }} />
            <View style={{ flex: 1, height: Math.max(4, (Number(r.actual_return) / max) * 110), borderRadius: 4, backgroundColor: c.ember }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.sf2 }} /><Txt v="small">Projected by then</Txt></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c.ember }} /><Txt v="small">Actually paid</Txt></View>
      </View>
    </View>
  );
}

export function InvestmentDetailScreen({ navigation, route }) {
  const { c } = useTheme();
  const { id } = route.params;
  const [inv, setInv] = useState(undefined);
  const [roi, setRoi] = useState([]);
  const [tx, setTx] = useState([]);
  useFocusEffect(useCallback(() => {
    rpc('my_portfolio').then((p) => setInv(p.items.find((x) => x.id === id) || null)).catch(() => setInv(null));
    supabase.from('roi_calculations').select('*').eq('investment_id', id).order('computed_date').limit(12).then(({ data }) => setRoi(data || []));
    supabase.from('transactions').select('*').eq('related_investment_id', id).order('created_at', { ascending: false }).then(({ data }) => setTx(data || []));
  }, [id]));
  if (inv === undefined) return <Screen><AppBar /><Skeleton h={160} r={20} /></Screen>;
  if (!inv) return <Screen><AppBar /><Empty icon="briefcase-off-outline" title="Investment not found" /></Screen>;
  const matures = inv.started_at ? addMonths(inv.started_at, inv.duration_months) : null;
  return (
    <Screen scroll>
      <AppBar title="Investment" />
      <Pill tone={inv.status === 'active' ? 'live' : inv.status === 'matured' ? 'ok' : 'neutral'} label={INVEST_STATUS[inv.status]} />
      <Txt v="display" style={{ fontSize: 26, lineHeight: 30 }}>{inv.title}</Txt>
      <Txt v="small">{inv.kind === 'pool' ? 'Pool · ' + inv.pool_farm_count + ' farms' : inv.farm_name}</Txt>
      {inv.status === 'refunded' ? <Banner tone="info" icon="undo-variant" title={naira(inv.amount) + ' returned to your wallet'} body="This raise closed without reaching its target, so you were refunded in full." /> : null}
      {inv.status === 'matured' ? <Banner tone="ok" title="This investment has matured" body={'Your ' + naira(inv.amount) + ' principal and ' + naira(inv.returns_paid) + ' in returns were paid to your wallet.'} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Invested" value={naira(inv.amount)} />
        <Stat label="Returns paid" value={naira(inv.returns_paid)} subColor={c.sage} />
        <Stat label="Projected profit" value={naira(inv.projected_return)} sub={pct(inv.projected_roi_pct, 1)} />
      </View>
      <Estimate />
      <Txt v="label">Projected vs actual</Txt>
      <Card>
        {roi.length ? <RoiBars rows={roi} /> : <Txt v="small">{inv.started_at ? 'The first comparison appears after the first payout or month-end.' : 'Term starts once fully funded.'}</Txt>}
      </Card>
      <Txt v="label">Term</Txt>
      <Group>
        <Row icon="calendar-start" title={inv.started_at ? shortDate(inv.started_at) : 'Not started yet'} subtitle={inv.started_at ? 'Started' : 'Term starts once fully funded'} />
        <Row icon="calendar-check" title={matures ? shortDate(matures) : inv.duration_months + ' months after it starts'} subtitle="Matures" />
        <Row last icon="cash-multiple" title={inv.payout_schedule === 'monthly' ? 'Monthly returns, principal at the end' : 'Returns and principal at the end of the term'} subtitle="Payout schedule" />
      </Group>
      <Txt v="label">Transactions</Txt>
      {tx.length ? <Group>{tx.map((t, i) => (
        <Row key={t.id} last={i === tx.length - 1} icon={Number(t.amount) > 0 ? 'arrow-bottom-left' : 'arrow-top-right'} iconColor={Number(t.amount) > 0 ? c.sage : c.ink} title={t.label || t.type}
          subtitle={timeAgo(t.created_at)} onPress={() => navigation.navigate('TxDetail', { id: t.id })}
          right={<Txt v="mono" color={Number(t.amount) > 0 ? c.sage : c.ink} style={{ fontSize: 14 }}>{naira(t.amount, { sign: true })}</Txt>} />))}</Group>
        : <Card><Txt v="small">No transactions yet.</Txt></Card>}
    </Screen>
  );
}

const TX_TYPE = { topup: 'Wallet top-up', payment: 'Payment', payout: 'Sales payout', refund: 'Refund', withdrawal: 'Withdrawal', earning: 'Delivery earning',
  investment: 'Investment', investment_return: 'Investment return', investment_refund: 'Investment refund', investment_funding: 'Investment funding' };

export function TxDetailScreen({ navigation, route }) {
  const { c } = useTheme();
  const [t, setT] = useState(undefined);
  useEffect(() => { supabase.from('transactions').select('*').eq('id', route.params.id).maybeSingle().then(({ data }) => setT(data || null)); }, [route.params.id]);
  if (t === undefined) return <Screen><AppBar title="Transaction" /><Skeleton h={120} r={20} /></Screen>;
  if (!t) return <Screen><AppBar title="Transaction" /><Empty icon="receipt-text-outline" title="Transaction not found" /></Screen>;
  const pos = Number(t.amount) > 0;
  return (
    <Screen scroll>
      <AppBar title="Transaction" />
      <View style={{ alignItems: 'center', gap: 6, paddingVertical: 12 }}>
        <Txt v="monoLg" color={pos ? c.sage : c.ink} style={{ fontSize: 36 }}>{naira(t.amount, { sign: true, decimals: 2 })}</Txt>
        <Txt v="body" color={c.mute} style={{ textAlign: 'center' }}>{t.label || TX_TYPE[t.type]}</Txt>
      </View>
      <Group>
        <Row icon="shape-outline" title={TX_TYPE[t.type] || t.type} subtitle="Type" />
        <Row icon="progress-check" title={t.status === 'processing' ? 'Processing' : 'Completed'} subtitle="Status" />
        <Row icon="clock-outline" title={fullDate(t.created_at)} subtitle="Date and time" />
        <Row last icon="pound" title={<Txt v="mono" selectable style={{ fontSize: 12 }}>{t.id}</Txt>} subtitle="Reference · press and hold to copy" />
      </Group>
      {t.related_investment_id ? <Button variant="outline" icon="chart-line" title="View this investment" onPress={() => navigation.navigate('InvestmentDetail', { id: t.related_investment_id })} /> : null}
      {t.related_order_id && ['payment', 'refund'].includes(t.type) ? <Button variant="outline" icon="receipt-text-outline" title="View this order" onPress={() => navigation.navigate('Tracking', { orderId: t.related_order_id })} /> : null}
    </Screen>
  );
}
