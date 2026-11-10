import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@p360/shared';

const KEY = 'p360-spot';

// The phone's (or browser's) position now, or null after telling the person why not.
export async function getHere() {
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    if (!p.granted) { Alert.alert('Location is off', 'Allow location for Poultry360 to use this.'); return null; }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    Alert.alert("Couldn't find your location", 'Try again in a minute.');
    return null;
  }
}

// Where the buyer is, for "nearest first" and delivery fees: their first saved address with a pinned
// location, else a location shared on this phone or browser. spot is undefined while loading, null if unknown.
export function useSpot() {
  const [spot, setSpot] = useState(undefined);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      let a = null;
      if (s.session) {
        const { data } = await supabase.from('addresses').select('lat,lng').not('lat', 'is', null).order('created_at').limit(1);
        a = data?.[0] || null;
      }
      if (!a) { try { a = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null'); } catch { a = null; } }
      if (alive) setSpot(a && a.lat != null ? { lat: a.lat, lng: a.lng } : null);
    })().catch(() => { if (alive) setSpot(null); });
    return () => { alive = false; };
  }, []);
  const locate = useCallback(async () => {
    const h = await getHere();
    if (h) { setSpot(h); AsyncStorage.setItem(KEY, JSON.stringify(h)).catch(() => {}); }
    return h;
  }, []);
  return { spot, locate };
}
