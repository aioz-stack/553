'use client';

import { useEffect, useRef } from 'react';
import { getEcho } from './echo';

/**
 * Multiplayer lobbies (the 553 Lobby) — client types and live updates.
 * Everything here is display: the server decides seats, balances, starts and results.
 */

export type LobbyMode = 'banker' | 'round_bank';
export type LobbyTab = 'all' | 'public' | 'private';

export interface LobbySummary {
  id: number;
  /** Public 6-digit Lobby ID. */
  lobby_id: string;
  name: string;
  game_mode: LobbyMode;
  game_mode_label: string;
  /** Chips you must hold to enter. */
  min_entry: number;
  /** Minimum bet per round (Chips, decimal string). */
  min_bet: string;
  /** The only bets allowed in this lobby (Chips, decimal strings), e.g. 20 / 30 / 40. */
  bet_chips: string[];
  /** Keys each player pays when the game starts (0 for older lobbies). */
  key_fee: number;
  /** A player must hold this multiple of their selected bet (2). */
  bet_multiple: number;
  preparation_seconds: number;
  players: number;
  max_players: number;
  type: 'public' | 'private';
  status: 'waiting' | 'full' | 'in_game' | 'closed';
  owner: string | null;
  is_mine: boolean;
  can_join: boolean;
}

export interface LobbySeat {
  seat: number;
  user_id: number | null;
  /** available · reserved (held, not confirmed) · occupied (confirmed). */
  state: 'available' | 'reserved' | 'occupied';
  seat_confirmed?: boolean;
  name?: string;
  avatar?: string | null;
  username?: string;
  is_ready?: boolean;
  is_connected?: boolean;
  is_owner?: boolean;
  is_banker?: boolean;
  is_you?: boolean;
  /** The bet this player selected (Chips, decimal string). */
  bet?: string;
}

export interface LobbyDetail extends LobbySummary {
  table_id: number | null;
  table_status: string | null;
  seats: LobbySeat[];
  is_owner: boolean;
  is_seated: boolean;
  banker_rule: string;
  my_seat: number | null;
  my_seat_confirmed: boolean;
  my_ready: boolean;
  all_confirmed: boolean;
  ready_count: number;
  /** Players seated now; a match starts with min_players (2) up to max_players (4). */
  seated_count?: number;
  min_players?: number;
  /** Server time the synchronized countdown ends (ISO, ms); null when none is running. */
  countdown_ends_at: string | null;
  /** Server clock at response time, to line the countdown up across devices. */
  server_time: string;
  can_press_start: boolean;
  start_hint: string;
  /** Your selected bet and the Chips you must hold for it: max(Minimum Entry, 2× bet). */
  my_bet: string | null;
  my_required_chips: string | null;
  my_chips: string;
  my_keys: string;
}

/** An entry tier (Create Lobby): Minimum Entry, its three bets and the Keys fee. */
export interface LobbyTier {
  min_entry: number;
  bets: number[];
  keys: number;
}

export interface LobbyList {
  data: LobbySummary[];
  meta: { tab: LobbyTab; page: number; pages: number; per_page: number; total: number; counts: Record<LobbyTab, number>; my_lobby_id: number | null; other_table_id: number | null; balance: string; keys?: string; tiers?: LobbyTier[] };
}

/** The entry tiers (the server sends the same list in the lobby list's meta.tiers and checks them). */
export const TIERS: LobbyTier[] = [
  { min_entry: 100, bets: [5, 10, 15], keys: 1 },
  { min_entry: 500, bets: [20, 30, 40], keys: 2 },
  { min_entry: 1000, bets: [50, 75, 100], keys: 5 },
];
export const MIN_ENTRIES = TIERS.map((t) => t.min_entry);
export const PLAYER_BET_MULTIPLE = 2;
export const BANKER_RESERVE_MULTIPLE = 6;
export const PREPARATION_SECONDS = [30, 45, 60, 75];
/** Older lobbies may still show Banker Mode; new lobbies are Round Bank only. */
export const MODE_LABEL: Record<LobbyMode, string> = { banker: 'Banker Mode', round_bank: 'Round Bank' };
export const MODE_RULE: Record<LobbyMode, string> = {
  banker: '12 rounds · the lobby owner is the banker every round.',
  round_bank: '12 rounds · the owner banks first, then the banker rotates clockwise (a banker needs 6× the maximum bet).',
};

