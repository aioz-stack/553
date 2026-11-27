'use client';

import { useEffect, useState } from 'react';
import { AUTO_QUALITY_KEY, MOTION_KEY, QUALITY_KEY } from './motionBoot';

/**
 * Motion effects quality (Settings → Motion Effects):
 *  - low:    no animations (deal / reveal shows skipped, every CSS animation off) — same as reduced motion
 *  - medium: game animations play, lighter: no travelling card shadows, fewer explosion particles,
 *            no screen shake, ambient sparkles / shine loops off
 *  - high:   everything — the default until the player picks a level (any device)
 *
 * Written to <html data-quality="low|medium|high"> and <html data-motion="reduce|full"> (low = reduce);
 * globals.css switches effects off from those. Changes apply immediately (listeners re-render).
 *
 * Without a chosen level, the native app may lower itself to Medium / Low after measuring that this
 * device drops frames (lib/perfGuard.ts → AUTO_QUALITY_KEY). Picking a level in Settings overrides it.
 *
 * Before a level is chosen, the older auto/on/off choice decides (auto follows the device's
 * reduce-motion setting): off → low, on → high, auto → low on reduce-motion devices, else high.
 */
export type Quality = 'low' | 'medium' | 'high';
export const QUALITIES: Quality[] = ['low', 'medium', 'high'];
/** Older 3-way choice, kept for existing callers. */
export type MotionPref = 'auto' | 'on' | 'off';

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function motionPref(): MotionPref {
  const v = read(MOTION_KEY);
  return v === 'on' || v === 'off' ? v : 'auto';
}

/** The player picked a level (Settings → Motion Effects); otherwise it is the default, High. */
export function qualityChosen(): boolean {
  const q = read(QUALITY_KEY);
  return q === 'low' || q === 'medium' || q === 'high';
}

/** The level this device lowered itself to after measuring dropped frames, if any. */
export function autoQuality(): Quality | null {
  const a = read(AUTO_QUALITY_KEY);
  return a === 'low' || a === 'medium' ? a : null;
}

/**
 * The quality level in effect now: the level the player picked, else High — unless this device
 * measured that it cannot keep up (autoQuality). Only the older explicit "motion off" choice still
 * means Low.
 */
export function quality(): Quality {
  const q = read(QUALITY_KEY);
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  if (motionPref() === 'off') return 'low';
  return autoQuality() ?? 'high';
}

/** Store the level the device measured it needs (not a player choice; Settings still overrides). */
export function setAutoQuality(q: Quality): void {
  try {
    if (q === 'high') localStorage.removeItem(AUTO_QUALITY_KEY);
    else localStorage.setItem(AUTO_QUALITY_KEY, q);
  } catch {
    // storage unavailable: applies for this session only
  }
  apply();
}

/** Forget a level this device stored without the player choosing it: the device decides again. */
export function clearQuality(): void {
  try {
    if (localStorage.getItem(QUALITY_KEY) === null) return;
    localStorage.removeItem(QUALITY_KEY);
  } catch {
    return;
  }
  apply();
}

/** No animations at all (Low quality / reduced motion). */
export function reducedNow(): boolean {
  return quality() === 'low';
}

/** Animations on, but lighter (Medium quality). */
export function lightNow(): boolean {
  return quality() === 'medium';
}

function apply() {
  if (typeof document !== 'undefined') {
    const q = quality();
    document.documentElement.dataset.quality = q;
    document.documentElement.dataset.motion = q === 'low' ? 'reduce' : 'full';
  }
  listeners.forEach((l) => l());
}

/** Choose Low / Medium / High (applies at once). */
export function setQuality(q: Quality): void {
  try {
    localStorage.setItem(QUALITY_KEY, q);
  } catch {
    // storage unavailable: applies for this session only
  }
  apply();
}

/** Older auto/on/off setter: on → high, off → low, auto → follow the device. */
export function setMotionPref(p: MotionPref): void {
  try {
    localStorage.setItem(MOTION_KEY, p);
    localStorage.removeItem(QUALITY_KEY);
  } catch {
    // storage unavailable
  }
  apply();
}

/** Keeps <html data-motion / data-quality> in sync with the device setting while the app runs. */
export function useMotionSync(): void {
  useEffect(() => {
    apply();
    if (typeof window.matchMedia !== 'function') return undefined;
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    q.addEventListener('change', apply);
    return () => q.removeEventListener('change', apply);
  }, []);
}

function useListen() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/** [quality, setter] — re-renders when it changes anywhere. */
export function useQuality(): [Quality, (q: Quality) => void] {
  useListen();
  return [typeof window === 'undefined' ? 'high' : quality(), setQuality];
}

/** [older preference, effective reduced?, setter] */
export function useMotion(): [MotionPref, boolean, (p: MotionPref) => void] {
  useListen();
  return [typeof window === 'undefined' ? 'auto' : motionPref(), typeof window === 'undefined' ? false : reducedNow(), setMotionPref];
}
