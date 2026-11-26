import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...args: unknown[]) => apiMock(...args), errorText: (e: Error) => e.message }));
vi.mock('@/lib/sound', () => ({ play: vi.fn(), useSound: () => [true, vi.fn()] }));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));

import MultiplayerTable from './MultiplayerTable';
import type { SeatPlayer, SessionState, TableState } from '@/lib/types';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;

const seat = (n: number, over: Partial<SeatPlayer> = {}): SeatPlayer => ({ user_id: 10 + n, name: `p${n}`, seat: n, is_connected: true, is_you: n === 2, ...over });
const PLAYERS = [seat(1), seat(2), seat(3), seat(4)];

const table = (over: Partial<TableState> = {}): TableState => ({
  id: 7,
  status: 'IN_GAME',
  room: { id: 3, name: 'Rookie Room', currency: 'CH', entry_amount: '10.00', payout_mode: 'winner_takes_all', game_mode: 'round_bank', bet_chips: ['5.00', '10.00', '15.00'], min_entry: '100.00', banker_reserve: '90.00' },
  game_mode: 'round_bank',
  rounds_total: 12,
  rounds_played: 1,
  banker_user_id: 13,
  players: PLAYERS,
  current_session_id: 50,
  ready_timeout_seconds: 60,
  standings: [],
  ...over,
});

const session = (over: Partial<SessionState> = {}): SessionState => ({
  id: 50,
  table_id: 7,
  status: 'BETTING',
  server_time: '2026-11-25T00:00:00Z',
  arrangement_deadline: null,
  deck_commitment: 'x',
  server_seed: null,
  config: { room_name: 'Rookie Room', currency: 'CH', entry_amount: '10.00', payout_mode: 'winner_takes_all', allow_foul_submission: true, arrangement_seconds: 45, rounds_total: 12, bet_chips: ['5.00', '10.00', '15.00'], min_entry: '100.00', banker_reserve: '90.00' },
  round_number: 2,
  banker_user_id: 13,
  can_bet: true,
  my_bet: null,
  pot: '0.00',
  players: PLAYERS,
  my_cards: null,
  my_submission: null,
  arrangements: null,
  results: null,
  cancel_reason: null,
  banker_selection: { reason: 'rotation_skipped_ineligible', checks: [{ user_id: 12, seat: 2, eligible: false }, { user_id: 13, seat: 3, eligible: true }] },
  ...over,
});

const props = (t: TableState, s?: SessionState) => ({
  table: t,
  session: s,
  userId: 12,
  chips: '250.00',
  live: true,
  betSecondsLeft: 12,
  arrangeSecondsLeft: 40,
  nextIn: 0,
  refresh: vi.fn(async () => undefined),
  onLeave: vi.fn(async () => undefined),
  onLobby: vi.fn(),
});

