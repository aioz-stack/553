import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.fn();
const refresh = vi.fn(async () => undefined);
vi.mock('@/lib/api', () => ({ api: (...args: unknown[]) => apiMock(...args), errorText: (e: Error) => e.message }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 5, name: 'Pat Player', display_name: 'Lucky Pat', avatar: 'boy-02' }, refresh }) }));
vi.mock('@/lib/sound', () => ({ play: vi.fn() }));

import AvatarPicker from './AvatarPicker';
import { Avatar } from './game';
import { AVATAR_IDS, avatarFor, avatarUrl, isAvatarId } from '@/lib/avatars';

describe('avatar catalogue', () => {
  it('has 9 boys, 10 girls and 10 animals, each mapped to an image file that exists', () => {
    expect(AVATAR_IDS).toHaveLength(29);
    expect(AVATAR_IDS.filter((id) => id.startsWith('boy-'))).toHaveLength(9);
    expect(AVATAR_IDS.filter((id) => id.startsWith('girl-'))).toHaveLength(10);
    expect(AVATAR_IDS.filter((id) => id.startsWith('animal-'))).toHaveLength(10);
    for (const id of AVATAR_IDS) {
      expect(existsSync(join(process.cwd(), 'public', avatarUrl(id)))).toBe(true);
    }
  });

  it('falls back to the same stable default as the server for missing or unknown ids', () => {
    expect(avatarFor(null, 5)).toBe(AVATAR_IDS[5 % 29]);
    expect(avatarFor('dragon-01', 5)).toBe(AVATAR_IDS[5]);
    expect(avatarFor('girl-03', 5)).toBe('girl-03');
    expect(isAvatarId('animal-10')).toBe(true);
  });
});

describe('Avatar', () => {
  it('shows the picture, and never a broken image: falls back to the default, then initials', () => {
    const { container } = render(<Avatar name="Pat Player" avatar="girl-03" userId={5} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/avatars/girl-03.webp');
    fireEvent.error(img);
    expect((container.querySelector('img') as HTMLImageElement).getAttribute('src')).toBe(`/avatars/${AVATAR_IDS[5]}.webp`);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('PP');
  });
});

describe('AvatarPicker', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue({ data: { avatar: 'animal-07' } });
    refresh.mockClear();
  });

  it('shows all 29, filters by Boys / Girls / Animals, and marks your current avatar', () => {
    render(<AvatarPicker onClose={() => {}} />);
    const grid = () => within(screen.getByRole('list', { name: 'Avatars' }));
    expect(grid().getAllByRole('button')).toHaveLength(29);
    fireEvent.click(screen.getByRole('tab', { name: 'Boys' }));
    expect(grid().getAllByRole('button')).toHaveLength(9);
    fireEvent.click(screen.getByRole('tab', { name: 'Girls' }));
    expect(grid().getAllByRole('button')).toHaveLength(10);
    fireEvent.click(screen.getByRole('tab', { name: 'Animals' }));
    expect(grid().getAllByRole('button')).toHaveLength(10);
    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    expect(grid().getByRole('button', { name: 'Backwards Cap' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('preview + Confirm saves it on the account and refreshes your profile', async () => {
    const saved = vi.fn();
    const close = vi.fn();
    render(<AvatarPicker onClose={close} onSaved={saved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tiger' }));
    expect(screen.getByRole('button', { name: 'Tiger' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByAltText('Preview: Tiger')).toHaveAttribute('src', '/avatars/animal-07.webp');
    fireEvent.click(screen.getByRole('button', { name: '✓ Confirm' }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/profile/avatar', { method: 'PUT', body: { avatar: 'animal-07' } }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith('animal-07'));
    expect(refresh).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('Cancel closes without saving', () => {
    const close = vi.fn();
    render(<AvatarPicker onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fox' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(close).toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('shows the current nickname below the picture; Change Nickname edits and saves it at once', async () => {
    apiMock.mockResolvedValue({ data: { nickname: 'Ace Pat' } });
    render(<AvatarPicker onClose={() => {}} />);
    const field = screen.getByLabelText('Nickname');
    expect(field).toHaveValue('Lucky Pat');
    expect(field).toHaveAttribute('readonly');
    fireEvent.click(screen.getByRole('button', { name: /Change Nickname/ }));
    expect(field).not.toHaveAttribute('readonly');
    fireEvent.change(field, { target: { value: 'Ace Pat' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Nickname/ }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/profile/nickname', { method: 'PUT', body: { nickname: 'Ace Pat' } }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(await screen.findByText('Nickname saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Nickname' })).toBeInTheDocument();
  });

  it("shows the server's nickname error and keeps the popup open", async () => {
    apiMock.mockRejectedValue(new Error('Use letters, numbers, spaces, "." "_" or "-" only.'));
    const close = vi.fn();
    render(<AvatarPicker onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: /Change Nickname/ }));
    fireEvent.change(screen.getByLabelText('Nickname'), { target: { value: '<bad>' } });
    fireEvent.click(screen.getByRole('button', { name: '✓ Confirm' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use letters');
    expect(close).not.toHaveBeenCalled();
    expect(apiMock).not.toHaveBeenCalledWith('/profile/avatar', expect.anything());
  });
});
