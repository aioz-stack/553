'use client';

import { useEffect, useState } from 'react';

/**
 * Game sound effects synthesised with the Web Audio API (no audio files, so
 * nothing to license or download). The ON/OFF choice is stored per device.
 */
export type SoundName = 'tap' | 'deal' | 'chip' | 'win' | 'lose' | 'lucky' | 'tick' | 'start' | 'flip' | 'boom' | 'zap';

const KEY = 'pusoy.sound';
const listeners = new Set<(on: boolean) => void>();
let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // storage unavailable: keep the in-memory choice for this session
  }
  listeners.forEach((l) => l(on));
  if (on) {
    play('tap');
  }
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.18) {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  amp.gain.setValueAtTime(0, ac.currentTime + start);
  amp.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(amp).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.02);
}

function noise(ac: AudioContext, start: number, duration: number, gain = 0.12, type: BiquadFilterType = 'highpass', freq = 1800) {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const src = ac.createBufferSource();
  const amp = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  amp.gain.value = gain;
  src.buffer = buffer;
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(ac.currentTime + start);
}

export function play(name: SoundName): void {
  if (!soundEnabled()) {
    return;
  }
  const ac = audio();
  if (!ac) {
    return;
  }

  switch (name) {
    case 'tap':
      tone(ac, 660, 0, 0.06, 'triangle', 0.12);
      break;
    case 'deal':
      noise(ac, 0, 0.07);
      noise(ac, 0.08, 0.07);
      break;
    case 'chip':
      tone(ac, 1250, 0, 0.05, 'square', 0.06);
      tone(ac, 1650, 0.05, 0.08, 'square', 0.05);
      break;
    case 'tick':
      tone(ac, 1000, 0, 0.03, 'square', 0.04);
      break;
    case 'start':
      [523, 659, 784].forEach((f, i) => tone(ac, f, i * 0.08, 0.16, 'triangle'));
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(ac, f, i * 0.1, 0.28, 'triangle'));
      break;
    case 'lose':
      [392, 330, 262].forEach((f, i) => tone(ac, f, i * 0.12, 0.25, 'sawtooth', 0.08));
      break;
    case 'flip':
      // a crisp card snap
      noise(ac, 0, 0.045, 0.1, 'bandpass', 3200);
      tone(ac, 1400, 0, 0.03, 'triangle', 0.05);
      break;
    case 'boom': {
      // cartoon explosion: a falling thump plus a rumble
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ac.currentTime + 0.5);
      amp.gain.setValueAtTime(0.4, ac.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.6);
      osc.connect(amp).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.62);
      noise(ac, 0, 0.7, 0.35, 'lowpass', 700);
      break;
    }
    case 'zap':
      // electric crackle
      [0, 0.09, 0.2].forEach((t) => noise(ac, t, 0.08, 0.16, 'highpass', 2500));
      tone(ac, 880, 0, 0.25, 'sawtooth', 0.05);
      tone(ac, 220, 0.05, 0.3, 'square', 0.04);
      break;
    case 'lucky':
      [784, 988, 1175, 1568, 1976].forEach((f, i) => tone(ac, f, i * 0.07, 0.3, 'sine', 0.16));
      break;
  }
}

/** [enabled, toggle] — shared across every mounted component. */
export function useSound(): [boolean, () => void] {
  const [on, setOn] = useState(true);

  useEffect(() => {
    setOn(soundEnabled());
    listeners.add(setOn);
    return () => {
      listeners.delete(setOn);
    };
  }, []);

  return [on, () => setSoundEnabled(!on)];
}
