'use client';

import { Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';

interface Row {
  rank: number;
  user_id: number;
  name: string;
  games_played: number;
  win_rate: number;
  total_score: number;
}

export default function Leaderboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ data: Row[] }>(user ? '/leaderboard' : null);

  return (
    <Screen title="Leaderboard">
      {loading && <Spinner />}
      <ol className="rounded-2xl bg-white dark:bg-gray-900">
        {data?.data.map((r) => (
          <li key={r.user_id} className={`flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-0 dark:border-gray-800 ${r.user_id === user?.id ? 'bg-brand-50/60' : ''}`}>
            <span className="w-8 text-center text-lg">{r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span>
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">{r.name}</p>
              <p className="text-xs text-gray-500">{r.games_played} games · {r.win_rate}% wins</p>
            </div>
            <span className="font-bold text-gray-900 dark:text-white">{r.total_score}</span>
          </li>
        ))}
      </ol>
    </Screen>
  );
}
