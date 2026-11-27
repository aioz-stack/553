import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

/**
 * Motion Effects (Settings): high = every ambient animation, medium = scene + game motion but no
 * idle decoration loops, low = still art (game state changes only). Native animations are cheap,
 * so the default is High on every device; the level follows the account (lib/prefs.ts).
 */
export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: Quality[] = ['low', 'medium', 'high'];
const KEY = 'pusoy.quality';

let current: Quality = 'high';
const listeners = new Set<(q: Quality) => void>();

SecureStore.getItemAsync(KEY)
  .then((v) => {
    if (v === 'low' || v === 'medium' || v === 'high') setQualityLocal(v);
  })
  .catch(() => undefined);

function setQualityLocal(q: Quality) {
  current = q;
  listeners.forEach((l) => l(q));
}

export function quality(): Quality {
  return current;
}

export function setQuality(q: Quality) {
  setQualityLocal(q);
  SecureStore.setItemAsync(KEY, q).catch(() => undefined);
}

export function useMotion(): [Quality, (q: Quality) => void] {
  const [q, setQ] = useState(current);
  useEffect(() => {
    listeners.add(setQ);
    setQ(current);
    return () => {
      listeners.delete(setQ);
    };
  }, []);
  return [q, setQuality];
}
