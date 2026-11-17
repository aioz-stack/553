'use client';

import { useState } from 'react';
import { GameButton, GlassCard } from '@/components/game';
import { Field, Notice, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { config } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useFetch, useOnline, when } from '@/lib/hooks';

interface Device {
  id: number;
  device_name: string;
  platform: string | null;
  last_used_at: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const online = useOnline();
  const devices = useFetch<{ data: Device[] }>(user ? '/auth/devices' : null);
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const change = async () => {
    try {
      await api('/profile/password', { method: 'PUT', body: pw });
      setPw({ current_password: '', password: '', password_confirmation: '' });
      setMessage({ tone: 'success', text: 'Password changed.' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    }
  };

  return (
    <Screen title="Settings" back>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <GlassCard title="Connection">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${online ? 'bg-mint-400 shadow-[0_0_8px_#45e0a5]' : 'bg-red-500'}`} />
          <span className="font-bold">{online ? 'Online' : 'Offline'}</span>
        </div>
        <p className="mt-1 break-all text-xs text-white/50">Server: {config.apiUrl}</p>
      </GlassCard>

      <GlassCard title="Change password">
        <Field label="Current password" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
        <Field label="New password" type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
        <Field label="Confirm" type="password" value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} />
        <GameButton tone="purple" className="w-full" onClick={change}>UPDATE PASSWORD</GameButton>
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
