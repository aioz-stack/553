'use client';

import { useEffect, useRef, useState } from 'react';
import { GoldCoins } from '@/components/HomeArt';
import type { GoldWallet } from '@/lib/gold';

const fmt = (n: number) => n.toLocaleString('en-US');
const whole = (v: string | undefined) => (v === undefined ? undefined : Math.floor(Number(v)));

/** Briefly flashes (up green / down red) when the value changes, without moving anything around it. */
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
 * Single Player wallet card: your Gold Total Amount (including what is reserved
 * for the round in play). The number comes from the server (useGoldWallet) and is
 * only displayed here. Fixed size, so an update never shifts the cards or buttons
 * around it. Gold only: Chips never appear in Single Player.
 */
export default function GoldWalletHud({ wallet, className = '' }: { wallet: GoldWallet | null; className?: string }) {
  const total = whole(wallet?.total ?? wallet?.gold);
  const reserved = whole(wallet?.reserved) ?? 0;
  const flash = useFlash(total);
  const tone = flash === 'up' ? 'text-[#7dff8a]' : flash === 'down' ? 'text-[#ff9a9a]' : 'text-white';

  return (
    <div className={`lx-gold w-[330px] rounded-[26px] p-[4px] shadow-[0_6px_0_#7a3e00] ${className}`} role="group" aria-label="Gold wallet">
      <div className="flex h-[68px] items-center gap-2 rounded-[22px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-3">
        <span className="-ml-1 shrink-0">
          <GoldCoins size={52} />
        </span>
        <span className="flex flex-col leading-none">
          <span className="font-display text-[16px] font-black uppercase tracking-wide text-[#ffe14d]">Total Gold</span>
          {reserved > 0 && <span className="mt-1 font-display text-[14px] font-bold text-white/60">{fmt(reserved)} in play</span>}
        </span>
        <span className={`ml-auto font-display text-[34px] font-black tabular-nums transition-colors drop-shadow-[0_2px_0_rgb(0_0_0/0.5)] ${tone}`} aria-label="Total Amount">
          {total !== undefined ? fmt(total) : '…'}
        </span>
      </div>
    </div>
  );
}
