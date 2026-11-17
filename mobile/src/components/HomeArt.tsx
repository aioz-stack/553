/**
 * Original illustrations for the landscape home (SVG, no image assets):
 * glossy candy titles, the logo crest, the Round Bank cards-and-coins art,
 * the Banker Mode crown on a cushion, and the large control icons. Parts are
 * animated with the lx-* classes in globals.css (off with reduced motion).
 */

import { useId, type CSSProperties, type ReactNode } from 'react';
import { useMotion } from '@/lib/motion';

/** True when motion is reduced (device setting or the in-app Motion choice); SMIL is not covered by CSS. */
export function useReducedMotion(): boolean {
  return useMotion()[1];
}

import { Glitter } from './Sparkles';

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

/** Bubbly title text: gold gradient, thick outline, drop shadow and a glossy top highlight. */
export function CandyText({ text, width, height, size, stroke = '#6b2300', className = '', fill = ['#fffbe0', '#ffe14d', '#ffa514'], sweepDelay = 0 }: { text: string; width: number; height: number; size: number; stroke?: string; className?: string; fill?: [string, string, string]; sweepDelay?: number }) {
  const id = `candy${useId().replace(/:/g, '')}`;
  const reduced = useReducedMotion();
  const y = height / 2 + size * 0.36;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={fill[0]} />
          <stop offset="0.5" stopColor={fill[1]} />
          <stop offset="1" stopColor={fill[2]} />
        </linearGradient>
        <linearGradient id={`${id}-sw`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={width * 0.35} y2={height * 0.4}>
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
          {!reduced && <animateTransform attributeName="gradientTransform" type="translate" values={`${-width * 0.5} 0; ${width * 1.3} 0; ${width * 1.3} 0`} keyTimes="0; 0.45; 1" dur="4.5s" begin={`${sweepDelay}s`} repeatCount="indefinite" />}
        </linearGradient>
        <linearGradient id={`${id}-hl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="font-display" fontWeight={900} fontSize={size} textAnchor="middle">
        <text x={width / 2} y={y + 7} fill="#3d1200" opacity="0.5">
          {text}
        </text>
        <text x={width / 2} y={y} fill={`url(#${id})`} stroke={stroke} strokeWidth={size * 0.16} strokeLinejoin="round" paintOrder="stroke fill">
          {text}
        </text>
        <text x={width / 2} y={y} fill={`url(#${id}-hl)`}>
          {text}
        </text>
        {!reduced && (
          <text x={width / 2} y={y} fill={`url(#${id}-sw)`}>
            {text}
          </text>
        )}
      </g>
    </svg>
  );
}

/** A glossy playing card; the inner group bobs gently (staggered by `d`). */
function Card({ x, y, r, rank, suit, red, d = 0 }: { x: number; y: number; r: number; rank: string; suit: string; red?: boolean; d?: number }) {
  const color = red ? '#e3172c' : '#141414';
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <g className="lx-bob" style={delay(d)}>
        <rect x="-62" y="-88" width="124" height="176" rx="14" fill="url(#card-face)" stroke="#d8b25a" strokeWidth="4" />
        <rect x="-54" y="-80" width="108" height="160" rx="10" fill="none" stroke="#f1e2bd" strokeWidth="2" />
        <text x="-40" y="-42" fontSize="42" fontWeight="900" fill={color} fontFamily="Georgia, serif">
          {rank}
        </text>
        <text x="-40" y="-6" fontSize="30" fill={color}>
          {suit}
        </text>
        <text x="10" y="64" fontSize="76" textAnchor="middle" fill={color}>
          {suit}
        </text>
        <path d="M-58 -84 h70 l-40 70 h-30z" fill="#fff" opacity="0.35" />
      </g>
    </g>
  );
}

function Laurel({ x, y, flip, s = 1, d = 0 }: { x: number; y: number; flip?: boolean; s?: number; d?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}>
      <g className="lx-sway" style={delay(d)}>
        <path d="M0 0 C-30 -40 -30 -110 10 -160" stroke="#c98a12" strokeWidth="8" fill="none" strokeLinecap="round" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} transform={`translate(${-16 - i} ${-22 - i * 30}) rotate(${-50 + i * 12})`}>
            <ellipse cx="-14" cy="0" rx="22" ry="10" fill="url(#gold-leaf)" stroke="#9a5b03" strokeWidth="2" />
            <ellipse cx="14" cy="-6" rx="20" ry="9" fill="url(#gold-leaf)" stroke="#9a5b03" strokeWidth="2" transform="rotate(60 14 -6)" />
            <ellipse cx="-18" cy="-3" rx="8" ry="3" fill="#fff" opacity="0.6" />
          </g>
        ))}
      </g>
    </g>
  );
}

function GoldDefs() {
  return (
    <defs>
      <linearGradient id="gold-leaf" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff7c4" />
        <stop offset="0.5" stopColor="#ffd13a" />
        <stop offset="1" stopColor="#e09000" />
      </linearGradient>
      <linearGradient id="gold-rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff7c4" />
        <stop offset="0.45" stopColor="#ffc531" />
        <stop offset="0.55" stopColor="#f0a800" />
        <stop offset="1" stopColor="#b86500" />
      </linearGradient>
      <radialGradient id="coin-face" cx="0.4" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#fffbe0" />
        <stop offset="0.5" stopColor="#ffd23a" />
        <stop offset="1" stopColor="#d58a00" />
      </radialGradient>
      <linearGradient id="card-face" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#f3ece0" />
      </linearGradient>
    </defs>
  );
}

