'use client';

import { useEffect } from 'react';
import { useMotionSync } from '@/lib/motion';
import { useMusicPlayer } from '@/lib/music';
import { initOrientation } from '@/lib/useLandscapeLock';

/**
 * Native integration on device: orientation, readiness-based splash hide, the iOS keyboard
 * accessory bar, and the Android hardware back button.
 */
export default function NativeShell() {
  useMotionSync();
  useMusicPlayer();
  useEffect(() => {
    (async () => {
      const { Capacitor } = await import('@capacitor/core');

      if (!Capacitor.isNativePlatform()) {
        return;
      }

      const [{ SplashScreen }, { App }] = await Promise.all([
        import('@capacitor/splash-screen'),
        import('@capacitor/app'),
      ]);

      // Portrait screens start in portrait (landscape screens lock landscape themselves).
      void initOrientation();

      if (Capacitor.getPlatform() === 'ios') {
        const { Keyboard } = await import('@capacitor/keyboard');
        await Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined);
      }

      App.addListener('backButton', ({ canGoBack }) => {
        // In a game (Multiplayer table, Single Player): the screen's own Leave rules decide.
        if (/^\/(play|practice)\//.test(window.location.pathname)) {
          window.dispatchEvent(new Event('pusoy:back'));
          return;
        }
        if (canGoBack) {
          window.history.back();
        } else {
          App.minimizeApp();
        }
      });

      // Hide only after the hydrated web UI has painted two frames, avoiding a native splash
      // removal before the first WebView frame (which shows a blank background on some devices).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void SplashScreen.hide().catch(() => undefined);
        });
      });

    })();
  }, []);

  return null;
}
