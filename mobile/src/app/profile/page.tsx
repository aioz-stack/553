'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar, GameButton, GlassCard } from '@/components/game';
import { IconList, IconSettings, IconTrophy } from '@/components/icons';
import { Field, Notice, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';

interface Stats {
  games_played: number;
  games_won: number;
  total_score: number;
  win_rate: number;
  best_score: number;
}

export default function Profile() {
  const { user, refresh, logout } = useAuth();
  const stats = useFetch<{ data: Stats }>(user ? '/profile/stats' : null);
  const [form, setForm] = useState({ name: '', display_name: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const s = stats.data?.data;

  useEffect(() => {
    if (user) {
      setForm({ name: user.name, display_name: user.display_name ?? '' });
    }
  }, [user]);

  const save = async () => {
    try {
      await api('/profile', { method: 'PATCH', body: form });
      await refresh();
      setMessage({ tone: 'success', text: 'Profile saved.' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    }
  };

  return (
    <Screen title="Player profile">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      <div className="mb-4 flex flex-col items-center text-center">
        <Avatar name={user?.display_name ?? user?.name ?? '?'} size={96} active />
        <h1 className="mt-2 font-display text-2xl font-black">{user?.display_name ?? user?.name}</h1>
        <p className="text-sm text-white/60">@{user?.username} · {user?.role_label}</p>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2 text-center">
        {[
          ['Games', s?.games_played ?? 0],
          ['Wins', s?.games_won ?? 0],
          ['Win %', `${s?.win_rate ?? 0}`],
          ['Best', s?.best_score ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="glass rounded-2xl py-2">
            <p className="font-display text-xl font-black text-gold-200">{value}</p>
            <p className="text-[10px] font-bold uppercase text-white/60">{label}</p>
          </div>
        ))}
      </div>

      <GlassCard title="Edit profile">
        <Field label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label="Table name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
        <GameButton className="w-full" onClick={save}>SAVE</GameButton>
      </GlassCard>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          ['/history/', 'History', IconList],
          ['/leaderboard/', 'Ranks', IconTrophy],
          ['/settings/', 'Settings', IconSettings],
        ].map(([href, label, Icon]) => {
          const I = Icon as typeof IconList;
          return (
            <Link key={href as string} href={href as string} className="glass flex flex-col items-center gap-1 rounded-2xl py-3">
              <I className="h-6 w-6 text-gold-300" />
              <span className="font-display text-xs font-bold">{label as string}</span>
            </Link>
          );
        })}
      </div>

      <GameButton tone="red" className="w-full" onClick={logout}>SIGN OUT</GameButton>
    </Screen>
  );
}
