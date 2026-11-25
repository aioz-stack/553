'use client';

import { fmtChips, keysLabel, requiredChips } from '@/lib/lobby';
import { ChipMark } from './LobbyUI';

/** The tier's three bets as big tappable chips; the selected one is highlighted. */
export function BetPicker({ bets, value, onChange, disabled }: { bets: number[]; value: number; onChange: (bet: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Your bet" className="flex flex-wrap gap-4">
      {bets.map((b) => {
        const on = b === value;
        return (
          <button
            key={b}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(b)}
            className={`flex h-[64px] min-w-[150px] items-center justify-center gap-3 rounded-full border-[3px] px-6 font-display text-[28px] font-black transition disabled:opacity-50 ${
              on ? 'border-[#ffe14d] bg-gradient-to-b from-[#ffcf3a] to-[#e08a00] text-[#3b1d00] shadow-[0_0_18px_rgb(255_210_60/0.55)]' : 'border-[#d9a441]/70 bg-[#1d0306] text-white/90'
            }`}
          >
            <ChipMark size={30} />
            {fmtChips(b)}
          </button>
        );
      })}
    </div>
  );
}

/**
 * What it takes to play: the tier's Minimum Entry, the selected bet and the Chips it needs (2×),
 * the Keys fee and when it is deducted, against your own Chips and Keys. Display only — the server
 * checks everything again.
 */
export function EntryTerms({ minEntry, bet, keyFee, chips, keys, charged }: { minEntry: number; bet: number; keyFee: number; chips?: number; keys?: number; charged?: boolean }) {
  const need = requiredChips(minEntry, bet);
  const chipsOk = chips === undefined || chips >= need;
  const keysOk = keys === undefined || keys >= keyFee;
  const row = (label: string, value: string, ok = true) => (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-[21px] font-bold text-white/70">{label}</span>
      <span className={`font-display text-[24px] font-black ${ok ? 'text-[#ffe9b0]' : 'text-[#ff9aa8]'}`}>{value}</span>
    </div>
  );

  return (
    <div aria-label="Entry requirements" className="rounded-[22px] border-[3px] border-[#d9a441]/60 bg-[#1d0306]/80 px-6 py-3">
      {row('Minimum Entry', `${fmtChips(minEntry)} Chips`)}
      {row('Your Bet', `${fmtChips(bet)} Chips`)}
      {row('Required Wallet', `${fmtChips(need)} Chips${need > minEntry ? ' (2× bet)' : ''}`, chipsOk)}
      {chips !== undefined && row('Your Chips', fmtChips(Math.floor(chips)), chipsOk)}
      {keyFee > 0 && row('Key Entry Fee', keysLabel(keyFee), keysOk)}
      {keys !== undefined && keyFee > 0 && row('Your Keys', fmtChips(keys), keysOk)}
      {keyFee > 0 && (
        <p className="mt-1 text-center text-[19px] font-bold text-white/60">
          {charged ? `${keysLabel(keyFee)} were deducted when the game started.` : `${keysLabel(keyFee)} will be deducted once, when the game starts — not when you join.`}
        </p>
      )}
    </div>
  );
}
