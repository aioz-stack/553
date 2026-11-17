import type { CSSProperties } from 'react';

/** Deterministic pseudo-random numbers so glitter never jumps between renders. */
function rand(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Twinkling glitter (4-point stars and soft dots) scattered over its
 * positioned parent. Purely decorative; ignores pointer events and is hidden
 * when the device asks for reduced motion.
 */
export function Glitter({ count = 8, seed = 1, size = 1, className = '' }: { count?: number; seed?: number; size?: number; className?: string }) {
  const r = rand(seed);
  const items = Array.from({ length: count }, (_, i) => {
    const star = i % 3 !== 2;
    const px = (star ? 10 + r() * 16 : 3 + r() * 4) * size;
    const style: CSSProperties = {
      left: `${4 + r() * 92}%`,
      top: `${4 + r() * 88}%`,
      width: px,
      height: px,
      animationDelay: `${(r() * 3).toFixed(2)}s`,
      animationDuration: `${(2 + r() * 2).toFixed(2)}s`,
    };
    return <span key={i} className={star ? 'lx-fleck' : 'lx-dot'} style={style} />;
  });

  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}>
      {items}
    </span>
  );
}

/** A light that travels around the border of its positioned parent. */
export function RimGlint({ width = 3, delay = 0 }: { width?: number; delay?: number }) {
  return <span aria-hidden="true" className="lx-rim" style={{ ['--rim' as string]: `${width}px`, ['--glint-delay' as string]: `${delay}s` }} />;
}
