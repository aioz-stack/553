import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api, ApiError, errorText } from './api';
import { getEcho } from './echo';
import type { SessionState, TableState } from './types';

/**
 * Multiplayer (the 553 Lobby). Everything here is display: the server decides seats, balances,
 * starts and results. Reverb events are only signals to re-fetch the authoritative state, so a
 * reconnect or app resume recovers exactly like a fresh load.
 */

export type LobbyMode = 'banker' | 'round_bank';
export type LobbyTab = 'all' | 'public' | 'private';

export interface LobbySummary {
  id: number;
  lobby_id: string;
  name: string;
  game_mode: LobbyMode;
  game_mode_label: string;
  min_entry: number;
  min_bet: string;
  bet_chips: string[];
  key_fee: number;
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
  state: 'available' | 'reserved' | 'occupied';
  seat_confirmed?: boolean;
  name?: string;
  avatar?: string | null;
  is_ready?: boolean;
  is_connected?: boolean;
  is_owner?: boolean;
  is_banker?: boolean;
  is_you?: boolean;
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
  seated_count?: number;
  min_players?: number;
  countdown_ends_at: string | null;
  server_time: string;
  can_press_start: boolean;
  start_hint: string;
  my_bet: string | null;
  my_required_chips: string | null;
  my_chips: string;
  my_keys: string;
}

export interface LobbyList {
  data: LobbySummary[];
  meta: { tab: LobbyTab; counts: Record<LobbyTab, number>; my_lobby_id: number | null; other_table_id: number | null; balance: string; keys?: string };
}

export const fmtChips = (n: number | string) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Re-run `fn` when the app comes back to the foreground or the network returns. */
function useResume(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const a = AppState.addEventListener('change', (s) => s === 'active' && ref.current());
    let wasOnline = true;
    const n = NetInfo.addEventListener((st) => {
      const online = !!st.isConnected;
      if (online && !wasOnline) ref.current();
      wasOnline = online;
    });
    return () => {
      a.remove();
      n();
    };
  }, []);
}

/** Live lobby list: `lobby.updated` on the public `lobbies` channel, plus polling. */
export function useLobbyUpdates(onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useResume(() => cb.current());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = false;
    let leave: (() => void) | null = null;
    let cancelled = false;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cb.current(), 250);
    };
    getEcho()
      .then((echo) => {
        if (!echo || cancelled) return;
        echo.channel('lobbies').listen('.lobby.updated', bump);
        live = true;
        leave = () => echo.leave('lobbies');
      })
      .catch(() => undefined);
    let tick = 0;
    const poll = setInterval(() => {
      tick += 1;
      if (!live || tick % 4 === 0) cb.current();
    }, 5_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      leave?.();
    };
  }, []);
}

/** Waiting room: table presence-channel events plus polling (1 s while the countdown runs). */
export function useWaitingRoomUpdates(tableId: number | null, onChange: () => void, fast = false) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useResume(() => cb.current());
  useEffect(() => {
    if (!tableId) return undefined;
    let leave: (() => void) | null = null;
    let cancelled = false;
    getEcho()
      .then((echo) => {
        if (!echo || cancelled) return;
        const ch = echo.join(`table.${tableId}`);
        ['player.joined', 'player.left', 'player.ready', 'player.seated', 'player.updated', 'table.full', 'match.countdown', 'match.countdown_cancelled', 'match.started', 'match.completed', 'player.disconnected', 'player.reconnected'].forEach((e) => ch.listen(`.${e}`, () => cb.current()));
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
}

const TABLE_EVENTS = [
  'player.joined', 'player.left', 'player.ready', 'table.full', 'game.started', 'game.timer',
  'player.submitted', 'game.all_submitted', 'game.revealed', 'game.scored', 'game.results',
  'player.disconnected', 'player.reconnected', 'game.cancelled', 'player.updated',
  'match.started', 'round.started', 'banker.assigned', 'player.bet', 'betting.closed', 'player.lucky',
  'round.completed', 'match.completed', 'match.paused', 'match.resumed',
];

/** Live table + current game session (port of the web's useTable). */
export function useTable(tableId: number | null, userId: number | undefined) {
  const [table, setTable] = useState<TableState | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [offset, setOffset] = useState(0);
  const busy = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (!tableId) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const { data } = await api<{ data: TableState }>(`/tables/${tableId}`);
      setTable(data);
      if (data.current_session_id) {
        const game = await api<{ data: SessionState }>(`/games/${data.current_session_id}`);
        setOffset(new Date(game.data.server_time).getTime() - Date.now());
        setSession(game.data);
      } else setSession(null);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setRemoved(true);
      setError(errorText(e));
    } finally {
      busy.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, [tableId]);

  const burst = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSoon = useCallback(() => {
    if (burst.current) clearTimeout(burst.current);
    burst.current = setTimeout(() => {
      burst.current = null;
      void refresh();
    }, 120);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tableId || !userId) return undefined;
    let cancelled = false;
    let cleanup = () => {};
    getEcho().then((echo) => {
      if (!echo || cancelled) return;
      const channel = echo.join(`table.${tableId}`);
      TABLE_EVENTS.forEach((e) => channel.listen(`.${e}`, refreshSoon));
      channel.here(() => setLive(true)).error(() => setLive(false));
      const mine = echo.private(`user.${userId}`);
      mine.listen('.cards.dealt', refreshSoon);
      cleanup = () => {
        echo.leave(`table.${tableId}`);
        mine.stopListening('.cards.dealt', refreshSoon);
      };
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [tableId, userId, refreshSoon]);

  const heartbeat = useCallback(() => {
    if (tableId) api(`/tables/${tableId}/heartbeat`, { method: 'POST' }).catch(() => undefined);
  }, [tableId]);
  useResume(() => {
    heartbeat();
    void refresh();
  });
  useEffect(() => {
    if (!tableId) return undefined;
    heartbeat();
    const beat = setInterval(heartbeat, 10_000);
    const poll = setInterval(() => void refresh(), live ? 30_000 : 4_000);
    return () => {
      clearInterval(beat);
      clearInterval(poll);
    };
  }, [tableId, refresh, live, heartbeat]);

  return { table, session, error, live, refresh, removed, clockOffset: offset };
}

/** Whole seconds left until `deadline` (server-aligned); re-renders once a second. */
export function useSecondsLeft(deadline: string | null | undefined, offsetMs: number): number {
  const calc = useCallback(() => (deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - (Date.now() + offsetMs)) / 1000)) : 0), [deadline, offsetMs]);
  const [, setShown] = useState(calc);
  useEffect(() => {
    if (!deadline) return undefined;
    const id = setInterval(() => setShown(calc()), 250);
    return () => clearInterval(id);
  }, [deadline, calc]);
  return calc();
}
