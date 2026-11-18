import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
  idempotencyKey: () => 'key-1',
  ApiError: class extends Error {
    constructor(message: string, public status = 0, public code?: string) {
      super(message);
    }
  },
}));
vi.mock('@/lib/sound', () => ({ play: vi.fn() }));

import OutOfGoldPopup from './OutOfGoldPopup';
import { ApiError } from '@/lib/api';
import type { GoldWallet } from '@/lib/gold';

const OUT: GoldWallet = { gold: '0.00', gold_points: '0.00', out_of_gold: true, can_claim: true, claim_amount: 1000, minimum_to_start: 1000 };
const CLAIMED = { ...OUT, gold_points: '1000.00', can_claim: false, reference: 'TX1' };

describe('Out of Gold popup', () => {
  beforeEach(() => apiMock.mockReset());

  it('shows the title, the message and the CLAIM 1,000 GOLD POINTS button; nothing is credited before the click', () => {
    render(<OutOfGoldPopup initial={OUT} onClose={() => {}} onPlay={() => {}} />);
    const dialog = screen.getByRole('alertdialog', { name: 'Out of Gold' });
    expect(dialog).toHaveTextContent('Your Gold Wallet balance has reached zero!');
    expect(dialog).toHaveTextContent('Claim your FREE 1,000 Gold Points to replenish your wallet and continue enjoying Single Player!');
    expect(screen.getByRole('button', { name: 'CLAIM 1,000 GOLD POINTS' })).toBeEnabled();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('Claim asks the server once (repeated clicks while it runs do nothing), then shows the new Gold Points balance', async () => {
    let resolve!: (v: unknown) => void;
    apiMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    render(<OutOfGoldPopup initial={OUT} onClose={() => {}} onPlay={() => {}} />);
    const claim = screen.getByRole('button', { name: 'CLAIM 1,000 GOLD POINTS' });
    // Three clicks in the same tick (before React re-renders), like a fast double-tap.
    act(() => {
      claim.click();
      claim.click();
      claim.click();
    });
    fireEvent.click(claim);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith('/practice/gold/claim', { method: 'POST' });

    resolve({ message: '1,000 Gold Points claimed!', data: CLAIMED });
    expect(await screen.findByRole('status')).toHaveTextContent('1,000 Gold Points claimed!');
    expect(screen.getByLabelText('Gold Points balance')).toHaveTextContent('Gold Points: 1,000');
  });

  it('Convert to Gold & Play converts on the server (with a retry-safe key) and then continues to Single Player', async () => {
    const onPlay = vi.fn();
    apiMock.mockResolvedValueOnce({ message: 'ok', data: CLAIMED });
    apiMock.mockResolvedValueOnce({ message: 'converted', data: { ...OUT, gold: '1000.00', gold_points: '0.00', out_of_gold: false, can_claim: false, converted: '1000.00' } });
    render(<OutOfGoldPopup initial={OUT} onClose={() => {}} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button', { name: 'CLAIM 1,000 GOLD POINTS' }));
    fireEvent.click(await screen.findByRole('button', { name: 'CONVERT TO GOLD & PLAY' }));
    await waitFor(() => expect(onPlay).toHaveBeenCalled());
    expect(apiMock).toHaveBeenLastCalledWith('/practice/gold/convert', { method: 'POST', body: { request_id: 'key-1' } });
  });

  it('an already-claimed reward opens on the convert step; Later closes without converting', () => {
    const onClose = vi.fn();
    render(<OutOfGoldPopup initial={CLAIMED} onClose={onClose} onPlay={() => {}} />);
    expect(screen.queryByRole('button', { name: /CLAIM/ })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('You have 1,000 Gold Points waiting.');
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onClose).toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('shows the server refusal when you are not eligible', async () => {
    apiMock.mockRejectedValueOnce(new ApiError('You still have Gold to play with.', 409, 'not_eligible'));
    render(<OutOfGoldPopup initial={OUT} onClose={() => {}} onPlay={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'CLAIM 1,000 GOLD POINTS' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You still have Gold to play with.');
  });
});
