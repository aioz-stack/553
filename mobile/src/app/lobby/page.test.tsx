import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
const push = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
  ApiError: class extends Error {},
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 5, name: 'Pat Player', username: 'player', level: { level: 1 } } }) }));
vi.mock('@/lib/useBalance', () => ({ useBalance: () => ({ gold: '0.00', chips: '2055.00' }) }));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));
vi.mock('@/lib/sound', () => ({ play: vi.fn(), useSound: () => [true, vi.fn()] }));
vi.mock('@/lib/echo', () => ({ getEcho: async () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }), usePathname: () => '/lobby/' }));
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<object>()), Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/FriendsPanel', () => ({ default: () => <div>Friends list</div> }));

import Lobby from './page';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;

const row = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  lobby_id: String(100000 + id),
  name: `Room ${id}`,
  game_mode: 'round_bank',
  game_mode_label: 'Round Bank',
  min_entry: 500,
  min_bet: '20.00',
  bet_chips: ['20.00', '30.00', '40.00'],
  key_fee: 2,
  bet_multiple: 2,
  preparation_seconds: 45,
  players: 1,
  max_players: 4,
  type: 'public',
  status: 'waiting',
  owner: 'demo1',
  is_mine: false,
  can_join: true,
  ...over,
});
const LIST = (data: unknown[], meta: Record<string, unknown> = {}) => ({
  data,
  meta: { tab: 'all', page: 1, pages: 1, per_page: 5, total: data.length, counts: { all: data.length, public: data.length, private: 0 }, my_lobby_id: null, other_table_id: null, balance: '2055.00', ...meta },
});
const DETAIL = { ...row(1), table_id: 2, table_status: 'WAITING_FOR_PLAYERS', seats: [], is_owner: false, is_seated: true, banker_rule: '', can_start: false, start_hint: '' };

function routes(over: Record<string, unknown> = {}) {
  apiMock.mockImplementation((path: string, opts?: { query?: Record<string, unknown> }) => {
    if (path in over) {
      const v = over[path];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(typeof v === 'function' ? (v as (o: unknown) => unknown)(opts) : v);
    }
    if (path === '/notifications') return Promise.resolve({ data: [], meta: { unread: 2 } });
    return Promise.resolve({});
  });
}

