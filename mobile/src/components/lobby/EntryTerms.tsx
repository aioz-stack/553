'use client';

import { fmtChips, keysLabel } from '@/lib/lobby';

/**
 * What it takes to join a lobby: its Minimum Entry, the bets used in the game (chosen there, each
 * round), the Keys fee and when it is deducted — against your own Chips and Keys. Display only: the
 * server checks everything again.
 */
export function EntryTerms({ minEntry, bets, keyFee, chips, keys }: { minEntry: number; bets: number[]; keyFee: number; chips?: number; keys?: number }) {
  const chipsOk = chips === undefined || chips >= minEntry;
  const keysOk = keys === undefined || keys >= keyFee;
  const row = (label: string, value: string, ok = true) => (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-[21px] font-bold text-white/70">{label}</span>
      <span className={`font-display text-[24px] font-black ${ok ? 'text-[#ffe9b0]' : 'text-[#ff9aa8]'}`}>{value}</span>
    </div>
  );

  return (
    <div aria-label="Entry requirements" className="rounded-[22px] border-[3px] border-[#d9a441]/60 bg-[#1d0306]/80 px-6 py-3">
      {row('Minimum Entry', `${fmtChips(minEntry)} Chips`, chipsOk)}
      {row('In-game bets', `${bets.map(fmtChips).join(' / ')} Chips`)}
      {chips !== undefined && row('Your Chips', fmtChips(Math.floor(chips)), chipsOk)}
      {keyFee > 0 && row('Key Entry Fee', keysLabel(keyFee), keysOk)}
      {keys !== undefined && keyFee > 0 && row('Your Keys', fmtChips(keys), keysOk)}
      <p className="mt-1 text-center text-[18px] font-bold text-white/60">
        You choose your bet in the game, each round (hold 2× your bet).
        {keyFee > 0 && ` ${keysLabel(keyFee)} ${keyFee === 1 ? 'is' : 'are'} deducted once, when the game starts.`}
      </p>
    </div>
  );
}
