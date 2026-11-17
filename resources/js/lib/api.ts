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