/** Chips a player must hold to play a bet: max(Minimum Entry, 2× bet). */
export const requiredChips = (minEntry: number, bet: number, multiple = PLAYER_BET_MULTIPLE) => Math.max(minEntry, bet * multiple);
export const keysLabel = (n: number) => `${n} ${n === 1 ? 'Key' : 'Keys'}`;

/**
 * What stops a player from joining with this bet (null = OK). Display only: the server checks again.
 */
export function entryProblem(t: { min_entry: number; bets: number[]; keys: number }, bet: number, chips: number | undefined, keys: number | undefined): string | null {
  if (!t.bets.includes(bet)) return `Choose one of the bets: ${t.bets.map(fmtChips).join(' / ')} Chips.`;
  const need = requiredChips(t.min_entry, bet);
  if (chips !== undefined && chips < need) {
    return need > t.min_entry
      ? `You need at least ${fmtChips(need)} Chips (2× your ${fmtChips(bet)} bet). You have ${fmtChips(Math.floor(chips))}.`
      : `You need at least ${fmtChips(need)} Chips for this lobby. You have ${fmtChips(Math.floor(chips))}.`;
  }
  if (keys !== undefined && keys < t.keys) return `You need ${keysLabel(t.keys)} to play. You have ${fmtChips(keys)}.`;
  return null;
}

/** A Chips amount (whole or with cents), e.g. 1,000 or 12.5. */
export const fmtChips = (n: number | string) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/**
 * Live lobby list: listens to `lobby.updated` on the public `lobbies` channel (Reverb) and also
 * polls (every 5 s without a socket, 20 s with one) so the list stays right either way.
 */
export function useLobbyUpdates(onChange: () => void, enabled = true): void {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!enabled) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = false;
    let leave: (() => void) | null = null;
    // Coalesce bursts of events (join + ready + full) into one refresh.
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 250);
    };

    let cancelled = false;
    getEcho()
      .then((echo) => {
        if (!echo || cancelled) return; // closed before the socket was ready: subscribe to nothing
        const ch = echo.channel('lobbies');
        ch.listen('.lobby.updated', bump);
        live = true;
        leave = () => echo.leave('lobbies');
      })
      .catch(() => undefined);

    let tick = 0;
    const poll = setInterval(() => {
      tick += 1;
      if (!live || tick % 4 === 0) cb.current();
    }, 5_000);
    const onVisible = () => document.visibilityState === 'visible' && cb.current();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      cancelled = true;
      leave?.();
    };
  }, [enabled]);
}

/**
 * Live Choose Your Seat: table events on the seated players' presence channel (`table.{id}`)
 * plus polling — every 3 s normally, every 1 s while the countdown runs (and once right as it
 * ends, via `endsAt`). Each poll (GET
 * /lobbies/{id}) is also your heartbeat and lets the server run the countdown / start the match.
 */
export function useWaitingRoomUpdates(tableId: number | null, onChange: () => void, fast = false, endsAt: number | null = null): void {
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!tableId) return undefined;
    let leave: (() => void) | null = null;
    let cancelled = false;
    getEcho()
      .then((echo) => {
        if (!echo || cancelled) return;
        const ch = echo.join(`table.${tableId}`);
        ['player.joined', 'player.left', 'player.ready', 'player.seated', 'player.updated', 'table.full', 'match.countdown', 'match.countdown_cancelled', 'match.started', 'match.completed', 'player.disconnected', 'player.reconnected'].forEach((e) =>
          ch.listen(`.${e}`, () => cb.current()),
        );
        leave = () => echo.leave(`table.${tableId}`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      leave?.();
    };
  }, [tableId]);

  useEffect(() => {
    if (!tableId) return undefined;
    const poll = setInterval(() => cb.current(), fast ? 1_000 : 3_000);
    return () => clearInterval(poll);
  }, [tableId, fast]);

  // The countdown's last moment: look once just after it ends (the server starts the match on that look).
  useEffect(() => {
    if (!tableId || endsAt === null) return undefined;
    const t = setTimeout(() => cb.current(), Math.max(0, endsAt - Date.now()) + 150);
    return () => clearTimeout(t);
  }, [tableId, endsAt]);
}
