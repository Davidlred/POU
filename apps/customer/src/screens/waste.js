import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme, Screen, AppBar, Txt, Hearth, Icon, Empty, Chip, Skeleton, Button } from '@p360/shared';
import { useAuth } from '../context/AuthContext';
import { WASTE_CATEGORIES, fetchListings } from '../lib/catalog';
import { ListRow } from './buyer';

export function WasteHomeScreen({ navigation }) {
  const { c } = useTheme();
  const { vendor } = useAuth();
  const [cat, setCat] = useState('manure');
  const [items, setItems] = useState(null);
  useFocusEffect(useCallback(() => { setItems(null); fetchListings({ waste: true, category: cat }).then(setItems).catch(() => setItems([])); }, [cat]));
  return (
    <Screen scroll>
      <AppBar title="Waste & manure" />
      <Hearth onPress={() => (vendor ? navigation.navigate('ListingForm', { waste: true }) : navigation.navigate('Role', { adding: true }))}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Icon name="sprout-outline" size={30} color={c.yolk} />
          <View style={{ flex: 1 }}><Txt v="h2" color={c.hink}>Sell your farm's waste</Txt><Txt v="small" color={c.hmute}>{vendor ? 'Manure and litter that compost makers buy' : 'Add a farm role to start selling'}</Txt></View>
          <Icon name="chevron-right" color={c.hink} />
        </View>
      </Hearth>
      <View style={{ flexDirection: 'row', gap: 8 }}>{WASTE_CATEGORIES.map((k) => <Chip key={k.id} label={k.label} selected={cat === k.id} onPress={() => setCat(k.id)} />)}</View>
      {items === null ? <Skeleton h={88} r={20} /> : !items.length
        ? <Empty icon="sprout-outline" title={'No ' + WASTE_CATEGORIES.find((k) => k.id === cat).label.toLowerCase() + ' listings yet'} body="Be the first to list." action={vendor ? 'List waste' : undefined} onAction={() => navigation.navigate('ListingForm', { waste: true })} />
        : items.map((l) => <ListRow key={l.id} l={l} onPress={() => navigation.navigate('Product', { id: l.id })} />)}
      <View style={{ flexDirection: 'row', gap: 8 }}><Icon name="truck-outline" size={16} color={c.mute} /><Txt v="small" style={{ flex: 1 }}>Bulk orders over 1 tonne may need a scheduled truck. We confirm the fee before you pay.</Txt></View>
    </Screen>
  );
}
