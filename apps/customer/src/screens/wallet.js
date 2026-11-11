import React, { useCallback, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usePage, useWide, useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Pill, Skeleton, Steps, OtpBoxes, Sheet, Segmented,
  naira, rpc, friendlyError, timeAgo, supabase, HeaderBar, SectionHead, DataTable, BarChart, SelectCard, SuccessMoment } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { TEST_CARDS, chargeCard } from '../lib/payments';
import { exportCsv } from '../lib/exportCsv';
import { TopBar } from '../components/RoleSwitcher';

const TX_ICON = { topup: 'plus', payment: 'arrow-top-right', payout: 'arrow-bottom-left', refund: 'undo-variant', withdrawal: 'bank-transfer-out', earning: 'motorbike',
  investment: 'chart-line', investment_return: 'cash-plus', investment_refund: 'undo-variant', investment_funding: 'hand-coin-outline' };
const TX_TYPE = { topup: 'Top-up', payment: 'Payment', payout: 'Payout', refund: 'Refund', withdrawal: 'Withdrawal', earning: 'Earning',
  investment: 'Investment', investment_return: 'Return', investment_refund: 'Refund', investment_funding: 'Funding' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FILTERS = [{ value: 'all', label: 'All' }, { value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }];

export function WalletScreen({ navigation }) {
  const page = usePage();
  const wide = useWide();
  const { c } = useTheme();
  const { uid, vendor, profile, wallet, refreshWallet } = useAuth();
  const [tx, setTx] = useState(null);
  const [owed, setOwed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const load = useCallback(async () => {
    setBusy(true);
    const [t] = await Promise.all([supabase.from('transactions').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(100), refreshWallet()]);
    setTx(t.data || []);
    rpc('my_credit').then((list) => setOwed((list || []).reduce((s, f) => s + Number(f.outstanding), 0))).catch(() => {});
    setBusy(false);
  }, [uid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const [exporting, setExporting] = useState(false);
  const doExport = async () => { setExporting(true); try { await exportCsv(tx); } catch (e) { Alert.alert("Couldn't export", friendlyError(e)); } finally { setExporting(false); } };
  const canWithdraw = !!vendor || (profile?.roles || []).includes('vet');
  // this week: money in, money out, and money in per day for the chart
  const weekAgo = Date.now() - 7 * 864e5;
  const week = (tx || []).filter((t) => new Date(t.created_at).getTime() >= weekAgo);
  const moneyIn = week.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const moneyOut = week.filter((t) => Number(t.amount) < 0).reduce((s, t) => s - Number(t.amount), 0);
  const bars = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i);
    const v = (tx || []).filter((t) => Number(t.amount) > 0 && new Date(t.created_at).toDateString() === d.toDateString()).reduce((s, t) => s + Number(t.amount), 0);
    return { label: DAYS[d.getDay()], value: v, text: naira(v) };
  });
  const shown = (tx || []).filter((t) => filter === 'all' || (filter === 'in' ? Number(t.amount) > 0 : Number(t.amount) < 0));

  const balance = (
    <Hearth style={wide ? { flex: 1.3, justifyContent: 'space-between' } : null}>
      <Txt v="label" color={c.hmute}>Available balance</Txt>
      {wallet ? <Txt v="monoLg" color={c.hink} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: wide ? 44 : 40, lineHeight: wide ? 50 : 46 }}>{naira(wallet.balance, { decimals: 2 })}</Txt> : <Skeleton h={44} w={220} />}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button small variant="onHearth" icon="plus" title="Add funds" onPress={() => navigation.navigate('TopUp')} style={{ flex: 1 }} />
        {canWithdraw ? <Button small variant="hearthOutline" icon="arrow-top-right" title="Withdraw" onPress={() => navigation.navigate('Withdraw')} style={{ flex: 1 }} /> : null}
      </View>
    </Hearth>
  );
  const figures = (
    <Card style={[{ gap: 14, padding: 18 }, wide ? { flex: 1 } : null]}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}><Txt v="label">In this week</Txt><Txt v="mono" color={c.sage} style={{ fontSize: 18 }}>{naira(moneyIn)}</Txt></View>
        <View style={{ flex: 1, gap: 2 }}><Txt v="label">Out this week</Txt><Txt v="mono" style={{ fontSize: 18 }}>{naira(moneyOut)}</Txt></View>
        {owed > 0 ? <View style={{ flex: 1, gap: 2 }}><Txt v="label">Pay later</Txt><Txt v="mono" color={c.warn} style={{ fontSize: 18 }}>{naira(owed)}</Txt></View> : null}
      </View>
      <BarChart bars={bars} height={86} caption="Money in per day, last 7 days" />
    </Card>
  );
  const owedCard = owed > 0 ? (
    <Card onPress={() => navigation.navigate('MyCredit')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.warnbg, alignItems: 'center', justifyContent: 'center' }}><Icon name="credit-card-clock-outline" size={20} color={c.warn} /></View>
      <View style={{ flex: 1 }}><Txt v="bold">{'You owe ' + naira(owed) + ' on pay later'}</Txt><Txt v="small">Pay it from your wallet</Txt></View>
      <Icon name="chevron-right" color={c.mute} />
    </Card>
  ) : null;
  const activity = (
    <View style={{ gap: 12 }}>
      <SectionHead title="Activity" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {wide ? <View style={{ width: 300 }}><Segmented options={FILTERS} value={filter} onChange={setFilter} /></View> : null}
        {tx?.length ? <Button small variant="outline" icon="download-outline" title="Export CSV" loading={exporting} onPress={doExport} style={{ paddingHorizontal: 14 }} /> : null}
      </View>} />
      {!wide ? <Segmented options={FILTERS} value={filter} onChange={setFilter} /> : null}
      {tx === null ? <Skeleton h={160} r={20} />
        : <DataTable columns={[{ label: 'Date', flex: 0.9 }, { label: 'Details', flex: 2.4 }, { label: 'Type', flex: 1 }, { label: 'Amount', flex: 1, right: true }]}
            rows={shown.map((t) => ({ key: t.id, onPress: () => navigation.navigate('TxDetail', { id: t.id }), cells: [
              <Txt v="small">{wide ? new Date(t.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }) : timeAgo(t.created_at)}</Txt>,
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name={TX_ICON[t.type] || 'swap-horizontal'} size={18} color={Number(t.amount) > 0 ? c.sage : c.mute} /><Txt v="strong" numberOfLines={1} style={{ flexShrink: 1 }}>{t.label || TX_TYPE[t.type] || t.type}</Txt></View>,
              t.status === 'processing' ? <Pill tone="warn" label="Processing" /> : <Pill tone={Number(t.amount) > 0 ? 'ok' : 'neutral'} icon={null} label={TX_TYPE[t.type] || t.type} />,
              <Txt v="mono" color={Number(t.amount) > 0 ? c.sage : c.ink}>{naira(t.amount, { sign: true })}</Txt>] }))}
            empty={<Empty icon="receipt-text-outline" title="No activity yet" body="Payments, payouts and refunds show here within a minute." style={{ borderWidth: 0 }} />} />}
    </View>
  );
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={[{ padding: 20, paddingTop: wide ? 20 : 8, gap: wide ? 28 : 18 }, page]} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        {wide ? <HeaderBar title="Wallet" /> : <><TopBar navigation={navigation} /><Txt v="display">Wallet</Txt></>}
        {wide ? <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>{balance}{figures}</View> : <>{balance}{owedCard}</>}
        {wide ? owedCard : null}
        {activity}
      </ScrollView>
    </Screen>
  );
}

