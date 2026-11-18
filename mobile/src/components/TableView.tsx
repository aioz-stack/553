'use client';

import type { Arrangement, Result, SeatPlayer } from '@/lib/types';
import { points } from '@/lib/hooks';
import { Avatar, Coin } from './game';
import { IconCrown } from './icons';
import PlayingCard, { CardFan } from './PlayingCard';

/** Circular countdown around the pot. */
export function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(1, seconds / total)) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const urgent = seconds <= 15;

  return (
    <div className="relative h-16 w-16" role="timer" aria-label={`${seconds} seconds left`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="rgb(0 0 0 / 0.45)" stroke="rgb(255 255 255 / 0.15)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={urgent ? '#f0428f' : '#ffcc3d'} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset 0.25s linear' }} />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-display text-lg font-black ${urgent ? 'animate-pulse text-candy-400' : 'text-white'}`}>{seconds}</span>
    </div>
  );
}

/**
 * One seat around the felt: avatar ring, name plate, status chip and a
 * face-down fan (or the revealed arrangement in miniature). Never shows
 * another player's wallet balance.
 */
export function Seat({ player, position, inGame, arrangement, result, phase }: { player?: SeatPlayer; position: 'top' | 'left' | 'right' | 'bottom'; inGame: boolean; arrangement?: Arrangement; result?: Result; phase?: string }) {
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-1 opacity-80">
        <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-white/40 bg-black/20 text-lg text-white/60">+</span>
        <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-bold text-white/70">Waiting…</span>
      </div>
    );
  }

  const status = !player.is_connected
    ? { text: 'Offline', cls: 'bg-red-500' }
    : phase === 'BETTING'
      ? player.is_banker
        ? { text: 'Covering', cls: 'bg-orange-500' }
        : player.bet
          ? { text: 'Bet in', cls: 'bg-mint-500' }
          : { text: 'Betting', cls: 'bg-felt-500' }
    : inGame
      ? player.has_submitted
        ? { text: 'Done', cls: 'bg-mint-500' }
        : { text: 'Thinking', cls: 'bg-felt-500' }
      : player.is_ready
        ? { text: 'Ready', cls: 'bg-mint-500' }
        : { text: 'Not ready', cls: 'bg-white/25' };

  const bankerRound = result?.role !== undefined && result?.role !== null;
  const won = bankerRound ? Number(result?.net) > 0 : result?.placement === 1;

  return (
    <div className="relative flex flex-col items-center">
      {result && won && (
        <span className="absolute -top-4 z-10 -rotate-6 rounded-md bg-gradient-to-b from-gold-300 to-gold-600 px-2 font-display text-xs font-black text-night-900 shadow-[0_3px_0_rgb(0_0_0/0.3)]">{result.lucky_type ? 'LUCKY' : 'WIN'}</span>
      )}
      {!result && player.declared_lucky && (
        <span className="absolute -top-4 z-10 animate-pulse rounded-md bg-gradient-to-b from-gold-300 to-gold-600 px-2 font-display text-xs font-black text-night-900">LUCKY!</span>
      )}
      <div className="relative">
        <Avatar name={player.is_you ? 'You' : player.name} avatar={player.avatar} userId={player.user_id} size={position === 'bottom' ? 50 : 44} active={player.is_you || player.is_banker} />
        {player.is_banker && (
          <span className="absolute -left-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-gold-200 bg-gradient-to-b from-orange-400 to-red-600 shadow" title="Banker" aria-label="Banker">
            <IconCrown className="h-3.5 w-3.5 text-gold-100" />
          </span>
        )}
        <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 text-[9px] font-black uppercase text-white shadow ${status.cls}`}>{status.text}</span>
      </div>
      <span className="mt-1.5 max-w-24 truncate rounded-lg bg-gradient-to-b from-gold-200 to-gold-400 px-2 py-0.5 font-display text-[11px] font-black text-night-900 shadow">
        {player.is_you ? 'You' : player.name}
      </span>
      {player.is_banker && <span className="mt-0.5 rounded-full bg-red-600 px-1.5 font-display text-[9px] font-black uppercase tracking-wide">Banker</span>}
      {!player.is_banker && player.bet && (
        <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-black/45 py-0.5 pl-0.5 pr-1.5 font-display text-[10px] font-black text-gold-200">
          <Coin size={14} />
          {points(player.bet).replace(/\.00$/, '')}
        </span>
      )}
      {result && (
        <span className={`mt-1 font-display text-xs font-black ${(bankerRound ? Number(result.net) : result.score) >= 0 ? 'text-mint-400' : 'text-candy-400'}`}>
          {bankerRound ? `${Number(result.net) > 0 ? '+' : ''}${points(result.net).replace(/\.00$/, '')}` : `${result.score > 0 ? '+' : ''}${result.score} pts`}
        </span>
      )}
      {inGame && phase !== 'BETTING' && !arrangement && position !== 'bottom' && (
        <div className="mt-1 scale-75">
          <CardFan faceDown cards={['a', 'b', 'c', 'd', 'e']} size="xs" spread={9} />
        </div>
      )}
    </div>
  );
}

/** Felt table with a gold rim; seats placed around a centre pot. */
export function Felt({ children }: { children: React.ReactNode }) {
  return (
    <div className="gold-rim mx-auto rounded-[2.5rem] p-[5px] shadow-[0_18px_40px_rgb(0_0_0/0.6)]">
      <div className="relative overflow-hidden rounded-[2.2rem] bg-[radial-gradient(110%_80%_at_50%_45%,#8b7dff_0%,#5446d6_45%,#2f2592_100%)] px-2 py-3">
        <div
          className="pointer-events-none absolute inset-3 rounded-[1.8rem] border-2 border-white/15"
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.04) 0 2px, transparent 2px 16px)' }}
        />
        {children}
      </div>
    </div>
  );
}

export function PotDisplay({ pot, currency }: { pot: string; currency: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex -space-x-2">
        <Coin currency={currency} size={22} />
        <Coin currency={currency} size={22} className="-translate-y-1" />
        <Coin currency={currency} size={22} />
      </div>
      <span className="mt-0.5 rounded-full bg-black/45 px-2 font-display text-xs font-black text-gold-200">{points(pot)}</span>
    </div>
  );
}

/** Revealed arrangement (one player) in a compact three-row grid. */
export function RevealedHand({ a, result, currency }: { a: Arrangement; result?: Result; currency: string }) {
  return (
    <div className={`rounded-2xl border p-2 ${(result?.role ? Number(result.net) > 0 : result?.placement === 1) ? 'border-gold-300 bg-gold-400/15' : 'border-white/10 bg-black/25'}`}>
      <div className="mb-1 flex items-center gap-2">
        <Avatar name={a.name} avatar={a.avatar} userId={a.user_id} size={28} />
        <span className="flex-1 truncate font-display text-sm font-extrabold">{a.name}</span>
        {a.is_foul && <span className="rounded-full bg-red-500 px-2 text-[10px] font-black">FOUL</span>}
        {a.is_auto && <span className="rounded-full bg-white/20 px-2 text-[10px] font-black">AUTO</span>}
        {result?.role === 'banker' && <span className="rounded-full bg-red-600 px-2 text-[10px] font-black">BANKER</span>}
        {a.lucky_type && <span className="rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-2 text-[10px] font-black text-night-900">LUCKY</span>}
        {result?.lanes && (
          <span className="flex gap-0.5">
            {(['front', 'middle', 'back'] as const).map((l) => (
              <span key={l} className={`h-4 w-4 rounded text-center text-[9px] font-black leading-4 ${result.lanes![l] > 0 ? 'bg-mint-500' : result.lanes![l] < 0 ? 'bg-red-500' : 'bg-white/25'}`}>
                {result.lanes![l] > 0 ? 'W' : result.lanes![l] < 0 ? 'L' : 'T'}
              </span>
            ))}
          </span>
        )}
        {result && (
          <span className={`font-display text-xs font-black ${Number(result.net) >= 0 ? 'text-mint-400' : 'text-candy-400'}`}>
            {Number(result.net) >= 0 ? '+' : ''}
            {points(result.net, currency)}
          </span>
        )}
      </div>
      {(['front', 'middle', 'back'] as const).map((r) => (
        <div key={r} className="mb-0.5 flex items-center gap-0.5">
          {a[r].map((c) => (
            <PlayingCard key={c} code={c} size="xs" />
          ))}
          <span className="ml-1 truncate text-[10px] font-bold text-white/70">{a.labels[r]}</span>
        </div>
      ))}
    </div>
  );
}
