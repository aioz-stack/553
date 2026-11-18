/**
 * Original SVG art for the landscape Single Player table (1600×900 stage):
 * the red lantern-night room, the oval poker table, cartoon seat avatars,
 * casino chips and the small Pusoy 553 crest. No image assets; motion uses
 * the lx-* / tb-* classes in globals.css (off with reduced motion).
 */

import { useId, type CSSProperties } from 'react';
import { CardBackArt } from '@/components/CardArt';

const d = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/** Five-petal cherry blossom. */
function Blossom({ x, y, r = 14, rot = 0, light = false }: { x: number; y: number; r?: number; rot?: number; light?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx="0" cy={-r * 0.62} rx={r * 0.5} ry={r * 0.66} transform={`rotate(${a})`} fill={light ? '#ffd6e2' : '#ff9fbd'} stroke="#e8628b" strokeWidth="1" />
      ))}
      <circle r={r * 0.28} fill="#ffdd55" />
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={`s${a}`} cx="0" cy={-r * 0.4} r={r * 0.07} fill="#c2185b" transform={`rotate(${a + 36})`} />
      ))}
    </g>
  );
}

function Branch({ path, flowers }: { path: string; flowers: Array<[number, number, number, number?]> }) {
  return (
    <g>
      <path d={path} stroke="#4a2414" strokeWidth="7" fill="none" strokeLinecap="round" />
      {flowers.map(([x, y, r, rot], i) => (
        <g key={i} className="tb-sway-soft" style={d(i * 0.3)}>
          <Blossom x={x} y={y} r={r} rot={rot ?? i * 23} light={i % 3 === 0} />
        </g>
      ))}
    </g>
  );
}

function BambooLeaves({ x, y, flip }: { x: number; y: number; flip?: boolean }) {
  const leaves: Array<[number, number, number]> = [
    [0, 0, -30], [20, 30, -10], [-10, 60, -45], [30, 80, 5], [5, 120, -25], [40, 150, 15],
  ];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} className="tb-sway-soft">
      <path d="M-40 -20 C -20 60 -10 140 -30 260" stroke="#5a7d1f" strokeWidth="9" fill="none" />
      {leaves.map(([lx, ly, r], i) => (
        <path key={i} d="M0 0 q 55 -16 120 6 q -60 20 -120 -6z" transform={`translate(${lx - 30} ${ly}) rotate(${r})`} fill={i % 2 ? '#7cc142' : '#5aa72e'} stroke="#2f6b18" strokeWidth="2" />
      ))}
    </g>
  );
}

