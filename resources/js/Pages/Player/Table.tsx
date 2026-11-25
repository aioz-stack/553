import { Link, router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import ArrangementBoard from '../../Components/Game/ArrangementBoard';
import RevealBoard from '../../Components/Game/RevealBoard';
import PageShell from '../../Components/PageShell';
import PlayingCard from '../../Components/PlayingCard';
import { Alert, Badge, Button, Card, Spinner } from '../../Components/ui';
import { api, errorMessage } from '../../lib/api';
import { points, titleCase } from '../../lib/format';
import type { SeatPlayer, SharedProps } from '../../lib/types';
import { useGameTable } from '../../lib/useGameTable';

function Seat({ player, seat, showSubmitted }: { player?: SeatPlayer; seat: number; showSubmitted: boolean }) {
  if (!player) {
    return (
      <div className="flex h-24 w-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/30 text-sm text-white/60">
        Seat {seat}
        <span className="text-xs">Waiting…</span>
      </div>
    );
  }

  return (
    <div className={`flex h-24 w-32 flex-col items-center justify-center rounded-xl border-2 bg-white/10 text-white ${player.is_you ? 'border-brand-300' : 'border-white/20'}`}>
      <span className="max-w-28 truncate text-sm font-semibold">{player.is_you ? 'You' : player.name}</span>
      <span className="text-xs text-white/70">Seat {player.seat}</span>
      <div className="mt-1 flex gap-1">
        {!player.is_connected && <span className="rounded-full bg-error-500 px-2 text-[10px]">offline</span>}
        {showSubmitted
          ? player.has_submitted && <span className="rounded-full bg-success-500 px-2 text-[10px]">submitted</span>
          : player.is_ready && <span className="rounded-full bg-success-500 px-2 text-[10px]">ready</span>}
      </div>
    </div>
  );
}

export default function Table({ tableId }: { tableId: number }) {
  const { auth } = usePage<SharedProps>().props;
  const { table, session, error, connected, refresh, secondsLeft } = useGameTable(tableId, auth.user?.id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!table) {
    return (
      <PageShell title="Game Table">
        {error ? <Alert>{error}</Alert> : <Spinner />}
      </PageShell>
    );
  }

  const me = table.players.find((p) => p.is_you);
  const inGame = !!session;
  const players: SeatPlayer[] = inGame ? session!.players : table.players;
  const bySeat = (seat: number) => players.find((p) => p.seat === seat);
  const currency = table.room.currency;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = () =>
    act(async () => {
      await api.post(`/tables/${tableId}/leave`);
      router.visit('/lobby');
    });

  const status = session?.status ?? table.status;

  return (
    <PageShell title={`${table.room.name} · Table #${table.id}`}>
      {error && <Alert>{error}</Alert>}
      {actionError && <Alert>{actionError}</Alert>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="brand">{titleCase(status)}</Badge>
        <Badge>{currency}</Badge>
        <Badge>Entry {points(table.room.entry_amount, currency)}</Badge>
        <Badge>{titleCase(table.room.payout_mode)}</Badge>
        <Badge tone={connected ? 'success' : 'warning'}>{connected ? 'Live' : 'Reconnecting…'}</Badge>
        {session?.status === 'ARRANGING' && (
          <span className={`ml-auto rounded-full px-4 py-1 text-lg font-bold ${secondsLeft <= 15 ? 'bg-error-500 text-white' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-white'}`}>
            ⏱ {secondsLeft}s
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2">
          {/* Poker-style table with four seats */}
          <div className="relative mx-auto flex aspect-square max-w-md items-center justify-center rounded-[40%] border-8 border-amber-900/60 bg-gradient-to-br from-emerald-700 to-emerald-900 p-4 shadow-theme-xl">
            <div className="absolute left-1/2 top-3 -translate-x-1/2">
              <Seat seat={1} player={bySeat(1)} showSubmitted={inGame} />
            </div>
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Seat seat={2} player={bySeat(2)} showSubmitted={inGame} />
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
              <Seat seat={3} player={bySeat(3)} showSubmitted={inGame} />
            </div>
            <div className="absolute left-3 top-1/2 -translate-y-1/2">
              <Seat seat={4} player={bySeat(4)} showSubmitted={inGame} />
            </div>
            <div className="text-center text-white/90">
              <div className="flex justify-center gap-1">
                <PlayingCard faceDown size="sm" />
                <PlayingCard faceDown size="sm" />
              </div>
              <p className="mt-2 text-sm">{inGame ? `Pot ${points(session!.pot, currency)}` : `${table.players.length}/4 seated`}</p>
            </div>
          </div>

          {!inGame && me && (
            <Card className="mt-6" title="Waiting room" subtitle="The game deals as soon as all four players are ready.">
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy} variant={me.is_ready ? 'outline' : 'success'} onClick={() => act(() => api.post(`/tables/${tableId}/ready`, { ready: !me.is_ready }))}>
                  {me.is_ready ? 'Not ready' : "I'm ready"}
                </Button>
                <Button disabled={busy} variant="danger" onClick={leave}>
                  Leave table (refund entry)
                </Button>
              </div>
              {table.status === 'READY' && !me.is_ready && (
                <p className="mt-3 text-sm text-warning-600">Table is full — get ready within {table.ready_timeout_seconds}s or you will be removed and refunded.</p>
              )}
            </Card>
          )}

          {session && (
            <Card className="mt-6" title="Fairness">
              <p className="break-all text-xs text-gray-500 dark:text-gray-400">
                Shuffle commitment: <code>{session.deck_commitment}</code>
              </p>
              {session.server_seed && (
                <p className="mt-2 break-all text-xs text-gray-500 dark:text-gray-400">
                  Revealed seed: <code>{session.server_seed}</code> — sha256(seed|deck) must equal the commitment.
                </p>
              )}
            </Card>
          )}
        </div>

        <div className="xl:col-span-3">
          {session?.status === 'ARRANGING' && session.my_cards && !session.my_submission && (
            <Card title="Arrange your hands" subtitle="Front 3 cards · Middle 5 · Back 5. Back ≥ Middle ≥ Front.">
              <ArrangementBoard sessionId={session.id} cards={session.my_cards} onSubmitted={refresh} disabled={secondsLeft === 0} />
            </Card>
          )}

          {session && session.my_submission && !session.arrangements && (
            <Card title="Arrangement submitted" subtitle="Waiting for the other players or the timer.">
              {(['front', 'middle', 'back'] as const).map((row) => (
                <div key={row} className="mb-2 flex items-center gap-3">
                  <span className="w-14 text-xs uppercase text-gray-500">{row}</span>
                  <div className="flex flex-wrap gap-1">
                    {session.my_submission![row].map((c) => (
                      <PlayingCard key={c} code={c} size="sm" />
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {session?.arrangements && (
            <Card
              title={session.status === 'COMPLETED' ? 'Results' : 'Reveal'}
              actions={
                session.status === 'COMPLETED' && (
                  <>
                    <Link href={`/games/${session.id}`} className="text-sm text-brand-500">
                      Full results
                    </Link>
                    <Button onClick={() => router.visit('/lobby')}>Back to lobby</Button>
                  </>
                )
              }
            >
              <RevealBoard arrangements={session.arrangements} results={session.results} currency={currency} />
            </Card>
          )}

          {session?.status === 'CANCELLED' && (
            <Alert tone="warning">
              This game was cancelled ({session.cancel_reason}). All entries were refunded. <Link href="/lobby">Back to lobby</Link>
            </Alert>
          )}

          {!session && (
            <Card title="How to play">
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600 dark:text-gray-400">
                <li>Each player gets 13 cards from a freshly shuffled 52-card deck.</li>
                <li>Arrange them into Front (3), Middle (5) and Back (5) before the timer runs out.</li>
                <li>Each hand is compared with the same hand of every opponent: +1 win, −1 loss, 0 tie.</li>
                <li>A misarranged hand can be submitted; it loses all three hands against every valid opponent (2× the bet against the banker).</li>
                <li>If time runs out, the server arranges your cards automatically.</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
