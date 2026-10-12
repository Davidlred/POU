import React, { useCallback, useState } from 'react';
import { View, ScrollView, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, Screen, AppBar, Txt, Button, Card, Hearth, Icon, Banner, Empty, Input, Chip, ChipRow, Group, Row, Pill, Skeleton, Steps, OtpBoxes, Sheet,
  naira, rpc, friendlyError, timeAgo, supabase } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { TEST_CARDS, chargeCard } from '../lib/payments';
import { exportCsv } from '../lib/exportCsv';

const TX_ICON = { topup: 'plus', payment: 'arrow-top-right', payout: 'arrow-bottom-left', refund: 'undo-variant', withdrawal: 'bank-transfer-out', earning: 'motorbike',
  investment: 'chart-line', investment_return: 'cash-plus', investment_refund: 'undo-variant', investment_funding: 'hand-coin-outline' };

export function WalletScreen({ navigation }) {
  const { c } = useTheme();
  const { uid, vendor, wallet, refreshWallet } = useAuth();
  const [tx, setTx] = useState(null);
  const [sales, setSales] = useState(null);
  const [owed, setOwed] = useState(0);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const [t] = await Promise.all([supabase.from('transactions').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(50), refreshWallet()]);
    setTx(t.data || []);
    rpc('my_credit').then((list) => setOwed((list || []).reduce((s, f) => s + Number(f.outstanding), 0))).catch(() => {});
    if (vendor) {
      const subs = (await rpc('vendor_orders')) || [];
      const week = subs.filter((s) => s.status === 'delivered' && Date.now() - new Date(s.created_at).getTime() < 7 * 864e5);
      setSales({ gross: week.reduce((a, s) => a + Number(s.items_total), 0), fee: week.reduce((a, s) => a + Number(s.commission), 0), net: week.reduce((a, s) => a + Number(s.net), 0) });
    }
    setBusy(false);
  }, [uid, vendor]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const [exporting, setExporting] = useState(false);
  const doExport = async () => { setExporting(true); try { await exportCsv(tx); } catch (e) { Alert.alert("Couldn't export", friendlyError(e)); } finally { setExporting(false); } };
  return (
    <Screen pad={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} />}>
        <Txt v="display" style={{ fontSize: 28 }}>Wallet</Txt>
        <Hearth>
          <Txt v="label" color={c.hmute}>Available balance</Txt>
          {wallet ? <Txt v="monoLg" color={c.hink} style={{ fontSize: 36 }}>{naira(wallet.balance, { decimals: 2 })}</Txt> : <Skeleton h={36} w={200} />}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button small icon="plus" title="Add funds" onPress={() => navigation.navigate('TopUp')} style={{ flex: 1 }} />
            {vendor ? <Button small variant="hearth" icon="arrow-top-right" title="Withdraw" onPress={() => navigation.navigate('Withdraw')} style={{ flex: 1, borderColor: c.hline }} /> : null}
          </View>
        </Hearth>
        {owed > 0 ? (
          <Card onPress={() => navigation.navigate('MyCredit')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="credit-card-clock-outline" color={c.warn} />
            <View style={{ flex: 1 }}><Txt v="bold">You owe {naira(owed)} on credit</Txt><Txt v="small">Goods you took on pay later. Tap to pay.</Txt></View>
            <Icon name="chevron-right" color={c.mute} />
          </Card>
        ) : null}
        {sales ? (
          <Card>
            <Txt v="label">Last 7 days of sales</Txt>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body">Gross</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(sales.gross)}</Txt></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt v="body" color={c.mute}>Platform commission</Txt><Txt v="mono" color={c.mute} style={{ fontSize: 14 }}>−{naira(sales.fee)}</Txt></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: c.line, paddingTop: 8 }}><Txt v="bold">Net to you</Txt><Txt v="mono" style={{ fontSize: 14 }}>{naira(sales.net)}</Txt></View>
          </Card>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt v="h2">Recent activity</Txt>
          {tx?.length ? <Button small variant="outline" icon="download-outline" title="Export" loading={exporting} onPress={doExport} /> : null}
        </View>
        {tx === null ? <><Skeleton h={56} r={14} /><Skeleton h={56} r={14} /></>
          : !tx.length ? <Empty icon="receipt-text-outline" title="No activity yet" body="Payments, payouts and refunds appear here within a minute." />
          : <Group>{tx.map((t, i) => (
              <Row key={t.id} last={i === tx.length - 1} icon={TX_ICON[t.type]} iconColor={t.amount > 0 ? c.sage : c.ink} title={t.label || t.type} onPress={() => navigation.navigate('TxDetail', { id: t.id })}
                subtitle={t.status === 'processing' ? 'Processing' : timeAgo(t.created_at)}
                right={<Txt v="mono" color={t.amount > 0 ? c.sage : c.ink} style={{ fontSize: 14 }}>{naira(t.amount, { sign: true })}</Txt>} />))}</Group>}
      </ScrollView>
    </Screen>
  );
}

export function TopUpScreen({ navigation, route }) {
  const { c } = useTheme();
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
    <Screen style={{ alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: c.sagebg, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={48} color={c.sage} /></View>
      <Txt v="display">{naira(n)} added</Txt>
      <Txt v="body" color={c.mute}>New balance <Txt v="mono">{naira(st.bal)}</Txt></Txt>
      <Txt v="label">Ref {st.ref}</Txt>
      <Button title="Back to wallet" onPress={() => navigation.goBack()} style={{ alignSelf: 'stretch', marginTop: 24 }} />
    </Screen>
  );
  return (
    <Screen scroll footer={<Button title={'Pay ' + naira(n)} disabled={n < 100} loading={st.phase === 'busy'} onPress={go} />}>
      <AppBar title="Add funds" close />
      {st.phase === 'failed' ? <Banner tone="err" title="Payment didn't go through" body={st.reason} /> : null}
      <Input label="Amount" prefix="₦" keyboardType="number-pad" value={amt} onChangeText={(t) => setAmt(t.replace(/\D/g, ''))} mono autoFocus={!route.params?.amount} hint={'Balance after: ' + naira(Number(wallet?.balance || 0) + n)} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{[5000, 10000, 25000, 50000].map((v) => <Chip key={v} label={naira(v)} selected={n === v} onPress={() => setAmt(String(v))} />)}</View>
      <Txt v="label">Card</Txt>
      <Group>{TEST_CARDS.map((k, i) => <Row key={k.id} icon="credit-card-outline" title={k.label} subtitle={k.note} last={i === TEST_CARDS.length - 1} onPress={() => setCard(k.id)}
        right={<View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: card === k.id ? 6 : 2, borderColor: card === k.id ? c.ember : c.line2 }} />} />)}</Group>
      <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="lock-outline" size={16} color={c.mute} /><Txt v="small">Card details are handled by Paystack, never stored by us.</Txt></View>
    </Screen>
  );
}

