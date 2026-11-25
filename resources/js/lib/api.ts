import axios, { AxiosError } from 'axios';

/**
 * Client for the shared /api/v1 backend. The web app authenticates with its
 * session cookie (Sanctum stateful), so no token handling is needed here.
 */
export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
});

// One active login per player: when the server has signed this browser out (a duplicate login, or
// the account signed in elsewhere), go to the login page, which shows why.
api.interceptors.response.use(undefined, (error: AxiosError<ApiErrorShape>) => {
  const code = error.response?.data?.error;
  if ((code === 'account_already_connected' || code === 'session_replaced') && typeof window !== 'undefined') {
    window.location.href = '/';
  }
  return Promise.reject(error);
});

export interface ApiErrorShape {
  message: string;
  error?: string;
  errors?: Record<string, string[]>;
}

export function errorMessage(error: unknown): string {
  const e = error as AxiosError<ApiErrorShape>;
  const data = e?.response?.data;

  if (data?.errors) {
    return Object.values(data.errors).flat().join(' ');
  }

  return data?.message ?? (e as Error)?.message ?? 'Something went wrong.';
}

export function fieldErrors(error: unknown): Record<string, string> {
  const errors = (error as AxiosError<ApiErrorShape>)?.response?.data?.errors ?? {};

  return Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0]]));
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
