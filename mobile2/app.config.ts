import type { ExpoConfig } from 'expo/config';

/**
 * Pusoy 13 — React Native (Expo) app. Native folders (android/, ios/) are generated from this file
 * by `npx expo prebuild`; never edit them by hand.
 *
 * Package id: ph.pusoy13.native, so it installs next to the current Capacitor app
 * (ph.pusoy13.app) while both exist. Switch to 'ph.pusoy13.app' when this app replaces it.
 */
const api = process.env.EXPO_PUBLIC_API_URL ?? '';
// Plain-http backends (local development) need cleartext traffic; production uses https/wss.
const cleartext = api.startsWith('http://');

const config: ExpoConfig = {
  name: 'Pusoy 13',
  slug: 'pusoy13',
  scheme: 'pusoy13',
  version: '1.0.0',
  orientation: 'landscape',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#170a3a',
  ios: {
    bundleIdentifier: 'ph.pusoy13.native',
    supportsTablet: true,
    requireFullScreen: true,
  },
  android: {
    package: 'ph.pusoy13.native',
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#161950',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-font',
    'expo-image',
    ['expo-screen-orientation', { initialOrientation: 'LANDSCAPE' }],
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 220, backgroundColor: '#170a3a' }],
    ['expo-build-properties', { android: { usesCleartextTraffic: cleartext } }],
  ],
  experiments: { typedRoutes: false },
};

export default config;
