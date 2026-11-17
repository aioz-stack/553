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
 * A touch-friendly playing card rendered with CSS (no image assets).
 */
export default function PlayingCard({ code, selected, onClick, size = 'md', faceDown }: { code?: string; selected?: boolean; onClick?: () => void; size?: 'sm' | 'md'; faceDown?: boolean }) {
  const dims = size === 'sm' ? 'h-14 w-10 text-xs' : 'h-20 w-14 text-sm sm:h-24 sm:w-16';

  if (faceDown || !code) {
    return <div className={`${dims} shrink-0 rounded-lg border-2 border-white/60 bg-gradient-to-br from-brand-600 to-brand-900 shadow-theme-sm`} />;
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
      className={`${dims} relative flex shrink-0 select-none flex-col justify-between rounded-lg border bg-white p-1 font-semibold shadow-theme-sm transition ${
        suit?.red ? 'text-error-600' : 'text-gray-900'
      } ${selected ? '-translate-y-2 border-brand-500 ring-3 ring-brand-500/40' : 'border-gray-300'} ${onClick ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default'}`}
    >
      <span className="leading-none">{rank}</span>
      <span className="self-center text-xl leading-none sm:text-2xl">{suit?.symbol}</span>
      <span className="self-end rotate-180 leading-none">{rank}</span>
    </button>
  );
}
