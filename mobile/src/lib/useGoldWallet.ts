'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getEcho } from './echo';
import { fetchGold, type GoldWallet } from './gold';

/**
 * The signed-in player's Single Player Gold Wallet, straight from the server
 * (`GET /practice/gold`: Gold, Gold reserved in the open round, Total Amount,
 * Gold Points). One source for Home, the Single Player table and the card
 * arrangement popup, so they always show the same numbers.
 *
 * It reloads (never computes) when:
 *  - the private `user.{id}` channel says a GD / GP balance changed (`wallet.updated`);
 *  - any screen fires `pusoy:wallet` after a deal, settlement, claim or conversion;
 *  - the app comes back to the foreground.
 * Only one request runs at a time; a change that arrives meanwhile triggers
 * exactly one more request afterwards, so the latest balance always wins.
 */
export function useGoldWallet(userId: number | undefined) {
  const [wallet, setWallet] = useState<GoldWallet | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const reload = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();
    if (pending.current) {
      again.current = true;
      return pending.current;
    }
    pending.current = fetchGold()
      .then((w) => setWallet(w))
      .catch(() => undefined)
      .finally(() => {
        pending.current = null;
        if (again.current) {
          again.current = false;
          void reload();
        }
      });
    return pending.current;
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return undefined;
    let stop = () => {};
    let cancelled = false;

    getEcho().then((echo) => {
      if (!echo || cancelled) return;
      const channel = echo.private(`user.${userId}`);
      const onUpdate = (e: { currency?: string }) => {
        if (e.currency === 'GD' || e.currency === 'GP') void reload();
      };
      channel.listen('.wallet.updated', onUpdate);
      stop = () => channel.stopListening('.wallet.updated', onUpdate);
    });

    const onChange = () => void reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    window.addEventListener('pusoy:wallet', onChange);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      stop();
      window.removeEventListener('pusoy:wallet', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, reload]);

  return { wallet, reload };
}
