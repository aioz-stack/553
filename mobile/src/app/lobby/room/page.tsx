'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import LandscapeStage from '@/components/LandscapeStage';
import CreateLobbyModal from '@/components/lobby/CreateLobbyModal';
import { CandyButton, EyeButton, ChipMark, Modal, TypeBadge, inputClass } from '@/components/lobby/LobbyUI';
import SettingsPanel from '@/components/SettingsPanel';
import { LanternRoom, MiniCrest, PokerTable } from '@/components/table/TableArt';
import { Avatar } from '@/components/game';
import { Screen } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBalance } from '@/lib/useBalance';
import { useQueryParam } from '@/lib/hooks';
import { MODE_RULE, fmtChips, keysLabel, useWaitingRoomUpdates, type LobbyDetail, type LobbySeat } from '@/lib/lobby';
import { play } from '@/lib/sound';
import { useLandscapeLock } from '@/lib/useLandscapeLock';

/**
 * Choose Your Seat (1600×900 stage) — where Create Lobby and Join both land.
 *
 * Seats are Available (glowing), Reserved (a player who has not confirmed), Occupied (confirmed)
 * or Selected (your pick before you confirm). Tap a free seat, your avatar glides there, Confirm
 * Seat saves it on the server (POST /lobbies/{id}/seat — never two players on one seat). When all
 * four have confirmed, Start appears; every player presses it, then the server runs a synchronized
 * 3-2-1 countdown (end time from the server, aligned to the server clock) and starts the match;
 * everyone glides into the game (/play). Back keeps your seat; Leave gives it up. All state comes
 * from GET /lobbies/{id}, which is also the heartbeat (every 3 s, every 0.4 s in the countdown).
 */

// Seat centres on the stage, as in the reference: 1 top, 2 left, 3 right, 4 bottom.
const SEAT_AT: Record<number, { x: number; y: number }> = {
  1: { x: 800, y: 170 },
  2: { x: 262, y: 410 },
  3: { x: 1338, y: 410 },
  4: { x: 800, y: 650 },
};
const TILE = 196;

function RoundIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="lx-tile flex h-[78px] w-[78px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b from-[#8a1a1f] to-[#3a0406] text-[#ffd34d] shadow-[0_6px_0_#1a0204]">
      {children}
    </button>
  );
}

