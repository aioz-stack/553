'use client';

import { useEffect, useState } from 'react';
import { MOTION_KEY, QUALITY_KEY } from './motionBoot';

/**
 * Motion effects quality (Settings → Motion Effects):
 *  - low:    no animations (deal / reveal shows skipped, every CSS animation off) — same as reduced motion
 *  - medium: game animations play, lighter: no travelling card shadows, fewer explosion particles,
 *            no screen shake, ambient sparkles / shine loops off
 *  - high:   everything (default)
 *
 * Written to <html data-quality="low|medium|high"> and <html data-motion="reduce|full"> (low = reduce);
 * globals.css switches effects off from those. Changes apply immediately (listeners re-render).
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

const deviceReduced = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The quality level in effect now. */
export function quality(): Quality {
  const q = read(QUALITY_KEY);
  if (q === 'low' || q === 'medium' || q === 'high') return q;
  const p = motionPref();
  return p === 'off' || (p === 'auto' && deviceReduced()) ? 'low' : 'high';
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