describe('Multiplayer Lobby', () => {
  beforeEach(() => {
    apiMock.mockReset();
    push.mockReset();
  });

  it('lists lobbies with name, ID, mode, bet, entry, prep, players, type and Join; no pagination for one page', async () => {
    routes({ '/lobbies': LIST([row(1), row(2, { type: 'private', name: 'Secret' }), row(3, { status: 'full', players: 4, can_join: false, game_mode: 'banker', game_mode_label: 'Banker Mode' })]) });
    render(<Lobby />);
    const list = await screen.findByRole('list', { name: 'Lobbies' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Room 1');
    expect(items[0]).toHaveTextContent('ID 100001');
    // Game Type column: the mode the creator chose.
    expect(screen.getByText('Game Type')).toBeInTheDocument();
    expect(within(items[0]).getByLabelText('Game Type')).toHaveTextContent('Round Bank');
    expect(within(items[2]).getByLabelText('Game Type')).toHaveTextContent('Banker Mode');
    expect(items[0]).toHaveTextContent('500');
    expect(items[0]).toHaveTextContent('45s');
    expect(items[0]).toHaveTextContent('1/4');
    expect(items[1]).toHaveTextContent('Private');
    expect(items[2]).toHaveTextContent('Full');
    expect(within(items[2]).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Pages' })).toBeNull();
    expect(screen.getByLabelText('Chips balance')).toHaveTextContent('2,055');
  });

  it('tabs and search ask the server again from page 1', async () => {
    routes({ '/lobbies': LIST([row(1)], { pages: 3 }) });
    render(<Lobby />);
    await screen.findByRole('list', { name: 'Lobbies' });
    expect(screen.getByRole('navigation', { name: 'Pages' })).toHaveTextContent('Page 1 of 3');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/lobbies', { query: { tab: 'all', search: undefined, page: 2 } }));
    fireEvent.click(screen.getByRole('tab', { name: /Private Lobby/ }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/lobbies', { query: { tab: 'private', search: undefined, page: 1 } }));
    fireEvent.change(screen.getByLabelText('Search lobby ID or name'), { target: { value: '100002' } });
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/lobbies', { query: { tab: 'private', search: '100002', page: 1 } }));
  });

  it('Join opens the confirmation: no bet choice, the entry requirements and Keys fee, then a private lobby needs the password', async () => {
    let calls = 0;
    routes({ '/lobbies': LIST([row(2, { type: 'private', name: 'Secret' })]) });
    // First try: wrong password; second: the right one.
    apiMock.mockImplementation(((orig) => (path: string, opts?: unknown) => {
      if (path === '/lobbies/2/join') {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('Incorrect lobby password.')) : Promise.resolve({ data: { ...DETAIL, id: 2 } });
      }
      return orig(path, opts);
    })(apiMock.getMockImplementation() as (p: string, o?: unknown) => Promise<unknown>));
    render(<Lobby />);
    fireEvent.click(await screen.findByRole('button', { name: 'Join Secret' }));
    const dialog = await screen.findByRole('dialog', { name: 'Join Lobby' });
    const terms = within(dialog).getByLabelText('Entry requirements');
    expect(terms).toHaveTextContent('Minimum Entry500 Chips');
    expect(terms).toHaveTextContent('In-game bets20 / 30 / 40 Chips');
    expect(terms).toHaveTextContent('You choose your bet in the game, each round');
    expect(terms).toHaveTextContent('2 Keys are deducted once, when the game starts');
    // No "Choose Your Bet" and no bet buttons.
    expect(within(dialog).queryByText('Choose Your Bet')).toBeNull();
    expect(within(dialog).queryByRole('radio')).toBeNull();

    // A password is required for a private lobby.
    fireEvent.click(within(dialog).getByRole('button', { name: '▶ Confirm Join' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Enter the lobby password.');
    fireEvent.change(within(dialog).getByLabelText('Lobby password'), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '▶ Confirm Join' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Incorrect lobby password.');
    fireEvent.change(within(dialog).getByLabelText('Lobby password'), { target: { value: 'tiger553' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '▶ Confirm Join' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby/room/?id=2'));
    expect(apiMock).toHaveBeenCalledWith('/lobbies/2/join', { method: 'POST', body: { password: 'tiger553' } });
  });

  it('Quick Join enters the room the server picked; with none it says so', async () => {
    routes({ '/lobbies': LIST([]), '/lobbies/quick-join': { data: { ...DETAIL, id: 9 } } });
    render(<Lobby />);
    expect(await screen.findByText('No open lobbies yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quick Join/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby/room/?id=9'));
  });

  it('Create Lobby opens the popup', async () => {
    routes({ '/lobbies': LIST([]) });
    render(<Lobby />);
    await screen.findByText('No open lobbies yet.');
    fireEvent.click(screen.getAllByRole('button', { name: /Create Lobby/ })[0]);
    expect(await screen.findByRole('dialog', { name: 'Create Lobby' })).toBeInTheDocument();
  });
});

describe('Multiplayer Lobby — top bar', () => {
  beforeEach(() => {
    apiMock.mockReset();
    push.mockReset();
  });

  it('has no notification bell (Sound and Settings stay)', async () => {
    routes({ '/lobbies': LIST([]) });
    const { container } = render(<Lobby />);
    await screen.findByText('No open lobbies yet.');
    expect(screen.queryByRole('button', { name: /notifications/i })).toBeNull();
    expect(container.querySelector('a[href="/notifications/"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sound/ })).toBeInTheDocument();
  });

  it('Chips is display only; no Ranking or Rewards; Shop sits right below Friends and opens the Shop', async () => {
    routes({ '/lobbies': LIST([]) });
    const { container } = render(<Lobby />);
    await screen.findByText('No open lobbies yet.');
    expect(screen.getByLabelText('Chips balance')).toHaveTextContent('2,055');
    expect(screen.queryByRole('link', { name: 'Chips wallet' })).toBeNull();
    expect(container.querySelector('a[href="/wallet/"]')).toBeNull();
    expect(container.querySelector('a[href="/leaderboard/"]')).toBeNull();
    const menu = screen.getByRole('navigation', { name: 'Lobby menu' });
    expect(within(menu).getAllByRole('button').map((b) => b.textContent)).toEqual(['Friends', 'Shop']);
    fireEvent.click(within(menu).getByRole('button', { name: 'Shop' }));
    expect(await screen.findByRole('dialog', { name: 'Shop' })).toBeInTheDocument();
  });

  it('Leave Multiplayer Lobby goes straight Home when you are not in a lobby', async () => {
    routes({ '/lobbies': LIST([]) });
    render(<Lobby />);
    await screen.findByText('No open lobbies yet.');
    expect(screen.queryByRole('link', { name: 'Back to home' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Leave Multiplayer Lobby/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home/'));
    expect(apiMock).not.toHaveBeenCalledWith(expect.stringContaining('/leave'), expect.anything());
  });

  it('seated in a waiting lobby: asks first, then leaves the lobby on the server and goes Home', async () => {
    const detail = {
      ...DETAIL,
      id: 3,
      name: 'Mine',
      lobby_id: '100003',
      table_id: 77,
      table_status: 'WAITING_FOR_PLAYERS',
      is_seated: true,
      is_owner: true,
      seats: [
        { seat: 1, user_id: 5, state: 'occupied', is_you: true },
        { seat: 2, user_id: 9, state: 'occupied' },
        { seat: 3, user_id: null, state: 'available' },
        { seat: 4, user_id: null, state: 'available' },
      ],
    };
    routes({ '/lobbies': LIST([row(3, { is_mine: true, name: 'Mine' })], { my_lobby_id: 3 }), '/lobbies/3': { data: detail }, '/tables/77/leave': {} });
    render(<Lobby />);
    await screen.findByText('Mine');
    fireEvent.click(screen.getByRole('button', { name: /Leave Multiplayer Lobby/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Leave Lobby?' });
    expect(dialog).toHaveTextContent('Ownership passes to the next player');
    // Stay keeps you in the lobby.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog', { name: 'Leave Lobby?' })).toBeNull();
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Leave Multiplayer Lobby/ }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Leave Lobby?' })).getByRole('button', { name: 'Leave Lobby' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/home/'));
    expect(apiMock).toHaveBeenCalledWith('/tables/77/leave', { method: 'POST' });
  });
});
