import React, { useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import { ThemeProvider, useP360Fonts, Loading, ErrorBoundary, Intro, installWebShims } from '@p360/shared';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import Navigation from './src/navigation';

SplashScreen.preventAutoHideAsync().catch(() => {});
installWebShims();


export default function App() {
  const fontsLoaded = useP360Fonts();
  const [intro, setIntro] = useState(Platform.OS !== 'web');   // the website opens straight on its home page
  if (Platform.OS === 'web') SplashScreen.hideAsync().catch(() => {});
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {fontsLoaded ? (
          <AuthProvider>
            <CartProvider>
              <ErrorBoundary><Navigation /></ErrorBoundary>
            </CartProvider>
          </AuthProvider>
        ) : <Loading />}
        {intro ? <Intro onReady={() => SplashScreen.hideAsync().catch(() => {})} onDone={() => setIntro(false)} /> : null}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