function PersonPlus() {
  return (
    <svg viewBox="0 0 64 64" className="h-[78px] w-[78px]" aria-hidden="true">
      <circle cx="28" cy="20" r="11" fill="#f2c67a" />
      <path d="M8 52 C8 38 17 32 28 32 C39 32 48 38 48 52Z" fill="#f2c67a" />
      <g className="cs-plus" style={{ transformOrigin: '47px 45px' }}>
        <circle cx="47" cy="45" r="13" fill="#21b84a" stroke="#fff" strokeWidth="3" />
        <path d="M47 38 V52 M40 45 H54" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** One seat tile: available (glow), reserved, occupied, or an empty frame under your own avatar. */
function SeatTile({
  seat,
  selected,
  mine,
  canPick,
  canKick,
  onPick,
  onKick,
  showReady,
}: {
  seat: LobbySeat;
  selected: boolean;
  mine: boolean;
  canPick: boolean;
  canKick: boolean;
  onPick: () => void;
  onKick: () => void;
  showReady: boolean;
}) {
  const at = SEAT_AT[seat.seat];
  const other = !!seat.user_id && !seat.is_you;
  const label = selected
    ? `Seat ${seat.seat}: selected`
    : other
      ? `Seat ${seat.seat}: ${seat.state === 'reserved' ? 'reserved' : 'occupied'} by ${seat.name}${seat.is_owner ? ', owner' : ''}${seat.is_banker ? ', banker' : ''}${showReady ? (seat.is_ready ? ', pressed Start' : ', not started') : ''}`
      : mine
        ? `Seat ${seat.seat}: your seat`
        : `Seat ${seat.seat}: available`;
  const free = !seat.user_id && !selected && !mine;

  return (
    <div className="absolute z-10 flex flex-col items-center" style={{ left: at.x - TILE / 2, top: at.y - TILE / 2 - 10, width: TILE }}>
      <button
        type="button"
        aria-label={label}
        disabled={!canPick || other}
        onClick={onPick}
        className={`relative flex items-center justify-center rounded-[34px] border-[6px] transition-transform ${free && canPick ? 'cs-free cursor-pointer hover:scale-[1.04]' : ''} ${selected ? 'cs-selected border-[#ffe14d]' : 'border-[#d9a441]'} ${other && seat.state === 'reserved' ? 'opacity-80' : ''} bg-gradient-to-b from-[#5a2a10] to-[#2a1204] shadow-[0_8px_0_#2a1204]`}
        style={{ width: TILE, height: TILE }}
      >
        {free && <PersonPlus />}
        {other && (
          <span key={seat.user_id} className={`cs-pop relative overflow-hidden rounded-[22px] border-[4px] ${seat.is_banker ? 'border-[#7cc8ff]' : 'border-white'} ${seat.is_connected === false ? 'grayscale' : ''}`}>
            <Avatar name={seat.name ?? ""} avatar={seat.avatar} userId={seat.user_id} size={150} square rim={false} />
            {seat.state === 'reserved' && <span className="absolute inset-x-0 bottom-0 bg-black/65 py-0.5 text-center font-display text-[18px] font-black text-[#ffe14d]">Reserved</span>}
            {seat.is_connected === false && <span className="absolute inset-x-0 top-0 bg-black/70 text-center text-[15px] font-bold text-white">offline</span>}
          </span>
        )}
        {other && seat.is_owner && (
          <svg viewBox="0 0 40 30" className="absolute -top-[30px] left-1/2 h-[40px] w-[54px] -translate-x-1/2" aria-hidden="true">
            <path d="M3 26 L1 6 L12 15 L20 2 L28 15 L39 6 L37 26Z" fill="#ffd34d" stroke="#8a4a00" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
        )}
        {other && seat.is_banker && <span className="absolute -left-3 -top-3 rounded-full border-2 border-white bg-gradient-to-b from-[#ffd34d] to-[#e08a00] px-2 font-display text-[14px] font-black text-[#4a1d00]">BANKER</span>}
        {canKick && (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Remove ${seat.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onKick();
            }}
            className="absolute -right-3 -top-3 flex h-[36px] w-[36px] items-center justify-center rounded-full border-2 border-white bg-[#c0101a] font-black text-white"
          >
            ✕
          </span>
        )}
      </button>
      <span className={`mt-2 whitespace-nowrap rounded-full border-[3px] px-5 py-0.5 font-display text-[24px] font-black ${selected ? 'border-[#ffe14d] bg-gradient-to-b from-[#ffd34d] to-[#e08a00] text-[#4a1d00]' : 'border-[#d9a441] bg-gradient-to-b from-[#3a1a08] to-[#1a0a02] text-white'}`}>
        {other ? seat.name : selected ? `Seat ${seat.seat} (Selected)` : mine ? `Seat ${seat.seat}` : `Seat ${seat.seat}`}
      </span>
      {other && showReady && (
        <span className={`mt-1 rounded-full px-3 font-display text-[17px] font-black ${seat.is_ready ? 'bg-[#13a344] text-white' : 'bg-black/55 text-white/80'}`}>{seat.is_ready ? 'Ready ✓' : 'Not ready'}</span>
      )}
    </div>
  );
}

export default function ChooseYourSeat() {
  const { user } = useAuth();
  // Your Chips (Multiplayer only), reloaded when the lobby changes (seat, start, match).
  const { chips, reload: reloadChips } = useBalance(user?.id);
  const router = useRouter();
  const idParam = useQueryParam('id');
  const roomId = idParam ? Number(idParam) : null;
  useLandscapeLock();

  const [lobby, setLobby] = useState<LobbyDetail | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [joined, setJoined] = useState<{ key: number; text: string } | null>(null);
  const [panel, setPanel] = useState<'settings' | 'help' | 'edit' | 'leave' | 'password' | null>(null);
  const [locked, setLocked] = useState(0); // bumps to replay the lock-in flash
  const [exiting, setExiting] = useState(false);
  const [countState, setCountState] = useState<number | null>(null);
  const clockOffset = useRef(0); // server time − local time
  const knownPlayers = useRef<Map<number, string> | null>(null);
  const wasSeated = useRef(false);

  const say = useCallback((ok: boolean, text: string) => setToast({ ok, text }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    if (!user || !roomId) return;
    const sent = Date.now();
    try {
      const r = await api<{ data: LobbyDetail }>(`/lobbies/${roomId}`);
      const got = Date.now();
      clockOffset.current = new Date(r.data.server_time).getTime() - (sent + got) / 2;
      // A new player sat down: a small notification with their name.
      const seats = r.data.seats.filter((s) => s.user_id);
      const map = new Map(seats.map((s) => [s.user_id as number, s.name ?? '']));
      if (knownPlayers.current) {
        for (const [id, name] of map) {
          if (!knownPlayers.current.has(id) && id !== user.id) {
            setJoined({ key: Date.now(), text: `${name} joined the table` });
            play('chip');
          }
        }
      }
      knownPlayers.current = map;
      setLobby(r.data);
      if (r.data.is_seated) wasSeated.current = true;
      else if (wasSeated.current) {
        wasSeated.current = false;
        say(false, 'You are no longer in this lobby.');
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone('This lobby no longer exists.');
    }
  }, [user, roomId, say]);

  useEffect(() => {
    load();
  }, [load]);

  const counting = !!lobby?.countdown_ends_at;
  useWaitingRoomUpdates(lobby?.is_seated ? lobby.table_id : null, load, counting, lobby?.countdown_ends_at ? new Date(lobby.countdown_ends_at).getTime() - clockOffset.current : null);

  // Countdown clock (aligned to the server). It re-renders the room only when the number changes
  // (once a second), not on every check.
  const endsAt = lobby?.countdown_ends_at ?? null;
  useEffect(() => {
    const read = () => (endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - (Date.now() + clockOffset.current)) / 1000)) : null);
    setCountState(read());
    if (!endsAt) return undefined;
    const id = setInterval(() => setCountState(read()), 100); // same number → no render
    return () => clearInterval(id);
  }, [endsAt]);
  const count = countState;
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (count !== null && count !== lastCount.current) {
      play(count === 0 ? 'start' : 'tick');
      lastCount.current = count;
    }
    if (count === null) lastCount.current = null;
  }, [count]);

  // Seats, starts and matches can move Chips: reload your balance when any of them changes.
  useEffect(() => {
    reloadChips();
  }, [lobby?.table_status, lobby?.my_seat, lobby?.players, lobby?.countdown_ends_at, reloadChips]);

  // The match started: a cinematic exit (zoom + fade), then into the game table.
  const gameTable = lobby?.is_seated && lobby.table_status === 'IN_GAME' ? lobby.table_id : null;
  useEffect(() => {
    if (gameTable) setExiting(true);
  }, [gameTable]);
  // The router is read through a ref so unrelated re-renders (e.g. a balance update) never restart this timer.
  const routerRef = useRef(router);
  routerRef.current = router;
  useEffect(() => {
    if (!exiting || !gameTable) return undefined;
    const t = setTimeout(() => routerRef.current.replace(`/play/?table=${gameTable}`), 650);
    return () => clearTimeout(t);
  }, [exiting, gameTable]);

  // Keep the pick in sync: once your seat is confirmed there, the pick is done.
  useEffect(() => {
    if (lobby && pick !== null && lobby.my_seat === pick && lobby.my_seat_confirmed) setPick(null);
  }, [lobby, pick]);

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      after?.();
      await load();
    } catch (e) {
      play('lose');
      say(false, errorText(e));
      await load();
    } finally {
      setBusy(false);
    }
  };

  const mySeat = pick ?? lobby?.my_seat ?? null;
  const canPick = !!lobby?.is_seated && !counting && lobby.table_status !== 'IN_GAME';
  const needsConfirm = !!lobby?.is_seated && (pick !== null ? pick !== lobby.my_seat || !lobby.my_seat_confirmed : !lobby.my_seat_confirmed);

  const confirmSeat = () => {
    const seat = pick ?? lobby?.my_seat;
    if (!lobby || !seat) return;
    act(
      () => api(`/lobbies/${lobby.id}/seat`, { method: 'POST', body: { seat } }),
      () => {
        play('chip');
        setLocked((n) => n + 1);
        setPick(null);
      },
    );
  };

  const pressStart = (ready: boolean) => {
    if (!lobby) return;
    act(() => api(`/lobbies/${lobby.id}/start`, { method: 'POST', body: { ready } }), () => play(ready ? 'start' : 'tap'));
  };

  const leave = () =>
    act(async () => {
      if (lobby?.table_id && lobby.is_seated) await api(`/tables/${lobby.table_id}/leave`, { method: 'POST' });
      wasSeated.current = false;
      router.replace('/lobby/');
    });

  const joinHere = (password?: string) => {
    if (!lobby) return;
    if (lobby.type === 'private' && password === undefined) {
      setPanel('password');
      return;
    }
    act(
      // Joins with the lobby's smallest bet; change it with Your Bet before the countdown.
      () => api(`/lobbies/${lobby.id}/join`, { method: 'POST', body: password ? { password } : {} }),
      () => setPanel(null),
    );
  };

  const players = lobby?.players ?? 0;
  const target = mySeat ? SEAT_AT[mySeat] : null;
  const showReady = !!lobby?.all_confirmed;

  return (
    <Screen title="Choose Your Seat" immersive>
      <LandscapeStage background={<LanternRoom className="h-full w-full" />}>
        <div className={`absolute inset-0 ${exiting ? 'cs-exit' : 'cs-enter'}`}>
          <PokerTable />

          {/* top-left controls + crest */}
          <div className="absolute left-[24px] top-[20px] z-20 flex gap-3">
            <RoundIcon label="Back to lobby" onClick={() => router.push('/lobby/')}>
              <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
                <path d="M24 9 L12 20 L24 31 M12 20 H32" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </RoundIcon>
            <RoundIcon label="Settings" onClick={() => setPanel('settings')}>
              <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
                <g fill="currentColor">
                  {Array.from({ length: 8 }, (_, i) => (
                    <rect key={i} x="17" y="3" width="6" height="9" rx="2" transform={`rotate(${i * 45} 20 20)`} />
                  ))}
                  <circle cx="20" cy="20" r="11" />
                </g>
                <circle cx="20" cy="20" r="5" fill="#7a0a0e" />
              </svg>
            </RoundIcon>
            <RoundIcon label="How it works" onClick={() => setPanel('help')}>
              <span className="font-display text-[42px] font-black leading-none">?</span>
            </RoundIcon>
          </div>
          <div className="pointer-events-none absolute left-[290px] top-[6px] z-20">
            <MiniCrest />
          </div>

          {/* top-right: lobby info */}
          {lobby && (
            <div className="absolute right-[22px] top-[18px] z-20 flex w-[430px] flex-col items-end gap-1.5">
              <div className="lx-gold w-full rounded-[24px] p-[5px] shadow-[0_6px_0_#7a3e00]">
                <div className="flex h-[64px] items-center gap-3 rounded-[19px] bg-gradient-to-b from-[#b3141b] to-[#5a0609] px-4">
                  <ChipMark size={44} />
                  <span className="flex-1 text-center font-display text-[30px] font-black text-white">{lobby.game_mode_label}</span>
                  <TypeBadge type={lobby.type} className="text-[17px]" />
                </div>
              </div>
              <span className="max-w-full truncate rounded-full bg-black/60 px-4 py-0.5 font-display text-[21px] font-black text-white">
                {lobby.name} · <span className="text-[#ffe14d]">ID {lobby.lobby_id}</span>
              </span>
              <span className="rounded-full bg-black/55 px-4 py-0.5 font-display text-[19px] font-black text-white/90">
                Bets {(lobby.bet_chips ?? [lobby.min_bet]).map(fmtChips).join('/')} · Min Entry {fmtChips(lobby.min_entry)}
                {lobby.key_fee > 0 ? ` · ${keysLabel(lobby.key_fee)}` : ''} · Prep {lobby.preparation_seconds}s
              </span>
              <span className="flex items-center gap-2 rounded-full bg-black/55 px-3 py-0.5 font-display text-[19px] font-black text-white" aria-label="Your Chips">
                <ChipMark size={24} /> Your Chips <span className="text-[#ffe14d]">{chips !== undefined ? fmtChips(Math.floor(Number(chips))) : '…'}</span>
                {lobby.key_fee > 0 && (
                  <>
                    · Keys <span className="text-[#ffe14d]">{fmtChips(Number(lobby.my_keys))}</span>
                  </>
                )}
              </span>
              {/* Your bet (one of the lobby's three) and what it requires; changeable before the countdown. */}
              {lobby.is_seated && lobby.my_bet && (
                <div className="flex w-full flex-col items-end gap-1 rounded-[18px] bg-black/60 px-3 py-1.5" aria-label="Your bet">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[18px] font-black text-white/85">Your Bet</span>
                    {(lobby.bet_chips ?? []).map((b) => {
                      const on = Number(b) === Number(lobby.my_bet);
                      const locked = counting || lobby.table_status === 'IN_GAME';
                      return (
                        <button
                          key={b}
                          type="button"
                          aria-pressed={on}
                          disabled={busy || locked || on}
                          onClick={() => act(() => api(`/lobbies/${lobby.id}/bet`, { method: 'POST', body: { bet: b } }), () => play('chip'))}
                          className={`rounded-full border-2 px-3 font-display text-[18px] font-black ${on ? 'border-[#ffe14d] bg-[#e08a00] text-[#3b1d00]' : 'border-white/40 text-white/85 disabled:opacity-50'}`}
                        >
                          {fmtChips(b)}
                        </button>
                      );
                    })}
                  </div>
                  <span className={`font-display text-[16px] font-bold ${chips !== undefined && Number(chips) < Number(lobby.my_required_chips) ? 'text-[#ff9aa8]' : 'text-white/70'}`}>
                    Needs {fmtChips(Number(lobby.my_required_chips))} Chips (2× bet, min entry)
                    {lobby.key_fee > 0 ? ` · ${keysLabel(lobby.key_fee)} deducted at start` : ''}
                  </span>
                </div>
              )}
              <span className="flex items-center gap-2 rounded-full bg-black/55 px-4 py-0.5 font-display text-[19px] font-black text-white/90">
                <span key={players} className="cs-bump inline-block text-[#ffe14d]" aria-label={`${players} of ${lobby.max_players ?? 4} players`}>{players}/{lobby.max_players ?? 4}</span> Players
                {lobby.is_owner && !counting && lobby.table_status !== 'IN_GAME' && (
                  <button type="button" onClick={() => setPanel('edit')} className="ml-1 rounded-full border-2 border-[#ffd34d]/70 px-3 text-[16px] text-[#ffe14d]">
                    ⚙ Edit lobby
                  </button>
                )}
              </span>
            </div>
          )}

          {/* seats */}
          {lobby &&
            lobby.seats.map((s) => (
              <SeatTile
                key={s.seat}
                seat={s}
                selected={pick === s.seat}
                mine={!!s.is_you || pick === s.seat}
                canPick={canPick && (!s.user_id || !!s.is_you)}
                canKick={lobby.is_owner && !!s.user_id && !s.is_you && !counting && lobby.table_status !== 'IN_GAME'}
                showReady={showReady}
                onPick={() => {
                  play('tap');
                  setPick(s.seat);
                }}
                onKick={() => act(() => api(`/lobbies/${lobby.id}/kick`, { method: 'POST', body: { user_id: s.user_id } }), () => say(true, `${s.name} was removed.`))}
              />
            ))}

          {/* your avatar: glides to the seat you pick */}
          {lobby?.is_seated && target && (
            <div className="cs-avatar pointer-events-none absolute left-0 top-0 z-[15]" style={{ transform: `translate(${target.x - 80}px, ${target.y - 96}px)` }} aria-hidden="true">
              <div key={locked} className={`relative ${locked ? 'cs-lock' : ''}`}>
                <span className="absolute -top-[30px] left-1/2 z-10 -translate-x-1/2 rounded-[12px] border-[3px] border-white bg-gradient-to-b from-[#ffd34d] to-[#e08a00] px-4 font-display text-[24px] font-black text-[#4a1d00] shadow-[0_4px_0_#7a3e00]">YOU</span>
                <div className={`overflow-hidden rounded-[24px] border-[5px] ${lobby.my_seat_confirmed && pick === null ? 'border-[#5dff7a]' : 'border-[#ffe14d]'} shadow-[0_0_30px_rgb(255_211_77/0.7)]`}>
                  <Avatar name={user?.display_name ?? user?.name ?? "You"} avatar={user?.avatar} userId={user?.id} size={150} square rim={false} />
                </div>
                {lobby.my_seat_confirmed && pick === null && <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#13a344] px-3 font-display text-[16px] font-black text-white">{lobby.my_ready ? 'Ready ✓' : 'Seat locked ✓'}</span>}
              </div>
            </div>
          )}

          {/* centre: Choose Your Seat → Start → countdown */}
          {lobby && count === null && (
            <div className="absolute left-[420px] top-[338px] z-[12] flex w-[760px] flex-col items-center text-center">
              {!lobby.all_confirmed || !lobby.is_seated ? (
                <>
                  <div className="flex items-end gap-1 text-[44px] leading-none drop-shadow-[0_3px_0_#3a1300]">
                    <span className="text-[#1a1a1a]">♠</span>
                    <span className="text-[#e0262f]">♥</span>
                    <span className="text-[#e0262f]">♦</span>
                    <span className="text-[#1a1a1a]">♣</span>
                  </div>
                  <div className="lx-gold rounded-[30px] p-[5px] shadow-[0_8px_0_#5a2a00]">
                    <h1 className="rounded-[25px] bg-gradient-to-b from-[#3a1206] to-[#1a0602] px-12 py-2 font-display text-[64px] font-black italic leading-tight text-[#ffd34d] drop-shadow-[0_3px_0_#5a2a00]">Choose Your Seat</h1>
                  </div>
                  <p className="mt-3 font-display text-[26px] font-bold text-white" role="status">
                    {!lobby.is_seated ? (gone ?? 'Join this lobby to pick a seat') : needsConfirm ? 'Tap an available seat, then Confirm Seat' : lobby.start_hint}
                  </p>
                </>
              ) : (
                <div className="cs-rise flex flex-col items-center gap-3">
                  <p className="font-display text-[26px] font-black text-[#ffe9b0]">{(() => { const seated = lobby.seated_count ?? players; const n = lobby.confirmed_count ?? seated; return `${n === 4 ? 'All four seats' : n === seated ? `All ${n} seats` : `${n} seats`} confirmed · ${lobby.ready_count}/${n} pressed Start`; })()}</p>
                  {lobby.my_ready ? (
                    <>
                      <span className="rounded-full bg-black/55 px-8 py-3 font-display text-[30px] font-black text-white" role="status">
                        {lobby.start_hint}
                      </span>
                      <button type="button" onClick={() => pressStart(false)} disabled={busy} className="text-[20px] font-bold text-white/75 underline">
                        Cancel my Start
                      </button>
                    </>
                  ) : (
                    <CandyButton tone="gold" onClick={() => pressStart(true)} disabled={busy || !lobby.can_press_start} className="cs-start-glow h-[120px] w-[420px] text-[60px]">
                      ▶ START
                    </CandyButton>
                  )}
                </div>
              )}
            </div>
          )}

          {/* countdown 3 → 2 → 1 (server-timed) */}
          {count !== null && (
            <div className="pointer-events-none absolute inset-0 overlay-bleed z-40 flex items-center justify-center bg-black/35" role="timer" aria-label={`Match starts in ${count}`}>
              <div className="relative flex h-[340px] w-[340px] items-center justify-center [perspective:800px]">
                <span key={`r${count}`} className="cs-ring absolute inset-0 rounded-full border-[10px] border-[#ffe14d] shadow-[0_0_60px_rgb(255_225_77/0.8)]" />
                <span key={count} className="cs-count font-display text-[260px] font-black leading-none text-[#ffe14d] drop-shadow-[0_10px_0_#7a3e00] [text-shadow:0_0_40px_rgb(255_200_60/0.9)]">
                  {count > 0 ? count : 'GO!'}
                </span>
              </div>
            </div>
          )}

          {/* bottom actions */}
          {lobby?.is_seated && count === null && lobby.table_status !== 'IN_GAME' && !lobby.all_confirmed && (
            <div className="absolute bottom-[26px] left-1/2 z-20 flex -translate-x-1/2 gap-10">
              <CandyButton tone="blue" onClick={() => setPick(null)} disabled={busy || pick === null} className="h-[92px] w-[380px] text-[38px]">
                ⟳ Change Seat
              </CandyButton>
              <CandyButton tone="gold" onClick={confirmSeat} disabled={busy || !needsConfirm} className="h-[92px] w-[400px] text-[40px]">
                ✓ Confirm Seat
              </CandyButton>
            </div>
          )}
          {lobby?.is_seated && count === null && lobby.table_status !== 'IN_GAME' && (
            <button type="button" onClick={() => setPanel('leave')} className="absolute bottom-[30px] left-[30px] z-20 rounded-full border-[3px] border-[#ffc2c2] bg-gradient-to-b from-[#ff6b5c] to-[#b3121a] px-6 py-2 font-display text-[24px] font-black text-white shadow-[0_5px_0_#6b0606]">
              Leave Lobby
            </button>
          )}
          {lobby && !lobby.is_seated && !gone && lobby.can_join && (
            <div className="absolute bottom-[30px] left-1/2 z-20 -translate-x-1/2">
              <CandyButton tone="gold" onClick={() => joinHere()} disabled={busy} className="h-[92px] w-[380px] text-[40px]">
                ▶ Join Lobby
              </CandyButton>
            </div>
          )}
          {(gone || lobby?.status === 'closed') && (
            <div className="absolute bottom-[30px] left-1/2 z-20 -translate-x-1/2">
              <CandyButton tone="gold" onClick={() => router.replace('/lobby/')} className="h-[86px] w-[380px] text-[34px]">
                Back to Lobby
              </CandyButton>
            </div>
          )}
          {!lobby && !gone && (
            <p className="absolute left-0 right-0 top-[420px] z-10 text-center font-display text-[36px] font-black text-white" role="status">
              Opening the table…
            </p>
          )}
        </div>

        {/* notifications */}
        {joined && (
          <div key={joined.key} className="cs-toast absolute left-1/2 top-[110px] z-50 rounded-full border-4 border-[#4ee36b] bg-[#0f2a1c]/95 px-8 py-2 font-display text-[24px] font-black text-[#b9ffcb]" role="status">
            {joined.text}
          </div>
        )}
        {toast && (
          <div role="alert" className={`absolute left-1/2 top-[160px] z-[60] -translate-x-1/2 whitespace-nowrap rounded-full border-4 px-8 py-3 font-display text-[26px] font-black shadow-lg ${toast.ok ? 'border-[#4ee36b] bg-[#0f2a1c] text-[#b9ffcb]' : 'border-[#ff8a8a] bg-[#3a0d14] text-[#ffe4e4]'}`}>
            {toast.text}
          </div>
        )}

        {/* popups */}
        {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
        {panel === 'edit' && lobby && (
          <CreateLobbyModal
            edit={lobby}
            onClose={() => setPanel(null)}
            onCreated={(l) => {
              setLobby(l);
              setPanel(null);
              say(true, 'Lobby updated.');
            }}
          />
        )}
        {panel === 'help' && lobby && (
          <Modal title="How it works" onClose={() => setPanel(null)} width={900}>
            <ol className="list-decimal space-y-2 pl-6 text-[24px] font-bold text-white/90">
              <li>Tap an available (glowing) seat — your avatar moves there — then press Confirm Seat.</li>
              <li>Reserved seats belong to players who have not confirmed yet; occupied seats are taken.</li>
              <li>When all four seats are confirmed, every player presses START.</li>
              <li>A 3-2-1 countdown runs for everyone, then the match begins. If anyone leaves or drops out, it stops.</li>
              <li>{MODE_RULE[lobby.game_mode]}</li>
            </ol>
          </Modal>
        )}
        {panel === 'leave' && (
          <Modal title="Leave Lobby?" onClose={() => setPanel(null)} width={720}>
            <p className="text-center text-[26px] font-bold text-white/90">You will give up your seat. Back (←) keeps it for you instead.</p>
            <div className="mt-7 flex justify-center gap-6">
              <CandyButton tone="dark" onClick={() => setPanel(null)} className="h-[78px] w-[240px] text-[30px]">
                Stay
              </CandyButton>
              <CandyButton tone="red" onClick={leave} disabled={busy} className="h-[78px] w-[240px] text-[30px]">
                Leave
              </CandyButton>
            </div>
          </Modal>
        )}
        {panel === 'password' && <JoinPassword onClose={() => setPanel(null)} onJoin={(pw) => joinHere(pw)} />}
      </LandscapeStage>
    </Screen>
  );
}

function JoinPassword({ onClose, onJoin }: { onClose: () => void; onJoin: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  const [shown, setShown] = useState(false);
  return (
    <Modal title="Private Lobby" onClose={onClose} width={720}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pw) onJoin(pw);
        }}
      >
        <div className="relative">
          <input aria-label="Lobby password" autoFocus type={shown ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter password" className={`${inputClass} pr-16`} />
          <EyeButton shown={shown} onToggle={() => setShown((s) => !s)} label="password" />
        </div>
        <div className="mt-6 flex justify-center">
          <CandyButton tone="gold" type="submit" disabled={!pw} className="h-[78px] w-[280px] text-[32px]">
            ▶ Join
          </CandyButton>
        </div>
      </form>
    </Modal>
  );
}
