import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  errorMessage: (e: { message?: string }) => e?.message ?? 'error',
}));

import ArrangementBoard from './ArrangementBoard';

const CARDS = ['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD'];

const card = (label: RegExp) => screen.getByRole('button', { name: label });

describe('ArrangementBoard', () => {
  beforeEach(() => {
    post.mockReset();
    post.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith('/preview') ? { labels: { front: null, middle: null, back: null }, complete: false, is_foul: false } : {} } }),
    );
    sessionStorage.clear();
  });

  it('places selected cards into rows and submits only when all 13 are placed', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(<ArrangementBoard sessionId={7} cards={CARDS} onSubmitted={onSubmitted} />);

    const submit = screen.getByRole('button', { name: /submit arrangement/i });
    expect(submit).toBeDisabled();

    const place = async (cards: RegExp[], row: string) => {
      for (const c of cards) {
        await user.click(card(c));
      }
      await user.click(screen.getByText(row).closest('[role="button"]') as HTMLElement);
    };

    await place([/^2 of clubs/, /^3 of diamonds/, /^4 of hearts/], 'Front');
    await place([/^10 of clubs/, /^10 of diamonds/, /^9 of hearts/, /^8 of spades/, /^5 of diamonds/], 'Middle');
    await place([/^A of clubs/, /^A of diamonds/, /^A of hearts/, /^K of spades/, /^K of diamonds/], 'Back');

    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    const [url, body] = post.mock.calls.find(([u]) => u === '/games/7/submit')!;
    expect(url).toBe('/games/7/submit');
    expect(body).toEqual({ front: ['2C', '3D', '4H'], middle: ['TC', 'TD', '9H', '8S', '5D'], back: ['AC', 'AD', 'AH', 'KS', 'KD'] });
  });

  it('never lets a row exceed its size', async () => {
    const user = userEvent.setup();
    render(<ArrangementBoard sessionId={7} cards={CARDS} onSubmitted={() => undefined} />);

    for (const c of [/^2 of clubs/, /^3 of diamonds/, /^4 of hearts/, /^10 of clubs/]) {
      await user.click(card(c));
    }
    await user.click(screen.getByText('Front').closest('[role="button"]') as HTMLElement);

    expect(screen.getByText('(3/3)')).toBeInTheDocument();
    expect(screen.getByText(/Your hand \(10\)/)).toBeInTheDocument();
  });

  it('shows the server foul warning and blocks submission', async () => {
    post.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.endsWith('/preview') ? { labels: { front: 'Three of a Kind', middle: null, back: null }, complete: true, is_foul: true } : {} } }),
    );

    await act(async () => {
      render(<ArrangementBoard sessionId={7} cards={CARDS} onSubmitted={() => undefined} />);
    });

    expect(await screen.findByText(/Foul: Back must be at least as strong/)).toBeInTheDocument();
    expect(screen.getByText('Three of a Kind')).toBeInTheDocument();
  });
});
