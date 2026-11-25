'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorText } from './api';
import { getEcho } from './echo';
import type { SessionState, TableState } from './types';

const EVENTS = [
  'player.joined', 'player.left', 'player.ready', 'table.full', 'game.started', 'game.timer',
  'player.submitted', 'game.all_submitted', 'game.revealed', 'game.scored', 'game.results',
  'player.disconnected', 'player.reconnected', 'game.cancelled', 'player.updated',
  // banker modes
  'match.started', 'round.started', 'banker.assigned', 'player.bet', 'betting.closed', 'player.lucky',
  'round.completed', 'match.completed', 'match.paused', 'match.resumed',
];

/**
 * Live table state. Reverb events are signals to re-fetch the authoritative
 * state from the API — so reconnecting after a network drop or app resume
 * recovers exactly like a fresh load. Falls back to polling without sockets.
 */
export function useTable(tableId: number | null, userId: number | undefined) {
  const [table, setTable] = useState<TableState | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  /** The server no longer seats you here (removed after missing rounds, or the table is gone). */
  const [removed, setRemoved] = useState(false);
  const offset = useRef(0);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!tableId || busy.current) {
      return;
    }

    busy.current = true;

    try {
      const { data } = await api<{ data: TableState }>(`/tables/${tableId}`);
      setTable(data);

      if (data.current_session_id) {
        const game = await api<{ data: SessionState }>(`/games/${data.current_session_id}`);
        offset.current = new Date(game.data.server_time).getTime() - Date.now();
        setSession(game.data);
      } else {
        setSession(null);
      }

      setError(null);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 403 || e.status === 404)) setRemoved(true);
      setError(errorText(e));
    } finally {
      busy.current = false;
    }
  }, [tableId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tableId || !userId) {
      return undefined;
    }

    let cancelled = false;
    let cleanup = () => {};

    getEcho().then((echo) => {
      if (!echo || cancelled) {
        return;
      }

      const channel = echo.join(`table.${tableId}`);
      EVENTS.forEach((e) => channel.listen(`.${e}`, () => refresh()));
      channel.here(() => setLive(true)).error(() => setLive(false));
      echo.private(`user.${userId}`).listen('.cards.dealt', () => refresh());

      cleanup = () => {
        echo.leave(`table.${tableId}`);
        echo.leave(`user.${userId}`);
      };
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [tableId, userId, refresh]);

  // Heartbeat, polling fallback, and recovery when the app returns to the foreground.
  useEffect(() => {
    if (!tableId) {
      return undefined;
    }

    // Heartbeat: right away (so a reconnect is noticed at once), every 10 s, on app resume and when the network returns.
    const heartbeat = () => api(`/tables/${tableId}/heartbeat`, { method: 'POST' }).catch(() => undefined);
    heartbeat();
    const beat = setInterval(heartbeat, 10_000);
    const online = () => {
      heartbeat();
      refresh();
    };
    window.addEventListener('online', online);
    const poll = setInterval(refresh, live ? 30_000 : 4_000);
    let removeResume: (() => void) | undefined;

    import('@capacitor/app')
      .then(({ App }) => App.addListener('resume', () => online()))
      .then((handle) => {
        removeResume = () => handle.remove();
      })
      .catch(() => undefined);

    return () => {
      clearInterval(beat);
      clearInterval(poll);
      window.removeEventListener('online', online);
      removeResume?.();
    };
  }, [tableId, refresh, live]);

  return { table, session, error, live, refresh, removed, clockOffset: offset.current };
}

export function useSecondsLeft(deadline: string | null | undefined, offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) {
      return undefined;
    }

    const id = setInterval(() => setNow(Date.now()), 250);

    return () => clearInterval(id);
  }, [deadline]);

  return deadline ? Math.max(0, Math.ceil((new Date(deadline).getTime() - (now + offsetMs)) / 1000)) : 0;
}
