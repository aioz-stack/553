'use client';

import { GlassCard } from '@/components/game';
import { Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useFetch, useOnline, when } from '@/lib/hooks';

interface Device {
  id: number;
  device_name: string;
  platform: string | null;
  last_used_at: string | null;
}

/** Signed-in devices and connection status (game settings live in the Settings panel). */
export default function SettingsDevices() {
  const { user } = useAuth();
  const online = useOnline();
  const devices = useFetch<{ data: Device[] }>(user ? '/auth/devices' : null);

  return (
    <Screen title="Devices" back>

      <GlassCard title="Connection">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${online ? 'bg-mint-400 shadow-[0_0_8px_#45e0a5]' : 'bg-red-500'}`} />
          <span className="font-bold">{online ? 'Online' : 'Offline'}</span>
        </div>
        <p className="mt-1 break-all text-xs text-white/50">Server: {config.apiUrl}</p>
      </GlassCard>

      <GlassCard title="Signed-in devices">
        {devices.data?.data.length === 0 && <p className="text-sm text-white/60">No other devices.</p>}
        {devices.data?.data.map((d) => (
          <div key={d.id} className="flex items-center justify-between border-b border-white/10 py-2 last:border-0">
            <span>
              <span className="block font-bold">{d.device_name}</span>
              <span className="text-xs text-white/50">{when(d.last_used_at)}</span>
            </span>
            <button className="rounded-full bg-red-500/25 px-3 py-1 text-xs font-bold text-red-100" onClick={async () => { await api(`/auth/devices/${d.id}`, { method: 'DELETE' }); devices.reload(); }}>
              Sign out
            </button>
          </div>
        ))}
      </GlassCard>
    </Screen>
  );
}
