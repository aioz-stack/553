'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ArrangeHands from '@/components/ArrangeHands';
import PlayingCard from '@/components/PlayingCard';
import { Badge, Button, Notice, Screen, Spinner } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { points, titleCase, useQueryParam } from '@/lib/hooks';
import type { SeatPlayer } from '@/lib/types';
import { useSecondsLeft, useTable } from '@/lib/useTable';

function SeatChip({ p, inGame }: { p?: SeatPlayer; inGame: boolean }) {
  if (!p) {
    return <div className="w-20 rounded-lg border border-dashed border-white/30 py-2 text-center text-[11px] text-white/50">Waiting…</div>;
  }

  return (
    <div className={`w-20 rounded-lg border py-1.5 text-center text-white ${p.is_you ? 'border-brand-300 bg-brand-500/30' : 'border-white/20 bg-white/10'}`}>
      <p className="truncate px-1 text-xs font-semibold">{p.is_you ? 'You' : p.name}</p>
      <div className="mt-0.5 flex justify-center gap-1 text-[10px]">
        {!p.is_connected && <span className="rounded bg-error-500 px-1">off</span>}
        {inGame ? p.has_submitted && <span className="rounded bg-success-500 px-1">done</span> : p.is_ready && <span className="rounded bg-success-500 px-1">ready</span>}
      </div>
    </div>
  );
}

/**
 * Portrait game table: waiting room → arrangement → reveal & result overlay.
 */