export function TopUpScreen({ navigation, route }) {
  const { c } = useTheme();
  const wide = useWide();
  const { wallet, refreshWallet } = useAuth();
  const [amt, setAmt] = useState(route.params?.amount ? String(route.params.amount) : '');
  const returnTo = route.params?.returnTo;   // e.g. the invest flow, which keeps its amount while this modal is open
  const [card, setCard] = useState('ok');
  const [st, setSt] = useState({ phase: 'idle' });
  const n = Number(amt || 0);
  const go = async () => {
    setSt({ phase: 'busy' });
    const r = await chargeCard(card, n);
    if (!r.ok) return setSt({ phase: 'failed', reason: r.reason });
    try { const bal = await rpc('wallet_topup', { p_amount: n, p_ref: r.ref }); await refreshWallet(); if (returnTo) return navigation.goBack(); setSt({ phase: 'done', bal, ref: r.ref }); }
    catch (e) { setSt({ phase: 'failed', reason: friendlyError(e) }); }
  };
  if (st.phase === 'done') return (
    <Screen style={{ justifyContent: 'center', gap: 14, ...(wide ? { maxWidth: 560 } : null) }}>
      <SuccessMoment title={naira(n) + ' added'} value={'New balance ' + naira(st.bal)} body={'Reference ' + st.ref} />
      <Button title="Back to wallet" onPress={() => navigation.goBack()} />
    </Screen>
  );
  return (
    <Screen scroll style={wide ? { maxWidth: 600 } : null} footer={<Button title={n < 100 ? 'Enter at least ₦100' : 'Pay ' + naira(n)} disabled={n < 100} loading={st.phase === 'busy'} onPress={go} />}>
      <AppBar title="Add funds" close />
      {st.phase === 'failed' ? <Banner tone="err" title="Payment didn't go through" body={st.reason} /> : null}
      <Input label="Amount" prefix="₦" keyboardType="number-pad" value={amt} onChangeText={(t) => setAmt(t.replace(/\D/g, ''))} mono autoFocus={!route.params?.amount} hint={'Balance after: ' + naira(Number(wallet?.balance || 0) + n)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[5000, 10000, 25000, 50000].map((v) => <Chip key={v} label={naira(v)} selected={n === v} onPress={() => setAmt(String(v))} />)}</View>
      <Txt v="h2">Pay with</Txt>
      {TEST_CARDS.map((k) => <SelectCard key={k.id} selected={card === k.id} onPress={() => setCard(k.id)} lead={<Icon name="credit-card-outline" color={c.acc} />} title={k.label} subtitle={k.note} />)}
      <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="lock-outline" size={16} color={c.mute} /><Txt v="small">Card details are handled by Paystack, never stored by us.</Txt></View>
    </Screen>
  );
}

