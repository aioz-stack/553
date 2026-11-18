import { useId } from 'react';

/**
 * PUSOY 553 card art — the one card design used everywhere (table, arrangement popup, deal and
 * reveal animations). Kept identical in both apps: mobile/src/components/CardArt.tsx (Next.js) and
 * resources/js/Components/CardArt.tsx (Laravel web) — change one, copy it to the other.
 *
 * Pure SVG on a 100 × 140 card (scales to any size, no image files):
 *  - Face: pearl-cream card, gold filigree in the top-right and bottom-left corners, serif corner
 *    index (rank over suit, repeated upside down bottom-right), real pip layouts for 2–10, a large
 *    suit emblem with crown and gold "553" on Aces, and illustrated Jack / Queen / King portraits.
 *  - Back: deep red with a fine lattice, ornate gold frame and the crowned "553" laurel emblem.
 * Red suits (hearts, diamonds) are crimson, black suits (spades, clubs) near-black.
 */

const SERIF = "Georgia, 'Times New Roman', 'Palatino Linotype', serif";

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

// Pip positions (x, y) on the 100 × 140 card; pips below the middle are drawn upside down.
const L = 35;
const C = 50;
const R = 65;
const PIPS: Record<string, Array<[number, number]>> = {
  '2': [[C, 32], [C, 108]],
  '3': [[C, 32], [C, 70], [C, 108]],
  '4': [[L, 32], [R, 32], [L, 108], [R, 108]],
  '5': [[L, 32], [R, 32], [C, 70], [L, 108], [R, 108]],
  '6': [[L, 32], [R, 32], [L, 70], [R, 70], [L, 108], [R, 108]],
  '7': [[L, 32], [R, 32], [C, 51], [L, 70], [R, 70], [L, 108], [R, 108]],
  '8': [[L, 32], [R, 32], [C, 51], [L, 70], [R, 70], [C, 89], [L, 108], [R, 108]],
  '9': [[L, 32], [R, 32], [L, 57.3], [R, 57.3], [C, 70], [L, 82.7], [R, 82.7], [L, 108], [R, 108]],
  T: [[L, 32], [R, 32], [C, 46], [L, 57.3], [R, 57.3], [L, 82.7], [R, 82.7], [C, 94], [L, 108], [R, 108]],
};

function Filigree({ gold }: { gold: string }) {
  return (
    <g fill="none" stroke={`url(#${gold})`} strokeLinecap="round" strokeLinejoin="round">
      <path d="M58 4.6 H85 Q95.4 4.6 95.4 15 V44" strokeWidth="1.1" />
      <path d="M95.4 30 C89.5 30 85.6 25.5 86.8 20.6 C87.8 16.6 92.2 16.4 92.6 19.6" strokeWidth="1.3" />
      <path d="M73 4.6 C73 10.2 77.4 13.4 81.6 12.4 C85 11.6 85.4 8.2 82.6 7.6" strokeWidth="1.3" />
      <path d="M95.4 44 C92.6 40.6 92 36.8 94.2 34" strokeWidth="0.9" />
      <path d="M58 4.6 C62 7.4 66.6 7.6 69 5.2" strokeWidth="0.9" />
      <path d="M88.6 12.6 C90.6 11.4 92 12 92.6 13.6" strokeWidth="1" />
      <circle cx="89.6" cy="9.6" r="1.25" fill={`url(#${gold})`} stroke="none" />
      <circle cx="95.4" cy="47" r="0.9" fill={`url(#${gold})`} stroke="none" />
      <circle cx="55" cy="4.6" r="0.9" fill={`url(#${gold})`} stroke="none" />
    </g>
  );
}

