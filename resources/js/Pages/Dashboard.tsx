import { Link, router } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import ApexChart from '../Components/ApexChart';
import PageShell from '../Components/PageShell';
import { IconCards, IconTrophy, IconWallet } from '../Components/PlatformIcons';
import { Alert, Button, Card, LinkButton, StatCard } from '../Components/ui';
import { api, errorMessage } from '../lib/api';
import { points } from '../lib/format';
import type { TableState, Wallet } from '../lib/types';
import { useApi } from '../lib/useApi';

interface Stats {
  games_played: number;
  games_won: number;
  total_score: number;
  win_rate: number;
  fouls: number;
  best_score: number;
  recent_scores: number[];
}

/**
 * Player dashboard (the original Baseplate demo dashboard lives in Pages/Baseplate).
 */
export default function Dashboard() {
  const wallet = useApi<{ data: Wallet[]; meta: { daily_reward_enabled: boolean; daily_reward_claimed: boolean } }>('/wallet');
  const stats = useApi<{ data: Stats }>('/profile/stats');
  const [seat, setSeat] = useState<TableState | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api.get<{ data: TableState | null }>('/tables/current').then((r) => setSeat(r.data.data)).catch(() => undefined);
  }, []);

  const chips = wallet.data?.data.find((w) => w.currency === 'CH' && w.type === 'player');
  const gold = wallet.data?.data.find((w) => w.currency === 'GD' && w.type === 'player');
  const s = stats.data?.data;

  const claim = async () => {
    try {
      const r = await api.post('/wallet/daily-reward');
      setMessage({ tone: 'success', text: r.data.message });
      wallet.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <PageShell title="Dashboard">
      {seat && (
        <Alert tone="info">
          You are seated at <strong>{seat.room.name}</strong> (table #{seat.id}).{' '}
          <button className="font-semibold underline" onClick={() => router.visit(`/play/${seat.id}`)}>
            Return to the table
          </button>
        </Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <StatCard icon={<IconWallet />} label="Chips" value={points(chips?.balance)} hint="Multiplayer only" />
        <StatCard icon={<IconWallet />} label="Gold" value={points(gold?.balance)} hint="Single Player only" />
        <StatCard icon={<IconCards />} label="Games played" value={s?.games_played ?? 0} hint={`${s?.win_rate ?? 0}% win rate`} />
        <StatCard icon={<IconTrophy />} label="Total score" value={s?.total_score ?? 0} hint={`Best game: ${s?.best_score ?? 0}`} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Recent scores" className="xl:col-span-2">
          {s && s.recent_scores.length > 0 ? (
            <ApexChart
              options={{
                chart: { type: 'bar', height: 260, fontFamily: 'Outfit, sans-serif', toolbar: { show: false } },
                colors: ['#465FFF'],
                series: [{ name: 'Score', data: s.recent_scores }],
                xaxis: { categories: s.recent_scores.map((_, i) => `#${i + 1}`) },
                plotOptions: { bar: { borderRadius: 4, columnWidth: '45%' } },
                dataLabels: { enabled: false },
                grid: { yaxis: { lines: { show: true } } },
              }}
            />
          ) : (
            <p className="text-sm text-gray-500">Play your first game to see your score history.</p>
          )}
        </Card>

        <Card title="Quick actions">
          <div className="flex flex-col gap-3">
            <LinkButton href="/lobby">Find a table</LinkButton>
            {wallet.data?.meta.daily_reward_enabled && (
              <Button variant="outline" onClick={claim} disabled={wallet.data.meta.daily_reward_claimed}>
                {wallet.data.meta.daily_reward_claimed ? 'Daily Chips claimed ✓' : 'Claim free daily Chips'}
              </Button>
            )}
            <LinkButton href="/history" variant="outline">
              Game history
            </LinkButton>
            <Link href="/leaderboard" className="text-center text-sm text-brand-500">
              View leaderboard
            </Link>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
