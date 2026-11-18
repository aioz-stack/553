import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
}));

import SinglePlayerPicker from './SinglePlayerPicker';

// jsdom has no matchMedia (used by the reduced-motion check in CandyText).
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;

const TIERS = [
  { key: 'beginner', name: 'Beginner', stars: 1, crown: false, min_gold: 1000, bets: [50, 100, 500], eligible: true },
  { key: 'intermediate', name: 'Intermediate', stars: 2, crown: false, min_gold: 10000, bets: [500, 1000, 5000], eligible: true },
  { key: 'advanced', name: 'Advance', stars: 3, crown: false, min_gold: 100000, bets: [5000, 10000, 50000], eligible: false },
  { key: 'mastery', name: 'Mastery', stars: 3, crown: true, min_gold: 1000000, bets: [50000, 100000, 500000], eligible: false },
];

/** Let the tiers request resolve. */
const loaded = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('Single Player difficulty picker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.mockReset();
    apiMock.mockResolvedValue({ data: TIERS });
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('shows the four levels with bet amounts as information only, and no Back/Continue buttons', async () => {
    render(<SinglePlayerPicker onClose={vi.fn()} onContinue={vi.fn()} />);
    await loaded();

    expect(apiMock).toHaveBeenCalledWith('/practice/tiers', { query: {} });
    expect(screen.getAllByTestId(/^tier-/)).toHaveLength(4);
    // 12 bet notes, none of them a control.
    const notes = screen.getAllByTestId('bet-note');
    expect(notes).toHaveLength(12);
    notes.forEach((n) => expect(n.closest('[data-testid="bet-note"]')?.tagName).toBe('SPAN'));
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /back/i })).toBeNull();
    // Only the four cards and Close are buttons.
    expect(screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Beginner — minimum gold 1,000',
      'Intermediate — minimum gold 10,000',
      'Advance — minimum gold 100,000 (not enough gold)',
      'Mastery — minimum gold 1,000,000 (not enough gold)',
      'Close',
    ]);
  });

  it('tapping an affordable level selects it and proceeds automatically, once', async () => {
    const onContinue = vi.fn();
    render(<SinglePlayerPicker onClose={vi.fn()} onContinue={onContinue} />);
    await loaded();

    const card = screen.getByTestId('tier-intermediate');
    fireEvent.click(card);
    expect(card).toHaveAttribute('data-selected', 'true');
    expect(card).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText("LET'S GO!")).toBeInTheDocument();

    // A second tap (same or another card) during the hand-off is ignored.
    fireEvent.click(card);
    fireEvent.click(screen.getByTestId('tier-beginner'));
    expect(screen.getByTestId('tier-beginner')).toHaveAttribute('data-selected', 'false');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledWith({ tier: 'intermediate' });
    expect(JSON.parse(sessionStorage.getItem('pusoy.singlePlayer') ?? 'null')).toEqual({ tier: 'intermediate' });
  });

  it('refuses a level the player cannot afford with a notification', async () => {
    const onContinue = vi.fn();
    render(<SinglePlayerPicker onClose={vi.fn()} onContinue={onContinue} />);
    await loaded();

    fireEvent.click(screen.getByTestId('tier-mastery'));
    expect(screen.getByRole('alert')).toHaveTextContent('Not enough gold for Mastery. You need at least 1,000,000 gold.');
    expect(screen.getByTestId('tier-mastery')).toHaveAttribute('data-selected', 'false');

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Close and Escape return without starting a game', async () => {
    const onClose = vi.fn();
    const onContinue = vi.fn();
    render(<SinglePlayerPicker onClose={onClose} onContinue={onContinue} />);
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('shows an error with retry when the levels cannot load', async () => {
    apiMock.mockRejectedValueOnce(new Error('Network unavailable.'));
    render(<SinglePlayerPicker onClose={vi.fn()} onContinue={vi.fn()} />);
    await loaded();

    expect(screen.getByText('Network unavailable.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    await loaded();
    expect(screen.getByTestId('tier-beginner')).toBeInTheDocument();
  });
});
