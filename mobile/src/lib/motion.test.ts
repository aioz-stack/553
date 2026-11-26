import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('./music', () => ({ setMusicEnabled: vi.fn() }));
vi.mock('./sound', () => ({ setSoundEnabled: vi.fn(), soundEnabled: () => true }));

import { quality, qualityChosen, setQuality } from './motion';
import { MOTION_BOOT_SCRIPT } from './motionBoot';
import { applyPrefs } from './prefs';

/** Pretend to be a device with this much memory (GB) and these many CPU cores. */
function device(memory: number | undefined, cores: number) {
  Object.defineProperty(navigator, 'deviceMemory', { value: memory, configurable: true });
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores, configurable: true });
}

/** The device asks for reduced motion (or not). */
function reducedMotion(on: boolean) {
  window.matchMedia = ((q: string) => ({ matches: on, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
}

/** What the inline boot script (run before first paint) decides on this device. */
function boot(): string | undefined {
  delete document.documentElement.dataset.quality;
  new Function(MOTION_BOOT_SCRIPT)();
  return document.documentElement.dataset.quality;
}

describe('Motion Effects default: High until the player picks a level', () => {
  beforeEach(() => {
    localStorage.clear();
    reducedMotion(false);
    device(undefined, 8);
  });

  it('High on every device — weak phones and reduced-motion devices included — and the boot script agrees', () => {
    for (const [memory, cores, reduce] of [[8, 8, false], [2, 4, false], [3, 8, false], [8, 8, true]] as const) {
      device(memory, cores);
      reducedMotion(reduce);
      expect(quality()).toBe('high');
      expect(boot()).toBe('high');
    }
    expect(qualityChosen()).toBe(false);
  });

  it("the player's choice always wins", () => {
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

  it('account settings: a level never chosen leaves the default High; a chosen one follows the account', () => {
    localStorage.setItem('pusoy.quality', 'medium'); // e.g. copied by an older app version
    applyPrefs({ bgm: true, sfx: true, motion: 'high', motion_chosen: false });
    expect(qualityChosen()).toBe(false);
    expect(quality()).toBe('high');
    expect(document.documentElement.dataset.quality).toBe('high');

    applyPrefs({ bgm: true, sfx: true, motion: 'low', motion_chosen: true });
    expect(quality()).toBe('low');
  });
});
