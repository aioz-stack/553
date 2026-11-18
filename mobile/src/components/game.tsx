'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { points } from '@/lib/hooks';
import { springStyle } from '@/lib/spring';
import { useId, useState } from 'react';
import { avatarFor, avatarUrl } from '@/lib/avatars';
import { Glitter, RimGlint } from './Sparkles';

/*
 * Game-style primitives: coins, coin pills, avatar rings, chunky 3D buttons,
 * ribbons. Pure presentation — no game or wallet logic lives here.
 */

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/** Gold (VC) or silver-blue (CP) coin drawn in SVG. */
export function Coin({ currency = 'VC', size = 22, className }: { currency?: 'VC' | 'CP' | string; size?: number; className?: string }) {
  const id = `coin-${currency}`;
  const springId = useId();
  const [a, b, c] = currency === 'CP' ? ['#e8f1ff', '#8fb3e8', '#3f6aa8'] : currency === 'GP' ? ['#fff0ff', '#f08cff', '#8a2bb8'] : ['#fff3b0', '#ffc83a', '#c27a04'];

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cx('lx-spring-icon', className)} style={springStyle(springId, 2.6, 1.6)} aria-hidden="true">
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
        {{ CP: '₱', GD: 'G', GP: 'GP' }[currency] ?? 'V'}
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
/**
 * A player's cartoon avatar (the 553 collection, lib/avatars) in a gold rim. `avatar` is the id
 * from the server; without one (or if an image ever fails to load) the player's stable default is
 * shown, and as a last resort their initials — never a broken image.
 */
export function Avatar({
  name,
  size = 48,
  active,
  className,
  avatar,
  userId,
  square,
  rim = true,
}: {
  name: string;
  size?: number;
  active?: boolean;
  className?: string;
  avatar?: string | null;
  userId?: number | null;
  /** Rounded square instead of a circle. */
  square?: boolean;
  /** Gold rim (default); false when the picture sits inside its own frame. */
  rim?: boolean;
}) {
  const wanted = avatarFor(avatar, userId);
  const [failed, setFailed] = useState<string[]>([]);
  const fallback = avatarFor(null, userId);
  const src = !failed.includes(wanted) ? wanted : !failed.includes(fallback) ? fallback : null;
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const hash = [...name].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const round = square ? 'rounded-[22%]' : 'rounded-full';

  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center', rim && 'gold-rim p-[3px] shadow-lg', round, active && 'ring-4 ring-gold-300/60', className)} style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export (Capacitor): plain <img>, sized, lazy
        <img
          src={avatarUrl(src)}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed((f) => [...f, src])}
          className={cx('h-full w-full bg-white object-cover', round)}
        />
      ) : (
        <span className={cx('flex h-full w-full items-center justify-center bg-gradient-to-br font-display font-black text-white', round, AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length])} style={{ fontSize: size * 0.36 }}>
          {initials}
        </span>
      )}
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

export function GameButton({ tone = 'gold', size = 'md', className, style, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'min-h-10 px-4 text-sm', md: 'min-h-12 px-5 text-base', lg: 'min-h-14 px-6 text-lg' };
  const id = useId();

  return (
    <button
      {...props}
      className={cx('btn-3d lx-gloss lx-spring', TONES[tone].cls, sizes[size], className)}
      style={{ ...springStyle(id, 3, 1.4), ['--lip' as string]: TONES[tone].lip, ['--sweep-delay' as string]: `${(tone.length % 4) * 0.7}s`, ...style }}
    >
      <RimGlint width={2} delay={(tone.length % 5) * 0.6} />
      {tone !== 'glass' && <Glitter count={3} seed={tone.length * 7} size={0.55} />}
      {/* Above the glossy dome so labels stay crisp. */}
      <span className="relative z-[4] inline-flex items-center justify-center" style={{ gap: 'inherit' }}>
        {children}
      </span>
    </button>
  );
}

/** Ribbon/banner heading (e.g. "WIN!", section titles). */
export function Ribbon({ children, tone = 'pink', className }: { children: ReactNode; tone?: 'pink' | 'gold' | 'green' | 'blue'; className?: string }) {
  const tones = {
    pink: 'from-candy-400 to-candy-500',
    gold: 'from-gold-300 to-gold-600',
    green: 'from-mint-400 to-mint-600',
    blue: 'from-sky-400 to-brand-600',
  };

  return (
    <span className={cx('lx-gloss relative inline-block -skew-x-6 rounded-lg bg-gradient-to-b px-4 py-1 font-display text-sm font-black uppercase tracking-wide shadow-[0_4px_0_rgb(0_0_0/0.3),inset_0_1px_0_rgb(255_255_255/0.5)]', tone === 'gold' ? 'text-night-900' : 'text-white', tones[tone], className)}>
      <span className="relative z-[4] inline-block skew-x-6">{children}</span>
    </span>
  );
}

/** Rounded glossy container used across screens. */
export function GlassCard({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx('glass lx-sheen mb-4 rounded-3xl p-4', className)}>
      <Glitter count={4} seed={7} size={0.5} />
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

/** Faceted diamond gem (the home screen shows the VC balance as diamonds). */
export function Diamond({ size = 24, className }: { size?: number; className?: string }) {
  const springId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={cx('lx-spring-icon', className)} style={springStyle(springId, 2.6, 1.6)} aria-hidden="true">
      <defs>
        <linearGradient id="gem-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9fbff" />
          <stop offset="1" stopColor="#38c8ff" />
        </linearGradient>
        <linearGradient id="gem-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6fe3ff" />
          <stop offset="1" stopColor="#1b7fe0" />
        </linearGradient>
      </defs>
      <path d="M8 5h16l6 8-14 15L2 13l6-8Z" fill="#0f5fb8" />
      <path d="M8 5h16l6 8H2l6-8Z" fill="url(#gem-a)" />
      <path d="M2 13h28L16 28 2 13Z" fill="url(#gem-b)" />
      <path d="M11 13 16 5l5 8-5 15-5-15Z" fill="#fff" fillOpacity="0.35" />
      <path d="M9.5 8.5h4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Gold-rimmed level shield with the level number. */
export function LevelBadge({ level, size = 30 }: { level: number; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-label={`Level ${level}`}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
        <path d="M16 1.5 29 7v9c0 7.4-5.6 12.6-13 14.5C8.6 28.6 3 23.4 3 16V7l13-5.5Z" fill="#9a5b03" />
        <path d="M16 3.5 27 8.2V16c0 6.2-4.6 10.7-11 12.4C9.6 26.7 5 22.2 5 16V8.2L16 3.5Z" fill="url(#lvl)" />
        <defs>
          <linearGradient id="lvl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff8ac0" />
            <stop offset="1" stopColor="#c21e68" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-display text-[13px] font-black text-white drop-shadow-[0_1px_0_rgb(0_0_0/0.5)]">{level}</span>
    </span>
  );
}
