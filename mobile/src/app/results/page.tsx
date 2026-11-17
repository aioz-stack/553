'use client';

import PlayingCard from '@/components/PlayingCard';
import { Badge, Notice, Panel, Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, useFetch, useQueryParam } from '@/lib/hooks';
import type { SessionState } from '@/lib/types';

export default function Results() {
  const { user } = useAuth();
  const id = useQueryParam('id');
  const { data, error, loading } = useFetch<{ data: SessionState }>(user && id ? `/games/${id}` : null);
  const s = data?.data;

  return (
    <Screen title={`Game #${id ?? ''}`} back>
      {loading && <Spinner />}
      {error && <Notice>{error}</Notice>}
      {s && (
        <>
          <Panel title={s.config.room_name}>
            {s.results?.map((r) => (
              <div key={r.user_id} className="flex justify-between py-1 text-sm">
                <span>#{r.placement} {r.name}</span>
                <span>{r.score} pts · {points(r.net, s.config.currency)}</span>
              </div>
            )) ?? <p className="text-sm text-gray-500">Results appear when the game completes.</p>}
          </Panel>
          {s.arrangements?.map((a) => (
            <Panel key={a.user_id} title={a.name} action={a.is_foul ? <Badge tone="error">Foul</Badge> : undefined}>
              {(['front', 'middle', 'back'] as const).map((r) => (
                <div key={r} className="mb-1 flex items-center gap-1">
                  {a[r].map((c) => <PlayingCard key={c} code={c} small />)}
                  <span className="ml-1 text-xs text-gray-500">{a.labels[r]}</span>
                </div>
              ))}
            </Panel>
          ))}
          <Panel title="Verify the shuffle">
            <p className="break-all text-xs text-gray-500">Commitment {s.deck_commitment}</p>
            <p className="mt-1 break-all text-xs text-gray-500">Seed {s.server_seed ?? '(revealed after completion)'}</p>
          </Panel>
        </>
      )}
    </Screen>
  );
}
