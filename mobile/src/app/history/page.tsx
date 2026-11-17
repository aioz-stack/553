'use client';

import Link from 'next/link';
import { Badge, Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, titleCase, useFetch, when } from '@/lib/hooks';

interface Game {
  id: number;
  room: { name: string };
  status: string;
  currency: string;
  started_at: string;
  my_result: { score: number; placement: number; net: string } | null;
}

const MEDAL = ['👑', '🥈', '🥉', '4'];

export default function History() {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ data: Game[] }>(user ? '/profile/games' : null);

  return (
    <Screen title="Game history" back>
      {loading && <Spinner />}
      {data?.data.length === 0 && <p className="pt-10 text-center text-white/60">No games yet — go win one!</p>}
      <div className="space-y-2">
        {data?.data.map((g) => (
          <Link key={g.id} href={`/results/?id=${g.id}`} className="glass flex items-center gap-3 rounded-2xl p-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-felt-400 to-felt-700 font-display text-lg font-black">
              {g.my_result ? MEDAL[g.my_result.placement - 1] : '•'}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display font-extrabold">{g.room.name}</p>
              <p className="text-[11px] text-white/55">#{g.id} · {when(g.started_at)}</p>
            </div>
            {g.my_result ? (
              <div className="text-right">
                <p className="font-display text-sm font-black text-gold-200">{g.my_result.score} pts</p>
                <p className={`text-xs font-bold ${Number(g.my_result.net) >= 0 ? 'text-mint-400' : 'text-candy-400'}`}>{points(g.my_result.net, g.currency)}</p>
              </div>
            ) : (
              <Badge>{titleCase(g.status)}</Badge>
            )}
          </Link>
        ))}
      </div>
    </Screen>
  );
}
