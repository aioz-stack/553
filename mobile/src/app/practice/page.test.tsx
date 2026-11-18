import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
// Most tests run like a reduced-motion device (no deal / reveal show); the reveal-show tests turn motion on.
const motion = vi.hoisted(() => ({ reduced: true }));
vi.mock('@/lib/motion', async (orig) => ({ ...(await orig<object>()), reducedNow: () => motion.reduced }));
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

const PREVIEW_PATH = '/practice/9/preview';
type L = 'front' | 'middle' | 'back';
const LANE_KEYS: L[] = ['front', 'middle', 'back'];

/** Deal round 1 (you bank: Deal, no bet) and return the arrangement popup. */
async function dealToPopup() {
  render(<Practice />);
  fireEvent.click(await screen.findByRole('button', { name: 'Deal' }));
  return screen.findByRole('dialog', { name: 'Declared Luck' });
}

const rowOf = (popup: HTMLElement, lane: L) => within(popup).getByRole('group', { name: `${lane} lane` });
const namesIn = (el: HTMLElement) => within(el).queryAllByRole('button', { name: / of / }).map((b) => b.getAttribute('aria-label'));
const rowsIn = (popup: HTMLElement) => Object.fromEntries(LANE_KEYS.map((l) => [l, namesIn(rowOf(popup, l))]));
const tapCard = (popup: HTMLElement, code: string) => fireEvent.click(within(popup).getByRole('button', { name: cardName(code) }));
/** The dealt cards placed straight into the rows: 1-3 Front, 4-8 Middle, 9-13 Back. */
const dealtRowsOf = (cards: string[]) => ({ front: cards.slice(0, 3).map(cardName), middle: cards.slice(3, 8).map(cardName), back: cards.slice(8).map(cardName) });

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
    expect(screen.queryByRole('group', { name: 'Bet chips' })).toBeNull();
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Banker · no bet');

    fireEvent.click(deal);
    const popup = await screen.findByRole('dialog', { name: 'Declared Luck' });
    expect(apiMock).toHaveBeenCalledWith('/practice/matches/3/deal', { method: 'POST', body: { request_id: 'req-1' } });
    expect(popup).toHaveTextContent('Covering 300');
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
    fireEvent.click(screen.getByRole('button', { name: 'Bet 100' }));
    await screen.findByRole('dialog', { name: 'Declared Luck' });
    expect(apiMock).toHaveBeenCalledWith('/practice/matches/3/deal', { method: 'POST', body: { bet: 100, request_id: 'req-1' } });
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Bet: 100 Gold');
  });

  it('all 13 cards sit directly in Front / Middle / Back, in dealt order — no separate card panel, nothing sorted', async () => {
    localStorage.setItem('pusoy.autoplayArrange', '1'); // an old "Autoplay on" setting is ignored
    const popup = await dealToPopup();

    expect(rowsIn(popup)).toEqual(dealtRowsOf(CARDS));
    expect(within(popup).queryByRole('button', { name: 'Your cards' })).toBeNull();
    expect(within(popup).getAllByRole('button', { name: / of / })).toHaveLength(13); // every card is in a row
    // Counts per section.
    expect(within(popup).getByLabelText('front count')).toHaveTextContent('3/3');
    expect(within(popup).getByLabelText('middle count')).toHaveTextContent('5/5');
    expect(within(popup).getByLabelText('back count')).toHaveTextContent('5/5');
    expect(apiMock).not.toHaveBeenCalledWith('/practice/9/suggest', expect.anything());
    // The table's own hand strip is hidden while the popup is open.
    expect(screen.queryByLabelText('Your hand')).toBeNull();
  });

  it('click-to-select and click-to-place: tap a card, then another to swap — across rows or within a row', async () => {
    const popup = await dealToPopup();

    // Front ↔ Back: 2C goes to Back, KD comes to Front.
    tapCard(popup, '2C');
    expect(within(popup).getByRole('button', { name: cardName('2C') })).toHaveAttribute('aria-pressed', 'true');
    tapCard(popup, 'KD');
    expect(rowsIn(popup).front).toEqual(['KD', '3D', '4H'].map(cardName));
    expect(rowsIn(popup).back).toEqual(['AC', 'AD', 'AH', 'KS', '2C'].map(cardName));

    // Within a row: reorder.
    tapCard(popup, 'TC');
    tapCard(popup, '5D');
    expect(rowsIn(popup).middle).toEqual(['5D', 'TD', '9H', '8S', 'TC'].map(cardName));

    // Tap the same card again to put it down.
    tapCard(popup, '9H');
    tapCard(popup, '9H');
    expect(within(popup).getByRole('button', { name: cardName('9H') })).toHaveAttribute('aria-pressed', 'false');

    // Rows only take their exact count: tapping a row while holding a card explains how to move into it.
    tapCard(popup, '9H');
    fireEvent.click(rowOf(popup, 'front'));
    expect(within(popup).getByRole('status')).toHaveTextContent('Front is full (3/3) — tap one of its cards to swap.');
    expect(namesIn(rowOf(popup, 'front'))).toHaveLength(3);

  });

  it('drag and drop: drop a card on another card to swap them', async () => {
    const popup = await dealToPopup();
    const drop = (from: HTMLElement, target: HTMLElement) => {
      if (!document.elementFromPoint) document.elementFromPoint = () => null; // not implemented by jsdom
      const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
      fireEvent.pointerDown(from, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(window, { clientX: 60, clientY: 60 });
      fireEvent.pointerUp(window, { clientX: 60, clientY: 60 });
      spy.mockRestore();
    };
    const cardEl = (c: string) => popup.querySelector(`[data-card="${c}"]`) as HTMLElement;

    drop(cardEl('4H'), cardEl('AC'));
    expect(rowsIn(popup).front).toEqual(['2C', '3D', 'AC'].map(cardName));
    expect(rowsIn(popup).back[0]).toBe(cardName('4H'));

    // Dropping on a row's empty space does nothing (rows are full) but says how to do it.
    drop(cardEl('2C'), rowOf(popup, 'middle'));
    expect(rowsIn(popup).front[0]).toBe(cardName('2C'));
    expect(within(popup).getByRole('status')).toHaveTextContent('Drop it on a card to swap the two.');
  });

  it('drag: the lifted card keeps exactly the size of its slot and the slot empties while it is held', async () => {
    const popup = await dealToPopup();
    const before = rowsIn(popup);
    const slot = popup.querySelector('[data-card="4H"]') as HTMLElement;
    const card = slot.firstElementChild as HTMLElement;
    // jsdom has no layout: give the card its real size in the row (104 × 140).
    Object.defineProperty(card, 'offsetWidth', { configurable: true, value: 104 });
    Object.defineProperty(card, 'offsetHeight', { configurable: true, value: 140 });

    fireEvent.pointerDown(slot, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 40 });
    const ghost = await waitFor(() => {
      const g = popup.querySelector('.cd-lift')?.parentElement as HTMLElement | null;
      expect(g).not.toBeNull();
      return g as HTMLElement;
    });
    expect(ghost.style.width).toBe('104px');
    expect(ghost.style.height).toBe('140px');
    expect(within(ghost).getByRole('button', { name: '4 of hearts', hidden: true })).toHaveStyle({ width: '104px', height: '140px' });
    expect(slot).toHaveClass('opacity-0');

    // Released over nothing: it goes back (no swap) and the slot shows the card again.
    if (!document.elementFromPoint) document.elementFromPoint = () => null;
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
    fireEvent.pointerUp(window, { clientX: 80, clientY: 40 });
    spy.mockRestore();
    await waitFor(() => expect(popup.querySelector('.cd-lift')).toBeNull());
    expect(slot).not.toHaveClass('opacity-0');
    expect(rowsIn(popup)).toEqual(before);
  });

  it('shows the server\'s hand names and order marks, and SUBMIT sends exactly your rows', async () => {
    routes({ [PREVIEW_PATH]: { data: { labels: { front: 'High Card', middle: 'One Pair', back: 'Full House' }, is_foul: false, order: { front: true, middle: true, back: true } } } });
    const popup = await dealToPopup();
    await within(popup).findByText('Full House');
    expect(within(popup).getAllByLabelText('In order')).toHaveLength(3);

    fireEvent.click(within(popup).getByRole('button', { name: 'SUBMIT' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/practice/9/submit', { method: 'POST', body: ROWS }));
    const result = await screen.findByLabelText('Round result');
    expect(result).toHaveTextContent('+600');
    await waitFor(() => expect(screen.getByLabelText('Match gold')).toHaveTextContent('Match +600'));
    expect(screen.getByText(/Round 2: LuckyBot banks/)).toBeInTheDocument();
  });

  it('a misplaced arrangement is still submitted as you made it; the server applies the 2× penalty', async () => {
    const penalised = {
      ...SETTLED,
      players: [{ ...SETTLED.players[0], is_foul: true, gold: -600 }, ...SETTLED.players.slice(1).map((p) => ({ ...p, lanes: { front: 1, middle: 1, back: 1 }, multiple: 2, gold: 200 }))],
      result: { lanes: null, multiple: null, gold: -600, misplaced: true },
    };
    routes({
      [PREVIEW_PATH]: { data: { labels: { front: 'High Card', middle: 'Full House', back: 'One Pair' }, is_foul: true, order: { front: true, middle: false, back: false } } },
      '/practice/9/submit': { data: penalised },
    });
    const popup = await dealToPopup();
    fireEvent.click(within(popup).getByRole('button', { name: 'Swap Middle and Back' }));
    await within(popup).findAllByLabelText('Out of order');
    fireEvent.click(within(popup).getByRole('button', { name: 'SUBMIT' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/practice/9/submit', { method: 'POST', body: { front: ROWS.front, middle: ROWS.back, back: ROWS.middle } }));
    expect(await screen.findByLabelText('Round result')).toHaveTextContent('Misplaced cards — 2× penalty to each player');
  });

  it('there are no Dealt order or Auto Arrange buttons: only you move the cards', async () => {
    const popup = await dealToPopup();
    expect(within(popup).queryByRole('button', { name: 'Dealt order' })).toBeNull();
    expect(within(popup).queryByRole('button', { name: 'Auto Arrange' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Auto Arrange' })).toBeNull();
    tapCard(popup, '2C');
    tapCard(popup, 'KD');
    expect(rowsIn(popup).front).toEqual(['KD', '3D', '4H'].map(cardName));
    expect(apiMock.mock.calls.some(([p]) => String(p).endsWith('/suggest'))).toBe(false);
  });

  it('Sort starts at dealt order and only changes when you tap it', async () => {
    await dealToPopup();
    fireEvent.click(screen.getByRole('button', { name: /Sort: dealt order/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sort: by rank/ }));
    fireEvent.click(screen.getByRole('button', { name: /Sort: by suit/ }));
    expect(screen.getByRole('button', { name: /Sort: dealt order/ })).toBeInTheDocument();
  });

  it('resumes an open round without dealing again, cards in the rows in dealt order', async () => {
    routes({ '/practice/matches/current': { data: { ...MATCH, next_round: null, next_banker: null, current: DEALT } } });
    render(<Practice />);
    const popup = await screen.findByRole('dialog', { name: 'Declared Luck' });
    expect(apiMock).not.toHaveBeenCalledWith('/practice/matches/3/deal', expect.anything());
    expect(rowsIn(popup)).toEqual(dealtRowsOf(CARDS));
  });

  it('refuses a difficulty the player cannot afford', async () => {
    window.history.replaceState(null, '', '/practice/?tier=mastery');
    render(<Practice />);
    await screen.findByText('You need at least 1,000,000 gold to play Mastery');
    expect(apiMock).not.toHaveBeenCalledWith('/practice/matches', expect.anything());
  });

  it('Out of Gold: when a round leaves you unable to continue, the match ends and you are taken Home to claim free Gold Points', async () => {
    routes({ '/practice/matches/3': { data: { ...AFTER_1, status: 'out_of_gold', out_of_gold: true } } });
    const popup = await dealToPopup();
    fireEvent.click(within(popup).getByRole('button', { name: 'SUBMIT' }));
    expect(await screen.findByRole('alert', { name: 'Out of Gold' })).toHaveTextContent('Single Player has ended');
    // No further round: no chips or Deal, and no new deal is requested.
    expect(screen.queryByRole('button', { name: 'Deal' })).toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home/?gold=out'), { timeout: 4000 });
    expect(apiMock.mock.calls.filter(([p]) => p === '/practice/matches/3/deal')).toHaveLength(1);
  });

  it('Out of Gold before playing: Single Player sends you straight Home (no match is started)', async () => {
    routes({ '/practice/tiers': { data: TIERS, meta: { gold_wallet: { gold: '0.00', gold_points: '0.00', out_of_gold: true, can_claim: true, claim_amount: 1000, minimum_to_start: 1000 } } } });
    render(<Practice />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home/?gold=out'));
    expect(apiMock).not.toHaveBeenCalledWith('/practice/matches', expect.anything());
  });

  it('shows the match summary after round 12', async () => {
    routes({ '/practice/matches/3': { data: { ...AFTER_1, status: 'completed', rounds_played: 12, next_round: null, next_banker: null, gold: 650 } } });
    const popup = await dealToPopup();
    fireEvent.click(within(popup).getByRole('button', { name: 'SUBMIT' }));
    const summary = await screen.findByRole('dialog', { name: 'Match results' }, { timeout: 3000 });
    expect(summary).toHaveTextContent('+650 Gold');
  });

  it('has no time limit: the popup stays open and nothing is submitted until you press SUBMIT', async () => {
    const popup = await dealToPopup();
    vi.useFakeTimers();
    try {
      await act(async () => {
        vi.advanceTimersByTime(30 * 60 * 1000);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(screen.getByRole('dialog', { name: 'Declared Luck' })).toBe(popup);
    expect(apiMock).not.toHaveBeenCalledWith('/practice/9/submit', expect.anything());
    expect(screen.queryByRole('timer')).toBeNull();
    fireEvent.click(within(popup).getByRole('button', { name: 'SUBMIT' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/practice/9/submit', expect.anything()));
  });

  it('Back asks before leaving a round in progress; Settings and Help open panels', async () => {
    await dealToPopup();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).not.toHaveTextContent('Autoplay');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByRole('dialog', { name: 'How to play' })).toHaveTextContent('swap');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(replace).toHaveBeenCalledWith('/home/?single=1');
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

describe('Declared Luck', () => {
  beforeEach(() => {
    apiMock.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/practice/?tier=beginner');
  });

  it('the popup has Declared Luck and SUBMIT — no Close button, no player portraits', async () => {
    routes();
    const popup = await dealToPopup();
    expect(within(popup).getByRole('button', { name: /Declared/ })).toBeInTheDocument();
    expect(within(popup).getByRole('button', { name: 'SUBMIT' })).toBeInTheDocument();
    expect(within(popup).queryByRole('button', { name: 'Close' })).toBeNull();
    expect(within(popup).getByLabelText("LuckyBot's cards")).toBeInTheDocument();
    expect(within(popup).queryByText('BANKER')).toBeNull();
  });

  it('a failed declaration shows NO LUCK! with the 2× loss and ends the round', async () => {
    const FAILED = { ...SETTLED, lucky: null, result: { lanes: null, multiple: -2, gold: -600, lucky_failed: true } };
    routes({ '/practice/9/lucky': { data: FAILED } });
    const popup = await dealToPopup();
    fireEvent.click(within(popup).getByRole('button', { name: /Declared/ }));
    const note = await screen.findByRole('alertdialog', { name: 'No luck' });
    expect(note).toHaveTextContent('No Three Flushes, No Face Cards or Six Pairs');
    expect(note).toHaveTextContent('Declaration failed · 2× bet to each bot');
    expect(note).toHaveTextContent('−600 Gold');
    fireEvent.click(within(note).getByRole('button', { name: 'OK' }));
    // The round is settled: no arrangement popup to go back to.
    expect(screen.queryByRole('dialog', { name: 'Declared Luck' })).toBeNull();
    expect(screen.getByLabelText('Round result')).toHaveTextContent('Declared Luck failed — 2× bet to each player');
  });

  it('declares luck once and settles the round', async () => {
    routes({ '/practice/9/lucky': { data: LUCKY } });
    const popup = await dealToPopup();
    const btn = within(popup).getByRole('button', { name: /Declared/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    const note = await screen.findByRole('alertdialog', { name: 'Declared Luck' });
    expect(apiMock.mock.calls.filter(([p]) => p === '/practice/9/lucky')).toHaveLength(1);
    expect(note).toHaveTextContent('Six Pairs');
  });
});

describe('round transitions: no cards from the previous round survive', () => {
  const CARDS2 = ['2S', '3S', '4S', '5S', '6H', '7H', '8H', '9D', 'TH', 'JC', 'QC', 'KC', 'AS'];
  const ROUND2 = {
    ...DEALT,
    id: 10,
    round: 2,
    banker: 2,
    banker_name: 'LuckyBot',
    bet: 50,
    covered: 0,
    cards: CARDS2,
    players: DEALT.players.map((p) => ({ ...p, is_banker: p.seat === 2, bet: p.seat === 2 ? 0 : 50 })),
  };
  const AFTER = { ...MATCH, rounds_played: 1, next_round: 2, next_banker: 2, next_banker_name: 'LuckyBot', gold: 600 };

  beforeEach(() => {
    apiMock.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/practice/?tier=beginner');
  });

  it('the next round shows only its own 13 cards in its rows, in dealt order — and a late round-1 answer is ignored', async () => {
    let releaseOld: (() => void) | null = null;
    let deals = 0;
    apiMock.mockImplementation((path: string) => {
      if (path === '/practice/tiers') return Promise.resolve({ data: TIERS });
      if (path === '/practice/matches/current') return Promise.resolve({ data: null });
      if (path === '/practice/matches') return Promise.resolve({ data: MATCH });
      if (path === '/practice/matches/3/deal') return Promise.resolve({ data: ++deals === 1 ? DEALT : ROUND2 });
      if (path === '/practice/matches/3') return Promise.resolve({ data: AFTER });
      if (path === '/practice/9/preview') return new Promise((resolve) => (releaseOld = () => resolve({ data: { labels: { front: 'Pair', middle: 'Pair', back: 'Pair' }, is_foul: true, order: { front: false, middle: false, back: false } } })));
      if (path === '/practice/9/submit') return Promise.resolve({ data: SETTLED });
      if (path.endsWith('/preview')) return Promise.resolve({ data: { labels: { front: null, middle: null, back: null }, is_foul: false } });
      return Promise.resolve({});
    });

    render(<Practice />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deal' }));
    const popup1 = await screen.findByRole('dialog', { name: 'Declared Luck' });
    // Round 1's last hand-name check is still in flight when you submit.
    fireEvent.click(within(popup1).getByRole('button', { name: 'SUBMIT' }));
    await screen.findByLabelText('Round result');

    fireEvent.click(await screen.findByRole('button', { name: 'Bet 50' }));
    const popup2 = await screen.findByRole('dialog', { name: 'Declared Luck' });
    await act(async () => releaseOld?.()); // round 1's answer arrives late

    expect(screen.getByRole('dialog', { name: 'Declared Luck' })).toBe(popup2);
    expect(rowsIn(popup2)).toEqual(dealtRowsOf(CARDS2));
    for (const old of CARDS) expect(screen.queryByRole('button', { name: cardName(old) })).toBeNull();
  });
});

describe('reveal show after SUBMIT', () => {
  beforeEach(() => {
    apiMock.mockReset();
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, '', '/practice/?tier=beginner');
    routes();
    motion.reduced = false;
  });
  afterEach(() => {
    motion.reduced = true;
  });

  const submitRound = async () => {
    const popup = await dealToPopup();
    fireEvent.click(within(popup).getByRole('button', { name: 'SUBMIT' }));
    return screen.findByRole('status', { name: 'Reveal' });
  };
  const faceDown = (hand: HTMLElement) => Array.from(hand.querySelectorAll<HTMLElement>('.rv-card')).filter((el) => el.style.transform.includes('rotateY(180deg)')).length;

  it('starts with "All Players Submitted": every card face down, results and chips held back', async () => {
    const banner = await submitRound();
    expect(banner).toHaveTextContent('All Players Submitted');
    for (const name of ["LuckyBot's hand", "CardBot's hand", "AceBot's hand", 'Your hand']) {
      expect(faceDown(screen.getByLabelText(name))).toBe(13);
    }
    expect(screen.getByLabelText('LuckyBot')).toHaveTextContent('Submitted ✓');
    expect(screen.queryByLabelText('Round result')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bet 50' })).toBeNull();
  });

  it('flips the Front cards first, one at a time, then Skip goes straight to the final results', async () => {
    await submitRound();
    // 1 s in: the intro is over and the first Front card (the first seat after you, the banker) is up.
    await waitFor(() => expect(faceDown(screen.getByLabelText("LuckyBot's hand"))).toBeLessThan(13), { timeout: 4000 });
    expect(screen.getByRole('status', { name: 'Reveal' })).toHaveTextContent('FRONT');
    expect(faceDown(screen.getByLabelText("AceBot's hand"))).toBe(13);

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(await screen.findByLabelText('Round result')).toHaveTextContent('+600');
    expect(screen.queryByRole('status', { name: 'Reveal' })).toBeNull();
    expect(faceDown(screen.getByLabelText('Your hand'))).toBe(0);
  });
});
