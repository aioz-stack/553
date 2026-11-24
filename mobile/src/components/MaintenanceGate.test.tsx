import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
let echoHandler: ((s: unknown) => void) | null = null;

vi.mock('@/lib/maintenance', async (orig) => ({
  ...(await orig<typeof import('@/lib/maintenance')>()),
  fetchMaintenance: () => fetchMock(),
}));
vi.mock('@/lib/echo', () => ({
  getEcho: async () => ({
    channel: () => ({ listen: (_e: string, cb: (s: unknown) => void) => (echoHandler = cb) }),
    leaveChannel: () => undefined,
  }),
}));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));

import MaintenanceGate from './MaintenanceGate';

const status = (mode: string, game_blocked: boolean) => ({ mode, label: mode, game_blocked, transactions_blocked: false, changed_at: null });

describe('MaintenanceGate', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    echoHandler = null;
  });

  it('shows the app normally when maintenance is off or does not touch the game', async () => {
    fetchMock.mockResolvedValue(status('agents_players', false));
    render(<MaintenanceGate><p>lobby</p></MaintenanceGate>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByText('lobby')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('replaces the whole app with the full-screen artwork while the game is in maintenance, and comes back on OFF', async () => {
    fetchMock.mockResolvedValue(status('mobile_game', true));
    render(<MaintenanceGate><p>lobby</p></MaintenanceGate>);

    const img = await screen.findByRole('img', { name: /under maintenance/i });
    expect(img).toHaveAttribute('src', '/maintenance.webp');
    expect(img.className).toContain('object-contain'); // never stretched
    expect(screen.queryByText('lobby')).toBeNull();

    // The Admin turns maintenance OFF: Reverb tells the app, which returns to normal by itself.
    await waitFor(() => expect(echoHandler).not.toBeNull());
    act(() => echoHandler!(status('off', false)));
    expect(await screen.findByText('lobby')).toBeInTheDocument();
  });

  it('switches to the maintenance screen as soon as any request answers 503 maintenance', async () => {
    fetchMock.mockResolvedValue(status('off', false));
    render(<MaintenanceGate><p>table</p></MaintenanceGate>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(new CustomEvent('pusoy:maintenance', { detail: status('full', true) }));
    });
    expect(await screen.findByRole('img', { name: /under maintenance/i })).toBeInTheDocument();
    expect(screen.queryByText('table')).toBeNull();
  });
});
