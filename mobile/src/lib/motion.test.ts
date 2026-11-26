import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ api: vi.fn(async () => ({})) }));
vi.mock('./music', () => ({ setMusicEnabled: vi.fn() }));
vi.mock('./sound', () => ({ setSoundEnabled: vi.fn(), soundEnabled: () => true }));

import { quality, qualityChosen, setQuality, weakDevice } from './motion';
import { MOTION_BOOT_SCRIPT } from './motionBoot';
import { applyPrefs } from './prefs';

/** Pretend to be a device with this much memory (GB) and these many CPU cores. */
function device(memory: number | undefined, cores: number) {
  Object.defineProperty(navigator, 'deviceMemory', { value: memory, configurable: true });
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores, configurable: true });
}

/** What the inline boot script (run before first paint) decides on this device. */
function boot(): string | undefined {
  delete document.documentElement.dataset.quality;
  new Function(MOTION_BOOT_SCRIPT)();
  return document.documentElement.dataset.quality;
}

describe('Motion Effects default: Medium on weak phones until the player picks a level', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    device(undefined, 8);
  });

  it('weak = 4 GB or less, or 4 cores or fewer', () => {
    device(8, 8);
    expect(weakDevice()).toBe(false);
    device(4, 8);
    expect(weakDevice()).toBe(true);
    device(undefined, 4);
    expect(weakDevice()).toBe(true);
    device(undefined, 6); // e.g. iOS: no deviceMemory, 6 cores
    expect(weakDevice()).toBe(false);
  });

  it('a weak phone starts on Medium, a strong one on High — and the boot script agrees', () => {
    device(3, 8);
    expect(quality()).toBe('medium');
    expect(boot()).toBe('medium');
    device(8, 8);
    expect(quality()).toBe('high');
    expect(boot()).toBe('high');
    expect(qualityChosen()).toBe(false);
  });

  it("the player's choice always wins, High included", () => {
    device(2, 4);
    setQuality('high');
    expect(quality()).toBe('high');
    expect(boot()).toBe('high');
    expect(qualityChosen()).toBe(true);
  });

  it("reduced motion on the device still means Low", () => {
    device(2, 4);
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    expect(quality()).toBe('low');
    expect(boot()).toBe('low');
  });

  it('account settings: a level never chosen does not override the device (and an old copied High is dropped)', () => {
    device(3, 8);
    localStorage.setItem('pusoy.quality', 'high'); // written by older versions from the account default
    applyPrefs({ bgm: true, sfx: true, motion: 'high', motion_chosen: false });
    expect(qualityChosen()).toBe(false);
    expect(quality()).toBe('medium');
    expect(document.documentElement.dataset.quality).toBe('medium');

    // A level the player picked (on any device) follows the account.
    applyPrefs({ bgm: true, sfx: true, motion: 'high', motion_chosen: true });
    expect(quality()).toBe('high');
  });
});
