import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getToken, setToken, setUnauthorizedHandler } from './api';

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('mobile API client', () => {
  beforeEach(async () => {
    localStorage.clear();
    await setToken(null);
    vi.restoreAllMocks();
  });

  it('sends the Sanctum bearer token and query params to /api/v1', async () => {
    await setToken('abc123');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(200, { data: [] }));

    await api('/rooms', { query: { currency: 'VC', empty: '' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8000/api/v1/rooms?currency=VC');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc123');
  });

  it('stores the token in local storage in the browser', async () => {
    await setToken('persisted');
    expect(localStorage.getItem('pusoy.token')).toBe('persisted');
  });

  it('turns validation errors into readable messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(422, { message: 'Invalid', errors: { username: ['Taken.'], email: ['Bad email.'] } }));

    await expect(api('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 422, message: 'Taken. Bad email.' });
  });

  it('passes the server error code through (e.g. insufficient balance)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(422, { message: 'Insufficient balance.', error: 'insufficient_balance' }));

    const error = (await api('/rooms/1/join', { method: 'POST' }).catch((e) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('insufficient_balance');
  });

  it('clears the token and signals logout on 401', async () => {
    await setToken('expired');
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => json(401, { message: 'Unauthenticated.' }));

    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(onUnauthorized).toHaveBeenCalled();
    expect(await getToken()).toBeNull();
  });

  it('reports network failures distinctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(api('/wallet')).rejects.toMatchObject({ status: 0, code: 'network' });
  });
});
