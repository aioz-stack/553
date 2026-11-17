'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { resetEcho } from './echo';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function deviceInfo() {
  try {
    const { Capacitor } = await import('@capacitor/core');
    return { device_name: `Pusoy 13 ${Capacitor.getPlatform()}`, platform: Capacitor.getPlatform() === 'web' ? 'web' : Capacitor.getPlatform() };
  } catch {
    return { device_name: 'Pusoy 13 web', platform: 'web' };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!(await getToken())) {
      setUser(null);
      return;
    }

    try {
      const { data } = await api<{ data: User }>('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      resetEcho();
      router.replace('/login/');
    });
    refresh().finally(() => setReady(true));
  }, [refresh, router]);

  const login = async (username: string, password: string) => {
    const { data } = await api<{ data: { token: string; user: User } }>('/auth/login', { method: 'POST', body: { username, password, ...(await deviceInfo()) } });
    await setToken(data.token);
    setUser(data.user);
  };

  const register = async (form: Record<string, string>) => {
    const { data } = await api<{ data: { token: string; user: User } }>('/auth/register', { method: 'POST', body: { ...form, ...(await deviceInfo()) } });
    await setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // token may already be invalid
    }

    await setToken(null);
    resetEcho();
    setUser(null);
    router.replace('/login/');
  };

  return <AuthContext.Provider value={{ user, ready, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return value;
}
