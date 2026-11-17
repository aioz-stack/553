'use client';

import { Avatar, GlassCard, Ribbon } from '@/components/game';
import { RevealedHand } from '@/components/TableView';
import { Notice, Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, useFetch, useQueryParam } from '@/lib/hooks';
import type { SessionState } from '@/lib/types';

export default function Results() {
  const { user } = useAuth();
  const id = useQueryParam('id');
  const { data, error, loading } = useFetch<{ data: SessionState }>(user && id ? `/games/${id}` : null);
  const s = data?.data;
  const byUser = (uid: number) => s?.results?.find((r) => r.user_id === uid);

  return (
    <Screen title={`Game #${id ?? ''}`} back>
      {loading && <Spinner />}
      {error && <Notice>{error}</Notice>}
      {s && (
        <>
          <GlassCard title={s.config.room_name} action={<Ribbon tone="gold">Final</Ribbon>}>
            {s.results ? (
              <ul className="space-y-1.5">
                {s.results.map((r) => (
                  <li key={r.user_id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${r.user_id === user?.id ? 'bg-gold-400/20 ring-2 ring-gold-400/60' : 'bg-white/8'}`}>
                    <span className="w-6 text-center font-display text-lg font-black text-gold-300">{r.placement === 1 ? '👑' : r.placement}</span>
                    <Avatar name={r.name} size={32} />
                    <span className="flex-1 truncate font-bold">{r.name}</span>
                    <span className="text-right text-sm">
                      <span className="block font-display font-black">{r.score} pts</span>
                      <span className={Number(r.net) >= 0 ? 'text-mint-400' : 'text-candy-400'}>{points(r.net, s.config.currency)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-white/60">Results appear when the game completes.</p>
            )}
          </GlassCard>

          <div className="mb-4 grid grid-cols-1 gap-2">
            {s.arrangements?.map((a) => (
              <RevealedHand key={a.user_id} a={a} result={byUser(a.user_id)} currency={s.config.currency} />
            ))}
          </div>

          <GlassCard title="Verify the shuffle">
            <p className="break-all text-[11px] text-white/60">Commitment {s.deck_commitment}</p>
            <p className="mt-1 break-all text-[11px] text-white/60">Seed {s.server_seed ?? '(revealed after completion)'}</p>
          </GlassCard>
        </>
      )}
    </Screen>
  );
}
