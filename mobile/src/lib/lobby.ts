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
  /** Diamonds you must hold to enter. */
  min_entry: number;
  /** Minimum bet per round (diamonds, decimal string). */
  min_bet: string;
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
  name?: string;
  username?: string;
  is_ready?: boolean;
  is_connected?: boolean;
  is_owner?: boolean;
  is_banker?: boolean;
  is_you?: boolean;
}

export interface LobbyDetail extends LobbySummary {
  table_id: number | null;
  table_status: string | null;
  seats: LobbySeat[];
  is_owner: boolean;
  is_seated: boolean;
  banker_rule: string;
  can_start: boolean;
  start_hint: string;
}

export interface LobbyList {
  data: LobbySummary[];
  meta: { tab: LobbyTab; page: number; pages: number; per_page: number; total: number; counts: Record<LobbyTab, number>; my_lobby_id: number | null; other_table_id: number | null; balance: string };
}

export const MIN_ENTRIES = [100, 250, 500, 1000, 2000];
export const PREPARATION_SECONDS = [30, 45, 60, 75];
export const MODE_LABEL: Record<LobbyMode, string> = { banker: 'Banker Mode', round_bank: 'Round Bank' };
export const MODE_RULE: Record<LobbyMode, string> = {
  banker: '12 rounds · the lobby owner is the banker every round.',
  round_bank: '12 rounds · the owner banks first, then the banker rotates clockwise.',
};

export const fmtDiamonds = (n: number | string) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

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

    getEcho()
      .then((echo) => {
        if (!echo) return;
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
      leave?.();
    };
  }, [enabled]);
}

/**
 * Live waiting room: table events on the seated players' presence channel (`table.{id}`) plus
 * a 3 s poll fallback and a 10 s heartbeat so the server knows you are still here.
 */
export function useWaitingRoomUpdates(tableId: number | null, onChange: () => void, heartbeat: () => void): void {
  const cb = useRef(onChange);
  cb.current = onChange;
  const beat = useRef(heartbeat);
  beat.current = heartbeat;

  useEffect(() => {
    if (!tableId) return undefined;
    let leave: (() => void) | null = null;
    getEcho()
      .then((echo) => {
        if (!echo) return;
        const ch = echo.join(`table.${tableId}`);
        ['player.joined', 'player.left', 'player.ready', 'table.full', 'match.started', 'match.completed', 'player.disconnected', 'player.reconnected'].forEach((e) => ch.listen(`.${e}`, () => cb.current()));
        leave = () => echo.leave(`table.${tableId}`);
      })
      .catch(() => undefined);
    const poll = setInterval(() => cb.current(), 3_000);
    const hb = setInterval(() => beat.current(), 10_000);
    beat.current();
    return () => {
      clearInterval(poll);
      clearInterval(hb);
      leave?.();
    };
  }, [tableId]);
}
