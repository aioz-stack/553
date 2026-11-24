import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...args: unknown[]) => apiMock(...args), errorText: (e: Error) => e.message, idempotencyKey: () => 'idem-123456' }));
vi.mock('@/lib/sound', () => ({ play: vi.fn() }));

import ShopModal from './ShopModal';

const SHOP = (chips = '30.00', keys = '0.00') => ({
  data: {
    chips_per_key: 5,
    packages: [
      { id: 'k1', chips: 5, keys: 1 },
      { id: 'k2', chips: 10, keys: 2 },
      { id: 'k5', chips: 25, keys: 5 },
      { id: 'k10', chips: 50, keys: 10 },
    ],
    balances: { chips, keys },
    history: [{ id: 1, package: 'k1', direction: 'keys_out', chips: '0.00', keys: '5.00', paid_out: { amount: '25.00', currency: 'GD' }, created_at: '2026-11-25T01:00:00Z' }],
  },
});

describe('Shop (Chips → Keys)', () => {
  beforeEach(() => apiMock.mockReset());

  it('sells Keys for Chips at 5 Chips = 1 Key, shows both balances and the notice', async () => {
    apiMock.mockImplementation((path?: string) => Promise.resolve(path === '/shop' ? SHOP() : {}));
    render(<ShopModal onClose={() => {}} />);
    const list = await screen.findByRole('list', { name: 'Exchange packages' });
    expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['1 Key for 5 Chips', '2 Keys for 10 Chips', '5 Keys for 25 Chips', '10 Keys for 50 Chips']);
    expect(screen.getByLabelText('Exchange rate')).toHaveTextContent('5 Chips = 1 Key');
    expect(screen.getByLabelText('Chips balance')).toHaveTextContent('30');
    expect(screen.getByLabelText('Keys balance')).toHaveTextContent('0');
    const notice = screen.getByRole('note', { name: 'Important notice' });
    expect(notice).toHaveTextContent('Chips spent in the Shop are non-refundable');
    expect(notice).toHaveTextContent('Keys bought cannot be converted back into Chips');
    // Earlier exchanges keep their own direction in the history.
    expect(screen.getByRole('list', { name: 'Exchange history' })).toHaveTextContent('−5 Keys → +25 Gold');
  });

  it('warns when you do not have enough Chips and never asks the server', async () => {
    apiMock.mockImplementation((path?: string) => Promise.resolve(path === '/shop' ? SHOP() : {}));
    render(<ShopModal onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Buy 10 Keys for 50 Chips' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough Chips');
    expect(screen.queryByRole('alertdialog', { name: 'Confirm exchange' })).toBeNull();
    expect(apiMock).not.toHaveBeenCalledWith('/shop/key-exchanges', expect.anything());
  });

  it('confirms the Chips paid and Keys received, sends one exchange, and shows the new balances', async () => {
    let resolve!: (v: unknown) => void;
    let now = SHOP();
    apiMock.mockImplementation((path?: string) => (path === '/shop/key-exchanges' ? new Promise((r) => (resolve = r)) : Promise.resolve(now)));
    const wallet = vi.fn();
    window.addEventListener('pusoy:wallet', wallet);
    render(<ShopModal onClose={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Buy 5 Keys for 25 Chips' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm exchange' });
    expect(dialog).toHaveTextContent('Pay 25 CHIPS → get 5 KEYS');
    expect(dialog).toHaveTextContent('Chips after: 5');
    const ok = within(dialog).getByRole('button', { name: 'Confirm exchange' });
    expect(ok).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(ok);
    fireEvent.click(ok); // double tap
    expect(apiMock.mock.calls.filter((c) => c[0] === '/shop/key-exchanges')).toEqual([['/shop/key-exchanges', { method: 'POST', body: { package: 'k5', idempotency_key: 'idem-123456', confirmed: true } }]]);

    now = SHOP('5.00', '5.00');
    await act(async () => resolve({ message: 'ok', data: { balances: { chips: '5.00', keys: '5.00' } } }));
    expect(await screen.findByRole('status')).toHaveTextContent('Success! 25 Chips exchanged for 5 keys');
    await waitFor(() => expect(screen.getByLabelText('Chips balance')).toHaveTextContent('5'));
    expect(screen.getByLabelText('Keys balance')).toHaveTextContent('5');
    expect(wallet).toHaveBeenCalled();
    window.removeEventListener('pusoy:wallet', wallet);
  });

  it("shows the server's refusal and changes nothing on screen", async () => {
    apiMock.mockImplementation((path?: string) => (path === '/shop/key-exchanges' ? Promise.reject(new Error('Not enough Chips for this package. You need 25.00 Chips.')) : Promise.resolve(SHOP())));
    render(<ShopModal onClose={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Buy 5 Keys for 25 Chips' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exchange' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough Chips for this package');
    expect(screen.getByLabelText('Chips balance')).toHaveTextContent('30');
  });
});
