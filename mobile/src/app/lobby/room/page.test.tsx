import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
const replace = vi.fn();
const push = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
  ApiError: class extends Error {
    constructor(message: string, public status = 0) {
      super(message);
    }
  },
}));
const me = { id: 5, name: 'Pat Player', username: 'player' };
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: me }) }));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));
vi.mock('@/lib/sound', () => ({ play: vi.fn(), useSound: () => [true, vi.fn()] }));
vi.mock('@/lib/echo', () => ({ getEcho: async () => null }));
vi.mock('@/lib/hooks', async (orig) => ({ ...(await orig<object>()), useQueryParam: () => '14' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }), usePathname: () => '/lobby/room/' }));
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<object>()), Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import ChooseYourSeat from './page';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;

type Seat = Record<string, unknown>;
const empty = (seat: number): Seat => ({ seat, user_id: null, state: 'available' });
const person = (seat: number, id: number, name: string, over: Seat = {}): Seat => ({ seat, user_id: id, name, username: name, state: 'occupied', seat_confirmed: true, is_ready: false, is_connected: true, is_owner: false, is_banker: false, is_you: false, ...over });

function detail(seats: Seat[], over: Record<string, unknown> = {}) {
  return {
    id: 14, lobby_id: '684421', name: 'Seat Test', game_mode: 'round_bank', game_mode_label: 'Round Bank', min_entry: 100, min_bet: '5.00', bet_chips: ['5.00', '10.00', '15.00'], key_fee: 1, bet_multiple: 2, my_bet: '10.00', my_required_chips: '100.00', my_chips: '500.00', my_keys: '3.00', preparation_seconds: 45,
    players: seats.filter((s) => s.user_id).length, max_players: 4, type: 'public', status: 'waiting', owner: 'player', is_mine: true, can_join: true,
    table_id: 8, table_status: 'WAITING_FOR_PLAYERS', seats, is_owner: true, is_seated: true, banker_rule: '', my_seat: 1, my_seat_confirmed: false, my_ready: false,
    all_confirmed: false, ready_count: 0, countdown_ends_at: null, server_time: new Date().toISOString(), can_press_start: false, start_hint: 'Waiting for 3 more players…',
    ...over,
  };
}

let current: ReturnType<typeof detail>;
beforeEach(() => {
  apiMock.mockReset();
  replace.mockReset();
  apiMock.mockImplementation((path: string) => Promise.resolve(path === '/wallet' ? { data: [{ id: 1, currency: 'CH', type: 'player', balance: '2500.00', is_frozen: false }] } : { data: current }));
});

describe('Choose Your Seat', () => {
  it('shows available, reserved and occupied seats and the lobby settings', async () => {
    current = detail([person(1, 5, 'Pat Player', { is_you: true, state: 'reserved', seat_confirmed: false, is_owner: true, is_banker: true }), person(2, 9, 'Demo 9', { state: 'reserved', seat_confirmed: false }), person(3, 10, 'Demo 10'), empty(4)]);
    render(<ChooseYourSeat />);
    expect(await screen.findByRole('heading', { name: 'Choose Your Seat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seat 1: your seat' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Seat 2: reserved by Demo 9/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Seat 3: occupied by Demo 10/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Seat 4: available' })).toBeEnabled();
    expect(screen.getByText(/Bets 5\/10\/15 · Min Entry 100 · 1 Key · Prep 45s/)).toBeInTheDocument();
    // Your bet and what it needs (2× the bet or the Minimum Entry) plus the Keys fee at the start.
    expect(screen.getByLabelText('Your bet')).toHaveTextContent('Needs 100 Chips (2× bet, min entry) · 1 Key deducted at start');
    expect(screen.getByRole('button', { name: '10', pressed: true })).toBeDisabled();
    expect(screen.getByText('Round Bank')).toBeInTheDocument();
    // Start stays hidden until all four seats are confirmed.
    expect(screen.queryByRole('button', { name: /START/ })).toBeNull();
  });

  it('pick a free seat, then Confirm Seat saves it on the server', async () => {
    current = detail([person(1, 5, 'Pat Player', { is_you: true, state: 'reserved', seat_confirmed: false }), empty(2), empty(3), empty(4)]);
    render(<ChooseYourSeat />);
    fireEvent.click(await screen.findByRole('button', { name: 'Seat 4: available' }));
    expect(screen.getByRole('button', { name: 'Seat 4: selected' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '⟳ Change Seat' }));
    expect(screen.queryByRole('button', { name: 'Seat 4: selected' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Seat 4: available' }));
    current = detail([empty(1), empty(2), empty(3), person(4, 5, 'Pat Player', { is_you: true })], { my_seat: 4, my_seat_confirmed: true });
    fireEvent.click(screen.getByRole('button', { name: '✓ Confirm Seat' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/lobbies/14/seat', { method: 'POST', body: { seat: 4 } }));
    expect(await screen.findByRole('button', { name: 'Seat 4: your seat' })).toBeInTheDocument();
  });

  it('a taken seat shows the server error and nothing changes', async () => {
    current = detail([person(1, 5, 'Pat Player', { is_you: true, state: 'reserved', seat_confirmed: false }), empty(2), empty(3), empty(4)]);
    apiMock.mockImplementation((path: string) => (path === '/lobbies/14/seat' ? Promise.reject(new Error('That seat was just taken — choose another one.')) : Promise.resolve({ data: current })));
    render(<ChooseYourSeat />);
    fireEvent.click(await screen.findByRole('button', { name: 'Seat 2: available' }));
    fireEvent.click(screen.getByRole('button', { name: '✓ Confirm Seat' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That seat was just taken');
  });

  it('all four confirmed: START appears; pressing it is sent to the server', async () => {
    const seats = [person(1, 5, 'Pat Player', { is_you: true }), person(2, 9, 'Demo 9', { is_ready: true }), person(3, 10, 'Demo 10'), person(4, 11, 'Demo 11')];
    current = detail(seats, { my_seat_confirmed: true, all_confirmed: true, can_press_start: true, ready_count: 1, start_hint: 'All seats confirmed — press Start!' });
    render(<ChooseYourSeat />);
    expect(await screen.findByText(/All four seats confirmed · 1\/4 pressed Start/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Seat 2: occupied by Demo 9, pressed Start/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '▶ START' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/lobbies/14/start', { method: 'POST', body: { ready: true } }));
  });

  it('shows the server-timed countdown, then moves everyone into the game', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const seats = [person(1, 5, 'Pat Player', { is_you: true, is_ready: true }), person(2, 9, 'Demo 9', { is_ready: true }), person(3, 10, 'Demo 10', { is_ready: true }), person(4, 11, 'Demo 11', { is_ready: true })];
    const ends = new Date(Date.now() + 2500).toISOString();
    current = detail(seats, { my_seat_confirmed: true, my_ready: true, all_confirmed: true, ready_count: 4, countdown_ends_at: ends, server_time: new Date().toISOString() });
    render(<ChooseYourSeat />);
    expect(await screen.findByRole('timer')).toHaveAttribute('aria-label', 'Match starts in 3');
    current = detail(seats, { table_status: 'IN_GAME', my_seat_confirmed: true, my_ready: true, all_confirmed: true, ready_count: 4 });
    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/play/?table=8'));
    vi.useRealTimers();
  });
});
