import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => apiMock(...args),
  errorText: (e: Error) => e.message,
  // A plain class standing in for ApiError (the component only reads .message / .errors).
  ApiError: class {
    constructor(public message: string, public status = 0, public code?: string, public errors?: Record<string, string[]>) {}
  },
}));
vi.mock('@/lib/sound', () => ({ play: vi.fn() }));

import CreateLobbyModal, { lobbyFormProblems } from './CreateLobbyModal';
import { ApiError } from '@/lib/api';

describe('lobbyFormProblems', () => {
  it('requires a 2–30 character name and a 4+ character password when one is given', () => {
    expect(lobbyFormProblems({ name: '', password: '' }).name).toMatch(/Enter a lobby name/);
    expect(lobbyFormProblems({ name: 'x'.repeat(31), password: '' }).name).toMatch(/at most 30/);
    expect(lobbyFormProblems({ name: 'Room', password: 'abc' }).password).toMatch(/at least 4/);
    expect(lobbyFormProblems({ name: 'Room', password: '' })).toEqual({});
  });
});

describe('CreateLobbyModal', () => {
  beforeEach(() => apiMock.mockReset());

  it('shows Public until a password is typed, then Private; the eye shows the password', () => {
    render(<CreateLobbyModal balance={5000} onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByLabelText('Lobby type')).toHaveTextContent('Public');
    const pw = screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(pw, { target: { value: 'tiger553' } });
    expect(screen.getByLabelText('Lobby type')).toHaveTextContent('Private');
    expect(pw.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw.type).toBe('text');
  });

  it('has the required dropdown options', () => {
    render(<CreateLobbyModal balance={5000} onClose={() => {}} onCreated={() => {}} />);
    const opts = (label: string) => Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.textContent);
    expect(opts('Type of Game')).toEqual(['Banker Mode', 'Round Bank']);
    expect(opts('Minimum Entry')).toEqual(['100 Diamonds', '250 Diamonds', '500 Diamonds', '1,000 Diamonds', '2,000 Diamonds']);
    expect(opts('Preparation Time')).toEqual(['30 Seconds', '45 Seconds', '60 Seconds', '75 Seconds']);
  });

  it('validates before sending, blocks an unaffordable entry, then creates exactly once', async () => {
    const created = vi.fn();
    let resolve: (v: unknown) => void = () => {};
    apiMock.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<CreateLobbyModal balance={800} onClose={() => {}} onCreated={created} />);

    fireEvent.click(screen.getByRole('button', { name: 'Create Lobby' }));
    expect(await screen.findByText('Enter a lobby name.')).toBeInTheDocument();
    expect(apiMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Lobby Name'), { target: { value: 'Rookie Room' } });
    fireEvent.change(screen.getByLabelText('Minimum Entry'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Lobby' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You need at least 1,000 diamonds');
    expect(apiMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Minimum Entry'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Type of Game'), { target: { value: 'banker' } });
    fireEvent.change(screen.getByLabelText('Preparation Time'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Lobby' }));
    fireEvent.click(screen.getByRole('button', { name: 'Creating…' }));
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith('/lobbies', { method: 'POST', body: { name: 'Rookie Room', password: null, game_mode: 'banker', min_entry: 500, preparation_seconds: 60 } });
    await act(async () => resolve({ data: { id: 7 } }));
    await waitFor(() => expect(created).toHaveBeenCalledWith({ id: 7 }));
  });

  it("shows the server's field errors", async () => {
    apiMock.mockRejectedValueOnce(new ApiError('The given data was invalid.', 422, undefined, { name: ['The lobby name can be at most 30 characters.'] }));
    render(<CreateLobbyModal balance={5000} onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText('Lobby Name'), { target: { value: 'Room' } });
    fireEvent.submit(screen.getByLabelText('Lobby Name').closest('form') as HTMLFormElement);
    expect(await screen.findByText('The lobby name can be at most 30 characters.')).toBeInTheDocument();
  });

  it('Cancel closes without creating', () => {
    const close = vi.fn();
    render(<CreateLobbyModal balance={5000} onClose={close} onCreated={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalled();
  });
});
