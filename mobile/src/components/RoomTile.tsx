'use client';

import { useRouter } from 'next/navigation';
import { useState, type ComponentType, type SVGProps } from 'react';
import { api, errorText } from '@/lib/api';
import { points, titleCase } from '@/lib/hooks';
import type { Room, TableState } from '@/lib/types';
import { Coin, GameButton } from './game';
import { IconBank, IconBolt, IconClock, IconCrown, IconLock, IconSpade, IconUsers } from './icons';
import { CardFan } from './PlayingCard';

export function useJoin() {
  const router = useRouter();

  return async (roomId: number, inviteCode?: string) => {
    const { data } = await api<{ data: TableState }>(`/rooms/${roomId}/join`, { method: 'POST', body: inviteCode ? { invite_code: inviteCode } : {} });
    router.push(`/play/?table=${data.id}`);
  };
}

interface Theme {
  bg: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  fan: string[];
  tag?: string;
  button?: 'gold' | 'pink';
}

/** Visual theme per room (cosmetic only; picked from room settings). */
export function roomTheme(room: Room): Theme {
  if (room.currency === 'CP') {
    return { bg: 'from-slate-500 via-slate-700 to-slate-900', Icon: IconLock, fan: ['AS', 'AH', 'AD'] };
  }

  if (room.visibility === 'private') {
    return { bg: 'from-mint-400 via-mint-600 to-emerald-900', Icon: IconUsers, fan: ['QH', 'QS', 'QC'], tag: 'Private' };
  }

  if (room.arrangement_seconds <= 60) {
    return { bg: 'from-candy-400 via-candy-500 to-fuchsia-900', Icon: IconBolt, fan: ['5H', '6H', '7H'], tag: 'Fast' };
  }

  if (room.payout_mode === 'round_bank') {
    return { bg: 'from-sky-400 via-brand-600 to-indigo-950', Icon: IconBank, fan: ['9C', '9D', '9S'] };
  }

  if (Number(room.entry_amount) >= 500) {
    return { bg: 'from-gold-300 via-gold-600 to-orange-900', Icon: IconCrown, fan: ['AS', 'KS', 'QS'], tag: 'VIP', button: 'pink' };
  }

  return { bg: 'from-felt-400 via-felt-600 to-night-800', Icon: IconSpade, fan: ['AS', 'KH', 'QD'], tag: 'Popular' };
}

/**
 * Game-mode tile (lobby / home). Gradient card with a gold rim, card-fan
 * illustration, entry chip and a chunky Join button.
 */
export default function RoomTile({ room, compact }: { room: Room; compact?: boolean }) {
  const join = useJoin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = roomTheme(room);

  const onJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      await join(room.id);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="gold-rim animate-pop rounded-[1.6rem] p-[3px] shadow-[0_10px_24px_rgb(0_0_0/0.45)]">
      <div className={`relative flex h-full flex-col overflow-hidden rounded-[1.45rem] bg-gradient-to-br ${theme.bg} p-3`}>
        <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15 blur-xl" />
        {theme.tag && (
          <span className="absolute left-0 top-3 rounded-r-full bg-gradient-to-r from-candy-400 to-candy-500 px-2.5 py-0.5 font-display text-[10px] font-black uppercase tracking-wide text-white shadow">
            {theme.tag}
          </span>
        )}
        <div className="flex items-start justify-end">
          <theme.Icon className="h-6 w-6 text-white/80 drop-shadow" />
        </div>

        <div className={compact ? 'my-1' : 'my-2'}>
          <CardFan cards={theme.fan} size={compact ? 'xs' : 'sm'} />
        </div>

        <h3 className="text-center font-display text-lg font-black leading-tight text-white drop-shadow-[0_2px_0_rgb(0_0_0/0.35)]">{room.name}</h3>
        {!compact && <p className="mt-0.5 line-clamp-2 text-center text-[11px] text-white/75">{titleCase(room.payout_mode)} · {titleCase(room.tie_handling)} ties</p>}

        <div className="mt-2 flex flex-wrap items-center justify-center gap-1 text-[11px] font-bold text-white/90">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/35 py-0.5 pl-0.5 pr-2">
            <Coin currency={room.currency} size={18} />
            {points(room.entry_amount)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5">
            <IconClock className="h-3.5 w-3.5" />
            {room.arrangement_seconds}s
          </span>
          {!compact && (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/35 px-2 py-0.5">
              <IconUsers className="h-3.5 w-3.5" />
              {room.waiting_players ?? 0}
            </span>
          )}
        </div>

        {Number(room.carry_over) > 0 && (
          <p className="mt-1 text-center font-display text-xs font-black text-gold-200">Bank {points(room.carry_over)}</p>
        )}
        {error && <p className="mt-1 text-center text-[11px] font-bold text-red-100">{error}</p>}

        <GameButton tone={room.enabled ? (theme.button ?? 'gold') : 'glass'} size="sm" className="mt-2 w-full" onClick={onJoin} disabled={busy || !room.enabled}>
          {room.enabled ? (busy ? 'Joining…' : 'PLAY') : 'Locked'}
        </GameButton>
      </div>
    </div>
  );
}
