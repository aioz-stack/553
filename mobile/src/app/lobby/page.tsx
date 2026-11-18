'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GameButton, GlassCard, Ribbon } from '@/components/game';
import RoomTile from '@/components/RoomTile';
import { Field, Notice, Screen, Spinner } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch, useQueryParam } from '@/lib/hooks';
import { play } from '@/lib/sound';
import type { GameMode, Room, TableState } from '@/lib/types';

const MODES: Record<string, { title: string; ribbon: 'blue' | 'pink' | 'gold'; rules: string[] }> = {
  round_bank: {
    title: 'Round Bank',
    ribbon: 'blue',
    rules: [
      '12 rounds. Everyone plays against the banker.',
      'The banker seat rotates to the next player after every round.',
      'Bet each round. Win all 3 lanes = +2× bet, win 2 = +1×, lose 2 = −1×, lose all 3 = −2×. Any tie = 0.',
      'Lucky Hands (Six Pairs, Three Flushes, Three Straights) pay 2×.',
    ],
  },
  banker: {
    title: 'Banker Mode',
    ribbon: 'gold',
    rules: [
      '12 rounds. The player who creates the table is the banker for every round.',
      'If the banker leaves, the player with the highest balance takes over after the round settles.',
      'Same lane payouts: +2× / +1× / 0 / −1× / −2× of the bet; Lucky Hands pay 2×.',
    ],
  },
};

/**
 * Lobby. `?mode=round_bank|banker` shows that mode's tables and lets the
 * player host one; without a mode it lists the classic VC tables.
 */
export default function Lobby() {
  const { user } = useAuth();
  const router = useRouter();
  const mode = useQueryParam('mode') as GameMode | null;
  const info = mode ? MODES[mode] : null;
  const rooms = useFetch<{ data: Room[]; meta?: { announcement?: string | null; maintenance_message?: string | null } }>(user ? '/rooms' : null, { currency: 'VC', game_mode: mode ?? 'classic' });
  const [host, setHost] = useState({ name: '', min_bet: '50', max_bet: '500', visibility: 'public' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    play('tap');
    try {
      const { data } = await api<{ data: TableState }>('/rooms/host', { method: 'POST', body: { ...host, name: host.name || `${user?.username}'s table`, game_mode: mode } });
      router.push(`/play/?table=${data.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <Screen title={info ? info.title : 'Multiplayer'} back>
      {rooms.data?.meta?.maintenance_message && <Notice tone="warning">{rooms.data.meta.maintenance_message}</Notice>}
      {rooms.data?.meta?.announcement && (
        <div className="glass mb-4 flex items-center gap-3 rounded-2xl px-4 py-3">
          <span className="text-2xl">📣</span>
          <p className="text-sm font-semibold">{rooms.data.meta.announcement}</p>
        </div>
      )}

      {info && (
        <GlassCard title={<Ribbon tone={info.ribbon}>{info.title}</Ribbon>}>
          <ul className="list-disc space-y-1 pl-4 text-xs text-white/80">
            {info.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </GlassCard>
      )}

      {!info && (
        <div className="mb-4 grid grid-cols-2 gap-3" aria-label="Game modes">
          {(
            [
              ['round_bank', 'from-[#c477ff] to-[#5a14b8]', 'Rotating banker · 12 rounds'],
              ['banker', 'from-[#ff6b5c] to-[#9c0a12]', 'Host & bank · 12 rounds'],
            ] as const
          ).map(([m, bg, sub]) => (
            <Link key={m} href={`/lobby/?mode=${m}`} onClick={() => play('tap')} className={`rounded-2xl border-4 border-gold-400 bg-gradient-to-b ${bg} px-3 py-3 text-center shadow-[0_5px_0_#8a4a00]`}>
              <span className="block font-display text-lg font-black text-white drop-shadow-[0_2px_0_rgb(0_0_0/0.4)]">{MODES[m].title}</span>
              <span className="block text-[11px] font-bold text-white/80">{sub}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mb-3 flex items-center justify-between">
        <Ribbon tone="pink">{info ? 'Open tables' : 'Classic tables'}</Ribbon>
        {!info && (
          <Link href="/rooms/" className="font-display text-sm font-extrabold text-gold-300">
            Private &amp; all rooms ›
          </Link>
        )}
      </div>

      {rooms.loading && <Spinner />}
      {rooms.error && <Notice>{rooms.error}</Notice>}

      <div className="grid grid-cols-2 gap-3">
        {rooms.data?.data.map((room) => (
          <RoomTile key={room.id} room={room} />
        ))}
      </div>
      {rooms.data && rooms.data.data.length === 0 && <p className="py-6 text-center text-sm text-white/60">No open tables yet — host one below.</p>}

      {info && (
        <GlassCard className="mt-5" title={mode === 'banker' ? 'Host a table — you are the banker' : 'Host a Round Bank table'}>
          {error && <Notice>{error}</Notice>}
          <Field label="Table name" value={host.name} placeholder={`${user?.username ?? 'My'}'s table`} onChange={(e) => setHost({ ...host, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Min bet (VC)" inputMode="decimal" value={host.min_bet} onChange={(e) => setHost({ ...host, min_bet: e.target.value })} />
            <Field label="Max bet (VC)" inputMode="decimal" value={host.max_bet} onChange={(e) => setHost({ ...host, max_bet: e.target.value })} />
          </div>
          <div className="mb-3 flex gap-1 rounded-2xl bg-black/30 p-1">
            {(['public', 'private'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setHost({ ...host, visibility: v })} className={`h-9 flex-1 rounded-xl font-display text-sm font-extrabold ${host.visibility === v ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-night-900' : 'text-white/70'}`}>
                {v === 'public' ? 'Public' : 'Friends only'}
              </button>
            ))}
          </div>
          <GameButton tone="green" size="lg" className="w-full" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'CREATE TABLE'}
          </GameButton>
          <p className="mt-2 text-center text-[11px] text-white/55">Each bet reserves 2× from the player and 2× cover from the banker until the round settles.</p>
        </GlassCard>
      )}

      {!info && <p className="mt-5 text-center text-xs text-white/55">4 players per table · your entry is held safely and refunded if you leave before the deal.</p>}
    </Screen>
  );
}
