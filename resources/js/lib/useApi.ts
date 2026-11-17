import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';

export interface Paginated<T> {
  data: T[];
  meta?: { current_page: number; last_page: number; total: number; per_page: number };
  links?: { prev: string | null; next: string | null };
}

/**
 * Fetch JSON from /api/v1 and keep it in state. `params` changes refetch.
 */
export function useApi<T = unknown>(path: string | null, params: Record<string, unknown> = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const key = JSON.stringify(params);
  const mounted = useRef(true);

  const reload = useCallback(async () => {
    if (path === null) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.get<T>(path, { params: JSON.parse(key) });

      if (mounted.current) {
        setData(response.data);
      }
    } catch (e) {
      if (mounted.current) {
        setError(errorMessage(e));
      }
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [path, key]);

  useEffect(() => {
    mounted.current = true;
    reload();

    return () => {
      mounted.current = false;
    };
  }, [reload]);

  return { data, error, loading, reload, setData };
}
