import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
const setToken = vi.fn(async () => undefined);
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ setToken: (t: string | null) => setToken(t) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 5 } }) }));
vi.mock('@/lib/echo', () => ({ getEcho: async () => null }));

import SessionDisconnected, { ACCOUNT_ALREADY_CONNECTED, DISCONNECTED_EVENT } from './SessionDisconnected';

describe('SessionDisconnected', () => {
  it('covers the app with "Account Already Connected"; OK signs out and goes to the login screen', async () => {
    render(<SessionDisconnected />);
    expect(screen.queryByRole('alertdialog')).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent(DISCONNECTED_EVENT, { detail: ACCOUNT_ALREADY_CONNECTED }));
    });
    const dialog = screen.getByRole('alertdialog', { name: 'Account Already Connected' });
    expect(dialog).toHaveTextContent('This account has been detected logging in from multiple sessions. For security reasons, all sessions have been disconnected. Please log in again to continue.');

    fireEvent.click(screen.getByRole('button', { name: /OK/ }));
    expect(setToken).toHaveBeenCalledWith(null);
    expect(replace).toHaveBeenCalledWith('/login/');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
