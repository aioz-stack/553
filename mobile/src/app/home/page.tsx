'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Coin, GameButton, Ribbon } from '@/components/game';
import { IconGift, IconList, IconSettings, IconSpade, IconTrophy, IconUsers } from '@/components/icons';
import { CardFan } from '@/components/PlayingCard';
import RoomTile, { useJoin } from '@/components/RoomTile';
import { Notice, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { points, useFetch } from '@/lib/hooks';
import type { Room, TableState, Wallet } from '@/lib/types';

interface Stats {
  games_played: number;
  games_won: number;
  total_score: number;
  win_rate: number;
}

const SHORTCUTS = [
  { href: '/rooms/', label: 'Rooms', Icon: IconUsers, bg: 'from-sky-400 to-brand-600' },
  { href: '/history/', label: 'History', Icon: IconList, bg: 'from-felt-400 to-felt-700' },
  { href: '/leaderboard/', label: 'Ranks', Icon: IconTrophy, bg: 'from-gold-300 to-gold-600' },
  { href: '/settings/', label: 'Settings', Icon: IconSettings, bg: 'from-candy-400 to-candy-500' },
];

export default function Home() {
  const { user } = useAuth();
  const join = useJoin();
  const wallet = useFetch<{ data: Wallet[]; meta: { daily_reward_enabled: boolean; daily_reward_claimed: boolean } }>(user ? '/wallet' : null);
  const stats = useFetch<{ data: Stats }>(user ? '/profile/stats' : null);
  const rooms = useFetch<{ data: Room[] }>(user ? '/rooms' : null, { currency: 'VC' });
  const [seat, setSeat] = useState<TableState | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      api<{ data: TableState | null }>('/tables/current').then((r) => setSeat(r.data)).catch(() => undefined);
    }
  }, [user]);

  const vc = wallet.data?.data.find((w) => w.currency === 'VC' && w.type === 'player');
  const s = stats.data?.data;
  const playable = rooms.data?.data.filter((r) => r.enabled) ?? [];
  const quick = [...playable].sort((a, b) => Number(a.entry_amount) - Number(b.entry_amount))[0];

  const claim = async () => {
    try {
      const r = await api<{ message: string }>('/wallet/daily-reward', { method: 'POST' });
      setMessage({ tone: 'success', text: r.message });
      wallet.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    }
  };

  const quickPlay = async () => {
    if (!quick) {
      return;
    }
    setBusy(true);
    try {
      await join(quick.id);
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
      setBusy(false);
    }
  };

  return (
    <Screen title="Welcome back!">
      {seat && (
        <Link href={`/play/?table=${seat.id}`} className="mb-3 flex items-center gap-3 rounded-2xl border border-mint-400/50 bg-mint-500/20 px-4 py-3">
          <span className="flex h-3 w-3 animate-ping rounded-full bg-mint-400" />
          <span className="flex-1 text-sm font-bold">You have a seat at {seat.room.name}</span>
          <span className="font-display text-sm font-black text-mint-100">Return ›</span>
        </Link>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {/* Hero */}
      <section className="gold-rim mb-4 rounded-[1.8rem] p-[3px] shadow-[0_14px_30px_rgb(0_0_0/0.5)]">
        <div className="relative overflow-hidden rounded-[1.65rem] bg-[radial-gradient(120%_90%_at_50%_0%,#8b7dff,#432290_55%,#170a3a)] px-4 pb-4 pt-5 text-center">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 to-transparent" />
          <div className="animate-float">
            <CardFan cards={['AS', 'KH', 'QD', 'JC', 'TS']} size="sm" spread={12} />
          </div>
          <h1 className="mt-2 font-display text-4xl font-black tracking-tight">
            <span className="text-gold">PUSOY</span> <span className="text-white drop-shadow-[0_3px_0_rgb(0_0_0/0.35)]">13</span>
          </h1>
          <p className="mb-4 text-sm text-white/75">Arrange 13 cards. Beat all three rivals.</p>
          <GameButton size="lg" className="shine w-full" onClick={quickPlay} disabled={busy || !quick}>
            {busy ? 'Finding a table…' : 'QUICK PLAY'}
          </GameButton>
          {quick && (
            <p className="mt-2 flex items-center justify-center gap-1 text-xs text-white/70">
              {quick.name} · entry <Coin size={14} /> {points(quick.entry_amount)}
            </p>
          )}
        </div>
      </section>

      {/* Daily reward + stats */}
      <div className="mb-4 grid grid-cols-5 gap-3">
        <div className="glass col-span-3 flex flex-col items-center justify-between rounded-3xl p-3 text-center">
          <span className="flex h-12 w-12 animate-float items-center justify-center rounded-2xl bg-gradient-to-b from-candy-400 to-candy-500 shadow-lg">
            <IconGift className="h-7 w-7 text-white" />
          </span>
          <p className="mt-1 font-display text-sm font-extrabold">Daily Bonus</p>
          {wallet.data?.meta.daily_reward_enabled ? (
            <GameButton tone={wallet.data.meta.daily_reward_claimed ? 'glass' : 'green'} size="sm" className="mt-2 w-full" onClick={claim} disabled={wallet.data.meta.daily_reward_claimed}>
              {wallet.data.meta.daily_reward_claimed ? 'Come back tomorrow' : 'CLAIM'}
            </GameButton>
          ) : (
            <p className="text-xs text-white/60">Not available</p>
          )}
        </div>
        <div className="glass col-span-2 flex flex-col justify-center gap-1 rounded-3xl p-3">
          {[
            ['Games', s?.games_played ?? 0],
            ['Wins', s?.games_won ?? 0],
            ['Score', s?.total_score ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-white/65">{label}</span>
              <span className="font-display text-base font-black text-gold-200">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Modes */}
      <div className="mb-2 flex items-center justify-between">
        <Ribbon tone="blue">Game Modes</Ribbon>
        <Link href="/lobby/" className="font-display text-sm font-extrabold text-gold-300">
          See all ›
        </Link>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        {(rooms.data?.data ?? []).slice(0, 4).map((room) => (
          <RoomTile key={room.id} room={room} compact />
        ))}
      </div>

      {/* Shortcuts */}
      <div className="grid grid-cols-4 gap-2">
        {SHORTCUTS.map(({ href, label, Icon, bg }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1">
            <span className={`btn-3d flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b ${bg}`} style={{ ['--lip' as string]: 'rgba(0,0,0,0.35)' }}>
              <Icon className="h-7 w-7 text-white" />
            </span>
            <span className="font-display text-xs font-bold text-white/80">{label}</span>
          </Link>
        ))}
      </div>

      <p className="mt-6 flex items-center justify-center gap-1 text-center text-[11px] text-white/45">
        <IconSpade className="h-3 w-3" /> VC is free-play only · {vc ? `${points(vc.balance)} VC` : ''} · cash features disabled
      </p>
    </Screen>
  );
}
