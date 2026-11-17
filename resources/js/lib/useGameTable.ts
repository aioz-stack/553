import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
import type { SessionState, TableState } from './types';

/**
 * Live table/game state for the web client.
 *
 * Real-time events from Reverb (presence channel `table.{id}` and private
 * `user.{id}`) are treated as signals: on every event the authoritative
 * state is re-fetched from the API. That keeps the client simple and makes
 * reconnection/state recovery identical to a first load. A slow poll is a
 * fallback when websockets are unavailable; a heartbeat lets the server
 * detect disconnects.
 */
const TABLE_EVENTS = [
  'player.joined',
  'player.left',
  'player.ready',
  'table.full',
  'game.started',
  'game.timer',
  'player.submitted',
  'game.all_submitted',
  'game.revealed',
  'game.scored',
  'game.results',
  'player.disconnected',
  'player.reconnected',
  'game.cancelled',
];

export function useGameTable(tableId: number, userId: number | undefined) {
  const [table, setTable] = useState<TableState | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const clockOffset = useRef(0);
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (refreshing.current) {
      return;
    }

    refreshing.current = true;

    try {
      const { data } = await api.get<{ data: TableState }>(`/tables/${tableId}`);
      setTable(data.data);

      if (data.data.current_session_id) {
        const game = await api.get<{ data: SessionState }>(`/games/${data.data.current_session_id}`);
        clockOffset.current = new Date(game.data.data.server_time).getTime() - Date.now();
        setSession(game.data.data);
      } else {
        setSession(null);
      }

      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      refreshing.current = false;
    }
  }, [tableId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime subscriptions.
  useEffect(() => {
    const echo = window.Echo;

    if (!echo || !userId) {
      return undefined;
    }

    const channel = echo.join(`table.${tableId}`);
    TABLE_EVENTS.forEach((name) =>
      channel.listen(`.${name}`, () => {
        setLastEvent(name);
        refresh();
      }),
    );
    channel.here(() => setConnected(true)).error(() => setConnected(false));

    const personal = echo.private(`user.${userId}`);
    personal.listen('.cards.dealt', () => refresh());

    const connector = (echo.connector as { pusher?: { connection: { bind: (e: string, cb: () => void) => void } } }).pusher;
    connector?.connection.bind('connected', () => {
      setConnected(true);
      refresh(); // recover state after a reconnect
    });
    connector?.connection.bind('unavailable', () => setConnected(false));

    return () => {
      echo.leave(`table.${tableId}`);
      echo.leave(`user.${userId}`);
    };
  }, [tableId, userId, refresh]);

  // Heartbeat + fallback poll.
  useEffect(() => {
    const beat = setInterval(() => {
      api.post(`/tables/${tableId}/heartbeat`).catch(() => undefined);
    }, 10_000);
    const poll = setInterval(() => refresh(), connected ? 30_000 : 4_000);

    return () => {
      clearInterval(beat);
      clearInterval(poll);
    };
  }, [tableId, refresh, connected]);

  const secondsLeft = useCountdown(session?.status === 'ARRANGING' ? session.arrangement_deadline : null, clockOffset.current);

  return { table, session, error, connected, lastEvent, refresh, secondsLeft };
}

export function useCountdown(deadline: string | null | undefined, offsetMs = 0): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) {
      return undefined;
    }

    const id = setInterval(() => setNow(Date.now()), 250);

    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) {
    return 0;
  }

  return Math.max(0, Math.ceil((new Date(deadline).getTime() - (now + offsetMs)) / 1000));
}
