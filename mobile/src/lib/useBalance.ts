'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { getEcho } from './echo';
import type { Wallet } from './types';

/**
 * The signed-in player's own Chips and Gold. Loaded from /wallet, reloaded on
 * `pusoy:wallet` (any screen after a transaction) and on returning to the app, and updated live
 * from the private `user.{id}` channel (`wallet.updated`), which only ever
 * carries the owner's balance.
 */
export function useBalance(userId: number | undefined) {
  const [wallets, setWallets] = useState<Wallet[] | null>(null);

  const reload = useCallback(() => {
    if (!userId) {
      return;
    }
    api<{ data: Wallet[] }>('/wallet').then((r) => setWallets(Array.isArray(r?.data) ? r.data : [])).catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) {
      return undefined;
    }

    let stop = () => {};
    let cancelled = false;

    getEcho().then((echo) => {
      if (!echo || cancelled) {
        return;
      }
      const channel = echo.private(`user.${userId}`);
      const onUpdate = (e: { currency: string; balance: string }) => {
        setWallets((ws) => ws?.map((w) => (w.type === 'player' && w.currency === e.currency ? { ...w, balance: e.balance } : w)) ?? ws);
      };
      channel.listen('.wallet.updated', onUpdate);
      stop = () => channel.stopListening('.wallet.updated', onUpdate);
    });

    const onFocus = () => reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    window.addEventListener('pusoy:wallet', onFocus);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      stop();
      window.removeEventListener('pusoy:wallet', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, reload]);

  const find = (c: string) => wallets?.find((w) => w.type === 'player' && w.currency === c)?.balance;

  // Three separate wallets: Chips (Multiplayer), Gold (Single Player) and Keys. Never combined.
  return { chips: find('CH'), gold: find('GD'), keys: find('KY'), reload };
}