describe('Multiplayer in-game table', () => {
  beforeEach(() => apiMock.mockReset());

  it('shows the round of 12, the server banker (badge), the room minimum entry and your Chips', () => {
    render(<MultiplayerTable {...props(table(), session())} />);
    expect(screen.getByLabelText('Round')).toHaveTextContent('Round 2 / 12 · p3 banks');
    expect(screen.getByLabelText('Room')).toHaveTextContent('Min Entry 100');
    expect(screen.getByLabelText('Your Chips')).toHaveTextContent('250');
    // Clockwise from you (seat 2): seat 3 on your left, seat 4 at the top, seat 1 on your right.
    const bankerSeat = screen.getByLabelText('p3 (banker)');
    expect(within(bankerSeat).getByText('BANKER')).toBeInTheDocument();
    expect(screen.getByLabelText('p4')).toBeInTheDocument();
    expect(screen.getByLabelText('p1')).toBeInTheDocument();
  });

  it('offers exactly the room chips 5 / 10 / 15 (1:1) and sends the tapped one to the server once', async () => {
    apiMock.mockResolvedValue({});
    const p = props(table(), session());
    render(<MultiplayerTable {...p} />);
    const group = screen.getByRole('group', { name: 'Bet chips' });
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Bet 5 Chips', 'Bet 10 Chips', 'Bet 15 Chips']);
    fireEvent.click(within(group).getByRole('button', { name: 'Bet 15 Chips' }));
    fireEvent.click(within(group).getByRole('button', { name: 'Bet 15 Chips' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/games/50/bet', { method: 'POST', body: { amount: '15.00' } }));
    expect(apiMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(p.refresh).toHaveBeenCalled());
  });

  it('a 500-Chip game offers only 20 / 30 / 40; chips your wallet cannot cover twice are disabled', () => {
    const s = session();
    render(<MultiplayerTable {...props(table(), { ...s, config: { ...s.config, bet_chips: ['20.00', '30.00', '40.00'] } })} chips="70.00" />);
    const group = screen.getByRole('group', { name: 'Bet chips' });
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Bet 20 Chips', 'Bet 30 Chips', 'Bet 40 Chips']);
    // 70 Chips covers 2 × 20 and 2 × 30, not 2 × 40.
    expect(within(group).getByRole('button', { name: 'Bet 20 Chips' })).toBeEnabled();
    expect(within(group).getByRole('button', { name: 'Bet 30 Chips' })).toBeEnabled();
    expect(within(group).getByRole('button', { name: 'Bet 40 Chips' })).toBeDisabled();
    expect(within(group).getByRole('button', { name: 'Bet 40 Chips' })).toHaveAttribute('title', 'Needs 80 Chips (2× the bet)');
  });

  it('with less than 2× the smallest chip, no chip can be tapped and it says what is needed', () => {
    render(<MultiplayerTable {...props(table(), session())} chips="9.00" />);
    const group = screen.getByRole('group', { name: 'Bet chips' });
    within(group).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    expect(within(group).getByRole('status')).toHaveTextContent('You need 10 Chips (2× the smallest bet) to bet');
  });

  it('betting timeout: says the minimum bet was placed automatically and marks it (auto)', async () => {
    const auto = session({ can_bet: false, my_bet: '5.00', my_bet_type: 'AUTO', players: PLAYERS.map((p) => (p.user_id === 11 ? { ...p, bet: '15.00', bet_type: 'MANUAL' } : p.user_id === 12 ? { ...p, bet: '5.00', bet_type: 'AUTO' } : p)) });
    render(<MultiplayerTable {...props(table(), auto)} betSecondsLeft={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Time expired — minimum bet of 5 chips automatically placed.');
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Bet: 5 Chips (auto)');
    expect(screen.getByText(/minimum bet of 5 Chips placed automatically/)).toBeInTheDocument();
    // Other players' manual bets are not marked.
    expect(screen.getByText('Bet 15')).toBeInTheDocument();
  });

  it('betting timeout without enough Chips: no bet, and the player is told why', async () => {
    render(<MultiplayerTable {...props(table(), session({ can_bet: false, my_bet: null, my_auto_bet_skipped: 'You need 10.00 CH available to cover a 5.00 bet (2× reserve).' }))} betSecondsLeft={0} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Time expired — no automatic bet: You need 10.00 CH available to cover a 5.00 bet (2× reserve).');
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Bet: —');
  });

  it("shows the server's refusal of a bet", async () => {
    apiMock.mockImplementation((path?: string) => (path?.endsWith('/bet') ? Promise.reject(new Error("Choose one of this table's chips: 5.00, 10.00, 15.00 Chips.")) : Promise.resolve({})));
    render(<MultiplayerTable {...props(table(), session())} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bet 5 Chips' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Choose one of this table's chips");
  });

  it('marks a player the rotation skipped for low Chips; the banker covers instead of betting', () => {
    render(<MultiplayerTable {...props(table(), session({ banker_user_id: 12, can_bet: false, players: [seat(1, { bet: '10.00' }), seat(2), seat(3), seat(4)] }))} />);
    expect(screen.queryByRole('group', { name: 'Bet chips' })).toBeNull();
    expect(screen.getByLabelText('Current bet')).toHaveTextContent('Covering 10');
    expect(screen.getByLabelText('You (banker)')).toBeInTheDocument();
    expect(screen.getByLabelText('p1')).toHaveTextContent('Bet 10');
  });

  it('after round 12: final standings and Back to Lobby', () => {
    const p = props(
      table({ status: 'CLOSED', rounds_played: 12, end_reason: 'completed', standings: [
        { rank: 1, user_id: 12, name: 'p2', rounds: 12, won: 7, lost: 3, tied: 2, banker_rounds: 3, lucky: 0, net: '40.00' },
        { rank: 2, user_id: 13, name: 'p3', rounds: 12, won: 5, lost: 5, tied: 2, banker_rounds: 3, lucky: 0, net: '-40.00' },
      ] }),
      session({ status: 'COMPLETED', can_bet: false, round_number: 12 }),
    );
    render(<MultiplayerTable {...p} />);
    const dialog = screen.getByRole('dialog', { name: 'Match results' });
    expect(within(dialog).getByText('YOU WIN THE MATCH!')).toBeInTheDocument();
    expect(within(dialog).getByText(/12 \/ 12 rounds · All 12 rounds played/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to Lobby' }));
    expect(p.onLobby).toHaveBeenCalled();
  });
});

describe('Multiplayer table — saved arrangement', () => {
  beforeEach(() => apiMock.mockReset());
  const cards = ['2C','3C','4C','5D','6D','7D','8H','9H','TH','JS','QS','KS','AS'];
  const draft = { front: ['2C', '3C', '4C'], middle: ['8H', '9H', 'TH', 'JS', 'QS'], back: ['5D', '6D', '7D', 'KS', 'AS'] };

  it('reopens with your saved arrangement (not the dealt order) and saves each move on the server', async () => {
    apiMock.mockImplementation((path?: string) => Promise.resolve(path?.endsWith('/preview') ? { data: { labels: { front: null, middle: null, back: null }, is_foul: false } } : { data: { saved: true } }));
    render(<MultiplayerTable {...props(table(), session({ status: 'ARRANGING', can_bet: false, my_bet: '10.00', my_cards: cards, my_draft: draft }))} />);
    const order = (lane: string) => [...screen.getByRole('group', { name: `${lane} lane` }).querySelectorAll('[data-card]')].map((e) => (e as HTMLElement).dataset.card);
    expect(order('middle')).toEqual(draft.middle);
    expect(order('back')).toEqual(draft.back);

    // Swap two cards: the new rows are saved (once the moves settle).
    const tap = (c: string) => fireEvent.click(screen.getByRole('group', { name: 'front lane' }).ownerDocument.querySelector(`[data-card="${c}"] [role="button"], [data-card="${c}"] button, [data-card="${c}"] > *`) as Element);
    tap('2C');
    tap('AS');
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/games/50/draft', { method: 'PUT', body: { front: ['AS', '3C', '4C'], middle: draft.middle, back: ['5D', '6D', '7D', 'KS', '2C'] } }));
  });
});

describe('Multiplayer table — the Single Player in-game sequence', () => {
  const animate = vi.fn(() => ({ cancel: vi.fn() }) as unknown as Animation);
  const cards = ['2C','3C','4C','5D','6D','7D','8H','9H','TH','JS','QS','KS','AS'];
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ data: { labels: { front: null, middle: null, back: null }, is_foul: false } });
    sessionStorage.clear();
    localStorage.setItem('pusoy.motion', 'on');
    (HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate;
  });

  it('shuffles and deals clockwise from the seat after the banker before the arrangement opens, once per round', () => {
    const s = session({ id: 61, status: 'ARRANGING', can_bet: false, my_bet: '10.00', my_cards: cards });
    const { unmount } = render(<MultiplayerTable {...props(table({ current_session_id: 61 }), s)} />);
    // You sit at seat 2, p3 (seat 3, on your left) banks: p4 (top) gets the first card.
    expect(screen.getByRole('status', { name: 'Shuffling and dealing' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'front lane' })).toBeNull();
    fireEvent.click(within(screen.getByRole('status', { name: 'Shuffling and dealing' })).getByRole('button', { name: /Skip/ }));
    expect(screen.queryByRole('status', { name: 'Shuffling and dealing' })).toBeNull();
    expect(screen.getByRole('group', { name: 'front lane' })).toBeInTheDocument();

    // Coming back to the same round (reload / reconnect): straight to the arrangement.
    unmount();
    render(<MultiplayerTable {...props(table({ current_session_id: 61 }), s)} />);
    expect(screen.queryByRole('status', { name: 'Shuffling and dealing' })).toBeNull();
    expect(screen.getByRole('group', { name: 'front lane' })).toBeInTheDocument();
  });

  it('reveals the judged round like Single Player (banner, Skip), then shows the results', () => {
    const arr = (n: number) => ({ user_id: 10 + n, name: `p${n}`, front: ['2C', '3C', '4C'].map((c) => c.replace('C', 'CDHS'[n - 1])), middle: ['5C', '6C', '7C', '8C', 'TC'].map((c) => c.replace('C', 'CDHS'[n - 1])), back: ['9C', 'JC', 'QC', 'KC', 'AC'].map((c) => c.replace('C', 'CDHS'[n - 1])), labels: { front: 'High Card', middle: 'Flush', back: 'Flush' }, is_foul: false, is_auto: false });
    const res = (n: number, net: string) => ({ user_id: 10 + n, name: `p${n}`, seat: n, score: 0, placement: 1, is_foul: false, entry: '0', payout: '0', net, role: n === 3 ? ('banker' as const) : ('player' as const), bet: '10.00', lanes: { front: 1, middle: 1, back: -1 } });
    const t = table({ current_session_id: 62 });
    const submitted = session({ id: 62, status: 'ARRANGING', can_bet: false, my_bet: '10.00', my_cards: cards, my_submission: { front: [], middle: [], back: [] } as unknown as SessionState['my_submission'] });
    sessionStorage.setItem('pusoy.mp.dealt.62', '1');
    const { rerender } = render(<MultiplayerTable {...props(t, submitted)} />);
    const judged = session({ id: 62, status: 'COMPLETED', can_bet: false, my_bet: '10.00', my_cards: cards, arrangements: [1, 2, 3, 4].map(arr), results: [res(1, '10.00'), res(2, '10.00'), res(3, '-30.00'), res(4, '10.00')] });
    rerender(<MultiplayerTable {...props(t, judged)} />);
    expect(screen.getByRole('status', { name: 'Reveal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip/ }));
    expect(screen.queryByRole('status', { name: 'Reveal' })).toBeNull();

    // Opening an already-judged round (no live transition) shows the results without replaying.
    sessionStorage.clear();
    rerender(<></>);
    render(<MultiplayerTable {...props(t, judged)} />);
    expect(screen.queryByRole('status', { name: 'Reveal' })).toBeNull();
  });
});

describe('Multiplayer table — submission, misarrangement and Lucky Hand rules', () => {
  const cards = ['2C','3C','4C','5D','6D','7D','8H','9H','TH','JS','QS','KS','AS'];
  beforeEach(() => {
    apiMock.mockReset();
    sessionStorage.setItem('pusoy.mp.dealt.70', '1');
  });

  it('Declared Luck sends the rows on screen; a false declaration is told plainly (2× bet)', async () => {
    apiMock.mockImplementation((path?: string) =>
      Promise.resolve(
        path?.endsWith('/lucky')
          ? { message: 'No qualifying Lucky Hand — a false declaration costs 2× your bet.', data: { my_submission: { lucky_failed: true } } }
          : { data: { labels: { front: null, middle: null, back: null }, is_foul: true } },
      ),
    );
    render(<MultiplayerTable {...props(table({ current_session_id: 70 }), session({ id: 70, status: 'ARRANGING', can_bet: false, my_bet: '10.00', my_cards: cards }))} />);
    fireEvent.click(screen.getByRole('button', { name: /Declared/ }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/games/70/lucky', { method: 'POST', body: { front: cards.slice(0, 3), middle: cards.slice(3, 8), back: cards.slice(8) } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('a false declaration costs 2× your bet');
  });

  it('results mark a misarranged hand and a false declaration with their 2× bet penalty', () => {
    const arr = (n: number, over = {}) => ({ user_id: 10 + n, name: `p${n}`, front: ['2C', '3C', '4C'], middle: ['5D', '6D', '7D', '8H', '9H'], back: ['TH', 'JS', 'QS', 'KS', 'AS'], labels: { front: 'High Card', middle: 'Straight', back: 'Straight' }, is_foul: false, is_auto: false, ...over });
    const s = session({ id: 71, status: 'COMPLETED', can_bet: false, arrangements: [arr(1, { is_foul: true }), arr(2, { lucky_failed: true }), arr(3, { lucky_type: 'six_pairs' }), arr(4, { lucky_type: 'three_straights' })], results: [] });
    render(<MultiplayerTable {...props(table({ current_session_id: 71 }), s)} />);
    expect(screen.getByText('MISARRANGED −2× BET')).toBeInTheDocument();
    expect(screen.getByText('FALSE LUCKY −2× BET')).toBeInTheDocument();
    expect(screen.getByText('3-STRAIGHT – LUCKY HAND · +2× BET')).toBeInTheDocument();
    expect(screen.getByText('6 PAIRS – LUCKY HAND · +2× BET')).toBeInTheDocument();
  });
});

describe('Multiplayer table — time up', () => {
  const cards = ['2C','3C','4C','5D','6D','7D','8H','9H','TH','JS','QS','KS','AS'];
  beforeEach(() => {
    apiMock.mockReset();
    sessionStorage.setItem('pusoy.mp.dealt.72', '1');
  });

  it('at 0s submits the rows on screen as they are, once, and catches up with the table', async () => {
    apiMock.mockResolvedValue({ data: { labels: { front: null, middle: null, back: null }, is_foul: false } });
    const p = props(table({ current_session_id: 72 }), session({ id: 72, status: 'ARRANGING', can_bet: false, my_bet: '10.00', my_cards: cards, arrangement_deadline: new Date(Date.now() - 500).toISOString() }));
    const { rerender } = render(<MultiplayerTable {...p} arrangeSecondsLeft={1} />);
    expect(apiMock).not.toHaveBeenCalledWith('/games/72/submit', expect.anything());
    rerender(<MultiplayerTable {...p} arrangeSecondsLeft={0} />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/games/72/submit', { method: 'POST', body: { front: cards.slice(0, 3), middle: cards.slice(3, 8), back: cards.slice(8) } }));
    rerender(<MultiplayerTable {...p} arrangeSecondsLeft={0} />);
    expect(apiMock.mock.calls.filter(([path]) => path === '/games/72/submit')).toHaveLength(1);
    await waitFor(() => expect(p.refresh).toHaveBeenCalled());
  });

  it('a late SUBMIT the server refuses (time up) does not leave an error: the table catches up', async () => {
    apiMock.mockImplementation((path?: string) => (path?.endsWith('/submit') ? Promise.reject(Object.assign(new Error('The arrangement timer has expired.'), { code: 'timer_expired' })) : Promise.resolve({ data: { labels: { front: null, middle: null, back: null }, is_foul: false } })));
    const p = props(table({ current_session_id: 72 }), session({ id: 72, status: 'ARRANGING', can_bet: false, my_bet: '10.00', my_cards: cards, arrangement_deadline: new Date(Date.now() - 500).toISOString() }));
    render(<MultiplayerTable {...p} arrangeSecondsLeft={0} />);
    await waitFor(() => expect(p.refresh).toHaveBeenCalled());
  });
});

describe('Multiplayer table — Leave Game only in the Betting Phase', () => {
  const BLOCKED = 'You cannot leave the game once the betting phase has ended. Please wait until the round is complete.';
  beforeEach(() => apiMock.mockReset());

  it('Betting Phase, server allows: Leave is enabled and calls the leave', async () => {
    const p = props(table({ leave: { allowed: true, reason: null } }), session());
    render(<MultiplayerTable {...p} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave table' });
    expect(dialog).toHaveTextContent('You can leave now, during betting.');
    const leave = within(dialog).getByRole('button', { name: 'Leave' });
    expect(leave).toBeEnabled();
    fireEvent.click(leave);
    await waitFor(() => expect(p.onLeave).toHaveBeenCalled());
  });

  it('after betting the server refuses: Leave is disabled and the message is shown', () => {
    render(<MultiplayerTable {...props(table({ leave: { allowed: false, reason: BLOCKED } }), session({ status: 'ARRANGING', can_bet: false }))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    const dialog = screen.getByRole('dialog', { name: 'Leave table' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(BLOCKED);
    expect(within(dialog).getByRole('button', { name: 'Leave' })).toBeDisabled();
  });

  it('the betting countdown reached 0: disabled at once, before the next refresh says so', () => {
    render(<MultiplayerTable {...props(table({ leave: { allowed: true, reason: null } }), session())} betSecondsLeft={0} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(within(screen.getByRole('dialog', { name: 'Leave table' })).getByRole('button', { name: 'Leave' })).toBeDisabled();
  });

  it('the Android back button opens the same panel (never a silent exit)', () => {
    const p = props(table({ leave: { allowed: false, reason: BLOCKED } }), session({ status: 'ARRANGING', can_bet: false }));
    render(<MultiplayerTable {...p} />);
    act(() => {
      window.dispatchEvent(new Event('pusoy:back'));
    });
    expect(screen.getByRole('dialog', { name: 'Leave table' })).toHaveTextContent(BLOCKED);
    expect(p.onLeave).not.toHaveBeenCalled();
  });
});

describe('Multiplayer table — no automatic submit before the time is really up', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ data: { labels: { front: null, middle: null, back: null }, is_foul: false } });
    sessionStorage.setItem('pusoy.mp.dealt.73', '1');
  });

  it('a stale 0 with a deadline still ahead (a round that just started) submits nothing', () => {
    const cards = ['2C','3C','4C','5D','6D','7D','8H','9H','TH','JS','QS','KS','AS'];
    const s = session({ id: 73, status: 'ARRANGING', can_bet: false, my_bet: '10.00', my_cards: cards, arrangement_deadline: new Date(Date.now() + 60_000).toISOString() });
    render(<MultiplayerTable {...props(table({ current_session_id: 73 }), s)} arrangeSecondsLeft={0} />);
    expect(apiMock).not.toHaveBeenCalledWith('/games/73/submit', expect.anything());
  });
});
