import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({ api: (...args: unknown[]) => apiMock(...args), errorText: (e: Error) => e.message, idempotencyKey: () => 'idem-123456' }));
vi.mock('@/lib/sound', () => ({ play: vi.fn() }));

import ShopModal from './ShopModal';

const SHOP = (keys = '7.00') => ({
  data: {
    packages: [
      { id: 'k1', keys: 1, gold: 5 },
      { id: 'k2', keys: 2, gold: 10 },
      { id: 'k5', keys: 5, gold: 25 },
      { id: 'k10', keys: 10, gold: 50 },
    ],
    balances: { keys, gold: '500.00' },
    history: [],
  },
});

describe('Shop (Keys → Gold)', () => {
  beforeEach(() => {
    apiMock.mockReset();
  });

  it('shows the four packages, your Keys and the important notice', async () => {
    apiMock.mockImplementation((path?: string) => Promise.resolve(path === '/shop' ? SHOP() : {}));
    render(<ShopModal onClose={() => {}} onGetKeys={() => {}} />);
    const list = await screen.findByRole('list', { name: 'Exchange packages' });
    expect(within(list).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['1 Key for 5 Gold', '2 Keys for 10 Gold', '5 Keys for 25 Gold', '10 Keys for 50 Gold']);
    expect(screen.getByLabelText('Keys balance')).toHaveTextContent('7');
    const notice = screen.getByRole('note', { name: 'Important notice' });
    expect(notice).toHaveTextContent('non-refundable');
    expect(notice).toHaveTextContent('cannot be converted back into Keys');
    expect(notice).toHaveTextContent('final');
  });

  it('warns when you do not have enough Keys and never asks the server', async () => {
    apiMock.mockImplementation((path?: string) => Promise.resolve(path === '/shop' ? SHOP() : {}));
    render(<ShopModal onClose={() => {}} onGetKeys={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Exchange 10 Keys for 50 Gold' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough Keys');
    expect(screen.queryByRole('alertdialog', { name: 'Confirm exchange' })).toBeNull();
    expect(apiMock).not.toHaveBeenCalledWith('/shop/key-exchanges', expect.anything());
  });

  it('asks for confirmation (final and non-refundable), sends one exchange, and shows the new balances', async () => {
    let resolve!: (v: unknown) => void;
    let keysNow = '7.00';
    apiMock.mockImplementation((path?: string) => (path === '/shop' ? Promise.resolve(SHOP(keysNow)) : new Promise((r) => (resolve = r))));
    const wallet = vi.fn();
    window.addEventListener('pusoy:wallet', wallet);
    render(<ShopModal onClose={() => {}} onGetKeys={() => {}} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Exchange 5 Keys for 25 Gold' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm exchange' });
    const ok = within(dialog).getByRole('button', { name: 'Confirm exchange' });
    expect(ok).toBeDisabled(); // must acknowledge first
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(ok);
    fireEvent.click(ok); // double tap
    expect(apiMock.mock.calls.filter((c) => c[0] === '/shop/key-exchanges')).toEqual([['/shop/key-exchanges', { method: 'POST', body: { package: 'k5', idempotency_key: 'idem-123456', confirmed: true } }]]);

    keysNow = '2.00'; // the server's balance after the exchange
    await act(async () => resolve({ message: 'ok', data: { balances: { keys: '2.00', gold: '525.00' } } }));
    expect(await screen.findByRole('status')).toHaveTextContent('Success! 5 keys exchanged for 25 Gold');
    await waitFor(() => expect(screen.getByLabelText('Keys balance')).toHaveTextContent('2'));
    expect(wallet).toHaveBeenCalled();
    window.removeEventListener('pusoy:wallet', wallet);
  });

  it("shows the server's refusal and changes nothing on screen", async () => {
    apiMock.mockImplementation((path?: string) => (path === '/shop' ? Promise.resolve(SHOP()) : Promise.reject(new Error('Not enough Keys for this package. You need 5.00 Keys.'))));
    render(<ShopModal onClose={() => {}} onGetKeys={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Exchange 5 Keys for 25 Gold' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm exchange' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not enough Keys for this package');
    expect(screen.getByLabelText('Keys balance')).toHaveTextContent('7');
  });
});
