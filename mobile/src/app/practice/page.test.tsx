import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
const replace = vi.fn();

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
  idempotencyKey: () => 'req-1',
  ApiError: class extends Error {
    constructor(message: string, public status = 0, public code?: string) {
      super(message);
    }
  },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 1, name: 'Pat Player', username: 'player' } }) }));
vi.mock('@/lib/useBalance', () => ({ useBalance: () => ({ cp: '10000.00', vc: '0.00' }) }));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));
vi.mock('@/lib/sound', () => ({ play: vi.fn(), useSound: () => [true, vi.fn()] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn(), back: vi.fn() }), usePathname: () => '/practice/' }));
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<object>()), Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import Practice from './page';
import { ApiError } from '@/lib/api';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;

const TIERS = [
  { key: 'beginner', name: 'Beginner', stars: 1, crown: false, min_gold: 1000, bets: [50, 100, 500], eligible: true },
  { key: 'mastery', name: 'Mastery', stars: 3, crown: true, min_gold: 1000000, bets: [50000, 100000, 500000], eligible: false },
];
const CARDS = ['2C', '3D', '4H', 'TC', 'TD', '9H', '8S', '5D', 'AC', 'AD', 'AH', 'KS', 'KD'];
const ROWS = { front: ['2C', '3D', '4H'], middle: ['TC', 'TD', '9H', '8S', '5D'], back: ['AC', 'AD', 'AH', 'KS', 'KD'] };
const labels = { front: 'High Card', middle: 'One Pair', back: 'Full House' };

const STANDINGS = [
  { seat: 1, name: 'You', gold: 0 },
  { seat: 2, name: 'LuckyBot', gold: 0 },
  { seat: 3, name: 'CardBot', gold: 0 },
  { seat: 4, name: 'AceBot', gold: 0 },
];
const MATCH = { id: 3, status: 'active', tier: { key: 'beginner', name: 'Beginner' }, rounds_total: 12, rounds_played: 0, next_round: 1, next_banker: 1, next_banker_name: 'You', wagering: false, gold: 0, standings: STANDINGS, history: [], current: null };
const DEALT = {
  id: 9,
  status: 'arranging',
  round: 1,
  rounds_total: 12,
  banker: 1,
  banker_name: 'You',
  tier: { key: 'beginner', name: 'Beginner' },
  bet: 0, // you bank round 1: no bet
  wagering: false,
  reserved: 0,
  covered: 300,
  cards: CARDS,
  players: [
    { seat: 1, name: 'You', is_you: true, is_banker: true, bet: 0 },
    { seat: 2, name: 'LuckyBot', is_you: false, is_banker: false, bet: 100 },
    { seat: 3, name: 'CardBot', is_you: false, is_banker: false, bet: 100 },
    { seat: 4, name: 'AceBot', is_you: false, is_banker: false, bet: 100 },
  ],
  result: null,
  lucky: null,
  deck_commitment: 'c0ffee',
  server_seed: null,
  allow_foul: false,
};
const lose3 = { front: -1, middle: -1, back: -1 };
// Round 1: you bank and beat all three bots (each loses every lane: −2 × 100).
const SETTLED = {
  ...DEALT,
  status: 'completed',
  server_seed: 'abc123',
  players: [
    { ...DEALT.players[0], ...ROWS, labels, is_foul: false, lucky: null, lanes: null, multiple: null, gold: 600 },
    ...DEALT.players.slice(1).map((p) => ({ ...p, ...ROWS, labels, is_foul: false, lucky: null, lanes: lose3, multiple: -2, gold: -200 })),
  ],
  result: { lanes: null, multiple: null, gold: 600 },
};
const AFTER_1 = {
  ...MATCH,
  rounds_played: 1,
  next_round: 2,
  next_banker: 2,
  next_banker_name: 'LuckyBot',
  gold: 600,
  standings: [
    { seat: 1, name: 'You', gold: 600 },
    { seat: 2, name: 'LuckyBot', gold: -200 },
    { seat: 3, name: 'CardBot', gold: -200 },
    { seat: 4, name: 'AceBot', gold: -200 },
  ],
  history: [{ round: 1, banker: 1, banker_name: 'You', bet: 100, multiple: null, gold: 600, lucky: null }],
};
const LUCKY = { ...SETTLED, lucky: { type: 'six_pairs', label: 'Six Pairs', multiplier: 2 }, result: { lanes: null, multiple: null, gold: 600 } };

