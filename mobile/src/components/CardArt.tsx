import { useId, type ReactNode } from 'react';

/**
 * PUSOY 553 card art — the one card design used everywhere (table, arrangement popup, deal and
 * reveal animations). Kept identical in both apps: mobile/src/components/CardArt.tsx (Next.js) and
 * resources/js/Components/CardArt.tsx (Laravel web) — change one, copy it to the other.
 *
 * Pure SVG on a 100 × 140 card (scales to any size, no image files):
 *  - Face: bright white card in a gold frame with gold corner flourishes; a large bold serif rank
 *    over a large suit symbol (the same clean layout for every rank, readable at any size). Hearts
 *    and diamonds are red, spades and clubs black.
 *  - Back: black with a gold quilted lattice, a gold double frame with corner scrolls, a crown in a
 *    gold laurel medallion, and gold fleurs-de-lis above and below.
 */

// Bold serif with even (lining) digits, like the card design; Georgia's old-style digits are a fallback only.
const SERIF = "'Times New Roman', Times, 'Liberation Serif', 'Noto Serif', Georgia, serif";

/** Suit outlines in a −5…5 box (drawn as paths so every card looks the same on every device). */
export const SUIT_PATH: Record<string, string> = {
  H: 'M0 4.7 C-2.2 3 -5 0.7 -5 -1.8 C-5 -3.8 -3.6 -5 -2.4 -5 C-1.3 -5 -0.4 -4.3 0 -3.3 C0.4 -4.3 1.3 -5 2.4 -5 C3.6 -5 5 -3.8 5 -1.8 C5 0.7 2.2 3 0 4.7Z',
  D: 'M0 -5.4 Q1.7 -2.5 4 0 Q1.7 2.5 0 5.4 Q-1.7 2.5 -4 0 Q-1.7 -2.5 0 -5.4Z',
  S: 'M0 -5.2 C-2.2 -3.4 -5 -1.3 -5 1.2 C-5 3 -3.7 4 -2.5 4 C-1.5 4 -0.7 3.4 -0.3 2.7 C-0.5 3.9 -1.1 4.8 -2.1 5.3 L2.1 5.3 C1.1 4.8 0.5 3.9 0.3 2.7 C0.7 3.4 1.5 4 2.5 4 C3.7 4 5 3 5 1.2 C5 -1.3 2.2 -3.4 0 -5.2Z',
  C: 'M0 -5.3 A2.45 2.45 0 0 1 1.9 -1.3 A2.45 2.45 0 1 1 0.5 2.6 Q0.9 4.5 2.1 5.3 L-2.1 5.3 Q-0.9 4.5 -0.5 2.6 A2.45 2.45 0 1 1 -1.9 -1.3 A2.45 2.45 0 0 1 0 -5.3Z',
};

const SUIT_NAME: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
export const suitName = (s: string) => SUIT_NAME[s] ?? s;
export const rankLabel = (r: string) => (r === 'T' ? '10' : r);
const isRed = (s: string) => s === 'H' || s === 'D';

function useCardIds() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return { gold: `cg${id}`, ink: `ci${id}`, face: `cf${id}`, sheen: `cs${id}`, lattice: `cl${id}`, back: `cb${id}` };
}

function GoldStops() {
  return (
    <>
      <stop offset="0" stopColor="#fff4b8" />
      <stop offset="0.45" stopColor="#f2c64a" />
      <stop offset="1" stopColor="#b07a0e" />
    </>
  );
}

/** A gold corner flourish (top-left; mirrored for the other corners). */
function Corner({ gold, back = false }: { gold: string; back?: boolean }) {
  return back ? (
    <path d="M8 22 C8 12 12 8 22 8 M8 16 C11 16 13 13.5 12.2 11.2 C11.6 9.4 9.4 9.6 9.4 11.4 M16 8 C16 11 13.5 13 11.2 12.2" fill="none" stroke={`url(#${gold})`} strokeWidth="1.1" strokeLinecap="round" />
  ) : (
    <g fill="none" stroke={`url(#${gold})`} strokeLinecap="round">
      <path d="M6.2 17 C6.2 10.4 10.4 6.2 17 6.2" strokeWidth="1" />
      <path d="M6.2 12.4 C8.8 12.4 10.6 10.4 10 8.6 C9.6 7.4 8 7.6 8.1 8.9" strokeWidth="0.85" />
      <path d="M12.4 6.2 C12.4 8.8 10.4 10.6 8.6 10" strokeWidth="0.85" />
      <circle cx="17.6" cy="6.2" r="0.75" fill={`url(#${gold})`} stroke="none" />
      <circle cx="6.2" cy="17.6" r="0.75" fill={`url(#${gold})`} stroke="none" />
    </g>
  );
}

