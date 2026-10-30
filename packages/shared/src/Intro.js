import React, { useEffect, useRef } from 'react';
import { View, Image, Animated, Easing, Dimensions, StyleSheet } from 'react-native';
import { useTheme } from './ThemeProvider';

export const LOGO_MARK = require('../assets/logo-mark.png');
export const LOGO_WORD = require('../assets/logo-word.png');
export const LOGO_FULL = require('../assets/logo-full.png');

// Opening animation, shown over the app on launch. It starts exactly where the native splash
// leaves off (the bird mark centred on white), lifts the mark while "Poultry360" slides up
// beneath it, holds briefly, then slides the whole card out to the left. onDone unmounts it.
export function Intro({ onReady, onDone }) {
  const { c } = useTheme();
  const w = Dimensions.get('window').width;
  const lift = useRef(new Animated.Value(0)).current;   // 0 → 1: mark moves up, wordmark slides in
  const out = useRef(new Animated.Value(0)).current;    // 0 → 1: the card slides off screen
  useEffect(() => {
    Animated.sequence([
      Animated.delay(150),
      Animated.timing(lift, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(650),
      Animated.timing(out, { toValue: 1, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => onDone?.());
  }, []);
  const MARK = 180;
  return (
    <Animated.View onLayout={onReady} pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: c.logobg, alignItems: 'center', justifyContent: 'center', zIndex: 10, elevation: 10,
        transform: [{ translateX: out.interpolate({ inputRange: [0, 1], outputRange: [0, -w] }) }] }]}>
      <Animated.Image source={LOGO_MARK} style={{ width: MARK, height: MARK,
        transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -36] }) }, { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) }] }} />
      <Animated.Image source={LOGO_WORD} resizeMode="contain" style={{ position: 'absolute', top: '50%', marginTop: 70, width: 220, height: 46,
        opacity: lift, transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }} />
    </Animated.View>
  );
}

// Logo on its own white tile, for screens in either theme (the artwork is drawn for white).
export function Logo({ size = 120, full }) {
  const { c } = useTheme();
  return (
    <View style={{ alignSelf: 'center', backgroundColor: c.logobg, borderRadius: size * 0.22, padding: size * 0.08 }}>
      <Image source={full ? LOGO_FULL : LOGO_MARK} resizeMode="contain" style={{ width: size, height: full ? size * (880 / 899) : size }} />
    </View>
  );
}