/** The room: red walls, a night window with moon and pagoda, a lantern, blossoms and bamboo. */
export function LanternRoom({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="tb-wall" cx="0.5" cy="0.45" r="0.8">
          <stop offset="0" stopColor="#b5161c" />
          <stop offset="0.6" stopColor="#7d0b10" />
          <stop offset="1" stopColor="#4a0508" />
        </radialGradient>
        <linearGradient id="tb-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1450" />
          <stop offset="1" stopColor="#3a3a9a" />
        </linearGradient>
        <radialGradient id="tb-moon" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="1" stopColor="#f2d58a" />
        </radialGradient>
        <radialGradient id="tb-lantern" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#ffd36a" />
          <stop offset="0.5" stopColor="#ff4a2a" />
          <stop offset="1" stopColor="#a8100e" />
        </radialGradient>
        <radialGradient id="tb-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb347" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#tb-wall)" />
      {/* wall panels */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect key={i} x={i * 200 + 10} y="0" width="180" height="900" fill="none" stroke="#5a0609" strokeOpacity="0.35" strokeWidth="4" />
      ))}

      {/* night window */}
      <g>
        <rect x="500" y="-10" width="800" height="170" fill="url(#tb-sky)" />
        {[[560, 30], [640, 70], [760, 20], [880, 55], [950, 18], [1180, 30], [1260, 80], [700, 110]].map(([sx, sy], i) => (
          <circle key={i} cx={sx} cy={sy} r={i % 2 ? 1.6 : 2.4} fill="#fff" className="lx-twinkle" style={d(i * 0.4)} />
        ))}
        <circle cx="1060" cy="48" r="46" fill="url(#tb-moon)" />
        <circle cx="1046" cy="36" r="8" fill="#e6c36e" opacity="0.5" />
        <circle cx="1078" cy="62" r="6" fill="#e6c36e" opacity="0.45" />
        <circle cx="1060" cy="48" r="70" fill="#fff6c8" opacity="0.12" />
        <path d="M500 150 L590 100 L660 130 L760 85 L860 128 L940 96 L1040 135 L1120 104 L1300 140 L1300 170 L500 170Z" fill="#1d2466" />
        <path d="M500 160 L620 128 L720 150 L820 120 L960 152 L1080 126 L1300 158 L1300 170 L500 170Z" fill="#141a4d" />
        {/* pagoda */}
        <g transform="translate(1200 40)">
          <path d="M-70 40 Q0 18 70 40 L56 46 L-56 46Z" fill="#c0181c" stroke="#5a0609" strokeWidth="2" />
          <rect x="-44" y="46" width="88" height="22" fill="#e83a2a" />
          {[-32, -14, 4, 22].map((wx) => (
            <rect key={wx} x={wx} y="50" width="10" height="13" fill="#ffd36a" className="lx-glow" />
          ))}
          <path d="M-86 74 Q0 50 86 74 L70 82 L-70 82Z" fill="#c0181c" stroke="#5a0609" strokeWidth="2" />
          <rect x="-58" y="82" width="116" height="30" fill="#e83a2a" />
          {[-46, -26, -6, 14, 34].map((wx) => (
            <rect key={wx} x={wx} y="88" width="12" height="16" fill="#ffd36a" />
          ))}
          <path d="M-20 18 Q0 4 20 18 L0 0Z" fill="#c0181c" />
          <rect x="-26" y="18" width="52" height="22" fill="#e83a2a" />
        </g>
        <rect x="490" y="-10" width="820" height="180" fill="none" stroke="#3a0204" strokeWidth="22" />
        <rect x="500" y="-10" width="800" height="170" fill="none" stroke="#c98a12" strokeWidth="4" />
      </g>

      {/* lantern */}
      <g transform="translate(552 0)">
        <circle cx="0" cy="70" r="90" fill="url(#tb-glow)" className="lx-breathe" />
        <g className="tb-swing">
          <line x1="0" y1="0" x2="0" y2="18" stroke="#3a0204" strokeWidth="3" />
          <rect x="-16" y="16" width="32" height="10" rx="3" fill="#e0a21a" stroke="#7a4a00" strokeWidth="2" />
          <ellipse cx="0" cy="66" rx="38" ry="44" fill="url(#tb-lantern)" stroke="#7a0a0a" strokeWidth="3" />
          {[-24, -10, 10, 24].map((lx) => (
            <path key={lx} d={`M${lx * 0.4} 24 Q${lx} 66 ${lx * 0.4} 108`} stroke="#7a0a0a" strokeWidth="2" fill="none" opacity="0.6" />
          ))}
          <rect x="-16" y="106" width="32" height="10" rx="3" fill="#e0a21a" stroke="#7a4a00" strokeWidth="2" />
          {[-8, -3, 2, 7].map((tx) => (
            <line key={tx} x1={tx} y1="116" x2={tx} y2="150" stroke="#e0a21a" strokeWidth="2.5" />
          ))}
          <text x="0" y="74" textAnchor="middle" fontSize="20" fontWeight="900" fill="#ffe08a" opacity="0.85">
            福
          </text>
        </g>
      </g>

      {/* bamboo */}
      <BambooLeaves x={60} y={70} />
      <BambooLeaves x={1550} y={90} flip />
      <BambooLeaves x={1580} y={330} flip />

      {/* cherry blossom branches */}
      <Branch path="M-10 140 C 80 120 140 160 230 110 S 330 70 380 20" flowers={[[90, 128, 16], [150, 150, 13], [190, 120, 18], [250, 100, 14], [300, 70, 16], [350, 40, 13], [40, 200, 15], [120, 230, 12], [210, 60, 12]]} />
      <Branch path="M600 0 C 640 30 700 20 760 40" flowers={[[630, 20, 14], [690, 32, 16], [740, 30, 13], [605, 60, 12]]} />
      <Branch path="M-10 760 C 40 740 90 760 120 720" flowers={[[40, 720, 22], [90, 760, 18], [20, 820, 24], [130, 830, 16], [80, 880, 20], [160, 880, 14]]} />

      {/* falling petals */}
      {[[200, 300], [330, 520], [1400, 250], [1480, 600], [260, 690], [1350, 760]].map(([px, py], i) => (
        <ellipse key={i} cx={px} cy={py} rx="7" ry="4" fill="#ffb3c8" className="tb-petal" style={d(i * 1.3)} />
      ))}

      {/* floor */}
      <rect x="0" y="820" width="1600" height="80" fill="#3a0204" opacity="0.5" />
    </svg>
  );
}

