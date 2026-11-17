'use client';

import Link from 'next/link';
import { Coin, GameButton, Ribbon } from '@/components/game';
import { IconList } from '@/components/icons';
import { Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, useFetch } from '@/lib/hooks';
import type { Wallet } from '@/lib/types';

export default function WalletScreen() {
  const { user } = useAuth();
  const { data } = useFetch<{ data: Wallet[] }>(user ? '/wallet' : null);
  const wallets = (data?.data.filter((w) => w.type === 'player') ?? []).sort((a, b) => Number(b.currency === 'VC') - Number(a.currency === 'VC'));

  return (
    <Screen title="Your wallet">
      <Ribbon tone="gold" className="mb-3">Wallet</Ribbon>

      {wallets.map((w) => (
        <div key={w.id} className="gold-rim mb-4 rounded-[1.6rem] p-[3px] shadow-[0_10px_24px_rgb(0_0_0/0.45)]">
          <div className={`relative overflow-hidden rounded-[1.45rem] p-5 ${w.currency === 'VC' ? 'bg-gradient-to-br from-felt-400 via-felt-600 to-night-800' : 'bg-gradient-to-br from-slate-500 via-slate-700 to-slate-900'}`}>
            <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="flex items-center gap-4">
              <Coin currency={w.currency} size={64} className="animate-float" />
              <div>
                <p className="font-display text-sm font-bold text-white/75">{w.currency === 'VC' ? 'Virtual Coins' : 'Cash Points'}</p>
                <p className="font-display text-4xl font-black text-gold-200 drop-shadow-[0_2px_0_rgb(0_0_0/0.4)]">{points(w.balance)}</p>
                <p className="text-xs text-white/60">{w.currency === 'VC' ? 'Free-play · not redeemable' : 'Accounting points · cash features disabled'}{w.is_frozen ? ' · frozen' : ''}</p>
              </div>
            </div>
          </div>
        </div>
      ))}

      <Notice tone="info">CP and VC are separate and never combined. VC can never be withdrawn, redeemed or converted to CP.</Notice>

      <Link href="/transactions/">
        <GameButton tone="purple" size="lg" className="flex w-full items-center justify-center gap-2">
          <IconList className="h-5 w-5" /> TRANSACTION HISTORY
        </GameButton>
      </Link>
    </Screen>
  );
}
