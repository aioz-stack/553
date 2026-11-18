'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Coin, GameButton, Ribbon } from '@/components/game';
import { IconList } from '@/components/icons';
import { Notice, Screen } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { convertGoldPoints, walletChanged } from '@/lib/gold';
import { points, useFetch } from '@/lib/hooks';
import type { Currency, Wallet } from '@/lib/types';

/** Each wallet's name, note and colours. Gold / Gold Points are Single Player; VC is Multiplayer; CP is cash (disabled). */
const INFO: Record<Currency, { name: string; note: string; bg: string; order: number }> = {
  GD: { name: 'Gold', note: 'Single Player · won and lost automatically · free-play, not redeemable', bg: 'from-gold-400 via-gold-600 to-night-800', order: 0 },
  GP: { name: 'Gold Points', note: 'Free reward · converts 1:1 into Gold · not redeemable', bg: 'from-fuchsia-500 via-purple-700 to-night-800', order: 1 },
  VC: { name: 'Virtual Coins', note: 'Free-play · not redeemable', bg: 'from-felt-400 via-felt-600 to-night-800', order: 2 },
  CP: { name: 'Cash Points', note: 'Accounting points · cash features disabled', bg: 'from-slate-500 via-slate-700 to-slate-900', order: 3 },
};

export default function WalletScreen() {
  const { user } = useAuth();
  const { data, reload } = useFetch<{ data: Wallet[] }>(user ? '/wallet' : null);
  const wallets = (data?.data.filter((w) => w.type === 'player') ?? []).sort((a, b) => (INFO[a.currency]?.order ?? 9) - (INFO[b.currency]?.order ?? 9));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const convert = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await convertGoldPoints();
      setMessage({ tone: 'success', text: r.message });
      reload();
      walletChanged();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Your wallet">
      <Ribbon tone="gold" className="mb-3">Wallet</Ribbon>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {wallets.map((w) => {
        const info = INFO[w.currency] ?? INFO.VC;
        return (
          <div key={w.id} className="gold-rim mb-4 rounded-[1.6rem] p-[3px] shadow-[0_10px_24px_rgb(0_0_0/0.45)]">
            <div className={`relative overflow-hidden rounded-[1.45rem] bg-gradient-to-br p-5 ${info.bg}`}>
              <div className="pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="flex items-center gap-4">
                <Coin currency={w.currency} size={64} className="animate-float" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-white/75">{info.name}</p>
                  <p className="font-display text-4xl font-black text-gold-200 drop-shadow-[0_2px_0_rgb(0_0_0/0.4)]">{points(w.balance)}</p>
                  <p className="text-xs text-white/60">
                    {info.note}
                    {w.is_frozen ? ' · frozen' : ''}
                  </p>
                </div>
              </div>
              {w.currency === 'GP' && Number(w.balance) > 0 && (
                <GameButton tone="green" size="sm" className="mt-3 w-full" onClick={convert} disabled={busy}>
                  {busy ? 'CONVERTING…' : 'CONVERT ALL TO GOLD (1:1)'}
                </GameButton>
              )}
            </div>
          </div>
        );
      })}

      <Notice tone="info">Every wallet is separate and never combined. Gold, Gold Points and VC can never be withdrawn, redeemed or converted to CP; Gold Points only convert into Gold.</Notice>

      <Link href="/transactions/">
        <GameButton tone="purple" size="lg" className="flex w-full items-center justify-center gap-2">
          <IconList className="h-5 w-5" /> TRANSACTION HISTORY
        </GameButton>
      </Link>
    </Screen>
  );
}
