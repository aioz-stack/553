'use client';

import { useEffect, useState } from 'react';

/**
 * Background music (Settings → Audio → BGM): a gentle, looping festival-style
 * tune on a pentatonic scale, synthesised with the Web Audio API (no audio
 * files to license or download). ON/OFF is saved per device and with the
 * account (lib/prefs). Browsers only allow audio after a tap, so the music
 * starts on the first tap / key press once enabled, pauses while the app is in
 * the background, and stops at once when switched off.
 */
const KEY = 'pusoy.bgm';
const listeners = new Set<(on: boolean) => void>();

export function musicEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

// ---- the tune: 16 bars of 4 beats, melody + bass + a soft pad, ~84 bpm ----
const BPM = 84;
const BEAT = 60 / BPM;
// Pentatonic (C D E G A) in MIDI note numbers; 0 = rest. Eighth notes.
const MELODY = [
  76, 0, 79, 81, 79, 76, 74, 0, 72, 74, 76, 79, 76, 0, 0, 0,
  81, 0, 79, 76, 74, 76, 79, 0, 76, 74, 72, 0, 74, 0, 0, 0,
  76, 79, 81, 84, 81, 79, 76, 0, 79, 76, 74, 72, 74, 76, 0, 0,
  72, 0, 74, 76, 79, 76, 74, 72, 69, 72, 74, 0, 72, 0, 0, 0,
];
// One bass note per bar (half notes twice).
const BASS = [48, 45, 43, 48, 48, 45, 43, 43, 45, 48, 43, 45, 48, 45, 43, 48];
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0; // eighth-note index into the loop

function note(ac: AudioContext, out: AudioNode, freq: number, t: number, dur: number, type: OscillatorType, gain: number) {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Schedule the notes that fall in the next ~0.3 s (look-ahead scheduler). */
function schedule() {
  if (!ctx || !master) return;
  const eighth = BEAT / 2;
  while (nextTime < ctx.currentTime + 0.3) {
    const m = MELODY[step % MELODY.length];
    if (m) note(ctx, master, hz(m), nextTime, eighth * 1.8, 'triangle', 0.09);
    if (step % 4 === 0) {
      const bar = Math.floor(step / 8) % BASS.length;
      note(ctx, master, hz(BASS[bar]), nextTime, eighth * 3.8, 'sine', 0.12);
      if (step % 8 === 0) note(ctx, master, hz(BASS[bar] + 19), nextTime, eighth * 7.5, 'sine', 0.025); // soft pad fifth
    }
    nextTime += eighth;
    step++;
  }
}

function start() {
  if (timer) {
    // Already scheduled (e.g. turned on before any tap): browsers only let audio run after one.
    ctx?.resume().catch(() => undefined);
    return;
  }
  if (!musicEnabled() || typeof window === 'undefined') return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx ??= new Ctor();
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  ctx.resume().catch(() => undefined);
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 100);
  schedule();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  if (ctx && master) {
    // Fade out what is already scheduled, then start fresh next time.
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    const old = master;
    setTimeout(() => old.disconnect(), 300);
    master = null;
  }
}

/** Turn the music on or off (saved on this device; applies at once). */
export function setMusicEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // storage unavailable: this session only
  }
  if (on) start();
  else stop();
  listeners.forEach((l) => l(on));
}

/** Mount once (NativeShell): starts the music on the first interaction and follows app visibility. */
export function useMusicPlayer(): void {
  useEffect(() => {
    const kick = () => {
      if (musicEnabled() && document.visibilityState === 'visible') start();
    };
    const vis = () => (document.visibilityState === 'visible' ? kick() : stop());
    window.addEventListener('pointerdown', kick);
    window.addEventListener('keydown', kick);
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', kick);
      window.removeEventListener('keydown', kick);
      document.removeEventListener('visibilitychange', vis);
      stop();
    };
  }, []);
}

/** [enabled, setter] — shared across every mounted component. */
export function useMusic(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(musicEnabled());
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return [on, setMusicEnabled];
}