function Sparkle({ x, y, s = 1, d = 0, color = '#fff' }: { x: number; y: number; s?: number; d?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className="lx-twinkle" style={delay(d)} d="M0 -18 L4 -4 L18 0 L4 4 L0 18 L-4 4 L-18 0 L-4 -4Z" fill={color} />
    </g>
  );
}

/** Logo crest: glossy red banner with a gold rim, swaying laurels and three bobbing cards. */
export function LogoCrest({ title }: { title: string }) {
  return (
    <div className="lx-bob-slow relative" style={{ width: 600, height: 250 }}>
      <svg width="600" height="250" viewBox="0 0 600 250" className="absolute inset-0 overflow-visible" aria-hidden="true">
        <GoldDefs />
        <defs>
          <linearGradient id="crest-red" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff8a4a" />
            <stop offset="0.5" stopColor="#f0441c" />
            <stop offset="1" stopColor="#b51a0b" />
          </linearGradient>
        </defs>
        <Laurel x={92} y={205} />
        <Laurel x={508} y={205} flip d={0.6} />
        <Card x={250} y={70} r={-14} rank="A" suit="♠" />
        <Card x={300} y={56} r={0} rank="A" suit="♥" red d={0.4} />
        <Card x={350} y={70} r={14} rank="A" suit="♥" red d={0.8} />
        <path d="M70 100 Q300 60 530 100 L540 190 Q300 170 300 232 Q300 170 60 190 Z" fill="url(#gold-rim)" stroke="#8a4a00" strokeWidth="5" />
        <path d="M86 112 Q300 76 514 112 L522 178 Q300 160 300 212 Q300 160 78 178 Z" fill="url(#crest-red)" />
        <path d="M100 118 Q300 86 500 118 L502 134 Q300 102 98 134Z" fill="#fff" opacity="0.35" />
        {[110, 490].map((cx) => (
          <circle key={cx} cx={cx} cy="150" r="9" fill="url(#gold-rim)" stroke="#8a4a00" strokeWidth="3" />
        ))}
        <Sparkle x={70} y={70} s={1.2} />
        <Sparkle x={540} y={60} s={0.9} d={1.1} />
        <Sparkle x={300} y={232} s={0.8} d={0.6} color="#fff6b0" />
      </svg>
      <CandyText text={title} width={560} height={120} size={84} className="absolute left-[20px] top-[90px]" />
      <Glitter count={8} seed={3} size={1.2} />
    </div>
  );
}

function CoinStack({ x, y, s = 1, d = 0 }: { x: number; y: number; s?: number; d?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="lx-coin" style={delay(d)}>
        <ellipse cx="0" cy="22" rx="62" ry="22" fill="#b06e00" />
        <rect x="-62" y="0" width="124" height="22" fill="#d58a00" />
        <path d="M-62 8 h124 M-62 15 h124" stroke="#f5b42a" strokeWidth="2" />
        <ellipse cx="0" cy="0" rx="62" ry="22" fill="url(#coin-face)" stroke="#a86400" strokeWidth="3" />
        <ellipse cx="-22" cy="-8" rx="22" ry="6" fill="#fff" opacity="0.55" />
        <path d="M0 -14 l5 10 11 1 -8 7 3 11 -11 -6 -11 6 3 -11 -8 -7 11 -1z" fill="#ffe680" stroke="#c47a00" strokeWidth="2" />
      </g>
    </g>
  );
}

/** Fanned aces on a pile of bouncing gold coins. */
export function RoundBankArt() {
  return (
    <svg width="440" height="250" viewBox="0 0 440 250" className="overflow-visible" aria-hidden="true">
      <GoldDefs />
      <Card x={140} y={110} r={-18} rank="A" suit="♠" />
      <Card x={220} y={92} r={0} rank="A" suit="♥" red d={0.5} />
      <Card x={300} y={110} r={18} rank="A" suit="♣" d={1} />
      <CoinStack x={90} y={205} s={0.9} />
      <CoinStack x={220} y={198} s={1.05} d={0.3} />
      <CoinStack x={350} y={205} s={0.9} d={0.6} />
      <CoinStack x={160} y={232} s={0.7} d={0.9} />
      <Sparkle x={60} y={60} s={1.3} />
      <Sparkle x={392} y={52} s={1} d={0.7} />
      <Sparkle x={372} y={150} s={0.7} d={1.4} />
      <Sparkle x={40} y={160} s={0.6} d={1.8} color="#fff6b0" />
    </svg>
  );
}

