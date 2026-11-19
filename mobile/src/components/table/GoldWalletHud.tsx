'use client';

import { useEffect, useRef, useState } from 'react';
import { Coin } from '@/components/game';
import { GoldCoins } from '@/components/HomeArt';
import type { GoldWallet } from '@/lib/gold';

const fmt = (n: number) => n.toLocaleString('en-US');
const whole = (v: string | undefined) => (v === undefined ? undefined : Math.floor(Number(v)));

/** Briefly flashes (up green / down red) when a value changes, without moving anything around it. */
function useFlash(value: number | undefined): 'up' | 'down' | null {
  const last = useRef(value);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (value === undefined || last.current === undefined || value === last.current) {
      last.current = value;
      return undefined;
    }
    setFlash(value > last.current ? 'up' : 'down');
    last.current = value;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [value]);
  return flash;
}

/**
 * Single Player wallet card: Total Amount (your Gold, including what is
 * reserved for the round in play) and your Gold Points. The numbers come
 * from the server (useGoldWallet) and are only displayed here. Fixed size, so
 * an update never shifts the cards or buttons around it.
 */
export default function GoldWalletHud({ wallet, className = '' }: { wallet: GoldWallet | null; className?: string }) {
  const total = whole(wallet?.total ?? wallet?.gold);
  const reserved = whole(wallet?.reserved) ?? 0;
  const points = whole(wallet?.gold_points);
  const totalFlash = useFlash(total);
  const pointsFlash = useFlash(points);
  const tone = (f: 'up' | 'down' | null) => (f === 'up' ? 'text-[#7dff8a]' : f === 'down' ? 'text-[#ff9a9a]' : 'text-white');

  return (
    <div className={`lx-gold w-[330px] rounded-[26px] p-[4px] shadow-[0_6px_0_#7a3e00] ${className}`} role="group" aria-label="Gold wallet">
      <div className="flex flex-col gap-[3px] rounded-[22px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-3 py-[6px]">
        <div className="flex h-[44px] items-center gap-2">
          <span className="-ml-1 shrink-0">
            <GoldCoins size={46} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[15px] font-black uppercase tracking-wide text-[#ffe14d]">Total Amount</span>
            {reserved > 0 && <span className="font-display text-[13px] font-bold text-white/60">{fmt(reserved)} in play</span>}
          </span>
          <span className={`ml-auto font-display text-[30px] font-black tabular-nums transition-colors drop-shadow-[0_2px_0_rgb(0_0_0/0.5)] ${tone(totalFlash)}`} aria-label="Total Amount">
            {total !== undefined ? fmt(total) : '…'}
          </span>
        </div>
        <div className="h-px bg-[#ffc531]/40" />
        <div className="flex h-[36px] items-center gap-2">
          <span className="ml-[6px] shrink-0">
            <Coin currency="GP" size={32} />
          </span>
          <span className="font-display text-[15px] font-black uppercase tracking-wide text-[#f5b6ff]">Gold Points</span>
          <span className={`ml-auto font-display text-[24px] font-black tabular-nums transition-colors ${tone(pointsFlash)}`} aria-label="Gold Points">
            {points !== undefined ? fmt(points) : '…'}
          </span>
        </div>
      </div>
    </div>
  );
}
