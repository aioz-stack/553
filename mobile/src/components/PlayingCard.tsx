const SUITS: Record<string, { s: string; red: boolean; name: string }> = {
  S: { s: '♠', red: false, name: 'spades' },
  H: { s: '♥', red: true, name: 'hearts' },
  D: { s: '♦', red: true, name: 'diamonds' },
  C: { s: '♣', red: false, name: 'clubs' },
};

export const RANKS = '23456789TJQKA';

export function sortCards(cards: string[], by: 'rank' | 'suit' = 'rank'): string[] {
  return [...cards].sort((a, b) => {
    const r = RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]);
    const s = 'SHDC'.indexOf(a[1]) - 'SHDC'.indexOf(b[1]);
    return by === 'rank' ? r || s : s || r;
  });
}

const SIZES = {
  xs: 'h-10 w-7 text-[10px]',
  sm: 'h-12 w-9 text-[11px]',
  md: 'h-[4.4rem] w-[3rem] text-sm',
  lg: 'h-24 w-16 text-base',
};

/**
 * Touch-friendly playing card: ivory face, corner index, large centre pip,
 * lift + glow when selected. Face-down cards use an original purple/gold back.
 */
export default function PlayingCard({
  code,
  selected,
  onClick,
  small,
  size,
  faceDown,
  className = '',
  style,
}: {
  code?: string;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  size?: keyof typeof SIZES;
  faceDown?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const dims = SIZES[size ?? (small ? 'sm' : 'md')];

  if (faceDown || !code) {
    return (
      <div className={`${dims} shrink-0 rounded-md border-2 border-gold-300 bg-felt-700 p-[3px] shadow-md ${className}`} style={style} aria-hidden="true">
        <div
          className="h-full w-full rounded-[3px] border border-gold-400/60"
          style={{
            background:
              'repeating-linear-gradient(45deg, rgb(255 204 61 / 0.18) 0 3px, transparent 3px 7px), linear-gradient(160deg, #6a5cf0, #301768)',
          }}
        />
      </div>
    );
  }

  const suit = SUITS[code[1]];
  const rank = code[0] === 'T' ? '10' : code[0];
  const color = suit.red ? 'text-[#d81e3c]' : 'text-[#1b1336]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${rank} of ${suit.name}`}
      aria-pressed={onClick ? !!selected : undefined}
      style={style}
      className={`${dims} relative shrink-0 select-none overflow-hidden rounded-md border bg-gradient-to-b from-white to-[#f3eee3] font-display font-extrabold leading-none shadow-[0_3px_0_rgb(0_0_0/0.25),0_6px_10px_rgb(0_0_0/0.25)] transition duration-150 ${color} ${
        selected ? '-translate-y-2.5 border-gold-400 ring-3 ring-gold-300 shadow-[0_0_18px_rgb(255_204_61/0.75)]' : 'border-black/15'
      } ${onClick ? 'cursor-pointer active:scale-95' : 'cursor-default'} ${className}`}
    >
      {size === 'xs' ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span>{rank}</span>
          <span className="text-[1.25em]">{suit.s}</span>
        </span>
      ) : (
        <>
          <span className="absolute left-[3px] top-[3px] flex flex-col items-center">
            <span>{rank}</span>
            <span className="-mt-0.5">{suit.s}</span>
          </span>
          <span className="absolute inset-0 flex items-center justify-center pt-2 text-[1.9em] opacity-95">{suit.s}</span>
        </>
      )}
    </button>
  );
}

/** Small fanned hand used as an illustration on tiles and seats. */
export function CardFan({ cards = ['AS', 'KH', 'QD'], faceDown, size = 'xs', spread = 14 }: { cards?: string[]; faceDown?: boolean; size?: keyof typeof SIZES; spread?: number }) {
  const mid = (cards.length - 1) / 2;

  return (
    <div className="relative flex items-end justify-center" style={{ height: size === 'xs' ? 46 : 60 }}>
      {cards.map((c, i) => (
        <PlayingCard
          key={`${c}-${i}`}
          code={faceDown ? undefined : c}
          faceDown={faceDown}
          size={size}
          className="-mx-2 origin-bottom"
          style={{ transform: `rotate(${(i - mid) * spread}deg) translateY(${Math.abs(i - mid) * 3}px)` }}
        />
      ))}
    </div>
  );
}