/** The oval table: red rail with a gold trim and ornaments, green felt. */
export function PokerTable() {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 1600 900" width="1600" height="900" className="absolute inset-0" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}rail`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e2343a" />
          <stop offset="0.5" stopColor="#b3141b" />
          <stop offset="1" stopColor="#6e080c" />
        </linearGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="0.45" stopColor="#ffc531" />
          <stop offset="1" stopColor="#b86500" />
        </linearGradient>
        <radialGradient id={`${id}felt`} cx="0.5" cy="0.45" r="0.65">
          <stop offset="0" stopColor="#21a447" />
          <stop offset="0.75" stopColor="#13802f" />
          <stop offset="1" stopColor="#0b5e22" />
        </radialGradient>
        <pattern id={`${id}grain`} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="transparent" />
          <circle cx="1" cy="1" r="0.7" fill="#000" opacity="0.06" />
          <circle cx="4" cy="4" r="0.7" fill="#fff" opacity="0.04" />
        </pattern>
      </defs>
      {/* skirt + shadow */}
      <ellipse cx="800" cy="860" rx="720" ry="60" fill="#000" opacity="0.35" />
      <rect x="110" y="300" width="1380" height="600" rx="300" fill="#5a0609" />
      {/* rail */}
      <rect x="95" y="128" width="1410" height="730" rx="365" fill={`url(#${id}rail)`} stroke="#4a0407" strokeWidth="4" />
      {/* gold trim */}
      <rect x="140" y="170" width="1320" height="580" rx="290" fill="none" stroke={`url(#${id}gold)`} strokeWidth="14" />
      <rect x="152" y="182" width="1296" height="556" rx="278" fill="#5a0609" />
      {/* felt */}
      <rect x="160" y="190" width="1280" height="540" rx="270" fill={`url(#${id}felt)`} />
      <rect x="160" y="190" width="1280" height="540" rx="270" fill={`url(#${id}grain)`} />
      <rect x="190" y="215" width="1220" height="490" rx="245" fill="none" stroke="#5be07a" strokeOpacity="0.35" strokeWidth="3" />
      <rect x="160" y="190" width="1280" height="540" rx="270" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="10" />
      {/* ornaments on the rail */}
      {[
        [330, 165, 0],
        [1270, 165, 180],
        [300, 760, 180],
        [1300, 760, 0],
      ].map(([ox, oy, r], i) => (
        <g key={i} transform={`translate(${ox} ${oy}) rotate(${r})`}>
          <path d="M-40 0 q 10 -14 22 0 q 10 14 22 0 q 10 -14 22 0 q 10 14 16 0" stroke={`url(#${id}gold)`} strokeWidth="5" fill="none" strokeLinecap="round" />
          <circle cx="0" cy="0" r="5" fill={`url(#${id}gold)`} />
        </g>
      ))}
    </svg>
  );
}

export type FaceKind = 'cap' | 'spiky' | 'shades' | 'beard';

