'use client';

import { useEffect } from 'react';

/**
 * Native screen orientation, shared by every screen.
 *
 * Landscape screens (Home, Lobby, Choose Your Seat, Single Player, Settings) call
 * useLandscapeLock(); every other screen is portrait. One shared counter keeps landscape
 * locked while ANY landscape screen is mounted, so moving between two of them never flips
 * the phone to portrait in between; portrait returns only a moment after the last one
 * closes. Lock requests run strictly one after another, so they can never finish out of
 * order. On the web nothing is locked (LandscapeStage rotates itself instead).
 */
type Orientation = 'landscape' | 'portrait';

let holders = 0;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
let applied: Orientation | null = null;
let queue: Promise<void> = Promise.resolve();

/** How long after the last landscape screen closes before going back to portrait. */
export const PORTRAIT_DELAY_MS = 400;

async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Queue an orientation (applied in call order; repeated requests are skipped). */
export function setOrientation(o: Orientation): Promise<void> {
  queue = queue.then(async () => {
    if (applied === o || !(await isNative())) return;
    applied = o;
    try {
      const [{ ScreenOrientation }, { StatusBar }] = await Promise.all([import('@capacitor/screen-orientation'), import('@capacitor/status-bar')]);
      await ScreenOrientation.lock({ orientation: o });
      // Full screen on the landscape game screens; the status bar is back on portrait screens.
      await (o === 'landscape' ? StatusBar.hide() : StatusBar.show());
    } catch {
      // plugin unavailable: nothing to do
    }
  });
  return queue;
}

/** At start-up: portrait unless a landscape screen has already asked for landscape. */
export function initOrientation(): Promise<void> {
  return holders === 0 ? setOrientation('portrait') : queue;
}

export function useLandscapeLock() {
  useEffect(() => {
    holders++;
    if (releaseTimer) {
      clearTimeout(releaseTimer);
      releaseTimer = null;
    }
    void setOrientation('landscape');

    return () => {
      holders = Math.max(0, holders - 1);
      if (holders > 0) return;
      releaseTimer = setTimeout(() => {
        releaseTimer = null;
        if (holders === 0) void setOrientation('portrait');
      }, PORTRAIT_DELAY_MS);
    };
  }, []);
}

/** Test helper: forget all state. */
export function resetOrientationForTests() {
  holders = 0;
  applied = null;
  queue = Promise.resolve();
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
}
