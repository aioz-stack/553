import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
const push = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
  idempotencyKey: () => 'key-1',
  ApiError: class extends Error {},
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 5, name: 'Pat Player', username: 'pat', role: 'player' }, logout: vi.fn() }) }));
vi.mock('@/lib/useBalance', () => ({ useBalance: () => ({ vc: '250.00', gd: '0.00', gp: '0.00' }) }));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));
vi.mock('@/lib/sound', () => ({ play: vi.fn(), useSound: () => [true, vi.fn()] }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }), usePathname: () => '/home/' }));
vi.mock('@/components/ui', async (orig) => ({ ...(await orig<object>()), Screen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import Home from './page';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;

const gold = (over: object = {}) => ({ data: { gold: '0.00', gold_points: '0.00', out_of_gold: true, can_claim: true, claim_amount: 1000, minimum_to_start: 1000, ...over } });

function routes(goldState: ReturnType<typeof gold>) {
  apiMock.mockImplementation((path: string) => {
    if (path === '/practice/gold') return Promise.resolve(goldState);
    if (path === '/practice/tiers') return Promise.resolve({ data: [] });
    if (path === '/tables/current') return Promise.resolve({ data: null });
    if (path === '/profile/stats') return Promise.resolve({ data: { level: { level: 3, xp: 10, into_level: 5, for_next: 10 } } });
    if (path === '/wallet') return Promise.resolve({ data: [], meta: {} });
    if (path === '/notifications') return Promise.resolve({ data: [], meta: { unread: 0 } });
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
    expect(screen.getByRole('button', { name: 'CLAIM 1,000 GOLD POINTS' })).toBeInTheDocument();
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
    // The Gold balance is shown (the coin HUD); no Gold Points popup without leaving Single Player.
    expect(screen.getByLabelText('Gold balance')).toBeInTheDocument();
  });
});
