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

export default function History() {
  const { user } = useAuth();
  const { data, loading } = useFetch<{ data: Game[] }>(user ? '/profile/games' : null);

  return (
    <Screen title="Game history" back>
      {loading && <Spinner />}
      {data?.data.length === 0 && <p className="text-center text-sm text-gray-500">No games yet.</p>}
      {data?.data.map((g) => (
        <Link key={g.id} href={`/results/?id=${g.id}`} className="mb-2 flex items-center justify-between rounded-2xl bg-white p-4 dark:bg-gray-900">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">#{g.id} · {g.room.name}</p>
            <p className="text-xs text-gray-500">{when(g.started_at)}</p>
          </div>
          <div className="text-right">
            {g.my_result ? (
              <>
                <p className="text-sm font-semibold">#{g.my_result.placement} · {g.my_result.score} pts</p>
                <p className={`text-xs ${Number(g.my_result.net) >= 0 ? 'text-success-700' : 'text-error-700'}`}>{points(g.my_result.net, g.currency)}</p>
              </>
            ) : (
              <Badge>{titleCase(g.status)}</Badge>
            )}
          </div>
        </Link>
      ))}
    </Screen>
  );
}
