'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import LandscapeStage from '@/components/LandscapeStage';
import { Avatar, ChipIcon } from '@/components/game';
import LuckPopup, { dealtRows, type Rows } from '@/components/table/LuckPopup';
import { Chip, LanternRoom, MiniCrest, PokerTable } from '@/components/table/TableArt';
import { BankerRibbon, HandPanel, TableCrest, type Spot } from '@/components/table/TableLayout';
import { api, errorText } from '@/lib/api';
import { savePrefs } from '@/lib/prefs';
import { play, useSound } from '@/lib/sound';
import { useLandscapeLock } from '@/lib/useLandscapeLock';
import { LUCKY_LABELS, type SeatPlayer, type SessionState, type TableState } from '@/lib/types';

/**
 * Multiplayer in-game table (landscape, 1600×900 stage) for lobby matches — the same table as
 * Single Player, driven entirely by the server (useTable: REST + Reverb `table.{id}` events):
 *
 *  - 12 rounds; "Round X / 12 · NAME banks" and the banker badge follow the server's rotation
 *    (clockwise; players below the banker reserve are skipped — shown as "Can't bank");
 *  - betting with the room's chips only (5 / 10 / 15 % of the Minimum Entry, 1:1) — the server
 *    validates every bet; the banker places none and covers the others;
 *  - arranging in the shared arrangement pop-up (live lane labels from /games/{id}/preview), then
 *    the server reveals, compares every lane with the banker's, settles Chips and starts the next
 *    round; after round 12 the final standings.
 * Seats are drawn clockwise from you: you at the bottom, then left, top, right. Nothing here
 * decides a banker, a bet, a score or a payout.
 */

const CHIP_COLORS = ['#1f6fe0', '#14a046', '#e0262f'];

/** Other seats, clockwise from you: left, top, right (TableLayout positions). */
const SPOT_ORDER: Spot[] = ['left', 'top', 'right'];

const num = (v: string | number | null | undefined) => Number(v ?? 0);
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? 'text-[#7dffa0]' : n < 0 ? 'text-[#ff9aa8]' : 'text-white');
const END_REASON: Record<string, string> = {
  completed: 'All 12 rounds played',
  not_enough_players: 'Not enough players left',
  not_enough_eligible_players: 'Not enough players with Chips to play',
  no_eligible_banker: 'Nobody held enough Chips to be the banker (6× the maximum bet) in time',
};

function RoundButton({ label, onClick, children, x }: { label: string; onClick: () => void; children: ReactNode; x: number }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ left: x }}
      className="lx-tile absolute top-[18px] z-20 flex h-[76px] w-[76px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b from-[#b3141b] to-[#5a0609] text-[#ffd34d] shadow-[0_6px_0_#3a0204,inset_0_3px_0_rgb(255_255_255/0.25)]"
    >
      {children}
    </button>
  );
}

/** Lucky Hand / Misplaced tags under a revealed hand. */
function HandBadges({ lucky, foul }: { lucky?: string | null; foul?: boolean }) {
  if (!lucky && !foul) return null;
  return (
    <span className="flex gap-2">
      {lucky && <span className="rounded-full bg-gradient-to-b from-[#a24dff] to-[#4a0f9a] px-3 font-display text-[15px] font-black text-[#ffe14d]">LUCKY · {LUCKY_LABELS[lucky] ?? lucky}</span>}
      {foul && <span className="rounded-full bg-[#d81e3c] px-3 font-display text-[15px] font-black text-white">MISPLACED</span>}
    </span>
  );
}

export interface MultiplayerTableProps {
  table: TableState;
  session: SessionState | undefined;
  userId: number | undefined;
  /** Your Chips balance (useBalance), display only. */
  chips: string | undefined;
  live: boolean;
  betSecondsLeft: number;
  arrangeSecondsLeft: number;
  nextIn: number;
  refresh: () => Promise<unknown> | void;
  onLeave: () => Promise<void>;
  onLobby: () => void;
}