function routes(over: Record<string, unknown> = {}) {
  apiMock.mockImplementation((path: string) => {
    if (path in over) {
      const v = over[path];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
    }
    if (path === '/practice/tiers') return Promise.resolve({ data: TIERS });
    if (path === '/practice/matches/current') return Promise.resolve({ data: null });
    if (path === '/practice/matches') return Promise.resolve({ data: MATCH });
    if (path === '/practice/matches/3/deal') return Promise.resolve({ data: DEALT });
    if (path === '/practice/matches/3') return Promise.resolve({ data: AFTER_1 });
    if (path.endsWith('/preview')) return Promise.resolve({ data: { labels: { front: null, middle: null, back: null }, is_foul: false, order: { front: null, middle: null, back: null } } });
    if (path.endsWith('/suggest')) return Promise.resolve({ data: ROWS });
    if (path.endsWith('/submit')) return Promise.resolve({ data: SETTLED });
    return Promise.resolve({});
  });
}

const NAMES: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const cardName = (code: string) => `${code[0] === 'T' ? '10' : code[0]} of ${NAMES[code[1]]}`;

/**
 * Open the table on a dealt round with the cards in hand (resumed, so no
 * arrangement popup): for tests of arranging on the table itself.
 */
async function openRound() {
  const base = apiMock.getMockImplementation()!;
  apiMock.mockImplementation((path: string, ...rest: unknown[]) =>
    path === '/practice/matches/current' ? Promise.resolve({ data: { ...MATCH, next_round: null, next_banker: null, current: DEALT } }) : base(path, ...rest),
  );
  render(<Practice />);
  await screen.findByRole('button', { name: 'Front row' });
}

