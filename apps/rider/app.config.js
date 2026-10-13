export default {
  name: 'Poultry360 Rider', slug: 'poultry360-rider', version: '0.1.0', icon: './assets/icon.png', orientation: 'portrait', userInterfaceStyle: 'automatic',
  splash: { backgroundColor: '#0C0D0D' },
  android: { package: 'com.goshenfarms.poultry360.rider', adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0C0D0D' }, config: { googleMaps: { apiKey: process.env.GOOGLE_MAPS_API_KEY } },
    permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA'] },
  plugins: ['expo-font',
    ['expo-location', { locationWhenInUsePermission: 'Dispatch needs your location to send you nearby pickups and show buyers where their order is.' }],
    ['expo-image-picker', { cameraPermission: 'Used to capture proof of delivery and quality-check photos.' }]],
};
