import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('./api', () => ({ api: (...args: unknown[]) => apiMock(...args), idempotencyKey: () => 'k' }));
vi.mock('./echo', () => ({ getEcho: () => Promise.resolve(null) }));

import { useGoldWallet } from './useGoldWallet';

const W = (total: string, points = '0.00') => ({ data: { gold: total, reserved: '0.00', total, gold_points: points, out_of_gold: false, can_claim: false, claim_amount: 1000, minimum_to_start: 1000 } });

describe('useGoldWallet', () => {
  beforeEach(() => apiMock.mockReset());

  it('loads the wallet from the server and reloads whenever any screen reports a wallet change', async () => {
    apiMock.mockResolvedValueOnce(W('1000.00')).mockResolvedValueOnce(W('1600.00', '250.00'));
    const { result } = renderHook(() => useGoldWallet(5));
    await waitFor(() => expect(result.current.wallet?.total).toBe('1000.00'));
    expect(apiMock).toHaveBeenCalledWith('/practice/gold');

    act(() => {
      window.dispatchEvent(new Event('pusoy:wallet'));
    });
    await waitFor(() => expect(result.current.wallet?.total).toBe('1600.00'));
    expect(result.current.wallet?.gold_points).toBe('250.00');
  });

  it('a change during a request is never lost: one request at a time, then one more for the latest balance', async () => {
    let release!: (v: unknown) => void;
    apiMock.mockImplementationOnce(() => new Promise((r) => (release = r))).mockResolvedValueOnce(W('900.00'));
    const { result } = renderHook(() => useGoldWallet(5));

    // Three changes while the first request is still out: no extra requests yet.
    act(() => {
      window.dispatchEvent(new Event('pusoy:wallet'));
      window.dispatchEvent(new Event('pusoy:wallet'));
      window.dispatchEvent(new Event('pusoy:wallet'));
    });
    expect(apiMock).toHaveBeenCalledTimes(1);

    await act(async () => release(W('1000.00')));
    // The first answer is followed by exactly one fresh request, whose balance wins.
    await waitFor(() => expect(result.current.wallet?.total).toBe('900.00'));
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it('does nothing when signed out', () => {
    renderHook(() => useGoldWallet(undefined));
    expect(apiMock).not.toHaveBeenCalled();
  });
});