function Crown({ gold, x = 0, y = 0, s = 1 }: { gold: string; x?: number; y?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-9 0 L-10 -9 L-5 -4.5 L0 -11 L5 -4.5 L10 -9 L9 0Z" fill={`url(#${gold})`} stroke="#7a4a00" strokeWidth="0.7" strokeLinejoin="round" />
      <rect x="-9.4" y="-0.4" width="18.8" height="3" rx="1" fill={`url(#${gold})`} stroke="#7a4a00" strokeWidth="0.6" />
      <circle cx="0" cy="-11" r="1.4" fill="#fff3b0" stroke="#7a4a00" strokeWidth="0.5" />
      <circle cx="-10" cy="-9" r="1.1" fill="#fff3b0" stroke="#7a4a00" strokeWidth="0.5" />
      <circle cx="10" cy="-9" r="1.1" fill="#fff3b0" stroke="#7a4a00" strokeWidth="0.5" />
      <circle cx="0" cy="1.1" r="1" fill="#d6122a" />
      <circle cx="-5" cy="1.1" r="0.8" fill="#1e6be0" />
      <circle cx="5" cy="1.1" r="0.8" fill="#1e6be0" />
    </g>
  );
}

/** Ace: a large suit emblem with a crown and gold "553". */
function AceEmblem({ suit, ink, gold }: { suit: string; ink: string; gold: string }) {
  const textY = { S: 3.4, H: -0.6, D: 1.6, C: 2.2 }[suit] ?? 1;
  return (
    <g transform="translate(50 72)">
      <path d={SUIT_PATH[suit]} transform="scale(4.3)" fill={`url(#${ink})`} stroke={`url(#${gold})`} strokeWidth="0.32" />
      <path d={SUIT_PATH[suit]} transform="scale(3.75)" fill="none" stroke={`url(#${gold})`} strokeWidth="0.12" opacity="0.8" />
      <Crown gold={gold} y={textY - 9.5} s={0.62} />
      <text x="0" y={textY + 4.4} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontWeight="700" fontSize="13.5" fill={`url(#${gold})`} stroke="#3a1600" strokeWidth="0.9" paintOrder="stroke" letterSpacing="-0.3">
        553
      </text>
      <path d={`M-10 ${textY + 7} Q0 ${textY + 9.5} 10 ${textY + 7} L9 ${textY + 9.6} Q0 ${textY + 12} -9 ${textY + 9.6}Z`} fill="#b30f22" stroke={`url(#${gold})`} strokeWidth="0.5" />
    </g>
  );
}

