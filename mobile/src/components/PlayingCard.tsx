const SUITS: Record<string, { s: string; red: boolean }> = {
  S: { s: '♠', red: false },
  H: { s: '♥', red: true },
  D: { s: '♦', red: true },
  C: { s: '♣', red: false },
};

export const RANKS = '23456789TJQKA';

export function sortCards(cards: string[], by: 'rank' | 'suit' = 'rank'): string[] {
  return [...cards].sort((a, b) => {
    const r = RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]);
    const s = 'SHDC'.indexOf(a[1]) - 'SHDC'.indexOf(b[1]);
    return by === 'rank' ? r || s : s || r;
  });
}

/**
 * Touch-friendly card sized for small Android screens (min 44px tap target).
 */
export default function PlayingCard({ code, selected, onClick, small, faceDown }: { code?: string; selected?: boolean; onClick?: () => void; small?: boolean; faceDown?: boolean }) {
  const size = small ? 'h-12 w-9 text-[11px]' : 'h-[4.25rem] w-[2.9rem] text-sm';

  if (faceDown || !code) {
    return <div className={`${size} shrink-0 rounded-md border-2 border-white/50 bg-gradient-to-br from-brand-500 to-brand-900`} />;
  }

  const suit = SUITS[code[1]];
  const rank = code[0] === 'T' ? '10' : code[0];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-pressed={selected}
      className={`${size} relative flex shrink-0 select-none flex-col items-center justify-center rounded-md border bg-white font-bold shadow-sm transition ${
        suit.red ? 'text-red-600' : 'text-gray-900'
      } ${selected ? '-translate-y-1.5 border-brand-500 ring-2 ring-brand-400' : 'border-gray-300'}`}
    >
      <span className="leading-none">{rank}</span>
      <span className="text-lg leading-none">{suit.s}</span>
    </button>
  );
}
