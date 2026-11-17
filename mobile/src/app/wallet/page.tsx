'use client';

import Link from 'next/link';
import { Notice, Panel, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, useFetch } from '@/lib/hooks';
import type { Wallet } from '@/lib/types';

export default function WalletScreen() {
  const { user } = useAuth();
  const { data } = useFetch<{ data: Wallet[] }>(user ? '/wallet' : null);
  const wallets = data?.data.filter((w) => w.type === 'player') ?? [];

  return (
    <Screen title="Wallet">
      <Notice tone="info">CP and VC are separate and never combined. VC is free-play only — not withdrawable or redeemable. Cash features are disabled.</Notice>
      {wallets.map((w) => (
        <div key={w.id} className={`mb-3 rounded-2xl p-5 text-white ${w.currency === 'VC' ? 'bg-gradient-to-br from-brand-500 to-brand-900' : 'bg-gradient-to-br from-gray-700 to-gray-900'}`}>
          <p className="text-sm text-white/70">{w.currency === 'VC' ? 'Virtual Coins' : 'Cash Points'}</p>
          <p className="text-3xl font-bold">{points(w.balance)}</p>
          <p className="text-xs text-white/60">{w.currency}{w.is_frozen ? ' · frozen' : ''}</p>
        </div>
      ))}
      <Panel>
        <Link href="/transactions/" className="block text-center font-medium text-brand-500">View transaction history</Link>
      </Panel>
    </Screen>
  );
}
