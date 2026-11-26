import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...a: unknown[]) => apiMock(...a), errorText: (e: Error) => e.message, ApiError: class extends Error {} }));
vi.mock('@/lib/echo', () => ({ getEcho: async () => null }));

import { useSecondsLeft, useTable } from './useTable';

describe('useTable', () => {
  beforeEach(() => apiMock.mockReset());

  it('a refresh asked for while one is running is not dropped: it runs once more afterwards', async () => {
    let release: () => void = () => {};
    let tableCalls = 0;
    apiMock.mockImplementation((path: string) => {
      if (path === '/tables/5') {
        tableCalls += 1;
        // The first load is slow; the refreshes asked for meanwhile collapse into one more run.
        if (tableCalls === 1) return new Promise((r) => (release = () => r({ data: { id: 5, current_session_id: null } })));
        return Promise.resolve({ data: { id: 5, current_session_id: null, status: 'IN_GAME' } });
      }
      return Promise.resolve({});
    });
    const { result } = renderHook(() => useTable(5, 1));
    await waitFor(() => expect(tableCalls).toBe(1));
    act(() => {
      void result.current.refresh();
      void result.current.refresh();
      void result.current.refresh();
    });
    await act(async () => release());
    await waitFor(() => expect(result.current.table?.status).toBe('IN_GAME'));
    expect(tableCalls).toBe(2);
  });
});

describe('useSecondsLeft', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('re-renders once per second, not on every check', () => {
    vi.setSystemTime(new Date('2026-11-26T00:00:00.000Z'));
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useSecondsLeft('2026-11-26T00:00:05.000Z', 0);
    });
    const start = renders;
    expect(result.current).toBe(5);
    act(() => vi.advanceTimersByTime(2000)); // 8 checks
    expect(result.current).toBe(3);
    expect(renders - start).toBeLessThanOrEqual(3);
  });
});

describe('useSecondsLeft — a deadline that arrives later', () => {
  it('is reported for the new deadline on the very render it arrives (never a stale 0)', () => {
    const later = new Date(Date.now() + 45_000).toISOString();
    const { result, rerender } = renderHook(({ d }: { d: string | null }) => useSecondsLeft(d, 0), { initialProps: { d: null as string | null } });
    expect(result.current).toBe(0);
    rerender({ d: later });
    expect(result.current).toBeGreaterThanOrEqual(44);
  });
});
