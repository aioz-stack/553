import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, newIdempotencyKey } from '../../lib/api';
import { usePanelRefresh } from '../../lib/panel';
import { useApi } from '../../lib/useApi';
import { Btn, Dialog, Figure, I, Panel, Toast, fieldClass, fmt } from './kit';

interface CommissionWallet {
  balance: string;
  available: string;
  pending: string;
  converted: string;
  min_conversion: number;
}

interface TeamOverview {
  total_player_wallets: string;
  total_agent_wallets: string;
  players: number;
  agents: number;
  scope: 'platform' | 'downline';
}

/**
 * "Convert Commission to Wallet" and "Team Overview" for Administrators, Agents, Master
 * Agents and Silver Agents. Every figure comes from the server; the server also enforces
 * the 10-Chip minimum, the available limit and one conversion per request id.
 */
export default function TeamSections({ onChanged, txLocked = false }: { onChanged?: () => void; /** maintenance: conversion closed */ txLocked?: boolean }) {
  const wallet = useApi<{ data: CommissionWallet }>('/commission/wallet');
  const team = useApi<{ data: TeamOverview }>('/team/overview');
  usePanelRefresh(wallet.reload, team.reload);
  const c = wallet.data?.data;
  const t = team.data?.data;
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const min = c?.min_conversion ?? 10;

  return (
    <>
      <Panel
        title="Convert Commission to Wallet"
        icon={<I.percent className="h-6 w-6" />}
        actions={
          <Btn variant="success" disabled={txLocked || !c || Number(c.available) < min} title={txLocked ? 'Unavailable during maintenance' : undefined} onClick={() => setOpen(true)}>
            <I.arrowRight className="h-4 w-4" /> Convert to Wallet
          </Btn>
        }
      >
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Figure label="Total accumulated commission" value={c ? fmt(c.balance, 2) : '…'} tone="good" hint="Chips" />
          <Figure label="Available to convert" value={c ? fmt(c.available, 2) : '…'} hint={c && Number(c.pending) > 0 ? `${fmt(c.pending, 2)} reserved by pending withdrawals` : `Minimum conversion: ${min} Chips`} />
        </div>
      </Panel>

      <Panel title="Team Overview" icon={<I.users className="h-6 w-6" />} actions={t && <span className="text-sm text-[#6b6385] dark:text-white/55">{t.scope === 'platform' ? 'Whole platform' : `${fmt(t.agents)} agents · ${fmt(t.players)} players in your downline`}</span>}>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <Figure label="Total Player Wallets" value={t ? fmt(t.total_player_wallets, 2) : '…'} tone="gold" hint={t?.scope === 'platform' ? 'Chips held by every player' : 'Chips held by every player in your downline, at every level'} />
          <Figure label="Total Agent Wallets" value={t ? fmt(t.total_agent_wallets, 2) : '…'} tone="gold" hint={t?.scope === 'platform' ? 'Chips held by every agent' : 'Chips held by every agent in your downline, at every level'} />
        </div>
      </Panel>

      <ConvertDialog
        open={open}
        wallet={c}
        onClose={() => setOpen(false)}
        onDone={(message) => {
          setOpen(false);
          setToast({ ok: true, text: message });
          wallet.reload();
          team.reload();
          onChanged?.();
        }}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </>
  );
}

function ConvertDialog({ open, wallet, onClose, onDone }: { open: boolean; wallet: CommissionWallet | undefined; onClose: () => void; onDone: (message: string) => void }) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One request id per opened dialog: a double click or retry converts once.
  const requestId = useRef(newIdempotencyKey());

  useEffect(() => {
    if (open) {
      setAmount('');
      setError(null);
      requestId.current = newIdempotencyKey();
    }
  }, [open]);

  const min = wallet?.min_conversion ?? 10;
  const available = Number(wallet?.available ?? 0);
  const n = Number(amount);
  const wellFormed = /^\d{1,13}(\.\d{1,2})?$/.test(amount);
  const problem = !amount ? null : !wellFormed ? 'Enter a valid amount (up to 2 decimals).' : n < min ? `The minimum conversion is ${min} Chips.` : n > available ? 'That is more than your available commission.' : null;
  const valid = wellFormed && n >= min && n <= available;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>('/commission/convert', { amount, request_id: requestId.current });
      onDone(r.data.message);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} title="Convert Commission to Wallet" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-[#f6f3fd] p-3 dark:bg-white/[0.04]">
            <dt className="text-[#6b6385] dark:text-white/55">Commission Amount</dt>
            <dd className="text-lg font-black text-[#1c1530] dark:text-white">{fmt(available, 2)} Chips</dd>
          </div>
          <div className="rounded-xl bg-[#f6f3fd] p-3 dark:bg-white/[0.04]">
            <dt className="text-[#6b6385] dark:text-white/55">Minimum Conversion</dt>
            <dd className="text-lg font-black text-[#1c1530] dark:text-white">{min} Chips</dd>
          </div>
        </dl>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">Amount to Convert</span>
          <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} className={fieldClass} placeholder={`${min}`} aria-label="Amount to Convert" />
        </label>
        {(problem || error) && (
          <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">
            {problem ?? error}
          </p>
        )}
        <p className="text-xs text-[#857d9c] dark:text-white/45">The Chips are added to your own Chips wallet right away and the amount is deducted from your commission.</p>
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" variant="success" disabled={!valid || busy}>
            {busy ? 'Converting…' : 'Confirm Conversion'}
          </Btn>
        </div>
      </form>
    </Dialog>
  );
}
