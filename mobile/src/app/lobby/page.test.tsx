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
  min_entry: 250,
  min_bet: '25.00',
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
    expect(items[0]).toHaveTextContent('250');
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

  it('a private lobby asks for the password; a wrong one shows the error, the right one enters the waiting room', async () => {
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
    const dialog = await screen.findByRole('dialog', { name: 'Private Lobby' });
    fireEvent.change(within(dialog).getByLabelText('Lobby password'), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '▶ Join' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Incorrect lobby password.');
    fireEvent.change(within(dialog).getByLabelText('Lobby password'), { target: { value: 'tiger553' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '▶ Join' }));
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

describe('Multiplayer Lobby — notifications', () => {
  const N = (id: string, type: string, data: Record<string, unknown>, at: string, read = false) => ({ id, type: 'App\\Notifications\\' + type, data, read_at: read ? at : null, created_at: at });
  const FEED = () => ({
    data: [
      N('n3', 'RoomInvitation', { title: 'Room invitation', message: 'ann invited you to Secret.', room_id: 7 }, '2026-11-25T03:00:00Z'),
      N('n2', 'FriendRequest', { title: 'Friend request', message: 'bob wants to be friends.' }, '2026-11-25T02:00:00Z'),
      N('n1', 'PointsReceived', { title: 'Points received', message: 'You received 100.00 CH.' }, '2026-11-24T01:00:00Z', true),
    ],
    meta: { unread: 2, announcement: 'Double rewards this weekend!', maintenance: { label: 'Agents/Players', message: 'Chips transactions are paused.', game_blocked: false, transactions_blocked: true, changed_at: null } },
  });

  beforeEach(() => {
    apiMock.mockReset();
    push.mockReset();
  });

  it('the message envelope is now a bell with the unread badge, and it opens the pop-up in the lobby', async () => {
    routes({ '/lobbies': LIST([]), '/notifications': FEED() });
    const { container } = render(<Lobby />);
    const bell = await screen.findByRole('button', { name: 'Notifications — 2 unread' });
    expect(within(bell).getByText('2')).toBeInTheDocument();
    expect(container.querySelector('a[href="/notifications/"]')).toBeNull();
    fireEvent.click(bell);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    // Pinned announcements, then newest first.
    expect(within(dialog).getByText('Maintenance — Agents/Players')).toBeInTheDocument();
    expect(within(dialog).getByText('Double rewards this weekend!')).toBeInTheDocument();
    const titles = within(within(dialog).getByRole('list', { name: 'Your notifications' })).getAllByRole('button').map((b) => b.textContent);
    expect(titles[0]).toContain('Room invitation');
    expect(titles[1]).toContain('Friend request');
    expect(titles[2]).toContain('Points received');
    expect(push).not.toHaveBeenCalled();
  });

  it('Mark all as read clears every unread notification and the bell badge', async () => {
    routes({ '/lobbies': LIST([]), '/notifications': FEED(), '/notifications/read': { message: 'ok' } });
    render(<Lobby />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications — 2 unread' }));
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    await within(dialog).findByText('Room invitation');
    expect(within(dialog).getAllByText('New')).toHaveLength(2);
    fireEvent.click(within(dialog).getByRole('button', { name: /Mark all as read/ }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/notifications/read', { method: 'POST' }));
    await waitFor(() => expect(within(dialog).queryAllByText('New')).toHaveLength(0));
    expect(within(dialog).getByRole('button', { name: /Mark all as read/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('tapping an invitation marks it read, joins that lobby and goes to Choose Your Seat', async () => {
    routes({ '/lobbies': LIST([]), '/notifications': FEED(), '/notifications/n3/read': { meta: { unread: 1 } }, '/lobbies/7/join': { data: { ...DETAIL, id: 7 } } });
    render(<Lobby />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications — 2 unread' }));
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Room invitation/ }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/notifications/n3/read', { method: 'POST' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/lobbies/7/join', { method: 'POST', body: {} }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/lobby/room/?id=7'));
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).toBeNull();
  });

  it('a friend request opens Friends; the unread counter follows the server', async () => {
    routes({ '/lobbies': LIST([]), '/notifications': FEED(), '/notifications/n2/read': { meta: { unread: 1 } } });
    render(<Lobby />);
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications — 2 unread' }));
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    fireEvent.click(await within(dialog).findByRole('button', { name: /Friend request/ }));
    expect(await screen.findByText('Friends list')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notifications — 1 unread' })).toBeInTheDocument();
  });
});
