'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import ArrangeHands from '@/components/ArrangeHands';
import { Avatar, Confetti, GameButton, GlassCard, Ribbon } from '@/components/game';
import PlayingCard from '@/components/PlayingCard';
import { Notice, Screen, Spinner } from '@/components/ui';
import { api, ApiError, errorText, idempotencyKey } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PICKER_URL, saveSelection, selectionFromUrl, type SinglePlayerSelection } from '@/lib/singlePlayer';
import { play } from '@/lib/sound';

type Lane = 'front' | 'middle' | 'back';

export interface PracticePlayer {
  seat: number;
  name: string;
  is_you: boolean;
  front?: string[];
  middle?: string[];
  back?: string[];
  labels?: Record<Lane, string>;
  is_foul?: boolean;
  score?: number;
  placement?: number;
  vs_you?: Record<Lane, number> | null;
  stake_result?: number;
}

export interface PracticeState {
  id: number;
  status: 'arranging' | 'completed' | 'abandoned';
  tier: { key: string; name: string };
  bet: number;
  cards: string[];
  players: PracticePlayer[];
  deck_commitment: string;
  server_seed: string | null;
  allow_foul: boolean;
}

const LANES: Lane[] = ['front', 'middle', 'back'];

function Outcome({ v }: { v: number }) {
  const [txt, cls] = v > 0 ? ['WIN', 'bg-mint-500 text-white'] : v < 0 ? ['LOSS', 'bg-candy-500 text-white'] : ['TIE', 'bg-white/25 text-white'];
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${cls}`}>{txt}</span>;
}

/**
 * Single Player: you against three server bots. Free play — no coins or
 * diamonds move. The server deals, arranges the bots, validates your hand
 * and scores the round; this screen only displays what it returns.
 */
export default function Practice() {
  const { user } = useAuth();
  const router = useRouter();
  const [game, setGame] = useState<PracticeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<SinglePlayerSelection | null>(null);
  const inFlight = useRef(false);
  // One id per deal: a retry after a network failure reuses it, so the server
  // returns the deal it may already have made instead of starting another.
  const requestId = useRef<string | null>(null);

  const deal = useCallback(async (selection: SinglePlayerSelection, fresh: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    if (fresh || !requestId.current) requestId.current = idempotencyKey();
    setBusy(true);
    setError(null);
    setErrorCode(undefined);
    try {
      const r = await api<{ data: PracticeState }>('/practice', { method: 'POST', body: { tier: selection.tier, ...(selection.bet ? { bet: selection.bet } : {}), request_id: requestId.current } });
      play('deal');
      setGame(r.data);
    } catch (e) {
      setError(errorText(e));
      setErrorCode(e instanceof ApiError ? e.code ?? (e.status === 422 ? 'invalid_selection' : undefined) : undefined);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const started = useRef(false);
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    const s = selectionFromUrl(window.location.search);
    if (!s) {
      // No level chosen yet: open the picker instead of dealing.
      router.replace(PICKER_URL);
      return;
    }
    saveSelection(s);
    setSel(s);
    deal(s, true);
  }, [user, deal, router]);

  const changeLevel = () => router.replace(PICKER_URL);
  const selectionProblem = errorCode === 'insufficient_gold' || errorCode === 'invalid_tier' || errorCode === 'invalid_bet' || errorCode === 'invalid_selection';

  const done = game?.status === 'completed';
  const me = game?.players.find((p) => p.is_you);
  const bots = game?.players.filter((p) => !p.is_you) ?? [];
  const ranked = done ? [...(game?.players ?? [])].sort((a, b) => (a.placement ?? 0) - (b.placement ?? 0) || a.seat - b.seat) : [];

  return (
    <Screen title="Single Player" back>
      {error && (
        <>
          <Notice>{error}</Notice>
          <div className="grid grid-cols-2 gap-2">
            <GameButton tone="glass" size="lg" onClick={changeLevel}>
              CHANGE LEVEL
            </GameButton>
            {!selectionProblem && sel && (
              <GameButton tone="gold" size="lg" onClick={() => deal(sel, false)} disabled={busy}>
                TRY AGAIN
              </GameButton>
            )}
          </div>
        </>
      )}
      {!game && !error && <Spinner />}

      {game && (
        <>
          <div className="mb-2 flex items-center justify-between rounded-2xl bg-white/8 px-3 py-2" aria-label="Selected level">
            <span className="font-display text-sm font-extrabold text-gold-300">{game.tier.name}</span>
            <span className="text-xs font-bold text-white/80">Bet {game.bet.toLocaleString('en-US')}</span>
            {!done && (
              <button type="button" onClick={changeLevel} className="text-xs font-bold text-white/60 underline">
                Change level
              </button>
            )}
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2" aria-label="Opponents">
            {bots.map((b) => (
              <div key={b.seat} className="glass flex flex-col items-center rounded-2xl px-2 py-2">
                <Avatar name={b.name} size={40} />
                <span className="mt-1 font-display text-xs font-extrabold">{b.name}</span>
                <span className="text-[10px] font-bold text-mint-400">{done ? `${(b.score ?? 0) > 0 ? '+' : ''}${b.score} pts` : 'Ready ✓'}</span>
              </div>
            ))}
          </div>

          {!done && (
            <>
              <p className="mb-2 text-center text-xs text-white/60">Practice round · no coins or diamonds are used. Beat the bots lane by lane.</p>
              <ArrangeHands
                key={game.id}
                sessionId={game.id}
                basePath={`/practice/${game.id}`}
                cards={game.cards}
                allowFoul={game.allow_foul}
                onSubmitted={(res) => {
                  const next = (res as { data?: PracticeState } | undefined)?.data;
                  if (next) {
                    if (next.players.find((p) => p.is_you)?.placement === 1) play('win');
                    setGame(next);
                  }
                }}
              />
            </>
          )}

          {done && me && (
            <div role="dialog" aria-label="Practice results">
              {me.placement === 1 && <Confetti />}
              <div className="mb-3 text-center">
                <span className="inline-block -rotate-3 rounded-2xl bg-gradient-to-b from-gold-200 via-gold-400 to-gold-600 px-6 py-2 font-display text-3xl font-black text-night-900 shadow-[0_6px_0_#9a5b03,0_12px_24px_rgb(0_0_0/0.5)]">
                  {me.placement === 1 ? 'YOU WIN!' : `#${me.placement} PLACE`}
                </span>
                <p className="mt-2 text-sm font-bold text-white/85">
                  Bet result{' '}
                  <span className={(me.stake_result ?? 0) >= 0 ? 'text-mint-400' : 'text-candy-400'}>
                    {(me.stake_result ?? 0) > 0 ? '+' : ''}
                    {(me.stake_result ?? 0).toLocaleString('en-US')}
                  </span>{' '}
                  <span className="text-xs text-white/55">(practice — no coins are charged)</span>
                </p>
              </div>

              <GlassCard title={<Ribbon tone="gold">Scoreboard</Ribbon>}>
                <ul className="space-y-1.5">
                  {ranked.map((p) => (
                    <li key={p.seat} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${p.is_you ? 'bg-gold-400/20 ring-2 ring-gold-400/60' : 'bg-white/8'}`}>
                      <span className="w-6 text-center font-display text-lg font-black text-gold-300">{p.placement === 1 ? '👑' : p.placement}</span>
                      <Avatar name={p.is_you ? (user?.display_name ?? user?.name ?? 'You') : p.name} size={32} />
                      <span className="flex-1 truncate font-bold">
                        {p.name} {p.is_foul && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-black">FOUL</span>}
                      </span>
                      <span className={`font-display text-sm font-black ${(p.score ?? 0) >= 0 ? 'text-mint-400' : 'text-candy-400'}`}>
                        {(p.score ?? 0) > 0 ? '+' : ''}
                        {p.score} pts
                      </span>
                    </li>
                  ))}
                </ul>
              </GlassCard>

              <div className="space-y-2">
                {[me, ...bots].map((p) => (
                  <div key={p.seat} className={`glass rounded-2xl p-3 ${p.is_you ? 'ring-2 ring-gold-400/60' : ''}`}>
                    <p className="mb-1 font-display text-sm font-extrabold">{p.is_you ? 'Your hand' : p.name}</p>
                    {LANES.map((lane) => (
                      <div key={lane} className="mb-1 flex items-center gap-2">
                        <span className="w-12 text-[10px] font-bold uppercase text-white/60">{lane}</span>
                        <span className="flex gap-0.5">
                          {p[lane]?.map((c) => (
                            <PlayingCard key={c} code={c} size="xs" />
                          ))}
                        </span>
                        <span className="ml-auto flex items-center gap-1 text-right text-[10px] text-white/75">
                          {p.labels?.[lane]}
                          {!p.is_you && p.vs_you && <Outcome v={p.vs_you[lane]} />}
                        </span>
                      </div>
                    ))}
                    {!p.is_you && p.vs_you && <p className="text-right text-[10px] text-white/50">WIN/LOSS = your lane against {p.name}</p>}
                  </div>
                ))}
              </div>

              <GlassCard className="mt-3" title="Verify the shuffle">
                <p className="break-all text-[11px] text-white/60">Commitment {game.deck_commitment}</p>
                <p className="mt-1 break-all text-[11px] text-white/60">Seed {game.server_seed}</p>
              </GlassCard>

              <div className="safe-bottom mt-3 grid grid-cols-2 gap-2 pb-2">
                <GameButton tone="glass" size="lg" onClick={() => router.replace('/home/')}>
                  HOME
                </GameButton>
                <GameButton tone="gold" size="lg" onClick={() => sel && deal(sel, true)} disabled={busy || !sel}>
                  {busy ? 'DEALING…' : 'PLAY AGAIN'}
                </GameButton>
              </div>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
