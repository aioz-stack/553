import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('./music', () => ({ setMusicEnabled: vi.fn() }));
vi.mock('./sound', () => ({ setSoundEnabled: vi.fn(), soundEnabled: () => true }));

import { quality, qualityChosen, setQuality } from './motion';
import { MOTION_BOOT_SCRIPT } from './motionBoot';
import { applyPrefs } from './prefs';

/** Pretend to be a device with this much memory (GB), CPU cores and touch points. */
function device(memory: number | undefined, cores: number, touchPoints = 0) {
  Object.defineProperty(navigator, 'deviceMemory', { value: memory, configurable: true });
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: touchPoints, configurable: true });
}

/** The device asks for reduced motion (or not); touch capability comes from device(). */
function reducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('prefers-reduced-motion') ? on : false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
}

/** What the inline boot script (run before first paint) decides on this device. */
function boot(): string | undefined {
  delete document.documentElement.dataset.quality;
  new Function(MOTION_BOOT_SCRIPT)();
  return document.documentElement.dataset.quality;
}

describe('Motion Effects default: follows device capability until the player picks a level', () => {
  beforeEach(() => {
    localStorage.clear();
    reducedMotion(false);
    device(undefined, 8);
  });

  it('High on capable desktop devices, and the boot script agrees', () => {
    device(8, 8);
    expect(quality()).toBe('high');
    expect(boot()).toBe('high');
    expect(qualityChosen()).toBe(false);
  });

  it('Medium on touch and low-resource devices, and the boot script agrees', () => {
    for (const [memory, cores, touch] of [[2, 4, 0], [3, 8, 0], [8, 4, 0], [8, 8, 5]] as const) {
      device(memory, cores, touch);
      expect(quality()).toBe('medium');
      expect(boot()).toBe('medium');
    }
  });

  it('Low when the device requests reduced motion, and the boot script agrees', () => {
    reducedMotion(true);
    expect(quality()).toBe('low');
    expect(boot()).toBe('low');
  });

  it("the player's choice always wins, even over reduced motion", () => {
    reducedMotion(true);
    setQuality('high');
    expect(quality()).toBe('high');
    expect(boot()).toBe('high');
    setQuality('low');
    expect(quality()).toBe('low');
    expect(boot()).toBe('low');
    setQuality('medium');
    expect(quality()).toBe('medium');
    expect(boot()).toBe('medium');
    expect(qualityChosen()).toBe(true);
  });

  it('the older explicit "motion off" choice still means Low', () => {
    localStorage.setItem('pusoy.motion', 'off');
    expect(quality()).toBe('low');
    expect(boot()).toBe('low');
  });

  it('account settings: an unchosen level follows this device; a chosen one follows the account', () => {
    device(2, 4);
    localStorage.setItem('pusoy.quality', 'medium'); // e.g. copied by an older app version
    applyPrefs({ bgm: true, sfx: true, motion: 'high', motion_chosen: false });
    expect(qualityChosen()).toBe(false);
    expect(quality()).toBe('medium');
    expect(document.documentElement.dataset.quality).toBe('medium');

    applyPrefs({ bgm: true, sfx: true, motion: 'low', motion_chosen: true });
    expect(quality()).toBe('low');
  });
});
