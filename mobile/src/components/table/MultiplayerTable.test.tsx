import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
