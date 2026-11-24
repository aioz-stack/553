'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Coin, GameButton, Ribbon } from '@/components/game';
import { IconList } from '@/components/icons';
import { Notice, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, useFetch } from '@/lib/hooks';
import type { Currency, Wallet } from '@/lib/types';
import { useGoldWallet } from '@/lib/useGoldWallet';

/** The game's three wallets: Gold (Single Player), Chips (Multiplayer) and Keys. */
const INFO: Record<Currency, { name: string; note: string; bg: string; order: number }> = {
  GD: { name: 'Gold', note: 'Single Player only · won and lost automatically', bg: 'from-gold-400 via-gold-600 to-night-800', order: 0 },
  CH: { name: 'Chips', note: 'Multiplayer only · rooms, lobbies and Banker Mode', bg: 'from-[#e0262f] via-[#8a0a10] to-night-800', order: 1 },
  KY: { name: 'Keys', note: 'Loaded by Pusoy553 · never cash, never exchanged', bg: 'from-[#9b3df0] via-[#4a0f9a] to-night-800', order: 2 },
};

export default function WalletScreen() {
  const { user } = useAuth();
  const { data, reload } = useFetch<{ data: Wallet[] }>(user ? '/wallet' : null);
  // Gold is shown as its Total Amount (spendable + in an open round): the same number as Home and Single Player.
  const { wallet: goldWallet } = useGoldWallet(user?.id);
  const reserved = goldWallet?.reserved ? Number(goldWallet.reserved) : 0;
  const wallets = (data?.data.filter((w) => w.type === 'player' && w.currency in INFO) ?? []).sort((a, b) => INFO[a.currency].order - INFO[b.currency].order);

  // Stay in sync with every other screen: reload after any wallet change.
  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener('pusoy:wallet', onChange);
    return () => window.removeEventListener('pusoy:wallet', onChange);
  }, [reload]);

  return (
    <Screen title="Your wallet">
      <Ribbon tone="gold" className="mb-3">Wallet</Ribbon>

      {wallets.map((w) => {
        const info = INFO[w.currency];
        return (
          <div key={w.id} className="gold-rim mb-4 rounded-[1.6rem] p-[3px] shadow-[0_10px_24px_rgb(0_0_0/0.45)]">
            <div className={`relative overflow-hidden rounded-[1.45rem] bg-gradient-to-br p-5 ${info.bg}`}>
              <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="flex items-center gap-4">
                <Coin currency={w.currency} size={64} className="animate-float" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-white/75">{info.name}</p>
                  <p className="font-display text-4xl font-black text-gold-200 drop-shadow-[0_2px_0_rgb(0_0_0/0.4)]" aria-label={`${info.name} balance`}>
                    {points(w.currency === 'GD' && goldWallet ? (goldWallet.total ?? goldWallet.gold) : w.balance)}
                  </p>
                  <p className="text-xs text-white/60">
                    {info.note}
                    {w.currency === 'GD' && reserved > 0 ? ` · ${points(reserved)} in play` : ''}
                    {w.is_frozen ? ' · frozen' : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <Notice tone="info">Gold and Chips are separate wallets: they are never combined, transferred or exchanged, and neither can be deposited, withdrawn or redeemed.</Notice>

      <Link href="/transactions/">
        <GameButton tone="purple" size="lg" className="flex w-full items-center justify-center gap-2">
          <IconList className="h-5 w-5" /> TRANSACTION HISTORY
        </GameButton>
      </Link>
    </Screen>
  );
}
