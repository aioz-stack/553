'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, errorText } from './api';

/**
 * GET an API path and keep the JSON in state.
 */
export function useFetch<T>(path: string | null, query: Record<string, unknown> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const key = JSON.stringify(query);

  const reload = useCallback(async () => {
    if (!path) {
      return;
    }

    setLoading(true);

    try {
      setData(await api<T>(path, { query: JSON.parse(key) }));
      setError(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [path, key]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload };
}

/**
 * Online/offline status from @capacitor/network (falls back to navigator.onLine).
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let remove: (() => void) | undefined;

    (async () => {
      try {
        const { Network } = await import('@capacitor/network');
        setOnline((await Network.getStatus()).connected);
        const handle = await Network.addListener('networkStatusChange', (s) => setOnline(s.connected));
        remove = () => handle.remove();
      } catch {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        remove = () => {
          window.removeEventListener('online', update);
          window.removeEventListener('offline', update);
        };
      }
    })();

    return () => remove?.();
  }, []);

  return online;
}

export function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(name));
  }, [name]);

  return value;
}

export function points(value: string | number | null | undefined, currency?: string): string {
  const formatted = Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return currency ? `${formatted} ${currency}` : formatted;
}

export function titleCase(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