export function WithdrawScreen({ navigation }) {
  const { c } = useTheme();
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
  if (acct === undefined) return <Screen><AppBar title="Withdraw" close /><Skeleton h={120} r={20} /></Screen>;
  const vendor = acct ? { bank_name: acct.bank_name, bank_account_last4: acct.bank_account_last4, business_name: acct.holder } : null;
  if (!vendor) return (
    <Screen scroll>
      <AppBar title="Withdraw" close />
      <Txt v="monoLg" color={c.mute} style={{ textAlign: 'center', marginVertical: 24 }}>{naira(bal)} available</Txt>
      <Card tone="warn">
        <View style={{ flexDirection: 'row', gap: 12 }}><Icon name="bank-outline" color={c.warn} /><View style={{ flex: 1, gap: 4 }}><Txt v="bold" color={c.warn}>Add a bank account to withdraw</Txt><Txt v="small" color={c.warn}>Payouts only go to a verified account in your own name or your business's name.</Txt></View></View>
        <Button variant="dark" icon="plus" title="Add bank account" onPress={() => navigation.replace('Bank')} />
      </Card>
    </Screen>
  );
  if (done) return (
    <Screen scroll footer={<Button title="Done" onPress={() => navigation.goBack()} />}>
      <View style={{ height: 40 }} />
      <Txt v="display">Your payout is on its way</Txt>
      <Txt v="body" color={c.mute}><Txt v="mono">{naira(n)}</Txt> to {vendor.bank_name} •••• {vendor.bank_account_last4}</Txt>
      <Card><Steps steps={[{ label: 'Initiated', state: 'done' }, { label: 'Processing with your bank', state: 'current' }, { label: 'Arrived', state: 'todo' }]} /></Card>
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
    <Screen scroll footer={<Button title="Continue" disabled={!n} onPress={start} />}>
      <AppBar title="Withdraw" close />
      <Input label="Amount" prefix="₦" keyboardType="number-pad" value={amt} onChangeText={(t) => setAmt(t.replace(/\D/g, ''))} mono autoFocus error={!sheet ? err : null} hint={naira(bal) + ' available'} />
      <Button small variant="outline" title="Withdraw all" onPress={() => setAmt(String(Math.floor(bal)))} style={{ alignSelf: 'flex-start' }} />
      <Txt v="label">To</Txt>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="bank-outline" /><View style={{ flex: 1 }}><Txt v="bold">{vendor.bank_name} •••• {vendor.bank_account_last4}</Txt><Txt v="small">{vendor.business_name}</Txt></View><Pill tone="ok" label="Verified" /></Card>
      <View style={{ flexDirection: 'row', gap: 6 }}><Icon name="shield-check-outline" size={16} color={c.mute} /><Txt v="small">You'll confirm with a one-time code on every withdrawal.</Txt></View>
      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <Txt v="h1">Confirm it's you</Txt>
        <Txt v="small" style={{ fontSize: 14 }}>Enter your one-time code to send {naira(n)} to {vendor.bank_name} ••{vendor.bank_account_last4}.</Txt>
        {devCode ? <Banner tone="info" icon="test-tube" title={'Test mode · code ' + devCode} body="Payments are simulated. In production this code is sent to you." /> : null}
        <OtpBoxes value={code} onChange={setCode} error={!!err} />
        {err ? <Txt v="small" color={c.err}>{err}</Txt> : null}
        <Button title="Confirm withdrawal" disabled={code.length !== 6} loading={busy} onPress={confirm} />
      </Sheet>
    </Screen>
  );
}

const BANKS = ['GTBank', 'Access', 'Zenith', 'First Bank', 'UBA', 'Moniepoint', 'Opay'];
export function BankScreen({ navigation }) {
  const { refresh } = useAuth();
  const [bank, setBank] = useState(null); const [acct, setAcct] = useState(''); const [err, setErr] = useState(null); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await rpc('add_bank', { p_bank: bank, p_account: acct }); await refresh(); navigation.replace('Withdraw'); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };
  return (
    <Screen scroll footer={<Button title="Verify and save" disabled={!bank || acct.length !== 10} loading={busy} onPress={save} />}>
      <AppBar title="Payout account" />
      <Txt v="strong" style={{ fontSize: 13 }}>Bank</Txt>
      <ChipRow options={BANKS} value={bank} onChange={setBank} />
      <Input label="Account number" keyboardType="number-pad" maxLength={10} value={acct} onChangeText={(t) => setAcct(t.replace(/\D/g, ''))} mono error={err} hint="10-digit NUBAN. The account name must match your business or your own name." />
    </Screen>
  );
}
