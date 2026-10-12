import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useP360Fonts, Loading } from '@p360/shared';
import { AuthProvider } from './src/context/AuthContext';
import { CartProvider } from './src/context/CartContext';
import Navigation from './src/navigation';

export default function App() {
  const fontsLoaded = useP360Fonts();
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {fontsLoaded ? (
          <AuthProvider>
            <CartProvider>
              <Navigation />
            </CartProvider>
          </AuthProvider>
        ) : <Loading />}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
