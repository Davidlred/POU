import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { palettes, fonts } from './theme';

const Ctx = createContext(null);
const KEY = 'p360-theme';

export function ThemeProvider({ children }) {
  const system = useColorScheme();
  const [pref, setPref] = useState(Platform.OS === 'web' ? 'light' : 'system'); // 'system' | 'light' | 'dark'; the website opens in light mode
  useEffect(() => { AsyncStorage.getItem(KEY).then((v) => v && setPref(v)); }, []);
  const mode = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const value = useMemo(() => ({
    mode, pref, c: palettes[mode], f: fonts,
    setPref: (p) => { setPref(p); AsyncStorage.setItem(KEY, p); },
    toggle: () => { const n = mode === 'dark' ? 'light' : 'dark'; setPref(n); AsyncStorage.setItem(KEY, n); },
  }), [mode, pref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
