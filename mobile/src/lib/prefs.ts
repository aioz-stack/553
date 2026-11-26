'use client';

import { api } from './api';
import { clearQuality, setQuality, type Quality } from './motion';
import { setMusicEnabled } from './music';
import { setSoundEnabled, soundEnabled } from './sound';

/**
 * Game settings that follow the account (Settings panel): BGM, sound effects and motion quality.
 * They apply on this device at once and are saved to the server (PUT /profile/preferences), so
 * they come back after logging out and in again, on any device (GET /auth/me → user.preferences).
 */
export interface GamePrefs {
  bgm: boolean;
  sfx: boolean;
  motion: Quality;
  /** The player picked the motion level (false: the account only has the default High). */
  motion_chosen?: boolean;
}

/** Apply settings from the server on this device (after login / app start). */
export function applyPrefs(p: Partial<GamePrefs> | null | undefined): void {
  if (!p) return;
  if (typeof p.bgm === 'boolean') setMusicEnabled(p.bgm);
  // setSoundEnabled plays a click when turning on; only call it when something changes.
  if (typeof p.sfx === 'boolean' && p.sfx !== soundEnabled()) setSoundEnabled(p.sfx);
  // Only a level the player picked follows the account. Never chosen: this device decides (Medium on a
  // weak phone) — and a High that older app versions copied here from the account default is dropped.
  if (p.motion_chosen === false) clearQuality();
  else if (p.motion === 'low' || p.motion === 'medium' || p.motion === 'high') setQuality(p.motion);
}

/** Change some settings: applied here at once, then saved with the account (best effort when offline). */
export async function savePrefs(patch: Partial<GamePrefs>): Promise<void> {
  applyPrefs(patch);
  try {
    await api('/profile/preferences', { method: 'PUT', body: patch });
  } catch {
    // Offline or signed out: kept on this device and sent again next time a setting changes.
  }
}
