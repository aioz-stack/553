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
  backgroundColor: '#ffffff',
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
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#ffffff',
      overlaysWebView: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: KeyboardResize.Body,
    },
  },
};

export default config;