export function WithdrawScreen({ navigation }) {
  const { c } = useTheme();
  const wide = useWide();
  const { wallet, refreshWallet } = useAuth();
  const [acct, setAcct] = useState(undefined);   // { bank_name, bank_account_last4, holder } or null
  useFocusEffect(useCallback(() => { rpc('my_payout_account').then((a) => setAcct(a || null)).catch(() => setAcct(null)); refreshWallet(); }, []));
  const [amt, setAmt] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const bal = Number(wallet?.balance || 0); const n = Number(amt || 0);
  const narrow = wide ? { maxWidth: 600 } : null;
  if (acct === undefined) return <Screen style={narrow}><AppBar title="Withdraw" close /><Skeleton h={120} r={20} /></Screen>;
  const vendor = acct ? { bank_name: acct.bank_name, bank_account_last4: acct.bank_account_last4, business_name: acct.holder } : null;
  if (!vendor) return (
    <Screen scroll style={narrow}>
      <AppBar title="Withdraw" close />
      <Hearth><Txt v="label" color={c.hmute}>Available</Txt><Txt v="monoLg" color={c.hink} style={{ fontSize: 40, lineHeight: 46 }}>{naira(bal)}</Txt></Hearth>
      <Empty icon="bank-outline" title="Add a bank account to withdraw" body="Payouts only go to a verified account in your own name or your business's name." action="Add bank account" onAction={() => navigation.replace('Bank')} />
    </Screen>
  );
  if (done) return (
    <Screen scroll style={narrow} footer={<Button title="Done" onPress={() => navigation.goBack()} />}>
      <View style={{ height: 24 }} />
      <SuccessMoment title="Your payout is on its way" value={naira(n)} body={'To ' + vendor.bank_name + ' •••• ' + vendor.bank_account_last4} />
      <Card><Steps steps={[{ label: 'Started', state: 'done' }, { label: 'Processing with your bank', state: 'current' }, { label: 'Arrived', state: 'todo' }]} /></Card>
    </Screen>
  );
  const start = async () => {
    if (n <= 0 || n > bal) return setErr("That's more than your available balance.");
    setErr(null); setCode('');
    // Payments are simulated, so the code is shown here. In production it's sent to the user and the RPC returns null.
    try { const cd = await rpc('request_withdrawal_code'); setDevCode(cd || null); setSheet(true); } catch (e) { setErr(friendlyError(e)); }
  };
  const confirm = async () => {
    setBusy(true);
    try { await rpc('wallet_withdraw', { p_amount: n, p_code: code }); await refreshWallet(); setSheet(false); setDone(true); }
    catch (e) { setErr(friendlyError(e)); setCode(''); } finally { setBusy(false); }
  };
  return (
    <Screen scroll style={narrow} footer={<Button title={n ? 'Continue' : 'Enter an amount'} disabled={!n} onPress={start} />}>
      <AppBar title="Withdraw" close />
      <Input label="Amount" prefix="₦" keyboardType="number-pad" value={amt} onChangeText={(t) => setAmt(t.replace(/\D/g, ''))} mono autoFocus error={!sheet ? err : null} hint={naira(bal) + ' available'} />
      <Button small variant="outline" title="Withdraw all" onPress={() => setAmt(String(Math.floor(bal)))} style={{ alignSelf: 'flex-start' }} />
      <Txt v="h2">To</Txt>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="bank-outline" color={c.acc} /><View style={{ flex: 1 }}><Txt v="bold">{vendor.bank_name} •••• {vendor.bank_account_last4}</Txt><Txt v="small">{vendor.business_name}</Txt></View><Pill tone="ok" label="Verified" /></Card>
      <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="shield-check-outline" size={16} color={c.mute} /><Txt v="small">You confirm every withdrawal with a one-time code.</Txt></View>
      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <Txt v="h1">Confirm it's you</Txt>
        <Txt v="small" style={{ fontSize: 14 }}>Enter your one-time code to send {naira(n)} to {vendor.bank_name} ••{vendor.bank_account_last4}.</Txt>
        {devCode ? <Banner tone="info" icon="test-tube" title={'Test mode · code ' + devCode} body="Payments are simulated. In production this code is sent to you." /> : null}
        <OtpBoxes value={code} onChange={setCode} error={!!err} />
        {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
        <Button title={code.length === 6 ? 'Confirm withdrawal' : 'Enter the 6-digit code'} disabled={code.length !== 6} loading={busy} onPress={confirm} />
      </Sheet>
    </Screen>
  );
}

const BANKS = ['GTBank', 'Access', 'Zenith', 'First Bank', 'UBA', 'Moniepoint', 'Opay'];
export function BankScreen({ navigation }) {
  const wide = useWide();
  const { refresh } = useAuth();
  const [bank, setBank] = useState(null); const [acct, setAcct] = useState(''); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await rpc('add_bank', { p_bank: bank, p_account: acct }); await refresh(); navigation.replace('Withdraw'); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  const missing = !bank ? 'Pick your bank' : acct.length !== 10 ? 'Enter the 10-digit account number' : null;
  return (
    <Screen scroll style={wide ? { maxWidth: 600 } : null} footer={<Button title={missing || 'Verify and save'} disabled={!!missing} loading={busy} onPress={save} />}>
      <AppBar title="Payout account" />
      <Txt v="h2">Bank</Txt>
      <ChipRow options={BANKS} value={bank} onChange={setBank} />
      <Input label="Account number" keyboardType="number-pad" maxLength={10} value={acct} onChangeText={(t) => setAcct(t.replace(/\D/g, ''))} mono error={err} hint="10-digit NUBAN. The account name must match your business or your own name." />
    </Screen>
  );
}
