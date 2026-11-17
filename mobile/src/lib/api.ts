import { config } from './config';
import { storage } from './storage';

/**
 * Thin client for the Laravel /api/v1 endpoints using a Sanctum bearer
 * token. All game rules, scoring and wallet logic stay on the server.
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
    cachedToken = await storage.get(TOKEN_KEY);
  }

  return cachedToken;
}

export async function setToken(token: string | null) {
  cachedToken = token;

  if (token) {
    await storage.set(TOKEN_KEY, token);
  } else {
    await storage.remove(TOKEN_KEY);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown; query?: Record<string, unknown> } = {}): Promise<T> {
  const token = await getToken();
  const url = new URL(`${config.apiUrl}/api/v1${path}`);

  Object.entries(options.query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  let response: Response;

  try {
    response = await fetch(url.toString(), {
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
    if (response.status === 401 && token) {
      await setToken(null);
      onUnauthorized?.();
    }

    const errors = data?.errors as Record<string, string[]> | undefined;
    const message = errors ? Object.values(errors).flat().join(' ') : (data?.message ?? `Request failed (${response.status})`);

    throw new ApiError(message, response.status, data?.error, errors);
  }

  return data as T;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export function idempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}