export default function MultiplayerTable({ table, session, userId, chips, live, betSecondsLeft, arrangeSecondsLeft, nextIn, refresh, onLeave, onLobby }: MultiplayerTableProps) {
  useLandscapeLock();
  const [soundOn] = useSound();
  const [busy, setBusy] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [panel, setPanel] = useState<'settings' | 'help' | 'leave' | null>(null);
  // The entry cover plays once per table in this app session (never again on a remount or refresh).
  const [entered, setEntered] = useState(() => {
    try {
      return sessionStorage.getItem(`pusoy.entered.${table.id}`) === '1';
    } catch {
      return false;
    }
  });
  const pendingBet = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Save your arrangement on the server as you move cards (shortly after the last move). If you go
   * offline or the timer runs out, the server submits this saved arrangement for you.
   */
  const pendingDraft = useRef<{ id: number; rows: Rows } | null>(null);
  const flushDraft = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    const d = pendingDraft.current;
    pendingDraft.current = null;
    if (d) api(`/games/${d.id}/draft`, { method: 'PUT', body: d.rows }).catch(() => undefined);
  };
  const saveDraft = (rows: Rows) => {
    if (!session) return;
    pendingDraft.current = { id: session.id, rows };
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(flushDraft, 400);
  };
  // Going to the background (switching apps, locking the phone, closing the tab): save right away.
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && flushDraft();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flushDraft);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', flushDraft);
      flushDraft();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Entry transition: a short cover while the first state arrives (never longer than ~1.5 s).
  useEffect(() => {
    if (entered) return undefined;
    try {
      sessionStorage.setItem(`pusoy.entered.${table.id}`, '1');
    } catch {
      // no storage: the cover simply plays again next time
    }
    if (!session && table.status === 'IN_GAME') {
      const t = setTimeout(() => setEntered(true), 1500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setEntered(true), 350);
    return () => clearTimeout(t);
  }, [session, table.status, entered, table.id]);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const players = session?.players.length ? session.players : table.players;
  const me = table.players.find((p) => p.is_you);
  const mySeat = me?.seat ?? 1;
  // Clockwise from you: the next seat number sits on your left, then the top, then your right.
  const around = [1, 2, 3].map((o) => {
    const seatNo = ((mySeat - 1 + o) % 4) + 1;
    // This round's data (bets, ready marks) comes from the round; empty / sitting-out seats from the table.
    return players.find((p) => p.seat === seatNo) ?? table.players.find((p) => p.seat === seatNo);
  });

  const phase = session?.status ?? (table.status === 'CLOSED' ? 'CLOSED' : 'STARTING');
  const bankerId = session?.banker_user_id ?? table.banker_user_id ?? null;
  const banker = table.players.find((p) => p.user_id === bankerId) ?? players.find((p) => p.user_id === bankerId);
  const iBank = !!userId && bankerId === userId;
  const round = session?.round_number ?? Math.max(1, table.rounds_played ?? 1);
  const total = table.rounds_total ?? session?.config.rounds_total ?? 12;
  // The only bets of this game: its entry tier's chips (100 → 5/10/15 · 500 → 20/30/40 · 1,000 →
  // 50/75/100), from the round's server config. No other amount can be entered; the server rejects it.
  const chipsList = (session?.config.bet_chips ?? table.room.bet_chips ?? []).map(num);
  // A bet needs 2× its amount in your Chips (it is held while the round is played).
  const myChips = chips !== undefined ? num(chips) : undefined;
  const canCover = (c: number) => myChips === undefined || myChips >= c * 2;
  const affordable = chipsList.filter(canCover);
  const minEntry = num(session?.config.min_entry ?? table.room.min_entry);
  const results = session?.results ?? null;
  const resultOf = (id?: number) => results?.find((r) => r.user_id === id);
  const arrangementOf = (id?: number) => session?.arrangements?.find((a) => a.user_id === id);
  const myResult = resultOf(userId);
  const cantBank = useMemo(() => new Set((session?.banker_selection?.checks ?? []).filter((c) => !c.eligible).map((c) => c.user_id)), [session?.banker_selection]);
  const standingOf = (id?: number) => table.standings?.find((s) => s.user_id === id);
  const matchOver = table.status === 'CLOSED';
  const revealed = !!session?.arrangements && (phase === 'REVEALING' || phase === 'SCORING' || phase === 'COMPLETED');
  const covering = iBank ? players.reduce((sum, p) => sum + num(p.bet), 0) : 0;

  const status = (p?: SeatPlayer): ReactNode => {
    if (!p || !session) {
      const st = standingOf(p?.user_id);
      return st ? <span className={tone(num(st.net))}>{signed(num(st.net))}</span> : null;
    }
    if (revealed) {
      const r = resultOf(p.user_id);
      return r ? <span className={tone(num(r.net))}>{signed(num(r.net))}</span> : null;
    }
    if (phase === 'BETTING') {
      if (p.user_id === bankerId) return <span className="text-[#9fe0ff]">Covering bets</span>;
      return p.bet ? <span className="text-[#7dffa0]">Bet {fmt(num(p.bet))}</span> : <span className="text-white/80">Betting…</span>;
    }
    if (phase === 'ARRANGING' || phase === 'SUBMITTED') {
      return p.has_submitted ? <span className="text-[#7dffa0]">✓ Ready</span> : <span className="text-white/80">Arranging…</span>;
    }
    const st = standingOf(p.user_id);
    return st ? <span className={tone(num(st.net))}>{signed(num(st.net))}</span> : null;
  };

  const bet = async (amount: number) => {
    if (!session || busy || pendingBet.current) return;
    pendingBet.current = true;
    setBusy(true);
    play('chip');
    try {
      await api(`/games/${session.id}/bet`, { method: 'POST', body: { amount: amount.toFixed(2) } });
      window.dispatchEvent(new Event('pusoy:wallet')); // the bet reserves 2× from your Chips
      await refresh();
    } catch (e) {
      play('lose');
      setToast({ ok: false, text: errorText(e) });
    } finally {
      pendingBet.current = false;
      setBusy(false);
    }
  };

  const submit = async (rows: Rows) => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await api(`/games/${session.id}/submit`, { method: 'POST', body: rows });
      play('deal');
      await refresh();
    } catch (e) {
      play('lose');
      setToast({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const declare = async () => {
    if (!session || declaring) return;
    setDeclaring(true);
    try {
      await api(`/games/${session.id}/lucky`, { method: 'POST' });
      play('lucky');
      setToast({ ok: true, text: 'Declared Luck!' });
      await refresh();
    } catch (e) {
      setToast({ ok: false, text: errorText(e) });
    } finally {
      setDeclaring(false);
    }
  };

  const arranging = phase === 'ARRANGING' && !!session?.my_cards && !session.my_submission;
  const leaveAllowed = !session || ['COMPLETED', 'CANCELLED'].includes(phase) || matchOver;
  const bankerName = banker ? (banker.is_you ? 'You' : banker.name) : '…';

  return (
    <LandscapeStage background={<LanternRoom className="h-full w-full" />}>
      <PokerTable />

      {/* Top-left controls + crest */}
      <RoundButton label="Back" x={20} onClick={() => setPanel('leave')}>
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
          <path d="M24 9 L12 20 L24 31 M12 20 H32" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </RoundButton>
      <RoundButton label="Settings" x={108} onClick={() => setPanel('settings')}>
        <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
          <g fill="currentColor">
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={i} x="17" y="3" width="6" height="9" rx="2" transform={`rotate(${i * 45} 20 20)`} />
            ))}
            <circle cx="20" cy="20" r="11" />
          </g>
          <circle cx="20" cy="20" r="5" fill="#7a0a0e" />
        </svg>
      </RoundButton>
      <RoundButton label="How to play" x={196} onClick={() => setPanel('help')}>
        <span className="font-display text-[44px] font-black leading-none">?</span>
      </RoundButton>
      <div className="pointer-events-none absolute left-[290px] top-[4px] z-20">
        <MiniCrest />
      </div>

      {/* Your Chips wallet (server balance; display only) */}
      <div className="lx-gold absolute right-[365px] top-[12px] z-20 w-[330px] rounded-[26px] p-[4px] shadow-[0_6px_0_#7a3e00]" role="group" aria-label="Chips wallet">
        <div className="flex h-[68px] items-center gap-2 rounded-[22px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-3">
          <ChipIcon size={50} />
          <span className="font-display text-[16px] font-black uppercase tracking-wide text-[#ffe14d]">Total Chips</span>
          <span className="ml-auto font-display text-[34px] font-black tabular-nums text-white drop-shadow-[0_2px_0_rgb(0_0_0/0.5)]" aria-label="Your Chips">
            {chips !== undefined ? fmt(Math.floor(num(chips))) : '…'}
          </span>
        </div>
      </div>

      {/* Bet pill + round / banker + room */}
      <div className="lx-gold absolute right-[20px] top-[18px] z-20 h-[76px] w-[330px] rounded-[24px] p-[5px] shadow-[0_6px_0_#7a3e00]">
        <div className="flex h-full items-center gap-2 rounded-[19px] bg-gradient-to-b from-[#b3141b] to-[#5a0609] px-3">
          <ChipIcon size={50} />
          <span className="flex-1 truncate text-center font-display text-[28px] font-black text-white drop-shadow-[0_2px_0_#3a0204]" aria-label="Current bet">
            {iBank ? (covering > 0 ? `Covering ${fmt(covering)}` : 'Banker · no bet') : session?.my_bet ? `Bet: ${fmt(num(session.my_bet))} Chips` : 'Bet: —'}
          </span>
        </div>
      </div>
      {/* No eligible banker: the match is paused until a player holds 6× the maximum bet. */}
      {table.paused && table.status === 'IN_GAME' && (
        <div role="alert" className="absolute left-1/2 top-[190px] z-30 w-[820px] -translate-x-1/2 rounded-[26px] border-4 border-[#ffd34d] bg-[#2a1402]/95 px-8 py-4 text-center shadow-[0_10px_30px_rgb(0_0_0/0.5)]">
          <p className="font-display text-[32px] font-black text-[#ffe14d]">Game paused — no eligible banker</p>
          <p className="mt-1 text-[21px] font-bold text-white/85">{table.paused.message}</p>
        </div>
      )}
      <div className="absolute right-[22px] top-[100px] z-20 flex flex-col items-end gap-1 font-display font-black">
        <span className="rounded-full bg-black/55 px-4 py-1 text-[22px] text-white" aria-label="Round">
          Round {Math.min(round, total)} / {total} · <span className="text-[#ffe14d]">{bankerName === 'You' ? 'You bank' : `${bankerName} banks`}</span>
        </span>
        <span className="flex items-center gap-2 rounded-full bg-black/45 px-4 py-0.5 text-[18px] text-white/90" aria-label="Room">
          <span className={`h-3 w-3 rounded-full ${live ? 'bg-[#45e0a5] shadow-[0_0_8px_#45e0a5]' : 'animate-pulse bg-[#ffd34d]'}`} title={live ? 'Live' : 'Syncing'} />
          {table.room.name} · Min Entry {fmt(minEntry)} · {table.game_mode === 'banker' ? 'Banker Mode' : 'Round Bank'}
        </span>
      </div>

      {/* The other three seats, clockwise from you: left, top, right (the reference layout). */}
      {around.map((p, i) => {
        const spot = SPOT_ORDER[i];
        if (!p) {
          return <HandPanel key={i} spot={spot} name="Empty seat" label="Empty seat" avatar={<div className="flex h-[116px] w-[116px] items-center justify-center bg-black/30 font-display text-[18px] font-black text-white/60">Empty</div>} cards={{ kind: 'empty' }} />;
        }
        const a = revealed ? arrangementOf(p.user_id) : undefined;
        const r = resultOf(p.user_id);
        const dealt = (phase === 'ARRANGING' || phase === 'SUBMITTED') && (p.user_id === bankerId || num(p.bet) > 0);
        return (
          <HandPanel
            key={i}
            spot={spot}
            name={p.name}
            avatar={<Avatar name={p.name} avatar={p.avatar} userId={p.user_id} size={116} square rim={false} />}
            status={
              <span className="flex flex-col items-center">
                {status(p)}
                {cantBank.has(p.user_id) && <span className="rounded-full bg-black/55 px-2 text-[13px] font-bold text-white/75">Can&apos;t bank · low Chips</span>}
              </span>
            }
            banker={p.user_id === bankerId}
            offline={!p.is_connected}
            glow={revealed && num(r?.net) > 0}
            cards={a ? { kind: 'rows', rows: { front: a.front, middle: a.middle, back: a.back }, labels: a.labels ?? null, outcomes: r?.lanes ?? null } : dealt ? { kind: 'backs' } : { kind: 'empty' }}
            extra={a ? <HandBadges lucky={a.lucky_type} foul={a.is_foul} /> : undefined}
          />
        );
      })}

      {/* Felt centre: PUSOY 553 crest, ROUND X / 12, and what is happening now */}
      <TableCrest
        round={round}
        total={total}
        status={
          <span role="status" aria-label="Game status" className="inline-block rounded-full bg-black/45 px-4 py-0.5 font-display text-[19px] font-black leading-snug text-white">
            {phase === 'STARTING'
              ? 'Get ready — seating players and shuffling…'
              : phase === 'BETTING'
                ? `${iBank ? 'You are the banker' : `${bankerName} is the banker`} · ${betSecondsLeft <= 0 ? 'betting closed' : session?.can_bet ? 'place your bet' : iBank ? 'you cover the bets' : session?.my_bet ? 'bet placed' : 'you sit out'} · ${Math.max(0, betSecondsLeft)}s`
                : phase === 'ARRANGING' || phase === 'SUBMITTED'
                  ? `${session?.my_submission ? 'Hand locked in' : session?.my_cards ? 'Arrange your hand' : 'Dealt in next round'} · ${players.filter((x) => x.has_submitted).length} / ${players.length} ready · ${arrangeSecondsLeft}s`
                  : phase === 'CANCELLED'
                    ? `Round cancelled (${session?.cancel_reason?.replace(/_/g, ' ')}) — reserved Chips returned`
                    : revealed && !matchOver && phase === 'COMPLETED'
                      ? round >= total ? 'Final round played' : nextIn > 0 ? `Next round in ${nextIn}s` : 'Dealing the next round…'
                      : matchOver ? 'Match over' : 'Every lane vs the banker · 3-0 pays 2× · 2-1 pays 1×'}
          </span>
        }
      />
      {iBank && !matchOver && <BankerRibbon />}

      {/* Your seat at the bottom centre: your hand after the reveal, or the bet chips / your status */}
      {(() => {
        const mine = revealed && userId ? arrangementOf(userId) : undefined;
        const myStatus = revealed ? (
          <span aria-label="Round result" className={tone(num(myResult?.net))}>
            {myResult ? `${signed(num(myResult.net))} Chips` : '—'}
          </span>
        ) : undefined;
        return (
          <HandPanel
            spot="bottom"
            name={me?.name ?? 'You'}
            label={`You${iBank ? ' (banker)' : ''}`}
            avatar={<Avatar name={me?.name ?? 'You'} avatar={me?.avatar} userId={userId} size={140} square rim={false} />}
            status={myStatus}
            banker={iBank}
            glow={revealed && num(myResult?.net) > 0}
            cards={mine ? { kind: 'rows', rows: { front: mine.front, middle: mine.middle, back: mine.back }, labels: mine.labels ?? null, outcomes: myResult?.lanes ?? null } : undefined}
            extra={mine ? <HandBadges lucky={mine.lucky_type} foul={mine.is_foul} /> : undefined}
          >
            {phase === 'BETTING' && session?.can_bet && betSecondsLeft > 0 ? (
              <div className="flex flex-col gap-2" role="group" aria-label="Bet chips">
                <div className="flex items-center gap-4">
                  {chipsList.map((c, i) => (
                    <button
                      key={c}
                      type="button"
                      aria-label={`Bet ${fmt(c)} Chips`}
                      title={canCover(c) ? undefined : `Needs ${fmt(c * 2)} Chips (2× the bet)`}
                      disabled={busy || !canCover(c)}
                      onClick={() => bet(c)}
                      className="tb-chip rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale"
                    >
                      <Chip value={fmt(c)} color={CHIP_COLORS[i % 3]} size={100} />
                    </button>
                  ))}
                </div>
                <span className="font-display text-[20px] font-black leading-tight text-white/85" role="status">
                  {busy
                    ? 'Placing bet…'
                    : affordable.length === 0
                      ? `You need ${fmt(Math.min(...chipsList) * 2)} Chips (2× the smallest bet) to bet`
                      : `Tap a chip to bet (hold 2× your bet) · ${betSecondsLeft}s`}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <span className="font-display text-[22px] font-bold leading-snug text-white/85">
                  {matchOver
                    ? 'Match over'
                    : phase === 'BETTING'
                      ? iBank
                        ? `You are the banker — covering ${fmt(covering)} Chips`
                        : session?.my_bet
                          ? `Bet ${fmt(num(session.my_bet))} Chips — waiting for the deal`
                          : betSecondsLeft <= 0 ? 'Betting closed — dealing…' : 'Sitting out this round'
                      : revealed
                        ? `Match total ${signed(num(standingOf(userId)?.net))} Chips · round ${round} of ${total}`
                        : session?.my_submission
                          ? 'Hand locked in — waiting for the others'
                          : session?.my_cards
                            ? 'Arrange your 13 cards: Front 3 · Middle 5 · Back 5'
                            : 'Waiting…'}
                </span>
                <span className="flex items-center gap-3">
                  {chipsList.map((c, i) => (
                    <span key={c} className="opacity-70" aria-hidden="true">
                      <Chip value={fmt(c)} color={CHIP_COLORS[i % 3]} size={60} />
                    </span>
                  ))}
                </span>
              </div>
            )}
          </HandPanel>
        );
      })()}

      {/* Arrangement pop-up (your 13 cards, server-checked lane labels) */}
      {arranging && session && (
        <LuckPopup
          key={session.id}
          gameId={session.id}
          cards={session.my_cards!}
          initial={session.my_draft ?? dealtRows(session.my_cards!)}
          onRowsChange={saveDraft}
          tierName={`${table.room.name} · R${round}/${total} · ${bankerName === 'You' ? 'You bank' : `${bankerName} banks`} · ${arrangeSecondsLeft}s`}
          bet={num(session.my_bet)}
          betLabel={iBank ? `Covering ${fmt(covering)}` : undefined}
          betText={(b) => `Bet: ${fmt(b)} Chips`}
          previewPath={`/games/${session.id}/preview`}
          hud={
            <div className="lx-gold absolute left-[1080px] top-[668px] z-10 w-[330px] rounded-[26px] p-[4px]" aria-label="Chips wallet">
              <div className="flex h-[68px] items-center gap-2 rounded-[22px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-3">
                <ChipIcon size={48} />
                <span className="font-display text-[16px] font-black uppercase text-[#ffe14d]">Total Chips</span>
                <span className="ml-auto font-display text-[32px] font-black text-white">{chips !== undefined ? fmt(Math.floor(num(chips))) : '…'}</span>
              </div>
            </div>
          }
          seats={{ left: { name: around[0]?.name ?? '' }, right: { name: around[2]?.name ?? '' } }}
          declaring={declaring}
          onDeclare={declare}
          submitting={busy}
          onSubmit={submit}
        />
      )}

      {/* Final results after round 12 (or an early end) */}
      {matchOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60">
          <div role="dialog" aria-label="Match results" className="sp-pop lx-gold w-[900px] rounded-[40px] p-[10px] shadow-[0_12px_0_#7a3e00]">
            <div className="rounded-[32px] bg-gradient-to-b from-[#8f1015] to-[#3a0204] p-8 text-center text-white">
              {(() => {
                const ranked = table.standings ?? [];
                const mine = ranked.find((s) => s.user_id === userId);
                return (
                  <>
                    <span className="inline-block -rotate-2 rounded-2xl bg-gradient-to-b from-[#fff3a0] via-[#ffd13a] to-[#e08a00] px-8 py-2 font-display text-[44px] font-black text-[#4a1d00] shadow-[0_6px_0_#8a4a00]">
                      {mine?.rank === 1 ? 'YOU WIN THE MATCH!' : mine ? `#${mine.rank} PLACE` : 'MATCH OVER'}
                    </span>
                    {mine && <p className={`mt-3 font-display text-[40px] font-black ${tone(num(mine.net))}`}>{signed(num(mine.net))} Chips</p>}
                    <p className="text-[18px] text-white/65">
                      {table.rounds_played ?? 0} / {total} rounds · {END_REASON[table.end_reason ?? ''] ?? (table.end_reason ?? '').replace(/_/g, ' ')}
                    </p>
                    <ul className="mx-auto mt-3 max-w-[600px] space-y-1 text-left" aria-label="Standings">
                      {ranked.map((s) => (
                        <li key={s.user_id} className={`flex items-center gap-4 rounded-2xl px-4 py-1.5 font-display text-[24px] font-black ${s.user_id === userId ? 'bg-[#ffd13a]/25 ring-2 ring-[#ffd13a]' : 'bg-black/30'}`}>
                          <span className="w-8 text-[#ffe14d]">{s.rank === 1 ? '👑' : s.rank}</span>
                          <Avatar name={s.name} avatar={s.avatar} userId={s.user_id} size={40} rim={false} />
                          <span className="flex-1 truncate">{s.name}</span>
                          <span className="text-[18px] text-white/60">banked {s.banker_rounds}</span>
                          <span className={tone(num(s.net))}>{signed(num(s.net))}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                );
              })()}
              <button type="button" onClick={onLobby} className="lx-tile mt-6 h-[76px] rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] px-10 font-display text-[30px] font-black text-[#4a1d00] shadow-[0_6px_0_#8a4a00]">
                Back to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="alert" className={`absolute left-1/2 top-[120px] z-50 -translate-x-1/2 whitespace-nowrap rounded-full border-4 px-8 py-3 font-display text-[26px] font-black shadow-lg ${toast.ok ? 'border-[#4ee36b] bg-[#0f2a1c] text-[#b9ffcb]' : 'border-[#ff8a8a] bg-[#3a0d14] text-[#ffe4e4]'}`}>
          {toast.text}
        </div>
      )}

      {panel && (
        <div className="absolute inset-0 z-[45] flex items-center justify-center bg-black/55" onClick={() => setPanel(null)}>
          <div role="dialog" aria-label={{ settings: 'Settings', help: 'How to play', leave: 'Leave table' }[panel]} onClick={(e) => e.stopPropagation()} className="lx-gold relative w-[900px] rounded-[40px] p-[10px] shadow-[0_12px_0_#7a3e00]">
            <div className="max-h-[840px] overflow-y-auto rounded-[32px] bg-gradient-to-b from-[#8f1015] to-[#3a0204] p-8 text-white">
              <button type="button" aria-label="Close" onClick={() => setPanel(null)} className="absolute right-6 top-6 flex h-[60px] w-[60px] items-center justify-center rounded-full border-4 border-[#ffc531] bg-gradient-to-b from-[#ff6b6b] to-[#c0101a] font-display text-[30px] font-black">
                ✕
              </button>
              {panel === 'settings' && (
                <div className="space-y-5">
                  <h2 className="font-display text-[40px] font-black">Settings</h2>
                  <button type="button" role="switch" aria-checked={soundOn} onClick={() => savePrefs({ sfx: !soundOn })} className="flex w-full items-center justify-between rounded-2xl bg-black/30 px-6 py-4 font-display text-[28px] font-black">
                    Sound <span className={soundOn ? 'text-[#7dffa0]' : 'text-white/50'}>{soundOn ? 'ON' : 'OFF'}</span>
                  </button>
                  <Link href="/settings/" className="block rounded-2xl bg-black/30 px-6 py-4 font-display text-[28px] font-black">
                    More settings ›
                  </Link>
                </div>
              )}
              {panel === 'help' && (
                <div className="space-y-3 text-[22px] leading-snug">
                  <h2 className="font-display text-[40px] font-black">{table.game_mode === 'banker' ? 'Banker Mode' : 'Round Bank'} · 12 rounds</h2>
                  <p>Four players, 12 rounds. {table.game_mode === 'banker' ? 'The lobby creator banks while they can cover the table.' : 'The banker turn passes clockwise each round.'} To bank you need at least <b className="text-[#ffe14d]">{fmt(num(table.room.banker_reserve))} Chips</b> (6× the biggest bet); anyone below that is skipped and the next player clockwise banks.</p>
                  <p>
                    Bets are the table&apos;s chips only: <b className="text-[#ffe14d]">{chipsList.map(fmt).join(' / ')} Chips</b> (from the {fmt(minEntry)}-Chip Minimum Entry). The banker places no bet and covers everyone else&apos;s.
                  </p>
                  <p>Arrange your 13 cards into Front (3), Middle (5) and Back (5). Each lane is compared with the banker&apos;s: win all 3 = 2× bet, win 2 = 1×; lose 2 = −1×, lose all 3 = −2×. An identical lane goes to the banker.</p>
                </div>
              )}
              {panel === 'leave' && (
                <div className="space-y-6 text-center">
                  <h2 className="font-display text-[40px] font-black">Leave the table?</h2>
                  <p className="text-[24px] text-white/85">{leaveAllowed ? 'You can leave between rounds. The match continues for the others.' : 'You can leave only between rounds — finish this round first.'}</p>
                  <div className="flex justify-center gap-4">
                    <button type="button" onClick={() => setPanel(null)} className="h-[72px] rounded-full border-4 border-white/60 bg-black/30 px-8 font-display text-[28px] font-black">
                      Stay
                    </button>
                    <button
                      type="button"
                      disabled={!leaveAllowed || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onLeave();
                        } catch (e) {
                          setToast({ ok: false, text: errorText(e) });
                          setPanel(null);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="h-[72px] rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] px-8 font-display text-[28px] font-black text-[#4a1d00] disabled:opacity-50"
                    >
                      Leave
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Entry transition from the lobby: fades away once the table is on screen */}
      <div className={`pointer-events-none absolute inset-0 z-[70] flex items-center justify-center bg-[#2a0204] transition-opacity duration-700 ${entered ? 'opacity-0' : 'opacity-100'}`} aria-hidden={entered}>
        <span className="font-display text-[44px] font-black text-[#ffe14d]">Entering the table…</span>
      </div>
    </LandscapeStage>
  );
}
