import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
}));

import ArrangeHands from './ArrangeHands';
import { sortCards } from './PlayingCard';

const CARDS = ['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD'];

describe('ArrangeHands (mobile)', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/preview') ? { data: { labels: { front: null, middle: null, back: null }, is_foul: false } } : {}),
    );
  });

  it('builds the three hands by tapping and submits them to the server', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<ArrangeHands sessionId={3} cards={CARDS} allowFoul={false} onSubmitted={onSubmitted} />);

    const tap = async (codes: string[], row: string) => {
      for (const code of codes) {
        const rank = code[0] === 'T' ? '10' : code[0];
        const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[code[1]]!;
        const button = screen.getAllByRole('button').find((b) => b.textContent === `${rank}${suit}` && b.getAttribute('aria-pressed') !== null);
        await user.click(button!);
      }
      await user.click(screen.getByText(new RegExp(`^${row} \\d/`)).closest('div[class*="border-dashed"]') as HTMLElement);
    };

    await tap(['2C', '3D', '4H'], 'Front');
    await tap(['TC', 'TD', '9H', '8S', '5D'], 'Middle');
    await tap(['AC', 'AD', 'AH', 'KS', 'KD'], 'Back');

    const submit = screen.getByRole('button', { name: /submit arrangement/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(apiMock).toHaveBeenCalledWith('/games/3/submit', {
      method: 'POST',
      body: { front: ['2C', '3D', '4H'], middle: ['TC', 'TD', '9H', '8S', '5D'], back: ['AC', 'AD', 'AH', 'KS', 'KD'] },
    });
  });

  it('keeps submit disabled until every card is placed', () => {
    render(<ArrangeHands sessionId={3} cards={CARDS} allowFoul={false} onSubmitted={() => undefined} />);
    expect(screen.getByRole('button', { name: /submit arrangement/i })).toBeDisabled();
  });

  it('sorts cards for display only', () => {
    expect(sortCards(['2C', 'AS', 'KH'])).toEqual(['AS', 'KH', '2C']);
  });
});
