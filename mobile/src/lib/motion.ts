'use client';

import { useEffect, useState } from 'react';
import { MOTION_KEY } from './motionBoot';

/**
 * Motion effects preference.
 *  - auto: follow the device's "reduce motion" setting (default, accessible)
 *  - on:   always animate
 *  - off:  never animate
 * The result is written to <html data-motion="full|reduce">; every animation
 * rule in globals.css is switched off under data-motion="reduce".
 */
export type MotionPref = 'auto' | 'on' | 'off';

const KEY = MOTION_KEY;
const listeners = new Set<() => void>();


export function motionPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function reducedNow(): boolean {
  const p = motionPref();
  return p === 'off' || (p === 'auto' && typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.motion = reducedNow() ? 'reduce' : 'full';
  }
  listeners.forEach((l) => l());
}

export function setMotionPref(p: MotionPref): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // storage unavailable: applies for this session only
  }
  apply();
}

/** Keeps <html data-motion> in sync with the device setting while the app runs. */
export function useMotionSync(): void {
  useEffect(() => {
    apply();
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    q.addEventListener('change', apply);
    return () => q.removeEventListener('change', apply);
  }, []);
}

/** [preference, effective reduced?, setter] */
export function useMotion(): [MotionPref, boolean, (p: MotionPref) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [typeof window === 'undefined' ? 'auto' : motionPref(), typeof window === 'undefined' ? false : reducedNow(), setMotionPref];
}
