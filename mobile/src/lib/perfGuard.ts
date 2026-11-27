'use client';

import { autoQuality, quality, qualityChosen, setAutoQuality, type Quality } from './motion';

/**
 * Native app only: keeps the game smooth on phones whose GPU cannot draw every effect.
 *
 * The emulator borrows the PC's graphics card, so the app can look perfect there and still drop
 * frames on a real phone. Instead of guessing from device specs, this measures the frame rate the
 * phone actually achieves. When it stays low for two windows in a row it steps the Motion Effects
 * level down one notch (High → Medium → Low) and remembers that for this device (AUTO_QUALITY_KEY,
 * applied before first paint next launch). A level the player picked in Settings is never touched.
 */

/** Below this many frames per second a window counts as janky (60 Hz screens give ~60). */
export const MIN_FPS = 45;
const WINDOW_MS = 2500;
const FIRST_DELAY_MS = 3000; // let the first screen load before judging
const GAP_MS = 6000; // between windows
const MAX_WINDOWS = 30; // ~4 minutes of checks per launch, then stop

/** Frames per second over `ms` (null if the app went to the background meanwhile). */
export function measureFps(ms: number, raf = requestAnimationFrame): Promise<number | null> {
  return new Promise((resolve) => {
    let first = 0;
    let last = 0;
    let frames = 0;
    const tick = (now: number) => {
      if (document.hidden) return resolve(null);
      if (!first) first = now;
      else frames++;
      last = now;
      if (now - first < ms) raf(tick);
      else resolve(frames > 0 ? (frames * 1000) / (last - first) : null);
    };
    raf(tick);
  });
}

/** The next lighter level, or null at Low. */
export function lighter(q: Quality): Quality | null {
  return q === 'high' ? 'medium' : q === 'medium' ? 'low' : null;
}

/**
 * Starts watching; returns a stop function. `measure` is injectable for tests.
 */
export function startPerfGuard(measure: (ms: number) => Promise<number | null> = measureFps): () => void {
  if (typeof document === 'undefined' || !document.documentElement.dataset.native) return () => undefined;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let bad = 0;
  let windows = 0;

  const schedule = (ms: number) => {
    timer = setTimeout(run, ms);
  };

  const run = async () => {
    if (stopped) return;
    // The player chose a level, or there is nothing lighter left: nothing to decide.
    if (qualityChosen() || lighter(quality()) === null || windows >= MAX_WINDOWS) return;
    windows++;
    const fps = document.hidden ? null : await measure(WINDOW_MS);
    if (stopped) return;
    if (fps !== null) {
      bad = fps < MIN_FPS ? bad + 1 : 0;
      if (bad >= 2) {
        const next = lighter(autoQuality() ?? quality());
        if (next && !qualityChosen()) setAutoQuality(next);
        bad = 0;
      }
    }
    schedule(bad ? 300 : GAP_MS); // confirm a bad window straight away
  };

  schedule(FIRST_DELAY_MS);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
