import { CardBackArt, CardFaceArt } from './CardArt';

const SUITS: Record<string, { symbol: string; red: boolean; name: string }> = {
  S: { symbol: '♠', red: false, name: 'spades' },
  H: { symbol: '♥', red: true, name: 'hearts' },
  D: { symbol: '♦', red: true, name: 'diamonds' },
  C: { symbol: '♣', red: false, name: 'clubs' },
};

const RANK_LABEL: Record<string, string> = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };

export const RANK_ORDER = '23456789TJQKA';

export function sortCards(cards: string[], by: 'rank' | 'suit' = 'rank'): string[] {
  return [...cards].sort((a, b) => {
    const rank = RANK_ORDER.indexOf(b[0]) - RANK_ORDER.indexOf(a[0]);
    const suit = 'SHDC'.indexOf(a[1]) - 'SHDC'.indexOf(b[1]);

    return by === 'rank' ? rank || suit : suit || rank;
  });
}

/**
 * A touch-friendly playing card in the PUSOY 553 design (Components/CardArt.tsx — the same art as the
 * mobile app): pearl face with gold filigree, serif corner index, pips / 553 Ace emblem / court
 * portraits; face-down cards show the red and gold 553 back.
 */
export default function PlayingCard({ code, selected, onClick, size = 'md', faceDown }: { code?: string; selected?: boolean; onClick?: () => void; size?: 'sm' | 'md'; faceDown?: boolean }) {
  const dims = size === 'sm' ? 'h-14 w-10' : 'h-20 w-14 sm:h-24 sm:w-[4.3rem]';

  if (faceDown || !code) {
    return (
      <div className={`${dims} relative shrink-0 overflow-hidden rounded-[9%/6.5%] bg-[#0b0b0d] shadow-theme-sm`} aria-hidden="true">
        <CardBackArt className="absolute inset-0 h-full w-full" />
      </div>
    );
  }

  const suit = SUITS[code[1]];
  const rank = RANK_LABEL[code[0]] ?? code[0];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${rank} of ${suit?.name}`}
      aria-pressed={selected}
      className={`${dims} relative shrink-0 select-none overflow-hidden rounded-[9%/6.5%] bg-white shadow-theme-sm transition ${
        selected ? '-translate-y-2 ring-3 ring-brand-500/60' : ''
      } ${onClick ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'}`}
    >
      <CardFaceArt code={code} className="pointer-events-none absolute inset-0 h-full w-full" />
    </button>
  );
}
