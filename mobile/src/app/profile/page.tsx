'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import AvatarPicker from '@/components/AvatarPicker';
import { Avatar, GameButton, GlassCard } from '@/components/game';
import { IconList, IconSettings, IconTrophy } from '@/components/icons';
import { Field, Notice, Screen } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch } from '@/lib/hooks';
import { useBalance } from '@/lib/useBalance';
import { useGoldWallet } from '@/lib/useGoldWallet';
import { Coin } from '@/components/game';

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
  const [picking, setPicking] = useState(false);
  const s = stats.data?.data;
  // Your two wallets (live): Gold for Single Player, Chips for Multiplayer.
  const { chips } = useBalance(user?.id);
  // Gold as every Single Player screen shows it: the Total Amount (including Gold in an open round).
  const { wallet: goldWallet } = useGoldWallet(user?.id);
  const gold = goldWallet ? (goldWallet.total ?? goldWallet.gold) : undefined;

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
      {picking && <AvatarPicker onClose={() => setPicking(false)} onSaved={() => setMessage({ tone: 'success', text: 'Avatar updated.' })} />}

      <div className="mb-4 flex flex-col items-center text-center">
        <Avatar name={user?.display_name ?? user?.name ?? '?'} size={96} active avatar={user?.avatar} userId={user?.id} />
        <GameButton tone="gold" size="sm" className="mt-2" onClick={() => setPicking(true)}>
          Change Avatar
        </GameButton>
        <h1 className="mt-2 font-display text-2xl font-black">{user?.display_name ?? user?.name}</h1>
        <p className="text-sm text-white/60">@{user?.username} · {user?.role_label}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {([['GD', 'Gold', 'Single Player', gold], ['CH', 'Chips', 'Multiplayer', chips]] as const).map(([c, label, mode, value]) => (
          <Link key={c} href="/wallet/" className="glass flex items-center gap-2 rounded-2xl px-3 py-2" aria-label={`${label} balance`}>
            <Coin currency={c} size={36} />
            <span className="min-w-0">
              <span className="block font-display text-lg font-black text-gold-200">{value !== undefined ? Math.floor(Number(value)).toLocaleString('en-US') : '…'}</span>
              <span className="block text-[10px] font-bold uppercase text-white/60">{label} · {mode}</span>
            </span>
          </Link>
        ))}
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
