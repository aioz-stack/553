import { act, fireEvent, render, screen } from '@testing-library/react';
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

const OUT: GoldWallet = { gold: '0.00', reserved: '0.00', total: '0.00', out_of_gold: true, can_claim: true, claim_amount: 1000, minimum_to_start: 1000 };
const CLAIMED = { ...OUT, gold: '1000.00', total: '1000.00', out_of_gold: false, can_claim: false, reference: 'TX1' };

describe('Out of Gold popup', () => {
  beforeEach(() => apiMock.mockReset());

  it('shows the title, the message and the CLAIM 1,000 GOLD button; nothing is credited before the click', () => {
    render(<OutOfGoldPopup initial={OUT} onClose={() => {}} onPlay={() => {}} />);
    const dialog = screen.getByRole('alertdialog', { name: 'Out of Gold' });
    expect(dialog).toHaveTextContent('Your Gold Wallet balance has reached zero!');
    expect(dialog).toHaveTextContent('Claim your FREE 1,000 Gold to replenish your wallet and continue enjoying Single Player!');
    expect(dialog).not.toHaveTextContent('Gold Points');
    expect(screen.getByRole('button', { name: 'CLAIM 1,000 GOLD' })).toBeEnabled();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('Claim credits Gold once: repeated clicks send one request with the popup key, then show the new Gold balance', async () => {
    let resolve!: (v: unknown) => void;
    apiMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const onPlay = vi.fn();
    render(<OutOfGoldPopup initial={OUT} onClose={() => {}} onPlay={onPlay} />);
    const claim = screen.getByRole('button', { name: 'CLAIM 1,000 GOLD' });
    // Three clicks in the same tick (before React re-renders), like a fast double-tap.
    act(() => {
      claim.click();
      claim.click();
      claim.click();
    });
    fireEvent.click(claim);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith('/practice/gold/claim', { method: 'POST', body: { request_id: 'key-1' } });

    await act(async () => resolve({ message: '1,000 Gold claimed!', data: CLAIMED }));
    expect(await screen.findByRole('status')).toHaveTextContent('1,000 Gold claimed!');
    expect(screen.getByLabelText('Gold balance')).toHaveTextContent('Gold: 1,000');

    fireEvent.click(screen.getByRole('button', { name: 'PLAY SINGLE PLAYER' }));
    expect(onPlay).toHaveBeenCalled();
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('shows the server refusal when you are not eligible', async () => {
    apiMock.mockRejectedValueOnce(new ApiError('You still have Gold to play with.', 409, 'not_eligible'));
    render(<OutOfGoldPopup initial={OUT} onClose={() => {}} onPlay={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'CLAIM 1,000 GOLD' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You still have Gold to play with.');
  });
});
