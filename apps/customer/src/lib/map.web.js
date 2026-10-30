// Browser build: react-native-maps has no web version, so show where the pin is and link to Google Maps.
import React from 'react';
import { View, Linking, Pressable } from 'react-native';
import { useTheme, Txt, Icon } from '@p360/shared';

export const PROVIDER_GOOGLE = 'google';
export function Marker() { return null; }

export default function MapView({ region, style }) {
  const { c } = useTheme();
  const at = region ? region.latitude.toFixed(5) + ',' + region.longitude.toFixed(5) : null;
  return (
    <View style={[{ backgroundColor: c.map, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }, style]}>
      <Icon name="map-marker-radius-outline" size={36} color={c.acc} />
      {at ? <Pressable onPress={() => Linking.openURL('https://www.google.com/maps?q=' + at)} accessibilityRole="link">
        <Txt v="bold" color={c.acc}>Open rider location in Google Maps</Txt>
      </Pressable> : <Txt v="small">Location not available yet</Txt>}
    </View>
  );
}
