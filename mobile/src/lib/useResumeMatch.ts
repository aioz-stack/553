'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { api } from './api';
import type { TableState } from './types';

/**
 * Reconnection: whenever this screen opens, the app returns to the foreground or the network
 * comes back, ask the server for your current seat. If a match you are seated in is still being
 * played, go straight back to it (/play/?table=ID) — the table then restores your round, cards and
 * saved arrangement from the server. Finished matches and waiting lobbies are left alone.
 */
export function useResumeMatch(userId: number | undefined, onSeat?: (seat: TableState | null) => void) {
  const router = useRouter();
  // The screen can reuse this answer (one /tables/current request, not two).
  const seatCb = useRef(onSeat);
  seatCb.current = onSeat;

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    const check = () => {
      api<{ data: TableState | null }>('/tables/current')
        .then((r) => {
          if (cancelled) return;
          seatCb.current?.(r?.data ?? null);
          if (r?.data && r.data.status === 'IN_GAME') router.replace(`/play/?table=${r.data.id}`);
        })
        .catch(() => undefined);
    };

    check();
    window.addEventListener('online', check);
    let removeResume: (() => void) | undefined;
    import('@capacitor/app')
      .then(({ App }) => App.addListener('resume', check))
      .then((handle) => {
        removeResume = () => handle.remove();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.removeEventListener('online', check);
      removeResume?.();
    };
  }, [userId, router]);
}
