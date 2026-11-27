import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const locks: string[] = [];
const bar: string[] = [];
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/screen-orientation', () => ({
  ScreenOrientation: { lock: vi.fn(async ({ orientation }: { orientation: string }) => void locks.push(orientation)) },
}));
vi.mock('@capacitor/status-bar', () => ({ StatusBar: { hide: vi.fn(async () => void bar.push('hide')), show: vi.fn(async () => void bar.push('show')) } }));

import { NATIVE_ROUTE_BOOT_SCRIPT, RESUME_KEY } from './nativeBoot';
import { PORTRAIT_DELAY_MS, initOrientation, resetOrientationForTests, useLandscapeLock } from './useLandscapeLock';

function Landscape() {
  useLandscapeLock();
  return null;
}

const settle = () => act(async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
});

describe('native orientation', () => {
  beforeEach(() => {
    resetOrientationForTests();
    locks.length = 0;
    bar.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('moving between two landscape screens never flips to portrait; portrait returns after the last one closes', async () => {
    vi.useFakeTimers();
    await initOrientation();
    const home = render(<Landscape />);
    await settle();
    expect(locks).toEqual(['portrait', 'landscape']);

    // Home → Lobby: the lobby mounts while home unmounts.
    const lobby = render(<Landscape />);
    home.unmount();
    await settle();
    await act(async () => vi.advanceTimersByTime(PORTRAIT_DELAY_MS * 2));
    await settle();
    expect(locks).toEqual(['portrait', 'landscape']);

    // Leaving the last landscape screen (e.g. to Profile): portrait, once.
    lobby.unmount();
    await act(async () => vi.advanceTimersByTime(PORTRAIT_DELAY_MS + 10));
    await settle();
    expect(locks).toEqual(['portrait', 'landscape', 'portrait']);
    expect(bar).toEqual(['show', 'hide', 'show']);
  });

  it('a landscape screen opened right after one closed cancels the pending portrait switch', async () => {
    vi.useFakeTimers();
    const a = render(<Landscape />);
    await settle();
    a.unmount();
    await act(async () => vi.advanceTimersByTime(PORTRAIT_DELAY_MS / 2));
    render(<Landscape />);
    await act(async () => vi.advanceTimersByTime(PORTRAIT_DELAY_MS * 2));
    await settle();
    expect(locks).toEqual(['landscape']);
  });
});

describe('native deep-route guard', () => {
  afterEach(() => {
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('in the app, a page loaded on an inner address is remembered and the URL reset to "/" (the page actually served)', () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    window.history.replaceState(null, '', '/practice/?tier=beginner');
    new Function(NATIVE_ROUTE_BOOT_SCRIPT)();
    expect(window.location.pathname).toBe('/');
    expect(sessionStorage.getItem(RESUME_KEY)).toBe('/practice/?tier=beginner');
  });

  it('does nothing in a browser or on "/"', () => {
    window.history.replaceState(null, '', '/lobby/');
    new Function(NATIVE_ROUTE_BOOT_SCRIPT)();
    expect(window.location.pathname).toBe('/lobby/');

    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    window.history.replaceState(null, '', '/');
    new Function(NATIVE_ROUTE_BOOT_SCRIPT)();
    expect(sessionStorage.getItem(RESUME_KEY)).toBeNull();
  });

  it('marks <html data-native> in the app only, so globals.css can use the lighter effects', () => {
    delete document.documentElement.dataset.native;
    new Function(NATIVE_ROUTE_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.native).toBeUndefined();

    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    new Function(NATIVE_ROUTE_BOOT_SCRIPT)();
    expect(document.documentElement.dataset.native).toBe('android');
    delete document.documentElement.dataset.native;
  });
});

describe('fix-export', () => {
  it('copies every __next.<route>/… data file to the dotted name the router requests, and is safe to re-run', () => {
    const out = mkdtempSync(join(tmpdir(), 'export-'));
    mkdirSync(join(out, 'lobby', '__next.lobby'), { recursive: true });
    mkdirSync(join(out, 'lobby', 'room', '__next.lobby', 'room'), { recursive: true });
    mkdirSync(join(out, '_next', 'static', '__next.x'), { recursive: true });
    writeFileSync(join(out, 'lobby', '__next.lobby', '__PAGE__.txt'), 'lobby data');
    writeFileSync(join(out, 'lobby', 'room', '__next.lobby', 'room', '__PAGE__.txt'), 'room data');
    writeFileSync(join(out, '_next', 'static', '__next.x', 'y.txt'), 'asset');

    const run = () => execFileSync(process.execPath, [join(process.cwd(), 'scripts', 'fix-export.mjs'), out]).toString();
    expect(run()).toContain('added 2');
    expect(readFileSync(join(out, 'lobby', '__next.lobby.__PAGE__.txt'), 'utf8')).toBe('lobby data');
    expect(readFileSync(join(out, 'lobby', 'room', '__next.lobby.room.__PAGE__.txt'), 'utf8')).toBe('room data');
    expect(existsSync(join(out, '_next', 'static', '__next.x.y.txt'))).toBe(false); // build assets untouched
    expect(run()).toContain('added 0');
  });
});
