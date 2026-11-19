import type { ReactNode } from 'react';
import type { CommissionLog, LoadLog, Withdrawal } from '../../Pages/AdminPanel/types';
import { I, StatusPill, fmt, when } from './kit';

/** Shared row pieces for the Load, Commission and Withdrawal tables and their detail dialogs. */

export function TxLabel({ direction, text }: { direction: string; text: string }) {
  const icon =
    direction === 'withdraw' ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white"><I.minus className="h-5 w-5" /></span>
    ) : direction === 'commission' ? (
      <span className="text-[#ca8a04] dark:text-[#f5c542]"><I.coins className="h-6 w-6" /></span>
    ) : direction === 'request' ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white"><I.clock className="h-4 w-4" /></span>
    ) : (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white"><I.plus className="h-5 w-5" /></span>
    );
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold">
      {icon}
      {text}
    </span>
  );
}

export function Signed({ value }: { value: string }) {
  const n = Number(value);
  return <span className={`whitespace-nowrap font-black ${n < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{n < 0 ? '- ' : '+ '}{fmt(Math.abs(n))}</span>;
}

export function Eye({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="View details" title="View details" className="inline-flex h-9 w-11 items-center justify-center rounded-xl border border-[#e3dcf5] bg-white text-[#3b3354] hover:bg-[#f3eeff] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85 dark:hover:bg-white/10">
      <I.eye className="h-5 w-5" />
    </button>
  );
}

export function loadRows(r: LoadLog): Array<[string, ReactNode]> {
  return [
    ['Transaction ID', r.reference],
    ['Date & Time', when(r.created_at)],
    ['Transaction', r.transaction],
    ['Status', <StatusPill key="s" status={r.status} />],
    ['Sender', r.sender ? `${r.sender.username} (${r.sender.account_type_label})` : 'Platform issuance'],
    ['Recipient / Account', r.account ? `${r.account.username} (${r.account_type_label})` : '—'],
    ['Chips', fmt(r.signed_amount, 2)],
    ['Administrator responsible', r.processed_by?.username ?? '—'],
    ['Ledger reference', r.ledger_reference ?? '—'],
    ['Processed', when(r.processed_at)],
    ['Note', r.note ?? '—'],
  ];
}

export function commissionRows(r: CommissionLog): Array<[string, ReactNode]> {
  return [
    ['Commission ID', r.reference],
    ['Date & Time', when(r.created_at)],
    ['Recipient', `${r.recipient?.username ?? '—'} (${r.account_type_label ?? '—'})`],
    ['Source', `${r.source.player?.username ?? '—'} · Game #${r.source.game_session_id}`],
    ['Kind', r.source.kind === 'override' ? 'Upline override' : 'Direct sponsor'],
    ['Platform fee basis', `${fmt(r.fee_basis, 2)} Chips`],
    ['Rate', `${r.rate}%`],
    ['Commission', `${fmt(r.amount, 2)} Chips`],
    ['Status', <StatusPill key="s" status={r.status} />],
  ];
}

export function withdrawalRows(r: Withdrawal): Array<[string, ReactNode]> {
  return [
    ['Withdrawal ID', r.reference],
    ['Requested', when(r.created_at)],
    ['Agent', `${r.agent?.username ?? '—'} (${r.account_type_label ?? '—'})`],
    ['Amount', `${fmt(r.amount, 2)} Chips`],
    ['Status', <StatusPill key="s" status={r.status} />],
    ['Reviewed by', r.reviewed_by?.username ?? '—'],
    ['Reviewed', when(r.reviewed_at)],
    ['Note', r.note ?? '—'],
  ];
}
