'use client';

import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { points } from '@/lib/hooks';
import { play } from '@/lib/sound';
import { LUCKY_LABELS, type Result, type SessionState, type Standing } from '@/lib/types';
import { Avatar, Coin, Confetti, GameButton, Ribbon } from './game';
import { IconCrown } from './icons';
import { Notice } from './ui';

const LANES = ['front', 'middle', 'back'] as const;
const short = (v: string | number | null | undefined) => points(v).replace(/\.00$/, '');

/** Pick a bet between the room's min and max; the server validates it. */
export function BetPanel({ session, onDone, secondsLeft }: { session: SessionState; onDone: () => void; secondsLeft: number }) {
  const min = Number(session.config.min_bet ?? 0);
  const max = Number(session.config.max_bet ?? min);
  const chips = Array.from(new Set([min, min * 2, min * 5, max].filter((v) => v >= min && v <= max)));
  const [amount, setAmount] = useState(min);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currency = session.config.currency;

  const place = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/games/${session.id}/bet`, { method: 'POST', body: { amount: amount.toFixed(2) } });
      play('chip');
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-3xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <Ribbon tone="gold">Place your bet</Ribbon>
        <span className={`font-display text-sm font-black ${secondsLeft <= 5 ? 'animate-pulse text-candy-400' : 'text-white/80'}`}>{secondsLeft}s</span>
      </div>
      {error && <Notice>{error}</Notice>}

      <div className="mb-3 flex justify-center gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              play('chip');
              setAmount(c);
            }}
            aria-pressed={amount === c}
            className={`flex h-14 w-14 flex-col items-center justify-center rounded-full border-[3px] border-dashed font-display text-xs font-black shadow-[0_4px_0_rgb(0_0_0/0.35)] transition ${
              amount === c ? 'scale-110 border-white bg-gradient-to-b from-gold-300 to-gold-600 text-night-900' : 'border-white/60 bg-gradient-to-b from-candy-400 to-candy-500 text-white'
            }`}
          >
            {short(c)}
          </button>
        ))}
      </div>

      <label className="mb-1 block text-center text-xs font-bold text-white/70" htmlFor="bet-range">
        Bet <span className="font-display text-lg font-black text-gold-200">{short(amount)}</span> {currency}
      </label>
      <input id="bet-range" type="range" min={min} max={max} step={min >= 10 ? Math.max(1, Math.round(min / 10)) : 1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full accent-gold-400" />
      <p className="mb-3 mt-1 text-center text-[11px] text-white/60">
        Reserves {short(amount * 2)} {currency} (2×) until the round settles · range {short(min)}–{short(max)}
      </p>

      <GameButton tone="green" size="lg" className="w-full" onClick={place} disabled={busy}>
        {busy ? 'Placing…' : `BET ${short(amount)}`}
      </GameButton>
    </div>
  );
}

/** W / L / T chips for one player's three lanes against the banker. */
export function LaneChips({ lanes }: { lanes: Result['lanes'] }) {
  if (!lanes) {
    return null;
  }

  return (
    <span className="inline-flex gap-1">
      {LANES.map((l) => {
        const o = lanes[l];
        return (
          <span key={l} title={`${l}: ${o > 0 ? 'win' : o < 0 ? 'loss' : 'tie'}`} className={`flex h-6 w-6 items-center justify-center rounded-md font-display text-[11px] font-black ${o > 0 ? 'bg-mint-500' : o < 0 ? 'bg-red-500' : 'bg-white/25'}`}>
            {o > 0 ? 'W' : o < 0 ? 'L' : 'T'}
          </span>
        );
      })}
    </span>
  );
}

function multipleLabel(r: Result): string {
  if (r.role === 'banker') {
    return 'Banker';
  }
  const bet = Number(r.bet ?? 0);
  const m = bet ? Math.round(Number(r.net) / bet) : 0;
  if (r.lucky_type && Number(r.lucky_bonus) > 0) {
    return `LUCKY ×2`;
  }
  return m === 0 ? 'Push' : `${m > 0 ? '+' : ''}${m}×`;
}

/** Round results bottom sheet (banker modes). */
export function BankerRoundSheet({ session, userId, nextIn, onClose }: { session: SessionState; userId?: number; nextIn: number | null; onClose: () => void }) {
  const results = session.results ?? [];
  const mine = results.find((r) => r.user_id === userId);
  const currency = session.config.currency;
  const net = Number(mine?.net ?? 0);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/70 backdrop-blur-sm" role="dialog" aria-label="Round results">
      {net > 0 && <Confetti />}
      <div className="safe-bottom animate-pop w-full rounded-t-[2rem] border-t-4 border-gold-400 bg-gradient-to-b from-night-700 to-night-950 px-5 pt-6">
        <div className="-mt-12 mb-2 text-center">
          <span className="inline-block -rotate-3 rounded-2xl bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 px-6 py-2 font-display text-2xl font-black text-night-900 shadow-[0_6px_0_#9a5b03,0_12px_24px_rgb(0_0_0/0.5)]">
            {mine?.lucky_type && Number(mine.lucky_bonus) > 0 ? 'LUCKY HAND!' : net > 0 ? 'YOU WIN!' : net < 0 ? 'ROUND LOST' : 'PUSH'}
          </span>
        </div>
        <p className="text-center font-display text-sm font-black text-white/70">
          Round {session.round_number}/{session.config.rounds_total}
        </p>
        {mine && (
          <p className={`mb-3 text-center font-display text-2xl font-black ${net > 0 ? 'text-mint-400' : net < 0 ? 'text-candy-400' : 'text-white'}`}>
            {net > 0 ? '+' : ''}
            {points(mine.net, currency)}
          </p>
        )}

        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.user_id} className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${r.user_id === userId ? 'bg-gold-400/20 ring-2 ring-gold-400/60' : 'bg-white/8'}`}>
              <span className="relative">
                <Avatar name={r.name} size={32} />
                {r.role === 'banker' && <IconCrown className="absolute -right-1 -top-2 h-4 w-4 text-gold-300 drop-shadow" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {r.name} {r.is_foul && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-black">FOUL</span>}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-white/60">
                  {r.role === 'player' ? <>Bet {short(r.bet)}</> : <>Banker</>}
                  {r.lucky_type && <span className="rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-1.5 font-black text-night-900">{LUCKY_LABELS[r.lucky_type] ?? r.lucky_type}</span>}
                </span>
              </span>
              <LaneChips lanes={r.lanes} />
              <span className="w-20 text-right">
                <span className="block font-display text-xs font-black text-white/80">{multipleLabel(r)}</span>
                <span className={`block font-display text-sm font-black ${Number(r.net) > 0 ? 'text-mint-400' : Number(r.net) < 0 ? 'text-candy-400' : 'text-white/70'}`}>
                  {Number(r.net) > 0 ? '+' : ''}
                  {short(r.net)}
                </span>
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex items-center gap-2 pb-2">
          <GameButton tone="glass" size="md" className="flex-1" onClick={onClose}>
            View hands
          </GameButton>
          <span className="flex-1 text-center font-display text-sm font-black text-gold-200">{nextIn !== null ? (nextIn > 0 ? `Next round in ${nextIn}s` : 'Dealing next round…') : 'Final round'}</span>
        </div>
      </div>
    </div>
  );
}

