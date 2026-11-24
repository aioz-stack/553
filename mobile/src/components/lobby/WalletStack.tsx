'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GoldCoins } from '@/components/HomeArt';
import { ChipIcon, KeyIcon } from '@/components/game';
import { RimGlint } from '@/components/Sparkles';
import { play } from '@/lib/sound';

/**
 * Main Lobby wallets, stacked in the upper-right corner: Gold, Chips, Keys (in that order).
 * Every number is the player's server balance (passed in by the page, which keeps it live);
 * nothing here changes a balance. Each card has a fixed width with room for 7 digits
 * (9,999,999) in tabular figures, so the layout never shifts as balances change.
 */
export type WalletKind = 'gold' | 'chips' | 'keys';

const THEME: Record<WalletKind, { label: string; frame: string; body: string; text: string }> = {
  gold: { label: 'Gold', frame: 'from-[#fff3a0] via-[#ffc531] to-[#c27a04]', body: 'from-[#6b4300] to-[#2a1800]', text: 'text-[#ffe14d]' },
  chips: { label: 'Chips', frame: 'from-[#ffb3b3] via-[#ff4a4a] to-[#8a0a10]', body: 'from-[#7a0a12] to-[#2e0306]', text: 'text-[#ffb3bd]' },
  keys: { label: 'Keys', frame: 'from-[#e9c8ff] via-[#a24dff] to-[#3a0b7a]', body: 'from-[#3a0b7a] to-[#160330]', text: 'text-[#e2c4ff]' },
};

const fmt = (n: number) => n.toLocaleString('en-US');

/** Briefly flashes green (up) or red (down) when the balance changes, without moving anything. */
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

function WalletCard({ kind, value, icon, onOpen, onPlus, delay }: { kind: WalletKind; value: number | undefined; icon: ReactNode; onOpen: () => void; onPlus?: () => void; delay: number }) {
  const t = THEME[kind];
  const flash = useFlash(value);
  const text = value !== undefined ? fmt(value) : '…';
  return (
    // Every bar is the same width; the (+) sits inside the Keys bar at its far right.
    <div className={`relative flex h-[64px] w-[356px] items-center rounded-full bg-gradient-to-b ${t.frame} p-[4px] shadow-[0_6px_0_rgb(0_0_0/0.35)]`}>
      <div className={`lx-gloss relative flex h-full min-w-0 flex-1 items-center rounded-full bg-gradient-to-b ${t.body} shadow-[inset_0_-6px_12px_rgb(0_0_0/0.4)]`}>
      <button
        type="button"
        onClick={() => {
          play('tap');
          onOpen();
        }}
        aria-label={`${t.label} wallet: ${text}`}
        className={`lx-tile relative flex h-full min-w-0 flex-1 items-center gap-2 rounded-full pl-1 text-left ${onPlus ? 'pr-2' : 'pr-3'}`}
      >
        <RimGlint width={3} delay={delay} />
        <span className="relative z-[4] shrink-0">{icon}</span>
        <span className={`relative z-[4] w-[54px] shrink-0 font-display text-[14px] font-black uppercase tracking-wide ${t.text}`}>{t.label}</span>
        {/* 7 digits + commas fit at this size in tabular figures; the box never grows or shrinks. */}
        <span
          className={`relative z-[4] ml-auto min-w-0 truncate text-right font-display text-[27px] font-black tabular-nums drop-shadow-[0_2px_0_rgb(0_0_0/0.5)] transition-colors ${flash === 'up' ? 'text-[#7dff8a]' : flash === 'down' ? 'text-[#ff9a9a]' : 'text-white'}`}
          aria-label={`${t.label} balance`}
        >
          {text}
        </span>
      </button>
      {onPlus && (
        <button
          type="button"
          onClick={() => {
            play('tap');
            onPlus();
          }}
          aria-label={`Get ${t.label}`}
          className="lx-tile relative z-[4] mr-[4px] flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-[3px] border-[#c8ffd8] bg-gradient-to-b from-[#5ef08a] to-[#13a344] font-display text-[30px] font-black leading-none text-white shadow-[0_3px_0_#0b6b2a,inset_0_3px_0_rgb(255_255_255/0.5)]"
        >
          +
        </button>
      )}
      </div>
    </div>
  );
}

export default function WalletStack({ gold, chips, keys, onOpen, onGetKeys, className = '' }: { gold?: number; chips?: number; keys?: number; onOpen: (kind: WalletKind) => void; onGetKeys: () => void; className?: string }) {
  return (
    <div className={`flex flex-col items-end gap-[12px] ${className}`} role="group" aria-label="Wallets">
      <WalletCard kind="gold" value={gold} icon={<GoldCoins size={48} />} onOpen={() => onOpen('gold')} delay={0.6} />
      <WalletCard kind="chips" value={chips} icon={<ChipIcon size={46} />} onOpen={() => onOpen('chips')} delay={1.4} />
      <WalletCard kind="keys" value={keys} icon={<KeyIcon size={46} />} onOpen={() => onOpen('keys')} onPlus={onGetKeys} delay={2.2} />
    </div>
  );
}
