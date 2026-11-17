'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { points } from '@/lib/hooks';

/*
 * Game-style primitives: coins, coin pills, avatar rings, chunky 3D buttons,
 * ribbons. Pure presentation — no game or wallet logic lives here.
 */

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** Gold (VC) or silver-blue (CP) coin drawn in SVG. */
export function Coin({ currency = 'VC', size = 22, className }: { currency?: 'VC' | 'CP' | string; size?: number; className?: string }) {
  const id = `coin-${currency}`;
  const [a, b, c] = currency === 'CP' ? ['#e8f1ff', '#8fb3e8', '#3f6aa8'] : ['#fff3b0', '#ffc83a', '#c27a04'];

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="0.55" stopColor={b} />
          <stop offset="1" stopColor={c} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={c} />
      <circle cx="16" cy="15" r="14" fill={`url(#${id})`} />
      <circle cx="16" cy="15" r="10" fill="none" stroke={c} strokeOpacity="0.5" strokeWidth="1.5" />
      <text x="16" y="19.5" textAnchor="middle" fontSize="11" fontWeight="900" fill={c} fontFamily="system-ui">
        {currency === 'CP' ? '₱' : 'V'}
      </text>
    </svg>
  );
}

/** Rounded balance pill with a coin on the left (like a game HUD). */
export function CoinPill({ amount, currency = 'VC', onPlus, compact }: { amount: string | number | null | undefined; currency?: string; onPlus?: () => void; compact?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full border border-gold-400/50 bg-black/45 py-0.5 pl-0.5 shadow-inner', onPlus ? 'pr-0.5' : 'pr-3')}>
      <Coin currency={currency} size={compact ? 20 : 24} />
      <span className={cx('font-display font-extrabold tabular-nums text-gold-200', compact ? 'text-xs' : 'text-sm')}>{amount === null || amount === undefined ? '—' : points(amount)}</span>
      {onPlus && (
        <button onClick={onPlus} aria-label="Get coins" className="ml-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-mint-400 to-mint-600 text-base font-black leading-none text-white shadow">
          +
        </button>
      )}
    </span>
  );
}

const AVATAR_GRADIENTS = [
  'from-candy-400 to-candy-500',
  'from-sky-400 to-brand-600',
  'from-mint-400 to-mint-600',
  'from-gold-300 to-gold-600',
  'from-felt-400 to-felt-700',
  'from-orange-300 to-red-500',
];

/** Initials avatar with a gold rim (no external images). */
export function Avatar({ name, size = 48, active, className }: { name: string; size?: number; active?: boolean; className?: string }) {
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

  return (
    <span className={cx('gold-rim inline-flex shrink-0 items-center justify-center rounded-full p-[3px] shadow-lg', active && 'ring-4 ring-gold-300/60', className)} style={{ width: size, height: size }}>
      <span className={cx('flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br font-display font-black text-white', AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length])} style={{ fontSize: size * 0.36 }}>
        {initials}
      </span>
    </span>
  );
}

type Tone = 'gold' | 'green' | 'pink' | 'blue' | 'purple' | 'red' | 'glass';

const TONES: Record<Tone, { cls: string; lip: string }> = {
  gold: { cls: 'bg-gradient-to-b from-gold-300 via-gold-400 to-gold-600 text-night-900 [text-shadow:0_1px_0_rgb(255_255_255/0.4)]', lip: '#9a5b03' },
  green: { cls: 'bg-gradient-to-b from-mint-400 to-mint-600 text-white', lip: '#06724c' },
  pink: { cls: 'bg-gradient-to-b from-candy-400 to-candy-500 text-white', lip: '#a51f5d' },
  blue: { cls: 'bg-gradient-to-b from-sky-400 to-brand-600 text-white', lip: '#1f2aa6' },
  purple: { cls: 'bg-gradient-to-b from-felt-400 to-felt-700 text-white', lip: '#2a1f7a' },
  red: { cls: 'bg-gradient-to-b from-red-400 to-red-600 text-white', lip: '#8f1b14' },
  glass: { cls: 'bg-white/12 text-white backdrop-blur', lip: 'rgba(0,0,0,0.35)' },
};

export function GameButton({ tone = 'gold', size = 'md', className, style, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'min-h-10 px-4 text-sm', md: 'min-h-12 px-5 text-base', lg: 'min-h-14 px-6 text-lg' };

  return (
    <button
      {...props}
      className={cx('btn-3d', TONES[tone].cls, sizes[size], className)}
      style={{ ['--lip' as string]: TONES[tone].lip, ...style }}
    />
  );
}

/** Ribbon/banner heading (e.g. "WIN!", section titles). */
export function Ribbon({ children, tone = 'pink', className }: { children: ReactNode; tone?: 'pink' | 'gold' | 'green' | 'blue'; className?: string }) {
  const tones = {
    pink: 'from-candy-400 to-candy-500',
    gold: 'from-gold-300 to-gold-600 text-night-900',
    green: 'from-mint-400 to-mint-600',
    blue: 'from-sky-400 to-brand-600',
  };

  return (
    <span className={cx('inline-block -skew-x-6 rounded-lg bg-gradient-to-b px-4 py-1 font-display text-sm font-black uppercase tracking-wide text-white shadow-[0_4px_0_rgb(0_0_0/0.3)]', tones[tone], className)}>
      <span className="inline-block skew-x-6">{children}</span>
    </span>
  );
}

/** Rounded glossy container used across screens. */
export function GlassCard({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('glass mb-4 rounded-3xl p-4', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg font-extrabold text-white">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Small celebratory confetti burst (CSS only). */
export function Confetti({ count = 28 }: { count?: number }) {
  const colors = ['#ffcc3d', '#ff6fb1', '#45e0a5', '#4cc3ff', '#8b7dff'];

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-2 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animation: `confetti ${2.2 + (i % 5) * 0.35}s ${(i % 7) * 0.12}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}
