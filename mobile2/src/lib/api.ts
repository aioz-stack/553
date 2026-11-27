import * as SecureStore from 'expo-secure-store';
import { config } from './config';
import { emit } from './events';

/**
 * Thin client for the Laravel /api/v1 endpoints using a Sanctum bearer token (kept in the
 * device's secure store). All game rules, scoring and wallet logic stay on the server.
 */
export const TOKEN_KEY = 'pusoy.token';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public errors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

let cachedToken: string | null | undefined;
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export async function getToken(): Promise<string | null> {
  if (cachedToken === undefined) {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
  }
  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const token = await getToken();
  const qs = Object.entries(options.query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const url = `${config.apiUrl}/api/v1${path}${qs ? `?${qs}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Network unavailable. Check your connection.', 0, 'network');
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    // One active login per player: this session was signed out elsewhere.
    if (data?.error === 'account_already_connected' || data?.error === 'session_replaced') {
      emit('disconnected', {
        title: data?.title ?? (data?.error === 'session_replaced' ? 'Signed Out' : 'Account Already Connected'),
        message: String(data?.message ?? '').replace(/^Account Already Connected\.\s*/, ''),
      });
    }
    if (response.status === 401 && token) {
      await setToken(null);
      onUnauthorized?.();
    }
    if (response.status === 503 && data?.error === 'maintenance') emit('maintenance', data.maintenance ?? null);

    const errors = data?.errors as Record<string, string[]> | undefined;
    const message = errors ? Object.values(errors).flat().join(' ') : (data?.message ?? `Request failed (${response.status})`);
    throw new ApiError(message, response.status, data?.error, errors);
  }

  return data as T;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** A request id the server accepts (letters, digits and dashes) — makes retries safe. */
export function requestKey(): string {
  const rnd = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rnd()}-${rnd()}`;
}