/** Jack / Queen / King: half-length portrait in red and gold robes. */
function Portrait({ rank, suit, gold }: { rank: string; suit: string; gold: string }) {
  const skin = '#f7cfa6';
  const robeId = `${gold}r`;
  // Queens' hair follows the suit (dark for black suits, chestnut / silver for red suits).
  const queenHair = suit === 'S' || suit === 'C' ? '#1f1410' : suit === 'H' ? '#9a9aa6' : '#5a2e16';
  return (
    <g transform="translate(50 71) scale(1.24)">
      <defs>
        <linearGradient id={robeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3283c" />
          <stop offset="1" stopColor="#7c0612" />
        </linearGradient>
      </defs>
      {/* hair behind the shoulders (queen) */}
      {rank === 'Q' && <path d="M-16 -14 C-22 4 -20 22 -14 30 L14 30 C20 22 22 4 16 -14 C10 -26 -10 -26 -16 -14Z" fill={queenHair} />}
      {/* robe and shoulders */}
      <path d="M-31 46 C-31 22 -20 13 0 13 C20 13 31 22 31 46Z" fill={`url(#${robeId})`} />
      <path d="M-31 46 C-31 22 -20 13 0 13 C20 13 31 22 31 46" fill="none" stroke="#5a0410" strokeWidth="0.8" />
      <ellipse cx="-21" cy="20" rx="8" ry="3.6" fill={`url(#${gold})`} transform="rotate(-18 -21 20)" />
      <ellipse cx="21" cy="20" rx="8" ry="3.6" fill={`url(#${gold})`} transform="rotate(18 21 20)" />
      <path d="M-9 13 L0 31 L9 13" fill="none" stroke={`url(#${gold})`} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M0 31 V46" stroke={`url(#${gold})`} strokeWidth="2.2" />
      {[34, 39, 44].map((y) => (
        <circle key={y} cx="0" cy={y} r="1.1" fill="#fff3b0" />
      ))}
      {rank === 'Q' && <path d="M-9 15 Q0 24 9 15" fill="none" stroke="#fff3b0" strokeWidth="1.4" strokeDasharray="0.1 2.6" strokeLinecap="round" />}
      {/* neck and face */}
      <rect x="-4.6" y="4" width="9.2" height="11" rx="3" fill={skin} />
      <ellipse cx="-12.6" cy="-5" rx="2.2" ry="3.2" fill={skin} />
      <ellipse cx="12.6" cy="-5" rx="2.2" ry="3.2" fill={skin} />
      <ellipse cx="0" cy="-6" rx="12.4" ry="14.4" fill={skin} />
      {/* hair */}
      {rank === 'J' && <path d="M-12.6 -7 C-13.6 -19 -6 -23 0 -23 C6 -23 13.6 -19 12.6 -7 C10 -13 6 -15.5 0 -15.5 C-6 -15.5 -10 -13 -12.6 -7Z" fill="#6b3a1c" />}
      {rank === 'Q' && <path d="M-12.8 -4 C-14 -18 -6 -22.5 0 -22.5 C6 -22.5 14 -18 12.8 -4 C11 -12 5 -15 0 -16.5 C-5 -15 -11 -12 -12.8 -4Z" fill={queenHair} />}
      {rank === 'K' && <path d="M-12.6 -3 C-14 -15 -7 -20.5 0 -20.5 C7 -20.5 14 -15 12.6 -3 C11 -10 6 -13.5 0 -13.5 C-6 -13.5 -11 -10 -12.6 -3Z" fill="#eeeef2" />}
      {/* eyes, brows, cheeks */}
      <ellipse cx="-4.6" cy="-6.4" rx="1.5" ry="1.9" fill="#2a1a12" />
      <ellipse cx="4.6" cy="-6.4" rx="1.5" ry="1.9" fill="#2a1a12" />
      <circle cx="-4.1" cy="-7" r="0.5" fill="#fff" />
      <circle cx="5.1" cy="-7" r="0.5" fill="#fff" />
      <path d="M-7 -10.4 Q-4.6 -11.8 -2.4 -10.6 M2.4 -10.6 Q4.6 -11.8 7 -10.4" fill="none" stroke={rank === 'K' ? '#b8b8c0' : '#3a2214'} strokeWidth="1" strokeLinecap="round" />
      <circle cx="-7.4" cy="-1.6" r="2.1" fill="#ff8a8a" opacity="0.35" />
      <circle cx="7.4" cy="-1.6" r="2.1" fill="#ff8a8a" opacity="0.35" />
      <path d="M-0.6 -4.2 Q0 -2.4 0.8 -3.2" fill="none" stroke="#c98a6a" strokeWidth="0.7" strokeLinecap="round" />
      {rank !== 'K' && <path d="M-3.2 1.4 Q0 3.8 3.2 1.4" fill={rank === 'Q' ? '#d6455a' : 'none'} stroke={rank === 'Q' ? '#b02a3e' : '#8a3a24'} strokeWidth="0.9" strokeLinecap="round" />}
      {rank === 'Q' && (
        <>
          <circle cx="-12.6" cy="-1" r="1.2" fill={`url(#${gold})`} />
          <circle cx="12.6" cy="-1" r="1.2" fill={`url(#${gold})`} />
        </>
      )}
      {/* king: white beard and moustache */}
      {rank === 'K' && (
        <>
          <path d="M-12.4 -3 C-12.6 12 -6 19 0 20.5 C6 19 12.6 12 12.4 -3 C10 2.5 6 4 3.4 2.4 C1.4 1.4 -1.4 1.4 -3.4 2.4 C-6 4 -10 2.5 -12.4 -3Z" fill="#f2f2f6" stroke="#cfcfd8" strokeWidth="0.6" />
          <path d="M-6.6 0.8 C-3.6 -1.2 -1 -0.6 0 0.6 C1 -0.6 3.6 -1.2 6.6 0.8 C4 2.4 1.4 2 0 1.2 C-1.4 2 -4 2.4 -6.6 0.8Z" fill="#e2e2ea" stroke="#c4c4ce" strokeWidth="0.5" />
        </>
      )}
      {/* headwear */}
      {rank === 'J' && (
        <g>
          <path d="M-15 -17 C-15 -27 -6 -31 2 -30 C12 -29 17 -24 16 -17Z" fill="#c8102e" />
          <rect x="-15" y="-19" width="31" height="4.2" rx="2" fill={`url(#${gold})`} stroke="#7a4a00" strokeWidth="0.5" />
          <circle cx="8" cy="-17" r="1.5" fill="#fff3b0" stroke="#7a4a00" strokeWidth="0.4" />
        </g>
      )}
      {rank === 'Q' && <Crown gold={gold} y={-19.5} s={0.82} />}
      {rank === 'K' && <Crown gold={gold} y={-17.5} s={1.2} />}
    </g>
  );
}

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

/**
 * A card face as an SVG filling its box. `compact` (tiny cards): a single large index and suit,
 * which stays readable at thumbnail size.
 */
export function CardFaceArt({ code, compact = false, className = '' }: { code: string; compact?: boolean; className?: string }) {
  const ids = useCardIds();
  const rank = code[0];
  const suit = code[1];
  const label = rankLabel(rank);
  const red = isRed(suit);
  const solid = red ? '#c8102e' : '#141418';
  const pip = PIPS[rank];
  // Large, easy-to-read pips (a little smaller on the busy 9 and 10).
  const pipScale = rank === "T" || rank === "9" ? 1.5 : rank === "7" || rank === "8" ? 1.65 : 1.8;

  return (
    <svg viewBox="0 0 100 140" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <linearGradient id={ids.ink} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={red ? '#ee3346' : '#3a3a44'} />
          <stop offset="1" stopColor={red ? '#9c0818' : '#050507'} />
        </linearGradient>
        <linearGradient id={ids.face} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#f5ecdc" />
        </linearGradient>
        <linearGradient id={ids.sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0.25" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.7" />
          <stop offset="0.62" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="0.6" y="0.6" width="98.8" height="138.8" rx="8" fill={`url(#${ids.face})`} stroke="#e4cf9e" strokeWidth="1.2" />
      <rect x="0.6" y="0.6" width="98.8" height="138.8" rx="8" fill={`url(#${ids.sheen})`} />
      <rect x="3.6" y="3.6" width="92.8" height="132.8" rx="6" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="0.6" opacity="0.45" />
      <Filigree gold={ids.gold} />
      <g transform="rotate(180 50 70)">
        <Filigree gold={ids.gold} />
      </g>

      {compact ? (
        <g fill={solid}>
          <text x="50" y="62" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={label === '10' ? 42 : 50} letterSpacing={label === '10' ? -4 : 0}>
            {label}
          </text>
          <path d={SUIT_PATH[suit]} transform="translate(50 96) scale(3.2)" fill={`url(#${ids.ink})`} />
        </g>
      ) : (
        <>
          {pip &&
            pip.map(([x, y], i) => (
              <path key={i} d={SUIT_PATH[suit]} transform={`translate(${x} ${y}) scale(${pipScale})${y > 70 ? ' rotate(180)' : ''}`} fill={`url(#${ids.ink})`} />
            ))}
          {rank === 'A' && <AceEmblem suit={suit} ink={ids.ink} gold={ids.gold} />}
          {(rank === 'J' || rank === 'Q' || rank === 'K') && <Portrait rank={rank} suit={suit} gold={ids.gold} />}
          {/* corner index (drawn last, over a portrait), and the same upside down */}
          {[0, 180].map((rot) => (
            <g key={rot} transform={rot ? 'rotate(180 50 70)' : undefined} fill={solid} stroke="#fbf5ea" strokeWidth="1.6" paintOrder="stroke" strokeLinejoin="round">
              <text x="14" y="31" textAnchor="middle" fontFamily={SERIF} fontWeight="700" fontSize={label === "10" ? 25 : 30} letterSpacing={label === "10" ? -2.6 : 0}>
                {label}
              </text>
              <path d={SUIT_PATH[suit]} transform="translate(14 42.5) scale(1.12)" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

/** The card back: deep red lattice, ornate gold frame and the crowned "553" laurel emblem. */
export function CardBackArt({ className = '' }: { className?: string }) {
  const ids = useCardIds();
  const leaves = (side: 1 | -1) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (200 - i * 22);
      const x = 50 + side * Math.cos(a) * -19;
      const y = 76 + Math.sin(a) * -15;
      return <ellipse key={`${side}${i}`} cx={x} cy={y} rx="3.6" ry="1.6" transform={`rotate(${side * (i * 22 - 60)} ${x} ${y})`} fill={`url(#${ids.gold})`} stroke="#6a3a00" strokeWidth="0.3" />;
    });
  const scroll = <path d="M8 22 C8 12 12 8 22 8 M8 16 C11 16 13 13.5 12.2 11.2 C11.6 9.4 9.4 9.6 9.4 11.4 M16 8 C16 11 13.5 13 11.2 12.2" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="1.1" strokeLinecap="round" />;
  return (
    <svg viewBox="0 0 100 140" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <GoldStops />
        </linearGradient>
        <radialGradient id={ids.back} cx="0.5" cy="0.48" r="0.75">
          <stop offset="0" stopColor="#c0141f" />
          <stop offset="0.6" stopColor="#8a0a12" />
          <stop offset="1" stopColor="#4a0306" />
        </radialGradient>
        <pattern id={ids.lattice} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H7 M0 0 V7" stroke="#ff6a6a" strokeWidth="0.35" opacity="0.28" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill={`url(#${ids.back})`} />
      <rect x="0.5" y="0.5" width="99" height="139" rx="8" fill={`url(#${ids.lattice})`} />
      <rect x="2.6" y="2.6" width="94.8" height="134.8" rx="7" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="2.6" />
      <rect x="6.6" y="6.6" width="86.8" height="126.8" rx="4.5" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="0.8" />
      {/* corner scrolls */}
      {scroll}
      <g transform="translate(100 0) scale(-1 1)">{scroll}</g>
      <g transform="translate(0 140) scale(1 -1)">{scroll}</g>
      <g transform="translate(100 140) scale(-1 -1)">{scroll}</g>
      {/* centre medallion */}
      <path d="M50 30 L76 72 L50 114 L24 72Z" fill="#5c040b" stroke={`url(#${ids.gold})`} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M50 36 L71 72 L50 108 L29 72Z" fill="none" stroke={`url(#${ids.gold})`} strokeWidth="0.5" opacity="0.8" />
      {leaves(1)}
      {leaves(-1)}
      <Crown gold={ids.gold} x={50} y={63} s={0.85} />
      <text x="50" y="80.5" textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontWeight="700" fontSize="17" fill={`url(#${ids.gold})`} stroke="#2a0e00" strokeWidth="1" paintOrder="stroke" letterSpacing="-0.4">
        553
      </text>
      <path d="M36 84 Q50 88.5 64 84 L62 89.5 Q50 94 38 89.5Z" fill="#c4111f" stroke={`url(#${ids.gold})`} strokeWidth="0.6" />
      {(['H', 'D', 'C'] as const).map((s, i) => (
        <path key={s} d={SUIT_PATH[s]} transform={`translate(${45 + i * 5} 89.4) scale(0.32)`} fill={`url(#${ids.gold})`} />
      ))}
    </svg>
  );
}
