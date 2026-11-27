import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import { getEcho } from './echo';
import { on } from './events';
import type { Wallet } from './types';

/** Single Player Gold wallet (server: GoldService). Display only — every change is made on the server. */
export interface GoldWallet {
  gold: string;
  reserved?: string;
  total?: string;
  out_of_gold: boolean;
  claim_amount: number;
  can_claim: boolean;
  minimum_to_start: number;
}

/**
 * Reload `load` whenever the server says your balance changed (`wallet.updated` on your private
 * channel), any screen reports a change, or the app returns to the foreground. One request at a
 * time; a change that arrives meanwhile triggers exactly one more.
 */
function useLive<T>(userId: number | undefined, load: () => Promise<T>, currency?: string) {
  const [value, setValue] = useState<T | null>(null);
  const pending = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback((): Promise<void> => {
    if (!userId) return Promise.resolve();
    if (pending.current) {
      again.current = true;
      return pending.current;
    }
    pending.current = loadRef
      .current()
      .then(setValue)
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
      const ch = echo.private(`user.${userId}`);
      const fn = (e: { currency?: string }) => {
        if (!currency || e.currency === currency) void reload();
      };
      ch.listen('.wallet.updated', fn);
      stop = () => ch.stopListening('.wallet.updated', fn);
    });
    const offWallet = on('wallet', () => void reload());
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void reload());
    return () => {
      cancelled = true;
      stop();
      offWallet();
      sub.remove();
    };
  }, [userId, reload, currency]);

  return { value, reload };
}

/** Chips (Multiplayer) and Keys balances from /wallet. */
export function useBalances(userId: number | undefined) {
  const { value, reload } = useLive<Wallet[]>(userId, () => api<{ data: Wallet[] }>('/wallet').then((r) => (Array.isArray(r?.data) ? r.data : [])));
  const of = (c: string) => value?.find((w) => w.currency === c)?.balance;
  return { chips: of('CH'), keys: of('KY'), reload };
}

/** Single Player Gold (spendable + reserved), from /practice/gold. */
export function useGold(userId: number | undefined) {
  const { value, reload } = useLive<GoldWallet>(userId, () => api<{ data: GoldWallet }>('/practice/gold').then((r) => r.data), 'GD');
  return { gold: value, reload };
}

export const fmt = (n: number | string | undefined | null) => (n === undefined || n === null ? '—' : Math.floor(Number(n)).toLocaleString('en-US'));