describe('Single Player — Round Bank table', () => {
  beforeEach(() => {
    apiMock.mockReset();
    replace.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/practice/?tier=beginner');
    routes();
  });

  it('round 1: you are the banker — no chips, no bet; Deal starts the round and you cover the bots\' bets', async () => {
    render(<Practice />);

    const deal = await screen.findByRole('button', { name: 'Deal' });
    expect(apiMock).toHaveBeenCalledWith('/practice/matches', { method: 'POST', body: { tier: 'beginner' } });
    expect(screen.getByLabelText('Round')).toHaveTextContent('Round 1 / 12 · You bank');
    expect(screen.getByText(/You are the banker/)).toBeInTheDocument();
    expect(screen.getByText(/no bet needed/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Bet chips' })).toBeNull();
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Banker · no bet');

    fireEvent.click(deal);
    const popup = await screen.findByRole('dialog', { name: 'Declared Luck' });
    expect(apiMock).toHaveBeenCalledWith('/practice/matches/3/deal', { method: 'POST', body: { request_id: 'req-1' } });
    expect(popup).toHaveTextContent('Covering 300');
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Covering 300');
    expect(screen.getByLabelText('LuckyBot')).toHaveTextContent('Bet 100');
  });

  it('when a bot banks, you place your bet with a chip', async () => {
    const bot2 = { ...DEALT, round: 2, banker: 2, banker_name: 'LuckyBot', bet: 100, covered: 0, players: DEALT.players.map((p) => ({ ...p, is_banker: p.seat === 2, bet: p.seat === 2 ? 0 : 100 })) };
    routes({
      '/practice/matches': { data: { ...MATCH, rounds_played: 1, next_round: 2, next_banker: 2, next_banker_name: 'LuckyBot' } },
      '/practice/matches/3/deal': { data: bot2 },
    });
    render(<Practice />);

    await screen.findByRole('group', { name: 'Bet chips' });
    expect(screen.queryByRole('button', { name: 'Deal' })).toBeNull();
    expect(screen.getByText(/LuckyBot is the banker/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bet 100' }));
    await screen.findByRole('dialog', { name: 'Declared Luck' });
    expect(apiMock).toHaveBeenCalledWith('/practice/matches/3/deal', { method: 'POST', body: { bet: 100, request_id: 'req-1' } });
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Bet: 100 Gold');
  });

  it('arranges, submits, shows lane-by-lane results and moves on to round 2 with the bot banking', async () => {
    await openRound();
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled(); // never disabled

    for (const [row, codes] of Object.entries(ROWS)) {
      for (const code of codes) fireEvent.click(screen.getByRole('button', { name: cardName(code) }));
      fireEvent.click(screen.getByRole('button', { name: `${row[0].toUpperCase()}${row.slice(1)} row` }));
    }
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/practice/9/submit', { method: 'POST', body: ROWS }));
    const result = await screen.findByLabelText('Round result');
    expect(result).toHaveTextContent('+600');
    expect(result).toHaveTextContent('You banked · beat 3 of 3');
    expect(result).toHaveTextContent('Practice Gold — not credited');
    expect(screen.queryAllByText('WIN')).toHaveLength(0);
    expect(screen.getAllByText('LOSS')).toHaveLength(9); // each bot lost every lane to you
    await waitFor(() => expect(screen.getByLabelText('Match gold')).toHaveTextContent('Match +600'));
    expect(screen.getByText(/Round 2: LuckyBot banks/)).toBeInTheDocument();
    // Chips are back for the next round's bet.
    expect(screen.getByRole('button', { name: 'Bet 500' })).toBeEnabled();
  });

  it('a misplaced arrangement can still be submitted; the server applies the 2× penalty', async () => {
    const penalised = {
      ...SETTLED,
      players: [
        { ...SETTLED.players[0], is_foul: true, gold: -600 },
        ...SETTLED.players.slice(1).map((p) => ({ ...p, lanes: { front: 1, middle: 1, back: 1 }, multiple: 2, gold: 200 })),
      ],
      result: { lanes: null, multiple: null, gold: -600, misplaced: true },
    };
    routes({
      '/practice/9/preview': { data: { labels: { front: 'One Pair', middle: 'High Card', back: 'High Card' }, is_foul: true } },
      '/practice/9/submit': { data: penalised },
    });
    await openRound();
    fireEvent.click(screen.getByRole('switch', { name: 'Autoplay Arrange' }));
    await screen.findByText(/Misplaced cards — submitting now pays a 2× bet penalty/);

    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    const result = await screen.findByLabelText('Round result');
    expect(result).toHaveTextContent('−600');
    expect(result).toHaveTextContent('Misplaced cards — 2× penalty to each player');
  });

  it('Submit is never disabled; with cards still in hand it asks you to place them', async () => {
    await openRound();
    const submit = screen.getByRole('button', { name: 'Submit' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('Place all 13 cards first');
    expect(apiMock).not.toHaveBeenCalledWith('/practice/9/submit', expect.anything());
  });

  it('Autoplay Arrange fills the lanes from the server and Sort switches order', async () => {
    await openRound();
    fireEvent.click(screen.getByRole('switch', { name: 'Autoplay Arrange' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/practice/9/suggest', { method: 'POST' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
    expect(localStorage.getItem('pusoy.autoplayArrange')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Sort by suit' }));
    expect(screen.getByRole('button', { name: 'Sort by rank' })).toBeInTheDocument();
  });

  it('resumes an open round of the active match without dealing again', async () => {
    routes({ '/practice/matches/current': { data: { ...MATCH, next_round: null, next_banker: null, current: DEALT } } });
    render(<Practice />);

    await screen.findByRole('button', { name: 'Front row' });
    expect(apiMock).not.toHaveBeenCalledWith('/practice/matches', expect.anything());
    expect(apiMock).not.toHaveBeenCalledWith('/practice/matches/3/deal', expect.anything());
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Covering 300');
  });

  it('refuses a difficulty the player cannot afford', async () => {
    window.history.replaceState(null, '', '/practice/?tier=mastery');
    render(<Practice />);

    await screen.findByText('You need at least 1,000,000 gold to play Mastery');
    expect(screen.queryByRole('button', { name: 'Bet 50,000' })).toBeNull();
    expect(apiMock).not.toHaveBeenCalledWith('/practice/matches', expect.anything());
  });

  it('shows the match summary after round 12', async () => {
    const done = { ...AFTER_1, status: 'completed', rounds_played: 12, next_round: null, next_banker: null, gold: 650 };
    routes({ '/practice/matches/3': { data: done } });
    await openRound();
    fireEvent.click(screen.getByRole('switch', { name: 'Autoplay Arrange' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    const summary = await screen.findByRole('dialog', { name: 'Match results' }, { timeout: 3000 });
    expect(summary).toHaveTextContent('YOU WIN THE MATCH!');
    expect(summary).toHaveTextContent('+650 Gold');
    fireEvent.click(within(summary).getByRole('button', { name: 'New match' }));
    // The first match was resumed, so this is the first match created on this screen.
    await waitFor(() => expect(apiMock.mock.calls.filter(([p]) => p === '/practice/matches')).toHaveLength(1));
  });

  it('Back asks before leaving a round in progress; Settings and Help open panels', async () => {
    await openRound();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog', { name: 'How to play' })).toHaveTextContent('12 rounds');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Leave table' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(replace).toHaveBeenCalledWith('/home/?single=1');
  });

  it('has no timer: no countdown is shown and nothing is submitted while you take your time', async () => {
    await openRound();
    vi.useFakeTimers();
    try {
      // Ten minutes pass with the cards still in hand.
      await act(async () => {
        vi.advanceTimersByTime(10 * 60 * 1000);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(apiMock).not.toHaveBeenCalledWith('/practice/9/submit', expect.anything());
    expect(screen.queryByText(/\d+\s*s\b|countdown|time left|seconds/i)).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    // Still free to arrange: a card can be picked and placed.
    fireEvent.click(screen.getByRole('button', { name: cardName('2C') }));
    fireEvent.click(screen.getByRole('button', { name: 'Front row' }));
    expect(within(screen.getByRole('button', { name: 'Front row' })).getAllByRole('button')).toHaveLength(1);
  });

  it('opens the difficulty picker when no level was chosen', async () => {
    window.history.replaceState(null, '', '/practice/');
    render(<Practice />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(replace).toHaveBeenCalledWith('/home/?single=1');
    expect(apiMock).not.toHaveBeenCalled();
  });
});

describe('Declared Luck popup', () => {
  beforeEach(() => {
    apiMock.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/practice/?tier=beginner');
  });

  const deal = async () => {
    render(<Practice />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deal' }));
    return screen.findByRole('dialog', { name: 'Declared Luck' });
  };

  it('opens after the deal with all 13 cards, Declared Luck and SUBMIT — no Close button, no player portraits', async () => {
    routes();
    const popup = await deal();
    expect(within(popup).getAllByRole('button', { name: / of / })).toHaveLength(13);
    expect(within(popup).getByRole('button', { name: /Declared/ })).toBeInTheDocument();
    expect(within(popup).getByRole('button', { name: 'SUBMIT' })).toBeInTheDocument();
    expect(within(popup).queryByRole('button', { name: 'READY' })).toBeNull();
    expect(within(popup).queryByRole('button', { name: 'Close' })).toBeNull();
    // Opponents keep only their card fans: no avatar, name plate or "13 cards" label.
    expect(within(popup).getByLabelText("LuckyBot's cards")).toBeInTheDocument();
    expect(within(popup).getByLabelText("AceBot's cards")).toBeInTheDocument();
    expect(within(popup).queryByText('13 cards')).toBeNull();
    expect(within(popup).queryByText('BANKER')).toBeNull();
    // Betting information stays.
    expect(popup).toHaveTextContent('You bank');
    expect(popup).toHaveTextContent('Covering 300');
  });

  it('SUBMIT in the popup sends the lanes shown there and settles the round', async () => {
    routes();
    const popup = await deal();
    fireEvent.click(within(popup).getByRole('button', { name: 'Swap Middle and Back' }));
    fireEvent.click(within(popup).getByRole('button', { name: 'SUBMIT' }));

    await waitFor(() =>
      expect(apiMock).toHaveBeenCalledWith('/practice/9/submit', {
        method: 'POST',
        // The swap moved the aces-and-kings Back into the Middle (a misplaced hand, still submitted).
        body: { front: expect.arrayContaining(['4H', '3D', '2C']), middle: expect.arrayContaining(['AC', 'AD', 'AH', 'KS', 'KD']), back: expect.arrayContaining(['TC', 'TD', '9H', '8S', '5D']) },
      }),
    );
    expect(await screen.findByLabelText('Round result')).toHaveTextContent('+600');
    expect(screen.queryByRole('dialog', { name: 'Declared Luck' })).toBeNull();
    expect(apiMock.mock.calls.filter(([p]) => p === '/practice/9/submit')).toHaveLength(1);
  });

  it('shows NO LUCK! when the server says the cards do not qualify, and play continues', async () => {
    routes({ '/practice/9/lucky': new ApiError('Your cards do not qualify for Declared Luck.', 422, 'not_lucky') });
    const popup = await deal();
    fireEvent.click(within(popup).getByRole('button', { name: /Declared/ }));

    const note = await screen.findByRole('alertdialog', { name: 'No luck' });
    expect(note).toHaveTextContent('Your cards do not qualify for Declared Luck.');
    fireEvent.click(within(note).getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Declared Luck' })).toBeInTheDocument();
  });

  it('declares luck once and settles the round', async () => {
    routes({ '/practice/9/lucky': { data: LUCKY } });
    const popup = await deal();
    const btn = within(popup).getByRole('button', { name: /Declared/ });
    fireEvent.click(btn);
    fireEvent.click(btn);

    const note = await screen.findByRole('alertdialog', { name: 'Declared Luck' });
    expect(apiMock.mock.calls.filter(([p]) => p === '/practice/9/lucky')).toHaveLength(1);
    expect(note).toHaveTextContent('Six Pairs');
    expect(note).toHaveTextContent('+600 Gold');
    fireEvent.click(within(note).getByRole('button', { name: 'OK' }));
    expect(await screen.findByLabelText('Round result')).toHaveTextContent('Declared Luck — Six Pairs');
    expect(screen.queryByRole('button', { name: /Declared/ })).toBeNull();
  });
});
