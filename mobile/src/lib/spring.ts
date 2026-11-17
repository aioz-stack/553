import type { CSSProperties } from 'react';

/**
 * Per-element spring timing so idle bounces never move in lock-step:
 * a stable hash of a key (or index) picks a duration between `min` and
 * `min + spread` seconds and a start delay inside one cycle.
 */
export function springStyle(key: string | number, min = 2.8, spread = 1.6): CSSProperties {
  const str = String(key);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  const a = ((h >>> 0) % 1000) / 1000;
  const b = ((h >>> 10) % 1000) / 1000;
  const dur = min + a * spread;

  return { ['--spring-dur' as string]: `${dur.toFixed(2)}s`, ['--spring-delay' as string]: `${(-b * dur).toFixed(2)}s` };
}
