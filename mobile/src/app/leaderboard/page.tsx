'use client';

import { Avatar, Ribbon } from '@/components/game';
import { Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';

interface Row {
  rank: number;
  user_id: number;
  name: string;
  avatar?: string | null;
  games_played: number;
  win_rate: number;
  total_score: number;
}

const PODIUM = [
  { place: 2, h: 'h-20', bg: 'from-slate-200 to-slate-400' },
  { place: 1, h: 'h-28', bg: 'from-gold-300 to-gold-600' },
  { place: 3, h: 'h-16', bg: 'from-orange-300 to-orange-600' },
];

export default function Leaderboard() {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ data: Row[] }>(user ? '/leaderboard' : null);
  const rows = data?.data ?? [];

  return (
    <Screen title="Top players">
      <Ribbon tone="gold" className="mb-4">Leaderboard</Ribbon>
      {loading && <Spinner />}

      {rows.length > 0 && (
        <div className="mb-5 grid grid-cols-3 items-end gap-2">
          {PODIUM.map(({ place, h, bg }) => {
            const r = rows[place - 1];

            return (
              <div key={place} className="flex flex-col items-center">
                {r && (
                  <>
                    {place === 1 && <span className="mb-1 text-2xl">👑</span>}
                    <Avatar name={r.name} avatar={r.avatar} userId={r.user_id} size={place === 1 ? 64 : 52} active={r.user_id === user?.id} />
                    <span className="mt-1 max-w-full truncate font-display text-sm font-extrabold">{r.name}</span>
                    <span className="font-display text-xs font-black text-gold-200">{r.total_score} pts</span>
                  </>
                )}
                <div className={`mt-2 flex w-full ${h} items-start justify-center rounded-t-2xl bg-gradient-to-b ${bg} pt-2 font-display text-3xl font-black text-night-900 shadow-[inset_0_2px_0_rgb(255_255_255/0.5)]`}>{place}</div>
              </div>
            );
          })}
        </div>
      )}

      <ol className="space-y-2">
        {rows.slice(3).map((r) => (
          <li key={r.user_id} className={`glass flex items-center gap-3 rounded-2xl px-3 py-2 ${r.user_id === user?.id ? 'ring-2 ring-gold-400' : ''}`}>
            <span className="w-7 text-center font-display text-lg font-black text-white/70">{r.rank}</span>
            <Avatar name={r.name} avatar={r.avatar} userId={r.user_id} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-extrabold">{r.name}</p>
              <p className="text-[11px] text-white/55">{r.games_played} games · {r.win_rate}% wins</p>
            </div>
            <span className="font-display text-base font-black text-gold-200">{r.total_score}</span>
          </li>
        ))}
      </ol>
    </Screen>
  );
}
