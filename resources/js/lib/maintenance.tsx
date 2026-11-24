import { usePage } from '@inertiajs/react';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { api } from './api';
import { PANEL_REFRESH } from './panel';

export type MaintenanceModeValue = 'full' | 'mobile_game' | 'agents_players' | 'off';

export interface MaintenanceStatus {
  mode: MaintenanceModeValue;
  label: string;
  game_blocked: boolean;
  transactions_blocked: boolean;
  changed_at: string | null;
}

export const MAINTENANCE_OFF: MaintenanceStatus = { mode: 'off', label: 'OFF', game_blocked: false, transactions_blocked: false, changed_at: null };

/** Shown on disabled transaction buttons. */
export const TX_LOCKED_HINT = 'Unavailable during maintenance';

// One shared store (not a React context): panel pages render the layout as their child, so
// they sit outside anything the layout provides — a store reaches the page and the layout alike.
let live: MaintenanceStatus | null = null;
const listeners = new Set<() => void>();
function setLive(next: MaintenanceStatus) {
  const changed = live !== null && live.mode !== next.mode;
  live = next;
  listeners.forEach((l) => l());
  if (changed) window.dispatchEvent(new Event(PANEL_REFRESH));
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The live maintenance mode for the panels: starts from the page props, then follows the public
 * Reverb channel "maintenance" and re-checks /api/v1/status every 30 s and when the tab regains
 * focus. When it changes, every open panel page refetches (PANEL_REFRESH). The server enforces
 * the same mode on every request; this only drives notices and disabled buttons.
 */
export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const fromPage = (usePage().props as { maintenance?: MaintenanceStatus }).maintenance;

  // Every page load / Inertia visit carries the current mode.
  useEffect(() => {
    if (fromPage) setLive(fromPage);
  }, [fromPage]);

  useEffect(() => {
    const check = () => {
      api.get<{ data: MaintenanceStatus }>('/status').then((r) => setLive(r.data.data)).catch(() => undefined);
    };
    const echo = (window as unknown as { Echo?: { channel: (c: string) => { listen: (e: string, cb: (s: MaintenanceStatus) => void) => unknown }; leaveChannel: (c: string) => void } }).Echo;
    echo?.channel('maintenance').listen('.maintenance.updated', setLive);
    const timer = window.setInterval(check, 30_000);
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      echo?.leaveChannel('maintenance');
    };
  }, []);

  return <>{children}</>;
}

/** The current maintenance mode, anywhere in the panels (page props until the live store has it). */
export function useMaintenance(): MaintenanceStatus {
  const fromPage = (usePage().props as { maintenance?: MaintenanceStatus }).maintenance;
  const current = useSyncExternalStore(subscribe, () => live, () => null);

  return current ?? fromPage ?? MAINTENANCE_OFF;
}

export const MODE_EFFECTS: Record<MaintenanceModeValue, string> = {
  full: 'The mobile game is closed (maintenance screen) and all Incorporator, Master Agent and Player transactions are disabled.',
  mobile_game: 'Only the Player Mobile Game is closed (maintenance screen). All panels and transactions keep working.',
  agents_players: 'Transactions of Incorporators, Master Agents and Players are disabled. The mobile game keeps running.',
  off: 'Normal operation: the mobile game and all transactions are open.',
};
