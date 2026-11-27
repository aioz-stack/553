import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import { resetEcho } from './echo';
import { setQuality } from './motion';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  /** Registers a PENDING account (an administrator approves it); resolves to the server's message. */
  register: (data: Record<string, string>) => Promise<string>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const device = () => ({ device_name: `Pusoy 13 ${Platform.OS}`, platform: Platform.OS });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // The motion level follows the account once the player has picked one.
  useEffect(() => {
    const p = user?.preferences;
    if (p?.motion_chosen && (p.motion === 'low' || p.motion === 'medium' || p.motion === 'high')) setQuality(p.motion);
  }, [user?.preferences]);

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
      router.replace('/login');
    });
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const login = async (username: string, password: string) => {
    const { data } = await api<{ data: { token: string; user: User } }>('/auth/login', { method: 'POST', body: { username, password, ...device() } });
    await setToken(data.token);
    resetEcho();
    setUser(data.user);
  };

  const register = async (form: Record<string, string>) => {
    const r = await api<{ message: string }>('/auth/register', { method: 'POST', body: { ...form, ...device() } });
    return r.message;
  };

  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      // the token may already be invalid
    }
    await setToken(null);
    resetEcho();
    setUser(null);
    router.replace('/login');
  };

  return <AuthContext.Provider value={{ user, ready, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
