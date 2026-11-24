import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const post = vi.fn();
let wallet = { balance: '50.00', available: '50.00', pending: '0.00', converted: '0.00', min_conversion: 10 };

vi.mock('../../lib/api', () => ({
  api: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
  errorMessage: (e: { message?: string }) => e?.message ?? 'error',
  newIdempotencyKey: () => 'req-1',
}));

import TeamSections from './TeamSections';

describe('TeamSections', () => {
  beforeEach(() => {
    wallet = { balance: '50.00', available: '50.00', pending: '0.00', converted: '0.00', min_conversion: 10 };
    get.mockReset();
    post.mockReset();
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: {
          data: url === '/commission/wallet' ? wallet : { total_player_wallets: '300.00', total_agent_wallets: '5000.00', agents_commission: '110.00', players: 2, agents: 2, scope: 'downline' },
        },
      }),
    );
  });

  it('shows the commission and the team totals from the server', async () => {
    render(<TeamSections />);
    expect(await screen.findByText('5,000.00')).toBeInTheDocument();
    expect(screen.getByText('300.00')).toBeInTheDocument();
    expect(screen.getByText('110.00')).toBeInTheDocument();
    expect(screen.getByText('2 agents · 2 players in your downline')).toBeInTheDocument();
  });

  it('converts: minimum 10, not above available, one request id, then refreshes balances', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<TeamSections onChanged={onChanged} />);
    await user.click(await screen.findByRole('button', { name: /convert to wallet/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Commission Amount')).toBeInTheDocument();
    expect(within(dialog).getByText('Minimum Conversion')).toBeInTheDocument();
    const input = within(dialog).getByLabelText('Amount to Convert');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm Conversion' });

    await user.type(input, '9');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('minimum conversion is 10');
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, '60');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('more than your available');
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, '30');
    post.mockImplementation(() => {
      wallet = { ...wallet, balance: '20.00', available: '20.00', converted: '30.00' };
      return Promise.resolve({ data: { message: '30 Chips moved from commission to your wallet.' } });
    });
    await user.click(confirm);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/commission/convert', { amount: '30', request_id: 'req-1' });
    expect(await screen.findByText('30 Chips moved from commission to your wallet.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('30.00')).toBeInTheDocument());
    expect(onChanged).toHaveBeenCalled();
  });

  it('cannot open the conversion below the minimum', async () => {
    wallet = { ...wallet, balance: '5.00', available: '5.00' };
    render(<TeamSections />);
    await screen.findAllByText('5.00');
    await waitFor(() => expect(screen.getByRole('button', { name: /convert to wallet/i })).toBeDisabled());
  });
});
