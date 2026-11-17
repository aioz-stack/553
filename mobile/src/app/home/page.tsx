'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Notice, Panel, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { points, useFetch } from '@/lib/hooks';
import type { TableState, Wallet } from '@/lib/types';

interface Stats {
  games_played: number;
  games_won: number;
  total_score: number;
  win_rate: number;
}

export default function Home() {
  const { user } = useAuth();
  const wallet = useFetch<{ data: Wallet[]; meta: { daily_reward_enabled: boolean; daily_reward_claimed: boolean } }>(user ? '/wallet' : null);
  const stats = useFetch<{ data: Stats }>(user ? '/profile/stats' : null);
  const [seat, setSeat] = useState<TableState | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      api<{ data: TableState | null }>('/tables/current').then((r) => setSeat(r.data)).catch(() => undefined);
    }
  }, [user]);

  const vc = wallet.data?.data.find((w) => w.currency === 'VC' && w.type === 'player');
  const cp = wallet.data?.data.find((w) => w.currency === 'CP' && w.type === 'player');
  const s = stats.data?.data;

  const claim = async () => {
    try {
      const r = await api<{ message: string }>('/wallet/daily-reward', { method: 'POST' });
      setMessage({ tone: 'success', text: r.message });
      wallet.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    }
  };

  return (
    <Screen title={`Hi, ${user?.display_name ?? user?.name ?? ''}`} action={<Link href="/notifications/" className="text-xl" aria-label="Notifications">🔔</Link>}>
      {seat && (
        <Notice tone="info">
          You have a seat at {seat.room.name}.{' '}
          <Link href={`/play/?table=${seat.id}`} className="font-semibold underline">
            Return to table
          </Link>
        </Notice>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-900 p-5 text-white">
        <p className="text-sm text-white/70">Virtual Coins</p>
        <p className="text-3xl font-bold">{vc ? points(vc.balance) : '—'}</p>
        <p className="mt-2 text-xs text-white/60">CP {cp ? points(cp.balance) : '—'} · cash features disabled</p>
        {wallet.data?.meta.daily_reward_enabled && (
          <Button variant="outline" className="mt-4 w-full border-white/40 text-white" onClick={claim} disabled={wallet.data.meta.daily_reward_claimed}>
            {wallet.data.meta.daily_reward_claimed ? 'Daily VC claimed ✓' : 'Claim free daily VC'}
          </Button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 text-center">
        {[
          ['Games', s?.games_played ?? 0],
          ['Wins', s?.games_won ?? 0],
          ['Score', s?.total_score ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white p-3 dark:bg-gray-900">
            <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
            <p className="text-xs text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      <Link href="/lobby/" className="mb-4 block">
        <Button className="w-full text-base">Play now</Button>
      </Link>

      <Panel title="More">
        <div className="grid grid-cols-2 gap-3">
          {[
            ['/rooms/', 'All rooms'],
            ['/history/', 'Game history'],
            ['/transactions/', 'Transactions'],
            ['/settings/', 'Settings'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-xl border border-gray-200 py-3 text-center text-sm font-medium text-gray-700 dark:border-gray-800 dark:text-gray-200">
              {label}
            </Link>
          ))}
        </div>
      </Panel>
    </Screen>
  );
}
