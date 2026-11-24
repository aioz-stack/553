import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('../../lib/api', () => ({
  api: { get: (...a: unknown[]) => get(...a), post: vi.fn() },
  errorMessage: (e: { message?: string }) => e?.message ?? 'error',
  newIdempotencyKey: () => 'req-1',
}));

import TeamSections from './TeamSections';

describe('TeamSections (Overview)', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockImplementation(() => Promise.resolve({ data: { data: { total_player_wallets: '300.00', total_agent_wallets: '5000.00', players: 2, agents: 2, scope: 'downline' } } }));
  });

  it('shows the team totals from the server', async () => {
    render(<TeamSections />);
    expect(await screen.findByText('5,000.00')).toBeInTheDocument();
    expect(screen.getByText('300.00')).toBeInTheDocument();
    expect(screen.getByText('2 agents · 2 players in your downline')).toBeInTheDocument();
  });

  it('no longer offers Convert Commission to Wallet (and never asks for the commission wallet)', async () => {
    render(<TeamSections />);
    await screen.findByText('5,000.00');
    expect(screen.queryByText(/convert commission to wallet/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /convert/i })).toBeNull();
    expect(screen.queryByText('Available to convert')).toBeNull();
    expect(get.mock.calls.map((c) => c[0])).not.toContain('/commission/wallet');
  });
});
