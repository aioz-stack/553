import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

/**
 * Native shell configuration. The app identity is Pusoy 13 (not the
 * default Capacitor branding). Change appId before publishing if your
 * store account uses a different reverse-domain.
 */
const config: CapacitorConfig = {
  appId: 'ph.pusoy13.app',
  appName: 'Pusoy 13',
  webDir: 'out',
  backgroundColor: '#161950',
  // LOCAL TESTING ONLY: `CAP_DEV_HTTP=1 npx cap sync` lets the app reach a plain-http
  // backend (e.g. http://10.0.2.2:8000 from the Android emulator). Never ship with it.
  ...(process.env.CAP_DEV_HTTP === '1' ? { server: { androidScheme: 'http', cleartext: true } } : {}),
  android: {
    allowMixedContent: process.env.CAP_DEV_HTTP === '1',
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: '#161950',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#161950',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
