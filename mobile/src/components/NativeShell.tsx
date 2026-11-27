'use client';

import { useEffect } from 'react';
import { useMotionSync } from '@/lib/motion';
import { useMusicPlayer } from '@/lib/music';
import { startPerfGuard } from '@/lib/perfGuard';
import { initOrientation } from '@/lib/useLandscapeLock';

/**
 * Native integration on device: status bar style, splash hide, keyboard
 * accessory bar, and the Android hardware back button.
 */
export default function NativeShell() {
  useMotionSync();
  useMusicPlayer();
  // Phones that cannot draw every effect smoothly step Motion Effects down by themselves.
  useEffect(() => startPerfGuard(), []);
  useEffect(() => {
    (async () => {
      const { Capacitor } = await import('@capacitor/core');

      if (!Capacitor.isNativePlatform()) {
        return;
      }

      const [{ StatusBar, Style }, { SplashScreen }, { Keyboard }, { App }] = await Promise.all([
        import('@capacitor/status-bar'),
        import('@capacitor/splash-screen'),
        import('@capacitor/keyboard'),
        import('@capacitor/app'),
      ]);

      // Portrait screens start in portrait (landscape screens lock landscape themselves).
      void initOrientation();
      await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);

      if (Capacitor.getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({ color: '#170a3a' }).catch(() => undefined);
      }

      await Keyboard.setAccessoryBarVisible({ isVisible: true }).catch(() => undefined);
      await SplashScreen.hide().catch(() => undefined);

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
    })();
  }, []);

  return null;
}
