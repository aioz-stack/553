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
  android: {
    allowMixedContent: false,
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
    Keyboard: {
      resize: KeyboardResize.Body,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