/** Cartoon player portrait (original drawing) in four looks. */
export function Face({ kind, size = 104 }: { kind: FaceKind; size?: number }) {
  const id = useId().replace(/:/g, '');
  const hoodie = { cap: '#2f6fd6', spiky: '#d42a2a', shades: '#2b56b8', beard: '#d0302a' }[kind];
  const bg = { cap: ['#9fd6ff', '#4a9be8'], spiky: ['#a9d8ff', '#5a9ee0'], shades: ['#8ec8ff', '#3c86d8'], beard: ['#ffd3a8', '#e8915a'] }[kind];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bg[0]} />
          <stop offset="1" stopColor={bg[1]} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id}bg)`} />
      {/* body */}
      <path d="M14 100 C 16 78 30 70 50 70 C 70 70 84 78 86 100Z" fill={hoodie} />
      <path d="M40 72 L50 84 L60 72" fill="none" stroke="#fff" strokeWidth="2.5" />
      {kind === 'cap' && <path d="M24 82 C 26 70 34 66 38 74 M76 82 C 74 70 66 66 62 74" stroke="#ffcc22" strokeWidth="7" fill="none" strokeLinecap="round" />}
      {/* neck + head */}
      <rect x="43" y="60" width="14" height="12" fill="#eab48a" />
      <ellipse cx="27" cy="46" rx="5" ry="7" fill="#f2c39a" />
      <ellipse cx="73" cy="46" rx="5" ry="7" fill="#f2c39a" />
      <ellipse cx="50" cy="44" rx="23" ry="25" fill="#f8d0aa" />
      {/* hair / hats */}
      {kind === 'spiky' && <path d="M26 40 L24 24 L33 28 L34 16 L42 23 L48 12 L54 22 L62 14 L64 25 L74 22 L74 40 C 66 30 36 30 26 40Z" fill="#1f1a1a" />}
      {kind === 'beard' && (
        <>
          <path d="M27 38 C 26 20 40 16 50 17 C 62 16 75 22 73 38 C 66 28 36 28 27 38Z" fill="#5a3a22" />
          <path d="M28 48 C 28 72 40 78 50 78 C 60 78 72 72 72 48 C 68 60 60 60 50 60 C 40 60 32 60 28 48Z" fill="#5a3a22" />
        </>
      )}
      {kind === 'cap' && (
        <>
          <path d="M26 36 C 26 18 74 18 74 36 Z" fill="#ffffff" stroke="#c9d6ee" strokeWidth="1.5" />
          <path d="M26 36 C 26 22 50 18 50 18 L50 36Z" fill="#2f6fd6" />
          <path d="M22 36 Q 50 30 80 36 L 82 41 Q 50 35 20 41Z" fill="#1d4fae" />
          <circle cx="56" cy="27" r="5" fill="#e53935" stroke="#fff" strokeWidth="1.5" />
        </>
      )}
      {kind === 'shades' && (
        <>
          <path d="M25 36 C 25 16 75 16 75 36 Z" fill="#26324f" />
          <path d="M20 36 Q 50 30 80 36 L 80 41 Q 50 35 20 41Z" fill="#1a2238" />
          <path d="M28 24 Q 34 20 42 22" stroke="#e8a92a" strokeWidth="2" fill="none" />
        </>
      )}
      {/* face */}
      {kind === 'shades' ? (
        <g>
          <rect x="30" y="40" width="17" height="10" rx="4" fill="#111" />
          <rect x="53" y="40" width="17" height="10" rx="4" fill="#111" />
          <path d="M47 44 h6" stroke="#111" strokeWidth="2" />
          <path d="M33 42 l5 0" stroke="#fff" strokeWidth="1.5" opacity="0.7" />
        </g>
      ) : (
        <g>
          <path d="M33 39 q 6 -4 11 0 M56 39 q 6 -4 11 0" stroke={kind === 'beard' ? '#4a2c18' : '#2a1d14'} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <ellipse cx="39" cy="46" rx="3.6" ry="4.4" fill="#2a1d14" />
          <ellipse cx="61" cy="46" rx="3.6" ry="4.4" fill="#2a1d14" />
          <circle cx="40.3" cy="44.6" r="1.3" fill="#fff" />
          <circle cx="62.3" cy="44.6" r="1.3" fill="#fff" />
        </g>
      )}
      <ellipse cx="34" cy="54" rx="4" ry="2.4" fill="#ff9c8a" opacity="0.5" />
      <ellipse cx="66" cy="54" rx="4" ry="2.4" fill="#ff9c8a" opacity="0.5" />
      <path d="M41 56 Q 50 65 59 56 Q 50 60 41 56Z" fill="#8a1f1f" stroke="#5a1010" strokeWidth="1" />
      <path d="M43 57 Q 50 59 57 57" stroke="#fff" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

/** Casino chip with striped edge and its value. */
export function Chip({ value, color, size = 104 }: { value: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="53" r="46" fill="#000" opacity="0.3" />
      <circle cx="50" cy="50" r="46" fill={color} stroke="#fff" strokeWidth="2" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x="45" y="4" width="10" height="16" rx="2" fill="#fff" transform={`rotate(${i * 45} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="31" fill={color} stroke="#fff" strokeWidth="3" strokeDasharray="5 4" />
      <circle cx="50" cy="50" r="26" fill="#fff" opacity="0.12" />
      <path d="M22 34 Q 50 8 78 34" stroke="#fff" strokeWidth="5" fill="none" opacity="0.35" strokeLinecap="round" />
      <text x="50" y={value.length > 4 ? 58 : 61} textAnchor="middle" fontSize={value.length > 4 ? 20 : value.length > 3 ? 24 : 30} fontWeight="900" fill="#fff" stroke="#00000055" strokeWidth="1.2" paintOrder="stroke" fontFamily="inherit">
        {value}
      </text>
    </svg>
  );
}

