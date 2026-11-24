import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loginMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ login: loginMock }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));
vi.mock('@/lib/useLandscapeLock', () => ({ useLandscapeLock: () => undefined }));

import Login from './page';

describe('Mobile Game login (artwork)', () => {
  beforeEach(() => {
    loginMock.mockReset();
    replaceMock.mockReset();
  });

  it('shows only username, password, show / hide and LOG IN on the whole artwork — no register or forgot links', () => {
    render(<Login />);
    const art = screen.getByRole('img', { name: 'Pusoy553' });
    expect(art).toHaveAttribute('src', '/login-art.webp');
    expect(art.className).toContain('object-contain');
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
    expect(screen.queryByText(/create an account|register|forgot/i)).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('shows and hides the password', () => {
    render(<Login />);
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  });

  it('signs in through the server, shows SIGNING IN… meanwhile, and goes Home', async () => {
    let resolve!: () => void;
    loginMock.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    render(<Login />);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'paplayer' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(loginMock).toHaveBeenCalledWith('paplayer', 'secret123');
    expect(await screen.findByText('SIGNING IN…')).toBeInTheDocument();
    await act(async () => resolve());
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/home/'));
  });

  it('shows the server\'s refusal (e.g. Web App accounts) and clears the password', async () => {
    loginMock.mockRejectedValue(new Error('Mobile Game Access Restricted. Your account is authorized to access the Pusoy553 Web Platform only. Please use the Web App to log in.'));
    render(<Login />);
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'superadmin' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Mobile Game Access Restricted');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
