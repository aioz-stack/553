'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { KeyIcon } from '@/components/game';
import { api, errorText } from '@/lib/api';
import { when } from '@/lib/hooks';
import { play } from '@/lib/sound';
import type { Transaction } from '@/lib/types';

/** Shared pop-up frame for the Main Lobby panels (portal, gold rim, close button). */
function Panel({ title, label, onClose, tone, children }: { title: ReactNode; label: string; onClose: () => void; tone: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/65 p-3" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()} className="sp-pop lx-gold flex max-h-[94vh] w-full max-w-[680px] flex-col rounded-[28px] p-[6px] shadow-[0_10px_0_#5a2a00,0_18px_40px_rgb(0_0_0/0.5)]">
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[23px] bg-gradient-to-b text-white ${tone}`}>
          <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
            <h2 className="flex items-center gap-2 font-display text-[clamp(22px,3.4vw,32px)] font-black text-[#ffd34d] drop-shadow-[0_2px_0_#3a1300]">{title}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => {
                play('tap');
                onClose();
              }}
              className="lx-tile flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-[#ffd34d] bg-gradient-to-b from-[#ff6b5c] to-[#c0101a] text-xl font-black text-white shadow-[0_4px_0_#6b0606]"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Keys (+): your Keys balance, how Keys are given (only the Pusoy553 team loads them, audited on
 * the server — there is no purchase and no cash), and your latest Keys history from the ledger.
 */
export function GetKeysPanel({ keys, agentName, onClose, onWallet }: { keys?: number; agentName?: string | null; onClose: () => void; onWallet: () => void }) {
  const [history, setHistory] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<{ data: Transaction[] }>('/wallet/transactions', { query: { currency: 'KY', per_page: 5 } })
      .then((r) => live && setHistory(r.data))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, []);

  return (
    <Panel
      label="Get Keys"
      onClose={onClose}
      tone="from-[#5a1aa8] via-[#3a0b7a] to-[#1a0440]"
      title={
        <>
          <KeyIcon size={40} /> Get Keys
        </>
      }
    >
      <div className="flex items-center justify-between rounded-[18px] bg-black/30 px-4 py-3">
        <span className="font-display text-[18px] font-black uppercase tracking-wide text-[#e2c4ff]">Your Keys</span>
        <span className="font-display text-[34px] font-black tabular-nums" aria-label="Keys balance">
          {keys !== undefined ? keys.toLocaleString('en-US') : '…'}
        </span>
      </div>
      <p className="mt-3 text-[15px] leading-snug text-white/85">
        Keys are loaded onto your account by the Pusoy553 team. Every Key added or removed is recorded in your wallet history. Keys can&apos;t be bought with cash, cashed out or exchanged for Gold or Chips.
      </p>
      <p className="mt-2 text-[15px] font-bold text-[#ffe14d]">{agentName ? `To get Keys, contact your agent ${agentName}.` : 'To get Keys, contact your agent or the Pusoy553 team.'}</p>

      <h3 className="mt-4 font-display text-[16px] font-black uppercase tracking-wide text-white/70">Latest Keys activity</h3>
      {error && (
        <p role="alert" className="mt-1 rounded-full bg-[#3a0d14] px-4 py-1.5 text-[14px] font-bold text-[#ffb3bd]">
          {error}
        </p>
      )}
      {!history && !error && <p className="mt-1 text-[14px] text-white/60">Loading…</p>}
      {history?.length === 0 && <p className="mt-1 text-[14px] text-white/60">No Keys activity yet.</p>}
      <ul className="mt-1 space-y-1" aria-label="Keys history">
        {history?.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-1.5 text-[14px]">
            <span className="min-w-0 truncate">
              {t.reason ?? t.type.replace(/_/g, ' ').toLowerCase()} <span className="text-white/50">· {when(t.created_at)}</span>
            </span>
            <span className={`font-display font-black tabular-nums ${t.direction === 'out' ? 'text-[#ff9aa8]' : 'text-[#7dffa0]'}`}>
              {t.direction === 'out' ? '−' : '+'}
              {Number(t.amount).toLocaleString('en-US')}
            </span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onWallet}
        className="lx-tile mt-4 h-12 w-full rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] to-[#e08a00] font-display text-[20px] font-black text-[#4a1d00] shadow-[0_5px_0_#8a4a00]"
      >
        Open wallet history
      </button>
    </Panel>
  );
}

/** Shop: not open yet — says so plainly (nothing can be bought). */
export function ShopPanel({ onClose }: { onClose: () => void }) {
  return (
    <Panel label="Shop" onClose={onClose} tone="from-[#1d8a4a] via-[#0f5a2e] to-[#052a14]" title="Shop">
      <div className="py-6 text-center">
        <p className="text-[56px]" aria-hidden="true">
          🛍️
        </p>
        <p className="font-display text-[28px] font-black text-[#ffe14d]">Coming soon!</p>
        <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-snug text-white/85">The Pusoy553 Shop is being prepared. Nothing can be bought yet, and nothing is charged to your Gold, Chips or Keys.</p>
        <button
          type="button"
          onClick={() => {
            play('tap');
            onClose();
          }}
          className="lx-tile mt-5 h-12 min-w-[180px] rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffe46a] to-[#e08a00] px-6 font-display text-[20px] font-black text-[#4a1d00] shadow-[0_5px_0_#8a4a00]"
        >
          OK
        </button>
      </div>
    </Panel>
  );
}
