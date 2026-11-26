import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const back = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ back, replace, push: vi.fn() }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 5, name: 'Pat', display_name: 'Pat' }, ready: true }) }));
vi.mock('@/lib/hooks', () => ({ useOnline: () => true }));
vi.mock('@/lib/useBalance', () => ({ useBalance: () => ({ chips: '0' }) }));

import { Screen } from './ui';

describe('Screen (no bottom tab bar)', () => {
  beforeEach(() => {
    back.mockReset();
    replace.mockReset();
  });

  it('has no bottom bar: no Home / Play / Me / Wallet / Ranks tabs', () => {
    render(<Screen title="Player profile" back>content</Screen>);
    expect(screen.queryByRole('navigation')).toBeNull();
    for (const label of ['Home', 'Play', 'Me', 'Wallet', 'Ranks']) expect(screen.queryByRole('link', { name: label })).toBeNull();
  });

  it('Back goes back — or to Game Home when there is nothing to go back to', () => {
    const length = vi.spyOn(window.history, 'length', 'get');
    length.mockReturnValue(3);
    render(<Screen title="Your wallet" back>content</Screen>);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledTimes(1);

    length.mockReturnValue(1); // opened straight from a notification
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(replace).toHaveBeenCalledWith('/home/');
    length.mockRestore();
  });
});
