import { api } from './api';

/**
 * Platform maintenance, set by the Admin Panel on the Laravel backend (GET /api/v1/status,
 * public Reverb channel "maintenance"). The app only reads it: while `game_blocked` is true
 * (Full Maintenance or Mobile Game) it shows the maintenance screen instead of the game. The
 * server refuses game requests on its own as well (503 "maintenance").
 */
export interface MaintenanceStatus {
  mode: 'full' | 'mobile_game' | 'agents_players' | 'off';
  label: string;
  game_blocked: boolean;
  transactions_blocked: boolean;
  changed_at: string | null;
}

/** Fired by the API client when the server answers 503 "maintenance" (detail: the status). */
export const MAINTENANCE_EVENT = 'pusoy:maintenance';

export async function fetchMaintenance(): Promise<MaintenanceStatus> {
  return (await api<{ data: MaintenanceStatus }>('/status')).data;
}

/** How often the app re-checks while open (Reverb usually tells it at once). */
export const MAINTENANCE_POLL_MS = 30_000;

/** The artwork shown full screen during maintenance (bundled in /public). */
export const MAINTENANCE_IMAGE = '/maintenance.webp';
