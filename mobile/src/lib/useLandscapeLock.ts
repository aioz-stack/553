'use client';

import { useEffect } from 'react';

/**
 * Lock the native app to landscape while the calling screen is mounted (and
 * hide the status bar); other screens are portrait. On the web the
 * LandscapeStage rotates itself instead.
 */
export function useLandscapeLock() {
  useEffect(() => {
    let native = false;
    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        native = Capacitor.isNativePlatform();
        if (!native) return;
        const { ScreenOrientation } = await import('@capacitor/screen-orientation');
        await ScreenOrientation.lock({ orientation: 'landscape' });
        const { StatusBar } = await import('@capacitor/status-bar');
        await StatusBar.hide();
      } catch {
        // web / plugin unavailable: the stage rotates itself instead
      }
    })();

    return () => {
      if (!native) return;
      (async () => {
        try {
          const { ScreenOrientation } = await import('@capacitor/screen-orientation');
          await ScreenOrientation.lock({ orientation: 'portrait' });
          const { StatusBar } = await import('@capacitor/status-bar');
          await StatusBar.show();
        } catch {
          // ignore
        }
      })();
    };
  }, []);
}
