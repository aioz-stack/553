'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import ArrangeHands from '@/components/ArrangeHands';
import { BankerRoundSheet, BetPanel, MatchOverSheet, StandingsList } from '@/components/BankerView';
import { Avatar, Coin, Confetti, GameButton, GlassCard, Ribbon } from '@/components/game';
import { IconCrown } from '@/components/icons';
import PlayingCard from '@/components/PlayingCard';
import { Felt, PotDisplay, RevealedHand, Seat, TimerRing } from '@/components/TableView';
import { Notice, Screen, Spinner } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { points, titleCase, useQueryParam } from '@/lib/hooks';
import { play } from '@/lib/sound';
import { LUCKY_LABELS, type SeatPlayer } from '@/lib/types';
import { useSecondsLeft, useTable } from '@/lib/useTable';

/**
 * Portrait game table. Classic: waiting room → arrangement → reveal → results.
 * Banker modes (Round Bank / Banker Mode): 12 rounds of bet → arrange (or
 * declare Lucky) → reveal → settle, then the next round. All state comes from
 * the server (useTable); this file is presentation.
 */
export default function Play() {
  const { user } = useAuth();
  const router = useRouter();
  const tableParam = useQueryParam('table');
  const tableId = tableParam ? Number(tableParam) : null;
  const { table, session, error, live, refresh, clockOffset } = useTable(tableId, user?.id);
  const secondsLeft = useSecondsLeft(session?.status === 'ARRANGING' ? session.arrangement_deadline : null, clockOffset);
  const betSecondsLeft = useSecondsLeft(session?.status === 'BETTING' ? session.betting_deadline : null, clockOffset);
  const nextIn = useSecondsLeft(table?.next_round_at ?? null, clockOffset);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);
  const [showStandings, setShowStandings] = useState(false);
  const lastStatus = useRef<string | null>(null);

  // Sound cues on phase changes.
  useEffect(() => {
    const key = session ? `${session.id}:${session.status}` : null;
    if (!session || key === lastStatus.current) {
      return;
    }
    lastStatus.current = key;
    if (session.status === 'BETTING') play('start');
    if (session.status === 'ARRANGING') play('deal');
    if (session.status === 'COMPLETED') {
      const mine = session.results?.find((r) => r.user_id === user?.id);
      const good = mine ? (mine.role ? Number(mine.net) > 0 : mine.placement === 1) : false;
      play(mine?.lucky_type ? 'lucky' : good ? 'win' : 'lose');
    }
  }, [session, user?.id]);

  useEffect(() => {
    if (session?.status === 'ARRANGING' && secondsLeft > 0 && secondsLeft <= 5) play('tick');
  }, [secondsLeft, session?.status]);

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
      <Screen title="Table" back tabs={false} hud={false}>
        {error ? <Notice>{error}</Notice> : <div className="pt-24"><Spinner /></div>}
      </Screen>
    );
  }

  const banker = table.game_mode === 'round_bank' || table.game_mode === 'banker';
  const inGame = !!session && table.status !== 'WAITING_FOR_PLAYERS';
  const players: SeatPlayer[] = inGame && session!.players.length ? session!.players : table.players;
  const me = table.players.find((p) => p.is_you);
  const mySeat = me?.seat ?? 1;
  const seat = (offset: number) => players.find((p) => p.seat === ((mySeat - 1 + offset) % 4) + 1);
  const currency = table.room.currency;
  const results = session?.results ?? null;
  const byUser = (id?: number) => results?.find((r) => r.user_id === id);
  const arrangementOf = (id?: number) => session?.arrangements?.find((a) => a.user_id === id);
  const myResult = byUser(user?.id);
  const matchOver = banker && table.status === 'CLOSED';
  const showResults = session?.status === 'COMPLETED' && !!results && dismissedFor !== session.id && !matchOver;
  // Banker Mode: the table creator banks from round 1, so name them before the match starts.
  const bankerPlayer = banker
    ? (players.find((p) => p.is_banker) ?? table.players.find((p) => p.user_id === (table.banker_user_id ?? (table.game_mode === 'banker' ? table.creator_user_id : null))))
    : undefined;
  const iAmBanker = banker && session?.banker_user_id === user?.id;
  const iAmDealt = !!session?.my_cards;
  const phase = session?.status;

  const seatEl = (offset: number, position: 'top' | 'left' | 'right' | 'bottom') => {
    const p = seat(offset);
    return <Seat position={position} player={p} inGame={inGame} phase={phase} arrangement={position === 'bottom' ? undefined : arrangementOf(p?.user_id)} result={byUser(p?.user_id)} />;
  };

  return (
    <Screen
      title={table.room.name}
      back
      tabs={false}
      hud={false}
      action={
        <span className="flex items-center gap-1.5">
          {banker ? (
            <span className="rounded-full bg-black/40 px-2 py-0.5 font-display text-xs font-black text-gold-200">
              Round {session?.round_number ?? Math.max(1, table.rounds_played ?? 0)}/{table.rounds_total}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/40 py-0.5 pl-0.5 pr-2 font-display text-xs font-black text-gold-200">
              <Coin currency={currency} size={18} />
              {points(table.room.entry_amount)}
            </span>
          )}
          <span className={`h-2.5 w-2.5 rounded-full ${live ? 'bg-mint-400 shadow-[0_0_8px_#45e0a5]' : 'animate-pulse bg-gold-400'}`} title={live ? 'Live' : 'Syncing'} />
        </span>
      }
    >
      {error && <Notice>{error}</Notice>}
      {actionError && <Notice>{actionError}</Notice>}

      {banker && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500/80 to-red-600/80 px-3 py-1.5 shadow-lg">
          <IconCrown className="h-5 w-5 text-gold-200" />
          <span className="min-w-0 flex-1 truncate font-display text-sm font-black">
            {table.game_mode === 'banker' ? 'Banker Mode' : 'Round Bank'} · Banker: {bankerPlayer ? (bankerPlayer.is_you ? 'You' : bankerPlayer.name) : 'assigned at start'}
          </span>
          {(table.my_banker_rounds_left ?? 0) > 0 && <span className="rounded-full bg-black/35 px-2 font-display text-[11px] font-black">You bank {table.my_banker_rounds_left} more</span>}
        </div>
      )}

      {/* Felt with four seats */}
      <Felt>
        <div className="grid grid-cols-3 grid-rows-[auto_auto_auto] items-center gap-y-1">
          <div />
          <div className="flex justify-center">{seatEl(2, 'top')}</div>
          <div />

          <div className="flex justify-center">{seatEl(1, 'left')}</div>
          <div className="flex flex-col items-center gap-1">
            {phase === 'ARRANGING' ? (
              <TimerRing seconds={secondsLeft} total={session!.config.arrangement_seconds ?? 90} />
            ) : phase === 'BETTING' ? (
              <TimerRing seconds={betSecondsLeft} total={session!.config.betting_seconds ?? 15} />
            ) : (
              <div className="flex -space-x-3">
                <PlayingCard faceDown size="xs" className="-rotate-12" />
                <PlayingCard faceDown size="xs" />
                <PlayingCard faceDown size="xs" className="rotate-12" />
              </div>
            )}
            {inGame ? <PotDisplay pot={session!.pot} currency={currency} /> : <span className="rounded-full bg-black/40 px-2 font-display text-xs font-black text-white">{table.players.length}/4</span>}
          </div>
          <div className="flex justify-center">{seatEl(3, 'right')}</div>

          <div />
          <div className="flex justify-center pt-1">{seatEl(0, 'bottom')}</div>
          <div />
        </div>
        <p className="relative mt-2 text-center font-display text-[11px] font-extrabold uppercase tracking-wider text-white/70">
          {phase === 'BETTING' ? 'Place your bets' : titleCase(session?.status ?? table.status)} · {banker ? `${table.rounds_total} rounds` : titleCase(table.room.payout_mode)}
        </p>
      </Felt>

      <div className="safe-bottom mt-4 pb-6">
        {/* Waiting room */}
        {!inGame && me && table.status !== 'CLOSED' && (
          <div className="glass rounded-3xl p-4 text-center">
            <Ribbon tone="blue">Waiting Room</Ribbon>
            <p className="my-3 text-sm text-white/75">
              {banker
                ? table.players.length < (table.min_players ?? 2)
                  ? `Need at least ${table.min_players ?? 2} players. Invite friends from the home screen!`
                  : 'Ready up! The match starts when everyone seated is ready (up to 4 can join, even mid-match).'
                : table.players.length < 4
                  ? `Waiting for ${4 - table.players.length} more player${4 - table.players.length === 1 ? '' : 's'}…`
                  : 'Table full! The deal starts when everyone is ready.'}
            </p>
            {table.room.invite_code && (
              <p className="mb-3 text-xs text-white/70">
                Room #{table.room.id} · invite code <span className="font-display font-black text-gold-200">{table.room.invite_code}</span>
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <GameButton tone={me.is_ready ? 'glass' : 'green'} size="lg" onClick={() => act(() => api(`/tables/${table.id}/ready`, { method: 'POST', body: { ready: !me.is_ready } }))}>
                {me.is_ready ? 'NOT READY' : 'READY!'}
              </GameButton>
              <GameButton tone="red" size="lg" onClick={() => act(async () => { await api(`/tables/${table.id}/leave`, { method: 'POST' }); router.replace('/lobby/'); })}>
                LEAVE
              </GameButton>
            </div>
            <p className="mt-3 text-[11px] text-white/50">{banker ? 'Money only moves when you bet each round.' : 'Leaving before the deal refunds your entry.'}</p>
          </div>
        )}

        {/* Banker modes: betting */}
        {banker && phase === 'BETTING' && (
          <>
            {session!.can_bet && <BetPanel session={session!} secondsLeft={betSecondsLeft} onDone={refresh} />}
            {!session!.can_bet && session!.my_bet && (
              <div className="glass rounded-3xl p-4 text-center">
                <p className="font-display text-lg font-black text-mint-400">Bet placed: {points(session!.my_bet)} {currency}</p>
                <p className="text-sm text-white/70">Cards are dealt when everyone has bet or in {betSecondsLeft}s.</p>
              </div>
            )}
            {iAmBanker && (
              <div className="glass rounded-3xl p-4 text-center">
                <Ribbon tone="gold">You are the banker</Ribbon>
                <p className="mt-2 text-sm text-white/75">Each bet reserves 2× cover from your balance. Waiting for bets… {betSecondsLeft}s</p>
              </div>
            )}
            {!session!.can_bet && !session!.my_bet && !iAmBanker && <Notice tone="info">You sit out this round and will be dealt in next round.</Notice>}
          </>
        )}

        {/* Arranging */}
        {phase === 'ARRANGING' && session!.my_cards && !session!.my_submission && (
          <ArrangeHands sessionId={session!.id} cards={session!.my_cards} allowFoul={session!.config.allow_foul_submission} onSubmitted={refresh} lucky={session!.my_lucky} />
        )}
        {banker && phase === 'ARRANGING' && !iAmDealt && <Notice tone="info">This round is in progress — you will be dealt in next round.</Notice>}

        {session?.my_submission && !session.arrangements && (
          <div className="glass rounded-3xl p-5 text-center">
            <p className="font-display text-xl font-black text-mint-400">{session.my_submission.lucky_type ? `LUCKY: ${LUCKY_LABELS[session.my_submission.lucky_type]}!` : 'Hand locked in!'}</p>
            <p className="mt-1 text-sm text-white/70">Waiting for the others…</p>
            <div className="mt-3 space-y-1">
              {(['front', 'middle', 'back'] as const).map((r) => (
                <div key={r} className="flex justify-center gap-1">
                  {session.my_submission![r].map((c) => (
                    <PlayingCard key={c} code={c} size="sm" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reveal */}
        {session?.arrangements && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Ribbon tone="gold">Showdown</Ribbon>
              {session.status === 'COMPLETED' && dismissedFor === session.id && !matchOver && (
                <button onClick={() => setDismissedFor(null)} className="font-display text-sm font-extrabold text-gold-300">
                  Results ›
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {session.arrangements.map((a) => (
                <RevealedHand key={a.user_id} a={a} result={byUser(a.user_id)} currency={currency} />
              ))}
            </div>
            {banker && session.status === 'COMPLETED' && !matchOver && (
              <p className="mt-3 text-center font-display text-sm font-black text-gold-200">{nextIn > 0 ? `Next round in ${nextIn}s` : 'Dealing next round…'}</p>
            )}
          </div>
        )}

        {session?.status === 'CANCELLED' && <Notice tone="warning">Round cancelled ({session.cancel_reason?.replace(/_/g, ' ')}). Reserved amounts were refunded.</Notice>}

        {/* Match standings */}
        {banker && !!table.standings?.length && !matchOver && (
          <GlassCard
            className="mt-4"
            title={<Ribbon tone="blue">Standings</Ribbon>}
            action={
              <button className="font-display text-xs font-black text-gold-300" onClick={() => setShowStandings(!showStandings)}>
                {showStandings ? 'Hide' : 'Show'}
              </button>
            }
          >
            {showStandings ? <StandingsList standings={table.standings} userId={user?.id} currency={currency} /> : <p className="text-xs text-white/60">{table.rounds_played}/{table.rounds_total} rounds played</p>}
          </GlassCard>
        )}

        {banker && inGame && me && !matchOver && (phase === 'COMPLETED' || phase === 'CANCELLED') && (
          <GameButton tone="red" size="md" className="mt-4 w-full" onClick={() => act(async () => { await api(`/tables/${table.id}/leave`, { method: 'POST' }); router.replace('/lobby/'); })}>
            LEAVE BETWEEN ROUNDS
          </GameButton>
        )}
      </div>

      {/* Banker round results */}
      {showResults && banker && <BankerRoundSheet session={session!} userId={user?.id} nextIn={(table.rounds_played ?? 0) < (table.rounds_total ?? 1) ? nextIn : null} onClose={() => setDismissedFor(session!.id)} />}

      {/* Final scoreboard */}
      {matchOver && (
        <MatchOverSheet standings={table.standings ?? []} userId={user?.id} currency={currency} reason={table.end_reason} roundsPlayed={table.rounds_played ?? 0} onLobby={() => router.replace('/lobby/')} />
      )}

      {/* Classic results sheet */}
      {showResults && !banker && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/70 backdrop-blur-sm" role="dialog" aria-label="Results">
          {myResult?.placement === 1 && <Confetti />}
          <div className="safe-bottom animate-pop w-full rounded-t-[2rem] border-t-4 border-gold-400 bg-gradient-to-b from-night-700 to-night-950 px-5 pt-6">
            <div className="-mt-12 mb-2 text-center">
              <span className="inline-block -rotate-3 rounded-2xl bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 px-6 py-2 font-display text-3xl font-black text-night-900 shadow-[0_6px_0_#9a5b03,0_12px_24px_rgb(0_0_0/0.5)]">
                {myResult?.placement === 1 ? 'YOU WIN!' : myResult ? `#${myResult.placement} PLACE` : 'RESULTS'}
              </span>
            </div>
            {myResult && (
              <p className={`mb-3 text-center font-display text-2xl font-black ${Number(myResult.net) >= 0 ? 'text-mint-400' : 'text-candy-400'}`}>
                {Number(myResult.net) >= 0 ? '+' : ''}
                {points(myResult.net, currency)}
              </p>
            )}
            <ul className="space-y-1.5">
              {results!.map((r) => (
                <li key={r.user_id} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${r.user_id === user?.id ? 'bg-gold-400/20 ring-2 ring-gold-400/60' : 'bg-white/8'}`}>
                  <span className="w-6 text-center font-display text-lg font-black text-gold-300">{r.placement === 1 ? '👑' : r.placement}</span>
                  <Avatar name={r.name} size={34} />
                  <span className="flex-1 truncate font-bold">
                    {r.name} {r.is_foul && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-black">FOUL</span>}
                  </span>
                  <span className="text-right">
                    <span className={`block font-display text-sm font-black ${r.score >= 0 ? 'text-mint-400' : 'text-candy-400'}`}>{r.score > 0 ? `+${r.score}` : r.score} pts</span>
                    <span className="block text-[11px] text-white/60">{Number(r.net) >= 0 ? '+' : ''}{points(r.net)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid grid-cols-3 gap-2 pb-2">
              <GameButton tone="glass" size="md" onClick={() => setDismissedFor(session!.id)}>
                View
              </GameButton>
              <Link href={`/results/?id=${session!.id}`} className="contents">
                <GameButton tone="purple" size="md">Details</GameButton>
              </Link>
              <GameButton tone="gold" size="md" onClick={() => router.replace('/lobby/')}>
                AGAIN
              </GameButton>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}
