'use client';

import { useState } from 'react';
import { Button, Field, Notice, Panel, Screen } from '@/components/ui';
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
      <Panel title="Connection">
        <p className="text-sm text-gray-600 dark:text-gray-300">Network: {online ? 'online' : 'offline'}</p>
        <p className="break-all text-xs text-gray-500">Server: {config.apiUrl}</p>
      </Panel>
      <Panel title="Change password">
        <Field label="Current password" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
        <Field label="New password" type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
        <Field label="Confirm" type="password" value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} />
        <Button className="w-full" onClick={change}>Update password</Button>
      </Panel>
      <Panel title="Signed-in devices">
        {devices.data?.data.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-2 text-sm">
            <span>{d.device_name} <span className="text-xs text-gray-500">{when(d.last_used_at)}</span></span>
            <button className="text-error-500" onClick={async () => { await api(`/auth/devices/${d.id}`, { method: 'DELETE' }); devices.reload(); }}>Sign out</button>
          </div>
        ))}
      </Panel>
    </Screen>
  );
}
