import { CardBackArt, CardFaceArt, rankLabel, suitName } from './CardArt';

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
 * Touch-friendly playing card in the PUSOY 553 design (components/CardArt.tsx): pearl face with gold
 * filigree, serif corner index, pips / 553 Ace emblem / court portraits; face-down cards show the red
 * and gold 553 back. Lifts with a gold glow when selected.
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
      <div className={`${dims} relative shrink-0 overflow-hidden rounded-[7%/5%] bg-[#5a0408] shadow-[0_3px_0_rgb(0_0_0/0.25),0_6px_10px_rgb(0_0_0/0.25)] ${className}`} style={style} aria-hidden="true">
        <CardBackArt className="absolute inset-0 h-full w-full" />
      </div>
    );
  }

  const label = rankLabel(code[0]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={`${label} of ${suitName(code[1])}`}
      aria-pressed={onClick ? !!selected : undefined}
      style={style}
      className={`${dims} relative shrink-0 select-none overflow-hidden rounded-[7%/5%] bg-[#fbf5ea] leading-none shadow-[0_3px_0_rgb(0_0_0/0.25),0_6px_10px_rgb(0_0_0/0.25)] transition duration-150 ${
        selected ? '-translate-y-2.5 ring-3 ring-gold-300 shadow-[0_0_18px_rgb(255_204_61/0.75)]' : ''
      } ${onClick ? 'cursor-pointer active:scale-95' : 'cursor-default'} ${className}`}
    >
      <CardFaceArt code={code} compact={size === 'xs'} className="pointer-events-none absolute inset-0 h-full w-full" />
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
