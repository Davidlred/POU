export default {
  name: 'Poultry360',
  slug: 'poultry360',
  scheme: 'poultry360',
  version: '0.1.0',
  icon: './assets/icon.png',   // the Poultry360 logo (bird mark on white); see CLAUDE.md "Logo"
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  splash: { image: './assets/splash-logo.png', backgroundColor: '#FFFFFF', resizeMode: 'contain' },
  android: {
    package: 'com.goshenfarms.poultry360',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#FFFFFF' },
    softwareKeyboardLayoutMode: 'resize',
    config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } },
  },
  ios: { bundleIdentifier: 'com.goshenfarms.poultry360', supportsTablet: false },
  web: { name: 'Poultry360', shortName: 'Poultry360', favicon: './assets/icon.png', bundler: 'metro', output: 'single', themeColor: '#0F8A5F', backgroundColor: '#FFFFFF' },
  plugins: [
    'expo-font',
    ['expo-splash-screen', { image: './assets/splash-logo.png', imageWidth: 180, backgroundColor: '#FFFFFF', dark: { image: './assets/splash-logo.png', backgroundColor: '#FFFFFF' } }],
    ['expo-location', { locationWhenInUsePermission: 'Poultry360 uses your location to set your delivery address.' }],
    ['expo-image-picker', { cameraPermission: 'Poultry360 uses the camera for listing photos, ID verification and symptom checks.' }],
  ],
};
