import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import type { SharedProps } from './types';

export type PanelLevel = 'agent' | 'master';

export interface PanelInfo {
  /** Incorporators and Master Agents use the Agent Panel; staff the Admin Panel. */
  isAgent: boolean;
  /** Loader Accounts (employees) use the Loader Panel. */
  isLoader: boolean;
  /** The Loader's own permissions (loader_loads, loader_commissions, loader_passwords). */
  loaderCan: (permission: 'loader_loads' | 'loader_commissions' | 'loader_passwords') => boolean;
  level: PanelLevel | null;
  /** Web base path: /admin, /agent or /loader. */
  base: '/admin' | '/agent' | '/loader';
  /** API base (the agent one is limited to its own downline; the loader one to its three modules). */
  api: '/admin/panel' | '/agent/panel' | '/loader/panel';
  /** "Admin Panel", "Agent Panel", "Master Agent Panel", "Loader Panel". */
  name: string;
}

const NAMES: Record<PanelLevel, string> = { agent: 'Agent Panel', master: 'Master Agent Panel' };

/** Which panel the signed-in user gets. The server enforces the same split on every request. */
export function usePanel(): PanelInfo {
  const { auth } = usePage<SharedProps>().props;
  const user = auth.user as (SharedProps['auth']['user'] & { account_type?: string }) | null;
  const isAgent = user?.role === 'agent';
  const level = isAgent && user?.account_type === 'master' ? 'master' : isAgent ? 'agent' : null;

  const abilities = new Set(user?.abilities ?? []);
  const loaderCan = (p: string) => user?.role === 'loader' && abilities.has(p);

  if (user?.role === 'loader') {
    return { isAgent: false, isLoader: true, loaderCan, level: null, base: '/loader', api: '/loader/panel', name: 'Loader Panel' };
  }

  return isAgent
    ? { isAgent, isLoader: false, loaderCan, level, base: '/agent', api: '/agent/panel', name: NAMES[level ?? 'agent'] }
    : { isAgent: false, isLoader: false, loaderCan, level: null, base: '/admin', api: '/admin/panel', name: 'Admin Panel' };
}

/** Fired by the panel layout when Reverb says something on the panel changed (or the tab regains focus). */
export const PANEL_REFRESH = 'pusoy:panel-refresh';

/** Re-run the given loaders whenever the panel should refresh (real-time). */
export function usePanelRefresh(...reloads: Array<() => unknown>) {
  const ref = useRef(reloads);
  ref.current = reloads;

  useEffect(() => {
    const run = () => ref.current.forEach((r) => r());
    window.addEventListener(PANEL_REFRESH, run);
    return () => window.removeEventListener(PANEL_REFRESH, run);
  }, []);
}
