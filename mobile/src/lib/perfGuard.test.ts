import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { quality, setQuality } from './motion';
import { QUALITY_KEY, MOTION_BOOT_SCRIPT } from './motionBoot';
import { lighter, measureFps, startPerfGuard } from './perfGuard';

/** Run every queued timer and let awaited measurements settle. */
async function flush(times = 12) {
  for (let i = 0; i < times; i++) {
    await vi.runOnlyPendingTimersAsync();
  }
}

function boot(): string | undefined {
  delete document.documentElement.dataset.quality;
  new Function(MOTION_BOOT_SCRIPT)();
  return document.documentElement.dataset.quality;
}

describe('perf guard: phones that drop frames step Motion Effects down by themselves', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    document.documentElement.dataset.native = 'android';
  });
  afterEach(() => {
    vi.useRealTimers();
    delete document.documentElement.dataset.native;
    localStorage.clear();
  });

  it('steps High → Medium → Low after two slow windows each, and remembers it before first paint', async () => {
    let calls = 0;
    const stop = startPerfGuard(async () => {
      calls++;
      return 20;
    });
    while (calls < 2) await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(0);
    expect(quality()).toBe('medium');
    expect(boot()).toBe('medium');
    while (calls < 4) await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(0);
    expect(quality()).toBe('low');
    expect(localStorage.getItem(QUALITY_KEY)).toBe('low');
    stop();
  });

  it('a single slow window (a screen loading) is not enough; a smooth phone stays High', async () => {
    const fps = [20, 58, 20, 60, 59, 60, 58, 60];
    const stop = startPerfGuard(async () => fps.shift() ?? 60);
    await flush(20);
    expect(quality()).toBe('high');
    expect(localStorage.getItem(QUALITY_KEY)).toBeNull();
    stop();
  });

  it("never overrides a level the player picked in Settings", async () => {
    setQuality('high');
    const measure = vi.fn(async () => 10);
    const stop = startPerfGuard(measure);
    await flush();
    expect(quality()).toBe('high');
    expect(measure).not.toHaveBeenCalled();
    stop();
  });

  it('picking a level in Settings wins over the automatic one', () => {
    localStorage.setItem(QUALITY_KEY, 'low');
    expect(quality()).toBe('low');
    setQuality('high');
    expect(quality()).toBe('high');
    expect(boot()).toBe('high');
  });

  it('does nothing in a browser (only the native app is watched)', async () => {
    delete document.documentElement.dataset.native;
    const measure = vi.fn(async () => 10);
    startPerfGuard(measure);
    await flush();
    expect(measure).not.toHaveBeenCalled();
    expect(quality()).toBe('high');
  });

  it('measureFps counts frames over the window', async () => {
    let t = 0;
    const raf = (cb: FrameRequestCallback) => {
      t += 1000 / 60;
      queueMicrotask(() => cb(t));
      return 0;
    };
    const fps = await measureFps(500, raf);
    expect(fps).toBeGreaterThan(58);
    expect(fps).toBeLessThan(62);
  });

  it('lighter() walks down one level at a time', () => {
    expect(lighter('high')).toBe('medium');
    expect(lighter('medium')).toBe('low');
    expect(lighter('low')).toBeNull();
  });
});
