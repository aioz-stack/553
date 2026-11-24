import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
const push = vi.fn();
const replace = vi.fn();
let currentTable: object | null = null;
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
  idempotencyKey: () => 'key-1',
  ApiError: class extends Error {},
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 5, name: 'Pat Player', username: 'pat', role: 'player' }, logout: vi.fn() }) }));
vi.mock('@/lib/useBalance', () => ({ useBalance: () => ({ chips: '250.00', gold: '0.00' }) }));
vi.mock('@/lib/echo', () => ({ getEcho: async () => null }));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));
vi.mock('@/lib/sound', () => ({ play: vi.fn(), useSound: () => [true, vi.fn()] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push, back: vi.fn() }), usePathname: () => '/home/' }));
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<object>()), Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import Home from './page';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;

const gold = (over: object = {}) => ({ data: { gold: '0.00', out_of_gold: true, can_claim: true, claim_amount: 1000, minimum_to_start: 1000, ...over } });

let notifications: object = { data: [], meta: { unread: 0 } };

function routes(goldState: ReturnType<typeof gold>) {
  apiMock.mockImplementation((path: string) => {
    if (path === '/practice/gold') return Promise.resolve(goldState);
    if (path === '/practice/tiers') return Promise.resolve({ data: [] });
    if (path === '/tables/current') return Promise.resolve({ data: currentTable });
    if (path === '/profile/stats') return Promise.resolve({ data: { level: { level: 3, xp: 10, into_level: 5, for_next: 10 } } });
    if (path === '/wallet') return Promise.resolve({ data: [], meta: {} });
    if (path === '/notifications') return Promise.resolve(notifications);
    if (path.startsWith('/notifications/') && path.endsWith('/read')) return Promise.resolve({ meta: { unread: 0 } });
    return Promise.resolve({ data: null });
  });
}

describe('Home — Single Player Out of Gold', () => {
  beforeEach(() => {
    apiMock.mockReset();
    push.mockReset();
    window.history.replaceState(null, '', '/home/');
  });

  it('coming back from Single Player with no Gold opens the Out of Gold popup', async () => {
    routes(gold());
    window.history.replaceState(null, '', '/home/?gold=out');
    render(<Home />);
    expect(await screen.findByRole('alertdialog', { name: 'Out of Gold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CLAIM 1,000 GOLD' })).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('tapping Single Player while Out of Gold shows the popup instead of the level picker', async () => {
    routes(gold());
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Single Player' }));
    expect(await screen.findByRole('alertdialog', { name: 'Out of Gold' })).toBeInTheDocument();
  });

  it('with Gold left, Single Player opens the level picker and no popup appears; Multiplayer never checks Gold', async () => {
    routes(gold({ gold: '5000.00', out_of_gold: false, can_claim: false }));
    render(<Home />);
    fireEvent.click(await screen.findByRole('button', { name: 'Single Player' }));
    expect(await screen.findByRole('dialog', { name: 'Single Player — Select Difficulty Level' })).toBeInTheDocument();
    expect(apiMock).toHaveBeenCalledWith('/practice/gold');
    expect(screen.queryByRole('alertdialog', { name: 'Out of Gold' })).toBeNull();

    // Multiplayer is a plain link to the lobby: it never checks Gold or shows the popup.
    apiMock.mockClear();
    fireEvent.click(screen.getByRole('link', { name: 'Multiplayer' }));
    expect(apiMock).not.toHaveBeenCalledWith('/practice/gold');
    // The Gold balance is shown (the coin HUD); no Out of Gold popup without leaving Single Player.
    expect(screen.getByLabelText('Gold balance')).toBeInTheDocument();
  });

  it('shows only Gold and Chips: the server Gold Total Amount and the Chips balance', async () => {
    routes(gold({ gold: '4500.00', total: '5100.00', reserved: '600.00', out_of_gold: false, can_claim: false }));
    render(<Home />);
    await waitFor(() => expect(screen.getByLabelText('Chips balance')).toHaveTextContent('250'));
    expect(screen.queryByText(/gold points|diamond|virtual coins|cash points/i)).toBeNull();
    await waitFor(() => expect(screen.getByLabelText('Gold balance')).toHaveTextContent('5,100'));
  });
});

describe('Home — Main Lobby top bar', () => {
  beforeEach(() => {
    apiMock.mockReset();
    push.mockReset();
    notifications = { data: [], meta: { unread: 0 } };
    window.history.replaceState(null, '', '/home/');
  });

  it('the profile is not clickable; only the pencil opens Choose Your Avatar', async () => {
    routes(gold({ out_of_gold: false }));
    render(<Home />);
    const profile = screen.getByRole('group', { name: 'Profile' });
    expect(profile.tagName).toBe('DIV');
    expect(profile.closest('a, button')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Profile' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change avatar' }));
    expect(await screen.findByRole('dialog', { name: 'Choose your avatar' })).toBeInTheDocument();
  });

  it('no top-up "+" buttons, no Leaderboard / Rankings — Gold and Chips still shown', async () => {
    routes(gold({ out_of_gold: false }));
    const { container } = render(<Home />);
    expect(screen.getByLabelText('Gold balance')).toBeInTheDocument();
    expect(screen.getByLabelText('Chips balance')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /wallet/i })).toBeNull();
    expect(container.querySelector('a[href="/wallet/"]')).toBeNull();
    expect(screen.queryByRole('link', { name: /leaderboard|ranking/i })).toBeNull();
    expect(container.querySelector('a[href="/leaderboard/"]')).toBeNull();
  });

  it('has no notification bell on the Main Lobby', async () => {
    routes(gold({ out_of_gold: false }));
    render(<Home />);
    await screen.findByRole('group', { name: 'Wallets' });
    expect(screen.queryByRole('button', { name: /notifications/i })).toBeNull();
  });
});

describe('Home — reconnecting to a match in progress', () => {
  beforeEach(() => {
    apiMock.mockReset();
    replace.mockReset();
    currentTable = null;
  });

  it('goes straight back to the table of a match you are seated in', async () => {
    currentTable = { id: 14, status: 'IN_GAME', players: [], room: { id: 1, name: 'Test', currency: 'CH' } };
    routes(gold({ out_of_gold: false }));
    render(<Home />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/play/?table=14'));
  });

  it('stays on Home when there is no match in progress (a waiting lobby or none)', async () => {
    currentTable = { id: 15, status: 'WAITING_FOR_PLAYERS', players: [], room: { id: 1, name: 'Test', currency: 'CH' } };
    routes(gold({ out_of_gold: false }));
    render(<Home />);
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/tables/current'));
    expect(replace).not.toHaveBeenCalledWith(expect.stringContaining('/play/'));
  });
});