/** Small crest: crown, laurels, "PUSOY" and a red "553" ribbon. */
export function MiniCrest() {
  const id = useId().replace(/:/g, '');
  return (
    <svg width="240" height="140" viewBox="0 0 240 140" className="overflow-visible" aria-label="Pusoy 553">
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff7c4" />
          <stop offset="0.5" stopColor="#ffc531" />
          <stop offset="1" stopColor="#b86500" />
        </linearGradient>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5a4a" />
          <stop offset="1" stopColor="#a10d0b" />
        </linearGradient>
      </defs>
      {[-1, 1].map((s) => (
        <g key={s} transform={`translate(${s < 0 ? 30 : 210} 112) scale(${s} 1)`} className="lx-sway">
          {[0, 1, 2, 3].map((i) => (
            <ellipse key={i} cx={-6 - i * 3} cy={-i * 22} rx="15" ry="7" transform={`rotate(${-60 + i * 16} ${-6 - i * 3} ${-i * 22})`} fill={`url(#${id}g)`} stroke="#9a5b03" strokeWidth="1.5" />
          ))}
        </g>
      ))}
      <g className="lx-bob">
        <path d="M96 30 L90 6 L106 18 L120 0 L134 18 L150 6 L144 30Z" fill={`url(#${id}g)`} stroke="#8a4a00" strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="120" cy="20" r="4" fill="#ff2d4d" />
      </g>
      <text x="120" y="72" textAnchor="middle" fontSize="44" fontWeight="900" fill={`url(#${id}g)`} stroke="#5a2600" strokeWidth="6" paintOrder="stroke" className="font-display">
        PUSOY
      </text>
      <path d="M58 82 Q120 72 182 82 L186 122 Q120 112 54 122Z" fill={`url(#${id}g)`} stroke="#7a3e00" strokeWidth="2.5" />
      <path d="M64 86 Q120 77 176 86 L178 116 Q120 107 62 116Z" fill={`url(#${id}r)`} />
      <text x="120" y="113" textAnchor="middle" fontSize="38" fontWeight="900" fill="#fff" stroke="#5a0606" strokeWidth="5" paintOrder="stroke" className="font-display">
        553
      </text>
    </svg>
  );
}

/** The 553 card back (the shared card design, components/CardArt.tsx) at a fixed size. */
export function CardBack553({ w = 70, h = 98 }: { w?: number; h?: number }) {
  return (
    <span className="relative block overflow-hidden rounded-[7%/5%] bg-[#5a0408] shadow-[0_2px_4px_rgb(0_0_0/0.35)]" style={{ width: w, height: h }} aria-hidden="true">
      <CardBackArt className="absolute inset-0 h-full w-full" />
    </span>
  );
}

/** Four-leaf clover for Declared Luck. */
export function Clover({ size = 64, sad = false }: { size?: number; sad?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}g`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor={sad ? '#b8c2b0' : '#a6ff7a'} />
          <stop offset="1" stopColor={sad ? '#5f6b58' : '#1f9a2e'} />
        </radialGradient>
      </defs>
      <path d="M32 34 Q 36 50 30 62" stroke={sad ? '#4a5444' : '#14702a'} strokeWidth="4" fill="none" strokeLinecap="round" />
      {[0, 90, 180, 270].map((a) => (
        <path key={a} d="M32 32 C 22 30 14 20 22 12 C 28 6 34 12 32 20 C 30 12 36 6 42 12 C 50 20 42 30 32 32Z" transform={`rotate(${a} 32 32) translate(0 -2)`} fill={`url(#${id}g)`} stroke={sad ? '#3a4236' : '#0f5a20'} strokeWidth="1.5" />
      ))}
      <circle cx="32" cy="32" r="3" fill={sad ? '#3a4236' : '#0f5a20'} />
      <path d="M24 18 q 4 -4 8 0" stroke="#fff" strokeWidth="1.5" fill="none" opacity="0.7" />
    </svg>
  );
}
