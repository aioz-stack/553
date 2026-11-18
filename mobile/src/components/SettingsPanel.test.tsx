import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 1, name: 'Pat Player', username: 'player' } }) }));

import SettingsPanel, { passwordProblem } from './SettingsPanel';
import { applyPrefs } from '@/lib/prefs';

window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;

describe('passwordProblem', () => {
  it('requires every field, 8+ characters with letters and numbers, a matching confirmation and a new password', () => {
    expect(passwordProblem({ current: '', next: 'abc12345', confirm: 'abc12345' })).toMatch(/fill in all/);
    expect(passwordProblem({ current: 'old12345', next: 'abc1', confirm: 'abc1' })).toMatch(/at least 8 characters/);
    expect(passwordProblem({ current: 'old12345', next: 'abcdefgh', confirm: 'abcdefgh' })).toMatch(/letters and numbers/);
    expect(passwordProblem({ current: 'old12345', next: '12345678', confirm: '12345678' })).toMatch(/letters and numbers/);
    expect(passwordProblem({ current: 'old12345', next: 'abc12345', confirm: 'abc12346' })).toMatch(/do not match/);
    expect(passwordProblem({ current: 'abc12345', next: 'abc12345', confirm: 'abc12345' })).toMatch(/different/);
    expect(passwordProblem({ current: 'old12345', next: 'abc12345', confirm: 'abc12345' })).toBeNull();
  });
});

describe('SettingsPanel', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({});
    localStorage.clear();
  });

  it('BGM and Sound Effects toggles apply at once and are saved with the account', async () => {
    render(<SettingsPanel onClose={() => {}} />);
    const bgm = screen.getByRole('switch', { name: 'Background music' });
    const sfx = screen.getByRole('switch', { name: 'Sound effects' });
    expect(bgm).toHaveAttribute('aria-checked', 'true');
    expect(sfx).toHaveAttribute('aria-checked', 'true');

    await act(async () => fireEvent.click(bgm));
    expect(bgm).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('pusoy.bgm')).toBe('off');
    expect(apiMock).toHaveBeenCalledWith('/profile/preferences', { method: 'PUT', body: { bgm: false } });

    await act(async () => fireEvent.click(sfx));
    expect(sfx).toHaveAttribute('aria-checked', 'false');
    expect(localStorage.getItem('pusoy.sound')).toBe('off');
    expect(apiMock).toHaveBeenCalledWith('/profile/preferences', { method: 'PUT', body: { sfx: false } });
  });

  it('Motion Effects: one of Low / Medium / High is highlighted and applied to the whole app at once', async () => {
    render(<SettingsPanel onClose={() => {}} />);
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Low' })));
    expect(screen.getByRole('radio', { name: 'Low' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.quality).toBe('low');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    expect(apiMock).toHaveBeenCalledWith('/profile/preferences', { method: 'PUT', body: { motion: 'low' } });

    await act(async () => fireEvent.click(screen.getByRole('radio', { name: 'Medium' })));
    expect(document.documentElement.dataset.quality).toBe('medium');
    expect(document.documentElement.dataset.motion).toBe('full');
  });

  it('settings saved on the account come back (e.g. after logging in again)', async () => {
    render(<SettingsPanel onClose={() => {}} />);
    await act(async () => applyPrefs({ bgm: false, sfx: false, motion: 'medium' }));
    expect(screen.getByRole('switch', { name: 'Background music' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'Sound effects' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true');
  });

  it('password: checks the form first, shows server errors, and confirms success', async () => {
    render(<SettingsPanel onClose={() => {}} />);
    const update = screen.getByRole('button', { name: /UPDATE PASSWORD/ });
    fireEvent.click(update);
    expect(screen.getByRole('alert')).toHaveTextContent('Please fill in all three password fields.');
    expect(apiMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'newpass124' } });
    fireEvent.click(update);
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');

    // Show / hide the typed password.
    const field = screen.getByLabelText('New Password') as HTMLInputElement;
    expect(field.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show New Password' }));
    expect(field.type).toBe('text');

    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'newpass123' } });
    apiMock.mockRejectedValueOnce(new Error('Your current password is incorrect.'));
    fireEvent.click(update);
    expect(await screen.findByText('Your current password is incorrect.')).toBeInTheDocument();

    fireEvent.click(update);
    expect(await screen.findByRole('status')).toHaveTextContent('Your password has been changed.');
    expect(apiMock).toHaveBeenLastCalledWith('/profile/password', { method: 'PUT', body: { current_password: 'oldpass123', password: 'newpass123', password_confirmation: 'newpass123' } });
    await waitFor(() => expect((screen.getByLabelText('Current Password') as HTMLInputElement).value).toBe(''));
  });

  it('the Close (X) button closes the panel', () => {
    const close = vi.fn();
    render(<SettingsPanel onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