export function StandingsList({ standings, userId, currency }: { standings: Standing[]; userId?: number; currency: string }) {
  return (
    <ul className="space-y-1.5">
      {standings.map((s) => (
        <li key={s.user_id} className={`flex items-center gap-2 rounded-2xl px-3 py-2 ${s.user_id === userId ? 'bg-gold-400/20 ring-2 ring-gold-400/60' : 'bg-white/8'}`}>
          <span className="w-6 text-center font-display text-lg font-black text-gold-300">{s.rank === 1 ? '👑' : s.rank}</span>
          <Avatar name={s.name} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">{s.name}</span>
            <span className="block text-[10px] text-white/60">
              W{s.won} · L{s.lost} · T{s.tied} · banked {s.banker_rounds}
              {s.lucky > 0 ? ` · lucky ${s.lucky}` : ''}
            </span>
          </span>
          <span className={`flex items-center gap-1 font-display text-sm font-black ${Number(s.net) > 0 ? 'text-mint-400' : Number(s.net) < 0 ? 'text-candy-400' : 'text-white/70'}`}>
            <Coin currency={currency} size={16} />
            {Number(s.net) > 0 ? '+' : ''}
            {short(s.net)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MatchOverSheet({ standings, userId, currency, reason, roundsPlayed, onLobby }: { standings: Standing[]; userId?: number; currency: string; reason: string | null | undefined; roundsPlayed: number; onLobby: () => void }) {
  const top = standings[0];
  const iWon = top && top.user_id === userId && Number(top.net) > 0;

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/75 backdrop-blur-sm" role="dialog" aria-label="Final results">
      {iWon && <Confetti count={40} />}
      <div className="safe-bottom animate-pop w-full rounded-t-[2rem] border-t-4 border-gold-400 bg-gradient-to-b from-night-700 to-night-950 px-5 pt-6">
        <div className="-mt-12 mb-2 text-center">
          <span className="inline-block -rotate-2 rounded-2xl bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 px-6 py-2 font-display text-2xl font-black text-night-900 shadow-[0_6px_0_#9a5b03,0_12px_24px_rgb(0_0_0/0.5)]">
            {iWon ? 'CHAMPION!' : 'MATCH OVER'}
          </span>
        </div>
        <p className="mb-3 text-center text-xs font-bold text-white/65">
          {roundsPlayed} round{roundsPlayed === 1 ? '' : 's'} played{reason && reason !== 'completed' ? ` · ended: ${reason.replace(/_/g, ' ')}` : ''}
        </p>
        {standings.length ? <StandingsList standings={standings} userId={userId} currency={currency} /> : <p className="py-4 text-center text-sm text-white/60">No rounds were completed.</p>}
        <div className="mt-4 pb-2">
          <GameButton tone="gold" size="lg" className="w-full" onClick={onLobby}>
            BACK TO LOBBY
          </GameButton>
        </div>
      </div>
    </div>
  );
}
