import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 1, name: 'Pat Player', username: 'player' } }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }), usePathname: () => '/practice/' }));
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<object>()), Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import Practice from './page';

const CARDS = ['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD'];
const ROWS = { front: ['2C', '3D', '4H'], middle: ['TC', 'TD', '9H', '8S', '5D'], back: ['AC', 'AD', 'AH', 'KS', 'KD'] };
const BOTS = [
  { seat: 2, name: 'LuckyBot', is_you: false },
  { seat: 3, name: 'CardBot', is_you: false },
  { seat: 4, name: 'AceBot', is_you: false },
];
const DEALT = { id: 9, status: 'arranging', cards: CARDS, players: [{ seat: 1, name: 'You', is_you: true }, ...BOTS], deck_commitment: 'c0ffee', server_seed: null, allow_foul: true };
const labels = { front: 'High Card', middle: 'One Pair', back: 'Full House' };
const lanes = (v: number) => ({ front: v, middle: v, back: v });
const DONE = {
  ...DEALT,
  status: 'completed',
  server_seed: 'abc123',
  players: [
    { seat: 1, name: 'You', is_you: true, ...ROWS, labels, is_foul: false, score: 6, placement: 1, vs_you: null },
    ...BOTS.map((b) => ({ ...b, ...ROWS, labels, is_foul: false, score: -2, placement: 2, vs_you: lanes(b.seat === 2 ? 0 : 1) })),
  ],
};

describe('Single Player practice', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation((path: string) => {
      if (path === '/practice') return Promise.resolve({ data: DEALT });
      if (path.endsWith('/preview')) return Promise.resolve({ data: { labels: { front: null, middle: null, back: null }, is_foul: false } });
      if (path.endsWith('/submit')) return Promise.resolve({ data: DONE });
      return Promise.resolve({});
    });
  });

  it('deals from the server, submits to the practice endpoint and shows the server scores', async () => {
    const user = userEvent.setup();
    render(<Practice />);

    await screen.findByText('LuckyBot');
    expect(apiMock).toHaveBeenCalledWith('/practice', { method: 'POST' });
    expect(apiMock.mock.calls.filter(([p]) => p === '/practice')).toHaveLength(1);

    const NAMES: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
    for (const [row, codes] of Object.entries(ROWS)) {
      for (const code of codes) {
        await user.click(screen.getByRole('button', { name: `${code[0] === 'T' ? '10' : code[0]} of ${NAMES[code[1]]}` }));
      }
      await user.click(screen.getByRole('button', { name: `${row[0].toUpperCase()}${row.slice(1)} row` }));
    }
    const submit = screen.getByRole('button', { name: /submit hand/i });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await screen.findByText('YOU WIN!');
    expect(apiMock).toHaveBeenCalledWith('/practice/9/submit', { method: 'POST', body: ROWS });
    expect(screen.getByText('+6 pts')).toBeInTheDocument();
    expect(screen.getAllByText('TIE').length).toBe(3);
    expect(screen.getByText(/Seed abc123/)).toBeInTheDocument();
  });
});