/** Gold crown (gently swaying, glinting ruby) on a red cushion between laurels. */
export function CrownArt() {
  return (
    <svg width="440" height="250" viewBox="0 0 440 250" className="overflow-visible" aria-hidden="true">
      <GoldDefs />
      <defs>
        <radialGradient id="cushion" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="1" stopColor="#a8101a" />
        </radialGradient>
        <linearGradient id="ruby" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc0c8" />
          <stop offset="0.5" stopColor="#ff2d4d" />
          <stop offset="1" stopColor="#a00a22" />
        </linearGradient>
      </defs>
      <Laurel x={70} y={230} s={0.95} />
      <Laurel x={370} y={230} s={0.95} flip d={0.7} />
      <ellipse cx="220" cy="200" rx="150" ry="44" fill="url(#cushion)" stroke="#7a0a12" strokeWidth="4" />
      <ellipse cx="190" cy="186" rx="70" ry="12" fill="#fff" opacity="0.25" />
      <path d="M90 212 q130 30 260 0" stroke="#ffd257" strokeWidth="5" fill="none" />
      <path d="M78 205 l-10 34 M362 205 l10 34" stroke="#ffd257" strokeWidth="6" strokeLinecap="round" />
      <g className="lx-sway" style={{ animationDuration: '3.4s' }}>
        <g className="lx-bob">
          <path d="M118 175 L104 60 L162 110 L220 34 L278 110 L336 60 L322 175 Z" fill="url(#gold-rim)" stroke="#8a4a00" strokeWidth="5" strokeLinejoin="round" />
          <path d="M126 168 L116 82 L162 120 L150 168Z" fill="#fff" opacity="0.35" />
          <rect x="114" y="160" width="212" height="28" rx="8" fill="url(#gold-rim)" stroke="#8a4a00" strokeWidth="4" />
          <g className="lx-glint lx-svg-part">
            <path d="M220 96 l20 30 -20 30 -20 -30z" fill="url(#ruby)" stroke="#7a0a12" strokeWidth="3" />
            <path d="M220 104 l8 14 -8 4z" fill="#fff" opacity="0.8" />
          </g>
          {[104, 162, 220, 278, 336].map((cx, i) => (
            <circle key={cx} cx={cx} cy={[60, 110, 34, 110, 60][i]} r="11" fill="url(#gold-rim)" stroke="#8a4a00" strokeWidth="3" />
          ))}
          <circle cx="150" cy="174" r="7" fill="#3fc1ff" />
          <circle cx="290" cy="174" r="7" fill="#3fc1ff" />
          <circle cx="220" cy="174" r="7" fill="#4ee36b" />
        </g>
      </g>
      <Sparkle x={380} y={70} s={1.1} />
      <Sparkle x={60} y={90} s={0.8} d={0.8} />
      <Sparkle x={230} y={20} s={0.9} d={1.5} color="#fff6b0" />
    </svg>
  );
}

function Shine({ children }: { children: ReactNode }) {
  return <g className="lx-glow">{children}</g>;
}

export function SpeakerArt({ on }: { on: boolean }) {
  return (
    <svg width="120" height="96" viewBox="0 0 120 96" className="overflow-visible" aria-hidden="true">
      <GoldDefs />
      <Shine>
        <path d="M10 34 h22 l30 -24 v76 l-30 -24 h-22 z" fill="url(#gold-rim)" stroke="#8a4a00" strokeWidth="5" strokeLinejoin="round" />
        <path d="M16 38 h14 l22 -18 v14z" fill="#fff" opacity="0.45" />
      </Shine>
      {on ? (
        <g fill="none" stroke="#ffd54a" strokeWidth="9" strokeLinecap="round">
          <path className="lx-wave" d="M78 30 q12 18 0 36" />
          <path className="lx-wave" style={delay(0.25)} d="M94 16 q24 32 0 64" />
        </g>
      ) : (
        <g stroke="#ff4d6a" strokeWidth="10" strokeLinecap="round">
          <path d="M80 30 l30 36 M110 30 l-30 36" />
        </g>
      )}
    </svg>
  );
}

export function GearArt() {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <svg width="110" height="100" viewBox="0 0 110 100" className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="gear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#5fb8ff" />
        </linearGradient>
      </defs>
      <g transform="translate(55 50)">
        <g className="lx-spin" stroke="#1a4f9c" strokeWidth="4" strokeLinejoin="round">
          {teeth.map((a) => (
            <rect key={a} x="-10" y="-48" width="20" height="22" rx="4" fill="url(#gear)" transform={`rotate(${a})`} />
          ))}
          <circle r="34" fill="url(#gear)" />
          <circle r="13" fill="#1f6fd1" />
        </g>
        <ellipse cx="-12" cy="-16" rx="14" ry="7" fill="#fff" opacity="0.7" />
      </g>
    </svg>
  );
}

export function ExitArt() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="exit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#ffc2d6" />
        </linearGradient>
      </defs>
      <path d="M18 10 h52 v24 h-14 v-10 h-24 v52 h24 v-10 h14 v24 h-52 z" fill="url(#exit)" stroke="#8a0e3d" strokeWidth="5" strokeLinejoin="round" />
      <g className="lx-nudge">
        <path d="M48 42 h36 v-16 l30 24 -30 24 v-16 h-36 z" fill="url(#exit)" stroke="#8a0e3d" strokeWidth="5" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