export default function Play() {
  const { user } = useAuth();
  const router = useRouter();
  const tableParam = useQueryParam('table');
  const tableId = tableParam ? Number(tableParam) : null;
  const { table, session, error, live, refresh, clockOffset } = useTable(tableId, user?.id);
  const secondsLeft = useSecondsLeft(session?.status === 'ARRANGING' ? session.arrangement_deadline : null, clockOffset);
  const [actionError, setActionError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(errorText(e));
    }
  };

  if (!table) {
    return (
      <Screen title="Table" back tabs={false}>
        {error ? <Notice>{error}</Notice> : <Spinner />}
      </Screen>
    );
  }

  const inGame = !!session;
  const players = inGame ? session!.players : table.players;
  const me = table.players.find((p) => p.is_you);
  const seat = (n: number) => players.find((p) => p.seat === n);
  const currency = table.room.currency;
  const showResults = session?.status === 'COMPLETED' && session.results;

  return (
    <Screen
      title={table.room.name}
      back
      tabs={false}
      action={
        session?.status === 'ARRANGING' ? (
          <span className={`rounded-full px-3 py-1 text-sm font-bold ${secondsLeft <= 15 ? 'bg-error-500' : 'bg-white/15'}`}>⏱ {secondsLeft}s</span>
        ) : (
          <Badge tone={live ? 'success' : 'warning'}>{live ? 'Live' : 'Syncing'}</Badge>
        )
      }
    >
      <div className="-mx-4 -mt-4 min-h-[calc(100dvh-3.5rem)] bg-gradient-to-b from-emerald-800 to-emerald-950 px-3 pb-6 pt-3">
        {error && <Notice>{error}</Notice>}
        {actionError && <Notice>{actionError}</Notice>}

        <div className="mb-2 flex flex-wrap justify-center gap-1.5">
          <Badge>{titleCase(session?.status ?? table.status)}</Badge>
          <Badge>Entry {points(table.room.entry_amount, currency)}</Badge>
          {session && <Badge>Pot {points(session.pot, currency)}</Badge>}
        </div>

        {/* Four seats around the felt; you are always shown at the bottom. */}
        <div className="relative mx-auto mb-3 h-44 max-w-sm rounded-[50%] border-4 border-amber-900/50 bg-emerald-700/60">
          <div className="absolute left-1/2 top-1 -translate-x-1/2"><SeatChip p={seat(((me?.seat ?? 1) + 1) % 4 + 1)} inGame={inGame} /></div>
          <div className="absolute left-1 top-1/2 -translate-y-1/2"><SeatChip p={seat((me?.seat ?? 1) % 4 + 1)} inGame={inGame} /></div>
          <div className="absolute right-1 top-1/2 -translate-y-1/2"><SeatChip p={seat(((me?.seat ?? 1) + 2) % 4 + 1)} inGame={inGame} /></div>
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2"><SeatChip p={seat(me?.seat ?? 1)} inGame={inGame} /></div>
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-0.5">
            <PlayingCard faceDown small />
            <PlayingCard faceDown small />
          </div>
        </div>

        {!inGame && me && (
          <div className="rounded-2xl bg-black/20 p-4 text-white">
            <p className="mb-3 text-sm text-white/80">{table.players.length}/4 seated. The deal starts when all four are ready.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={me.is_ready ? 'outline' : 'success'} className={me.is_ready ? 'border-white/40 text-white' : ''} onClick={() => act(() => api(`/tables/${table.id}/ready`, { method: 'POST', body: { ready: !me.is_ready } }))}>
                {me.is_ready ? 'Not ready' : "I'm ready"}
              </Button>
              <Button variant="danger" className="border-white/40 text-white" onClick={() => act(async () => { await api(`/tables/${table.id}/leave`, { method: 'POST' }); router.replace('/lobby/'); })}>
                Leave & refund
              </Button>
            </div>
          </div>
        )}

        {session?.status === 'ARRANGING' && session.my_cards && !session.my_submission && (
          <ArrangeHands sessionId={session.id} cards={session.my_cards} allowFoul={session.config.allow_foul_submission} onSubmitted={refresh} />
        )}

        {session?.my_submission && !session.arrangements && (
          <div className="rounded-2xl bg-black/20 p-4 text-center text-white">
            <p className="font-semibold">Arrangement submitted ✓</p>
            <p className="text-sm text-white/70">Waiting for the other players…</p>
          </div>
        )}

        {session?.arrangements && (
          <div className="space-y-2">
            {session.arrangements.map((a) => (
              <div key={a.user_id} className="rounded-xl bg-black/25 p-2 text-white">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold">{a.name}</span>
                  <span>
                    {a.is_foul && <Badge tone="error">Foul</Badge>} {a.is_auto && <Badge tone="warning">Auto</Badge>}
                  </span>
                </div>
                {(['front', 'middle', 'back'] as const).map((r) => (
                  <div key={r} className="mb-1 flex items-center gap-1">
                    {a[r].map((c) => <PlayingCard key={c} code={c} small />)}
                    <span className="ml-1 text-[10px] text-white/70">{a.labels[r]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {session?.status === 'CANCELLED' && <Notice tone="warning">Game cancelled ({session.cancel_reason}). Entries refunded.</Notice>}
      </div>

      {showResults && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/60" role="dialog" aria-label="Results">
          <div className="safe-bottom w-full rounded-t-3xl bg-white p-5 dark:bg-gray-900">
            <h2 className="mb-3 text-center text-xl font-bold text-gray-900 dark:text-white">Results</h2>
            {session!.results!.map((r) => (
              <div key={r.user_id} className="flex items-center justify-between border-b border-gray-100 py-2 dark:border-gray-800">
                <span className="text-sm text-gray-800 dark:text-gray-100">
                  #{r.placement} {r.name} {r.is_foul && <Badge tone="error">Foul</Badge>}
                </span>
                <span className="text-sm">
                  <strong className={r.score >= 0 ? 'text-success-700' : 'text-error-700'}>{r.score > 0 ? `+${r.score}` : r.score}</strong>{' '}
                  <span className="text-gray-500">{Number(r.net) >= 0 ? '+' : ''}{points(r.net, currency)}</span>
                </span>
              </div>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href={`/results/?id=${session!.id}`}><Button variant="outline" className="w-full">Details</Button></Link>
              <Button onClick={() => router.replace('/lobby/')}>Play again</Button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
