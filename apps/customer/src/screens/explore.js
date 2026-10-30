import React from 'react';
import { View, Pressable, Alert } from 'react-native';
import { useTheme, Screen, AppBar, Txt, Icon, rpc, friendlyError } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { INVEST_ENABLED } from '../lib/roi';

// Other things an account can do on Poultry360. Shown to a supplier while their business is in review
// (instead of Farm Hub, which is for farms), and from Profile → Explore. Roles already held are left out.
export function ExploreOptions({ navigation }) {
  const { c } = useTheme();
  const { profile, refresh, setActiveRole } = useAuth();
  const roles = profile?.roles || [];
  const shop = async () => {
    try {
      if (!roles.includes('buyer')) { await rpc('set_roles', { p_roles: ['buyer'] }); await refresh(); }
      await setActiveRole('buyer');
      navigation.popTo('Tabs');
    } catch (e) { Alert.alert("Couldn't switch", friendlyError(e)); }
  };
  const items = [
    ['Shop the marketplace', 'Buy eggs, birds and feed from verified farms', 'basket-outline', 't1', shop, true],
    ['Add a farm', 'Sell birds and eggs, and keep flock records in Farm Hub', 'barn', 't4', () => navigation.navigate('Business', { roles: roles.includes('supplier') ? ['vendor', 'supplier'] : ['vendor'] }), !roles.includes('vendor')],
    ['Work as a vet', 'Offer consults and farm visits', 'stethoscope', 't2', () => navigation.navigate('VetApply'), !roles.includes('vet')],
    ['Sell for a store', "Join a store as its agent and earn commission", 'account-tie-outline', 't3', () => navigation.navigate('AgentJoin'), !roles.includes('agent')],
    ...(INVEST_ENABLED ? [['Invest in farms', 'Fund verified farms and track returns', 'chart-line', 't1', () => navigation.navigate('InvestHome'), true]] : []),
  ].filter((x) => x[5]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map(([t, b, i, tone, fn]) => (
        <Pressable key={t} onPress={fn} accessibilityRole="button"
          style={{ flexBasis: '45%', flexGrow: 1, minHeight: 120, borderRadius: 20, backgroundColor: c[tone], padding: 14, gap: 8 }}>
          <Icon name={i} size={26} color={c[tone + 'i']} />
          <Txt v="bold">{t}</Txt>
          <Txt v="small" color={c.ink} style={{ opacity: 0.75 }}>{b}</Txt>
        </Pressable>
      ))}
    </View>
  );
}

export function ExploreScreen({ navigation }) {
  return (
    <Screen scroll>
      <AppBar title="Explore" />
      <ExploreOptions navigation={navigation} />
    </Screen>
  );
}
