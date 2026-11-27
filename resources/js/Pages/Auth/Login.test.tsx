import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  errors: {} as Record<string, string | undefined>,
  post: vi.fn(),
  reset: vi.fn(),
  processing: false,
  flash: {} as { success?: string | null },
}));

vi.mock('@inertiajs/react', async () => {
  const React = await import('react');

  return {
    Head: () => null,
    Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...props }, children),
    usePage: () => ({ props: { flash: mocks.flash } }),
    useForm: (initial: Record<string, unknown>) => {
      const [data, setData] = React.useState(initial);

      return {
        data,
        setData: (key: string, value: unknown) => setData((current) => ({ ...current, [key]: value })),
        post: mocks.post,
        processing: mocks.processing,
        errors: mocks.errors,
        reset: mocks.reset,
      };
    },
  };
});

vi.mock('../../Layouts/GuestLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../lib/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, toggle: vi.fn() }),
}));

import Login from './Login';

describe('Auth/Login', () => {
  beforeEach(() => {
    mocks.errors = {};
    mocks.flash = {};
    mocks.post.mockReset();
    mocks.reset.mockReset();
    mocks.processing = false;
  });

  it('renders the Baseplate split login and enables Sign In only with both fields', async () => {
    const user = userEvent.setup();
    render(<Login />);

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByText(/three hands\./i)).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: /^sign in$/i });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(/username/i), 'alice');
    await user.type(screen.getByLabelText(/^password/i), 'secret');
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(mocks.post).toHaveBeenCalledWith('/login', expect.objectContaining({ onFinish: expect.any(Function) }));
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<Login />);

    const password = screen.getByLabelText(/^password/i);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: /hide password/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the server error and marks the username field invalid', () => {
    mocks.errors = { username: 'The provided credentials do not match our records.' };
    render(<Login />);

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to sign in/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/provided credentials/i);
    expect(screen.getByLabelText(/username/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the mobile-app platform error', () => {
    mocks.errors = { platform: 'Player accounts can only access Pusoy553 through the official Mobile Game application.' };
    render(<Login />);

    expect(screen.getByRole('alert')).toHaveTextContent(/mobile app required/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/official mobile game application/i);
  });

  it('shows the one-session dialog and dismisses it', async () => {
    const user = userEvent.setup();
    mocks.errors = { session: 'This account has been detected logging in from multiple sessions. For security reasons, all sessions have been disconnected.' };
    render(<Login />);

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent(/account already connected/i);
    expect(dialog).toHaveTextContent(/multiple sessions/i);

    await user.click(screen.getByRole('button', { name: /ok — sign in again/i }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows flash success notices without assuming why the user arrived', () => {
    mocks.flash = { success: 'Your password has been reset. You can now sign in.' };
    render(<Login />);

    expect(screen.getByRole('status')).toHaveTextContent(/your password has been reset/i);
    expect(screen.queryByText(/signed out/i)).not.toBeInTheDocument();
  });
});
