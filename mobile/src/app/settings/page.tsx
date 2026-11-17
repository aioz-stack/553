'use client';

import { useState } from 'react';
import { GameButton, GlassCard } from '@/components/game';
import { Field, Notice, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { config } from '@/lib/config';
import { useAuth } from '@/lib/auth';
import { useFetch, useOnline, when } from '@/lib/hooks';
import { useSound } from '@/lib/sound';
import { useMotion, type MotionPref } from '@/lib/motion';

interface Device {
  id: number;
  device_name: string;
  platform: string | null;
  last_used_at: string | null;
}

export default function Settings() {
  const { user } = useAuth();
  const online = useOnline();
  const [soundOn, toggleSound] = useSound();
  const [motion, reduced, setMotion] = useMotion();
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

      <GlassCard title="Game audio">
        <button type="button" role="switch" aria-checked={soundOn} onClick={toggleSound} className="flex w-full items-center justify-between">
          <span className="font-bold">Sound effects</span>
          <span className={`relative h-8 w-14 rounded-full transition ${soundOn ? 'bg-mint-500' : 'bg-white/20'}`}>
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${soundOn ? 'left-7' : 'left-1'}`} />
          </span>
        </button>
        <p className="mt-1 text-xs text-white/55">{soundOn ? 'ON' : 'OFF'} · saved on this device</p>
      </GlassCard>

      <GlassCard title="Motion effects">
        <div className="flex gap-1 rounded-2xl bg-black/30 p-1" role="radiogroup" aria-label="Motion effects">
          {([['auto', 'Auto'], ['on', 'On'], ['off', 'Off']] as Array<[MotionPref, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={motion === value}
              onClick={() => setMotion(value)}
              className={`h-10 flex-1 rounded-xl font-display text-sm font-extrabold ${motion === value ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-night-900' : 'text-white/70'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/60">
          {motion === 'auto' ? `Auto follows your device's reduce-motion setting (${reduced ? 'currently reduced, so effects are paused' : 'animations are on'}).` : motion === 'on' ? 'Bounces, sparkles and shine always play.' : 'All animations are off.'} Saved on this device.
        </p>
      </GlassCard>

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
