import { usePage } from '@inertiajs/react';
import { useEffect, useRef } from 'react';
import type { SharedProps } from './types';

export type PanelLevel = 'agent' | 'master' | 'silver';

export interface PanelInfo {
  /** Agents, Master Agents and Silver Agents use the Agent Panel; staff the Admin Panel. */
  isAgent: boolean;
  level: PanelLevel | null;
  /** Web base path: /admin or /agent. */
  base: '/admin' | '/agent';
  /** API base: /admin/panel or /agent/panel (the agent one is limited to its own downline). */
  api: '/admin/panel' | '/agent/panel';
  /** "Admin Panel", "Agent Panel", "Master Agent Panel", "Silver Agent Panel". */
  name: string;
}

const NAMES: Record<PanelLevel, string> = { agent: 'Agent Panel', master: 'Master Agent Panel', silver: 'Silver Agent Panel' };

/** Which panel the signed-in user gets. The server enforces the same split on every request. */
export function usePanel(): PanelInfo {
  const { auth } = usePage<SharedProps>().props;
  const user = auth.user as (SharedProps['auth']['user'] & { account_type?: string }) | null;
  const isAgent = user?.role === 'agent';
  const level = isAgent && (user?.account_type === 'master' || user?.account_type === 'silver') ? (user.account_type as PanelLevel) : isAgent ? 'agent' : null;

  return isAgent
    ? { isAgent, level, base: '/agent', api: '/agent/panel', name: NAMES[level ?? 'agent'] }
    : { isAgent: false, level: null, base: '/admin', api: '/admin/panel', name: 'Admin Panel' };
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