/** The same element in all four corners of the 100 × 140 card. */
function FourCorners({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <g transform="translate(100 0) scale(-1 1)">{children}</g>
      <g transform="translate(0 140) scale(1 -1)">{children}</g>
      <g transform="translate(100 140) scale(-1 -1)">{children}</g>
    </>
  );
}

function Crown({ gold, x = 0, y = 0, s = 1 }: { gold: string; x?: number; y?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-9 0 L-10 -9 L-5 -4.5 L0 -11 L5 -4.5 L10 -9 L9 0Z" fill={`url(#${gold})`} stroke="#6a3a00" strokeWidth="0.7" strokeLinejoin="round" />
      <rect x="-9.4" y="-0.4" width="18.8" height="3" rx="1" fill={`url(#${gold})`} stroke="#6a3a00" strokeWidth="0.6" />
      <circle cx="0" cy="-11" r="1.4" fill="#fff3b0" stroke="#6a3a00" strokeWidth="0.5" />
      <circle cx="-10" cy="-9" r="1.1" fill="#fff3b0" stroke="#6a3a00" strokeWidth="0.5" />
      <circle cx="10" cy="-9" r="1.1" fill="#fff3b0" stroke="#6a3a00" strokeWidth="0.5" />
      <circle cx="0" cy="1.1" r="0.9" fill="#7a4a00" />
      <circle cx="-5" cy="1.1" r="0.7" fill="#7a4a00" />
      <circle cx="5" cy="1.1" r="0.7" fill="#7a4a00" />
    </g>
  );
}

/** A gold fleur-de-lis, about 14 × 14, centred on (x, y); `flip` turns it upside down. */
function Fleur({ gold, x, y, flip = false }: { gold: string; x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})${flip ? ' rotate(180)' : ''}`} fill={`url(#${gold})`} stroke="#6a3a00" strokeWidth="0.3" strokeLinejoin="round">
      <path d="M0 -7 C2.4 -3.8 2.6 -0.4 0 2.6 C-2.6 -0.4 -2.4 -3.8 0 -7Z" />
      <path d="M-0.8 1.6 C-4.8 0.6 -7.4 -2.6 -5.6 -5 C-5 -2.6 -3 -0.8 -0.4 0.2Z" />
      <path d="M0.8 1.6 C4.8 0.6 7.4 -2.6 5.6 -5 C5 -2.6 3 -0.8 0.4 0.2Z" />
      <rect x="-3.6" y="2.2" width="7.2" height="1.6" rx="0.6" />
      <path d="M0 3.8 C-0.6 5.4 -2 6.4 -3.4 6.6 M0 3.8 C0.6 5.4 2 6.4 3.4 6.6" fill="none" stroke={`url(#${gold})`} strokeWidth="1" strokeLinecap="round" />
      <circle cx="-7.4" cy="0" r="0.8" />
      <circle cx="7.4" cy="0" r="0.8" />
    </g>
  );
}

/**
 * A card face as an SVG filling its box: large rank over a large suit in a gold frame. `compact`
 * (kept for callers; the design is already readable at thumbnail size) uses slightly bigger marks.
 */
