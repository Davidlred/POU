import React, { useState } from 'react';
import { View, Alert } from 'react-native';
import { useTheme, Screen, AppBar, Txt, Button, Group, Row, Pill, Segmented, Icon, Sheet, Input, rpc, friendlyError } from '@p360/shared';
import { useAuth } from '../context/AuthContext';

export function ProfileScreen({ navigation }) {
  const { c, pref, setPref } = useTheme();
  const { profile, vendor, signOut, setActiveRole, refresh } = useAuth();
  const [typeSheet, setTypeSheet] = useState(false);
  const [bType, setBType] = useState(profile?.buyer_type || 'individual');
  const [bName, setBName] = useState(profile?.buyer_business_name || '');
  const [saving, setSaving] = useState(false);
  const saveType = async () => {
    setSaving(true);
    try { await rpc('set_buyer_type', { p_type: bType, p_business_name: bType === 'business' ? bName.trim() : null }); await refresh(); setTypeSheet(false); }
    catch (e) { Alert.alert("Couldn't save", friendlyError(e)); } finally { setSaving(false); }
  };
  const roles = profile?.roles || [];
  const vs = vendor?.verification_status;
  return (
    <Screen scroll>
      <AppBar title="Profile" />
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.t2, alignItems: 'center', justifyContent: 'center' }}><Txt v="h1" color={c.t2i}>{(profile?.full_name || 'P').split(' ').map((x) => x[0]).join('').slice(0, 2)}</Txt></View>
        <View><Txt v="h1">{profile?.full_name || 'Your name'}</Txt><Txt v="small" color={c.mute} style={{ fontSize: 13 }}>{profile?.email || (profile?.phone ? '+' + profile.phone : '')}</Txt></View>
      </View>
      <Txt v="label">Your roles</Txt>
      <Group>
        {roles.includes('buyer') ? <Row icon="basket-outline" title="Buyer" onPress={() => setActiveRole('buyer')} right={profile.active_role === 'buyer' ? <Pill tone="ok" label="Active" /> : <Txt v="small">Switch</Txt>} /> : null}
        {roles.includes('vendor') || roles.includes('supplier') ? <Row icon="barn" title={vendor?.business_name || 'Farm'} subtitle={vs === 'approved' ? 'Verified' : vs === 'rejected' ? 'Needs attention' : 'In review'} onPress={() => (vs === 'approved' ? setActiveRole('vendor') : navigation.navigate('Pending'))}
          right={profile.active_role === 'vendor' ? <Pill tone="ok" label="Active" /> : <Pill tone={vs === 'approved' ? 'ok' : vs === 'rejected' ? 'err' : 'warn'} label={vs === 'approved' ? 'Verified' : vs === 'rejected' ? 'Rejected' : 'Pending'} />} /> : null}
        {roles.includes('vet') ? <Row icon="stethoscope" title="Vet desk" subtitle="Licence status, bookings and time slots" onPress={() => setActiveRole('vet').then(() => navigation.popTo('Tabs'))} right={profile.active_role === 'vet' ? <Pill tone="ok" label="Active" /> : <Txt v="small">Switch</Txt>} /> : null}
        {roles.includes('investor') ? <Row icon="chart-line" title="Investor" subtitle="Portfolio and identity verification" onPress={() => navigation.navigate('InvestHome')} /> : null}
        {roles.length < 5 ? <Row icon="plus-circle-outline" iconColor={c.acc} title="Add a role" onPress={() => navigation.navigate('Role', { adding: true })} last /> : null}
      </Group>
      {roles.includes('buyer') ? <>
        <Txt v="label">Buying</Txt>
        <Group>
          <Row icon={profile?.buyer_type === 'business' ? 'storefront-outline' : 'account-outline'} title={profile?.buyer_type === 'business' ? 'Business buyer · ' + (profile.buyer_business_name || '') : 'Individual buyer'} subtitle="Farms use this when deciding on credit" onPress={() => setTypeSheet(true)} />
          <Row last icon="credit-card-clock-outline" title="Pay later" subtitle="Credit you have with farms, and what you owe" onPress={() => navigation.navigate('MyCredit')} />
        </Group>
      </> : null}
      <Txt v="label">Appearance</Txt>
      <Segmented options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Night' }]} value={pref} onChange={setPref} />
      <Txt v="label">Settings</Txt>
      <Group>
        {vendor ? <Row icon="bank-outline" title="Payout account" subtitle={vendor.bank_verified ? vendor.bank_name + ' ••' + vendor.bank_account_last4 : 'Not added'} onPress={() => navigation.navigate('Bank')} /> : null}
        <Row icon="shield-check-outline" title="Two-factor authentication" subtitle="Required for every withdrawal" right={<Pill tone="ok" label="On" />} />
        <Row icon="lifebuoy" title="Help & support" last onPress={() => {}} />
      </Group>
      <Button variant="ghost" title="Sign out" onPress={signOut} />
      <Sheet visible={typeSheet} onClose={() => setTypeSheet(false)}>
        <Txt v="h1">Who are you buying for?</Txt>
        <Segmented options={[{ value: 'individual', label: 'Myself' }, { value: 'business', label: 'A business' }]} value={bType} onChange={setBType} />
        {bType === 'business' ? <Input label="Business name" value={bName} onChangeText={setBName} placeholder="Mama T's Kitchen" autoCapitalize="words" /> : null}
        <Txt v="small">A farm can offer pay later after you've bought ₦50,000 from it as an individual, or ₦300,000 as a business.</Txt>
        <Button title="Save" loading={saving} disabled={bType === 'business' && !bName.trim()} onPress={saveType} />
      </Sheet>
    </Screen>
  );
}
