import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionState } from '@/lib/types';

const apiMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
}));

import ArrangeHands from './ArrangeHands';
import { BetPanel, LaneChips } from './BankerView';

const session = {
  id: 7,
  config: { currency: 'VC', min_bet: '50.00', max_bet: '500.00', room_name: 'R', entry_amount: '50.00', payout_mode: 'winner_takes_all', allow_foul_submission: false, arrangement_seconds: 60 },
} as unknown as SessionState;

const CARDS = ['2C', '2D', '5H', '5S', '7C', '7D', '9H', '9S', 'JC', 'JD', 'KH', 'KS', 'AC'];

describe('banker mode UI (mobile)', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/preview') ? { data: { labels: { front: null, middle: null, back: null }, is_foul: false } } : {}),
    );
  });

  it('bets a chip amount through the API (the server validates it)', async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<BetPanel session={session} secondsLeft={10} onDone={onDone} />);

    await user.click(screen.getByRole('button', { name: '250' }));
    await user.click(screen.getByRole('button', { name: /BET 250/ }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(apiMock).toHaveBeenCalledWith('/games/7/bet', { method: 'POST', body: { amount: '250.00' } });
  });

  it('declaring Lucky needs a confirmation and calls the lucky endpoint', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<ArrangeHands sessionId={7} cards={CARDS} allowFoul={false} onSubmitted={onSubmitted} lucky={{ type: 'six_pairs', label: 'Six Pairs' }} />);

    expect(screen.getByText(/Lucky Hand: Six Pairs/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /DECLARE LUCKY/ }));
    expect(apiMock).not.toHaveBeenCalledWith('/games/7/lucky', expect.anything());

    await user.click(screen.getByRole('button', { name: /Lock it in/ }));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(apiMock).toHaveBeenCalledWith('/games/7/lucky', { method: 'POST' });
  });

  it('drags a card from the hand onto a lane', async () => {
    render(<ArrangeHands sessionId={7} cards={CARDS} allowFoul={false} onSubmitted={() => undefined} />);
    const card = screen.getByRole('button', { name: 'A of clubs' });
    const front = screen.getByRole('button', { name: 'Front row' });

    // jsdom has no layout: point elementFromPoint at the Front lane for the drop.
    document.elementFromPoint = vi.fn(() => front);

    fireEvent.pointerDown(card.parentElement!, { clientX: 10, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 200 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 50 });

    await waitFor(() => expect(front).toContainElement(screen.getByRole('button', { name: 'A of clubs' })));
  });

  it('shows W/L/T lane chips', () => {
    render(<LaneChips lanes={{ front: 1, middle: -1, back: 0 }} />);
    expect(screen.getByText('W')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('T')).toBeInTheDocument();
  });
});