export function CardFaceArt({ code, compact = false, className = '' }: { code: string; compact?: boolean; className?: string }) {
  const ids = useCardIds();
  const rank = code[0];
  const suit = code[1];
  const label = rankLabel(rank);
  const red = isRed(suit);
  const solid = red ? '#d0101f' : '#101014';
  const ten = label === '10';
  const rankSize = (compact ? 56 : 52) - (ten ? 8 : 0);

  return (
    <svg viewBox="0 0 100 140" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <linearGradient id={ids.ink} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={red ? '#f0303f' : '#3a3a44'} />
          <stop offset="1" stopColor={red ? '#a8081a' : '#050507'} />
        </linearGradient>
        <linearGradient id={ids.face} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f6f2ea" />
        </linearGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="0.62" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* white card, gold frame (thick outer edge + fine inner line), gold corner flourishes */}
      <rect x="1.6" y="1.6" width="96.8" height="136.8" rx="9" fill={`url(#${ids.face})`} />
      <rect x="1.6" y="1.6" width="96.8" height="136.8" rx="9" fill={`url(#${ids.sheen})`} />
      <rect x="1.6" y="1.6" width="96.8" height="136.8" rx="9" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="3.2" />
      <rect x="4.6" y="4.6" width="90.8" height="130.8" rx="6.5" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="0.6" opacity="0.8" />
      <FourCorners>
        <Corner gold={ids.gold} />
      </FourCorners>

      {/* large rank over a large suit */}
      <text
        x="50"
        y={compact ? 60 : 58}
        textAnchor="middle"
        fontFamily={SERIF}
        fontWeight="900"
        fontSize={rankSize}
        letterSpacing={ten ? -5 : 0}
        fill={solid}
        stroke={solid}
        strokeWidth="1.1"
        strokeLinejoin="round"
      >
        {label}
      </text>
      <path d={SUIT_PATH[suit]} transform={`translate(50 ${compact ? 99 : 98}) scale(${compact ? 3.9 : 3.7})`} fill={`url(#${ids.ink})`} />
    </svg>
  );
}

/** The card back: black with a gold quilted lattice and frame, crown in a laurel medallion, fleurs-de-lis. */
export function CardBackArt({ className = '' }: { className?: string }) {
  const ids = useCardIds();
  // Laurel: leaves on two arcs around the medallion, from bottom to top on each side.
  const leaves = (side: 1 | -1) =>
    Array.from({ length: 7 }, (_, i) => {
      const a = (Math.PI / 180) * (118 + i * 19);
      // Rounded so the server and the browser render identical numbers.
      const x = Math.round((50 + side * Math.cos(a) * -21) * 100) / 100;
      const y = Math.round((70 + Math.sin(a) * 21) * 100) / 100;
      return <ellipse key={`${side}${i}`} cx={x} cy={y} rx="3.4" ry="1.5" transform={`rotate(${side * (i * 19 - 40)} ${x} ${y})`} fill={`url(#${ids.gold})`} stroke="#5a3200" strokeWidth="0.3" />;
    });
  return (
    <svg viewBox="0 0 100 140" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <radialGradient id={ids.back} cx="0.5" cy="0.48" r="0.75">
          <stop offset="0" stopColor="#2a2a30" />
          <stop offset="0.6" stopColor="#141417" />
          <stop offset="1" stopColor="#050506" />
        </radialGradient>
        {/* quilted diamond lattice */}
        <pattern id={ids.lattice} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H6 M0 0 V6" stroke="#d4a53a" strokeWidth="0.35" opacity="0.35" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="99" height="139" rx="9" fill={`url(#${ids.back})`} />
      <rect x="6.6" y="6.6" width="86.8" height="126.8" rx="4.5" fill={`url(#${ids.lattice})`} />
      <rect x="2.4" y="2.4" width="95.2" height="135.2" rx="8" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="3" />
      <rect x="6.6" y="6.6" width="86.8" height="126.8" rx="4.5" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="0.8" />
      <FourCorners>
        <Corner gold={ids.gold} back />
      </FourCorners>

      <Fleur gold={ids.gold} x={50} y={22} />
      <Fleur gold={ids.gold} x={50} y={118} flip />

      {/* crown in a gold medallion inside a laurel wreath */}
      {leaves(1)}
      {leaves(-1)}
      <circle cx="50" cy="70" r="15.5" fill="#0b0b0d" stroke={`url(#${ids.gold})`} strokeWidth="2" />
      <circle cx="50" cy="70" r="12.6" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="0.6" opacity="0.85" />
      <Crown gold={ids.gold} x={50} y={74} s={0.8} />
    </svg>
  );
}
