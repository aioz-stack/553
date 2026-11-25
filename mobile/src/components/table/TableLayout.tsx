'use client';

import type { ReactNode } from 'react';
import PlayingCard from '@/components/PlayingCard';

/**
 * The PUSOY 553 game table layout shared by Single Player and Multiplayer (1600×900 stage):
 *
 *   ┌ top-left controls · logo ─────────── Total · Bet / Covering ┐
 *   │                 [avatar] [ TOP hand panel ]          Round  │
 *   │ [avatar][ LEFT hand panel ]  PUSOY 553  [ RIGHT hand panel ][avatar]
 *   │                             ROUND X / 12                    │
 *   │                          ★ BANKER (YOU) ★                    │
 *   │               [ [avatar]  YOUR hand panel ]     Skip · Sort │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Display only: every card, label, result and banker flag passed in comes from the game engine (the
 * server); nothing here deals, ranks or scores. Opponents' cards are only ever drawn face down until
 * the engine reveals them.
 */

export type Lane = 'front' | 'middle' | 'back';
export const LANES: Lane[] = ['front', 'middle', 'back'];
const SIZES: Record<Lane, number> = { front: 3, middle: 5, back: 5 };

export type Spot = 'left' | 'top' | 'right' | 'bottom';

/** Stage positions of each seat's panel and avatar. */
export const SPOT: Record<Spot, { panel: { x: number; y: number; w: number; h: number }; avatar: { x: number; y: number } | null }> = {
  top: { panel: { x: 730, y: 106, w: 336, h: 212 }, avatar: { x: 590, y: 126 } },
  left: { panel: { x: 168, y: 322, w: 364, h: 228 }, avatar: { x: 20, y: 352 } },
  right: { panel: { x: 1068, y: 322, w: 364, h: 228 }, avatar: { x: 1444, y: 352 } },
  bottom: { panel: { x: 446, y: 590, w: 708, h: 284 }, avatar: null },
};

/** Card size in a panel: smaller for opponents, larger for you. */
const CARD: Record<'small' | 'large', { w: number; h: number; f: number; step: number }> = {
  small: { w: 38, h: 54, f: 13, step: 41 },
  large: { w: 54, h: 76, f: 18, step: 57 },
};

export function OutcomePill({ v }: { v: number }) {
  const [txt, cls] = v > 0 ? ['WIN', 'from-[#3fe06e] to-[#0f8a34] border-[#b8ffcb]'] : v < 0 ? ['LOSE', 'from-[#ff5a6e] to-[#b3121a] border-[#ffc2c8]'] : ['TIE', 'from-[#9a9aa6] to-[#5a5a66] border-white/60'];
  return <span className={`rounded-full border-2 bg-gradient-to-b px-3 py-[1px] font-display text-[14px] font-black leading-tight text-white shadow-[0_2px_0_rgb(0_0_0/0.35)] ${cls}`}>{txt}</span>;
}

export function RankPill({ text }: { text: string }) {
  return <span className="whitespace-nowrap rounded-full border-2 border-[#ffc531] bg-gradient-to-b from-[#2a1406] to-[#0d0602] px-2.5 py-[1px] font-display text-[14px] font-black leading-tight text-[#ffe14d]">{text}</span>;
}

/** What to draw in a hand panel's three rows. */
export type PanelCards =
  | { kind: 'empty' } // nothing dealt yet: faint slots
  | { kind: 'backs' } // dealt, still private: 3 / 5 / 5 card backs
  | { kind: 'rows'; rows: Record<Lane, string[]>; labels?: Record<Lane, string> | null; outcomes?: Record<Lane, number> | null; up?: (lane: Lane, i: number) => boolean; laneShown?: (lane: Lane) => boolean; hit?: Lane[] };

/** Three card rows (3 / 5 / 5), each with its hand ranking and result vs the banker. */
export function HandRows({ cards, size, label }: { cards: PanelCards; size: 'small' | 'large'; label: string }) {
  const c = CARD[size];
  return (
    <div className="flex flex-col" style={{ gap: size === 'large' ? 8 : 6 }} aria-label={label}>
      {LANES.map((lane) => {
        const n = SIZES[lane];
        const rows = cards.kind === 'rows' ? cards.rows[lane] ?? [] : [];
        const shown = cards.kind === 'rows' && (!cards.laneShown || cards.laneShown(lane));
        return (
          <div key={lane} className="flex items-center gap-2">
            <div className={`relative shrink-0 ${cards.kind === 'rows' && cards.hit?.includes(lane) ? 'rv-hit' : ''}`} style={{ width: c.w + c.step * (n - 1), height: c.h }}>
              {Array.from({ length: n }, (_, i) => {
                const code = rows[i];
                const style = { width: c.w, height: c.h, fontSize: c.f };
                return (
                  <span key={code ?? i} className="absolute top-0 [perspective:600px]" style={{ left: i * c.step, width: c.w, height: c.h }}>
                    {cards.kind === 'empty' || (cards.kind === 'rows' && !code) ? (
                      <span className="block h-full w-full rounded-[6px] border-2 border-dashed border-white/20 bg-black/15" />
                    ) : cards.kind === 'backs' ? (
                      <PlayingCard faceDown style={style} />
                    ) : (
                      // Two-sided card: it turns face up at its moment of the reveal show.
                      <span className="rv-card relative block h-full w-full" style={{ transform: !cards.up || cards.up(lane, i) ? 'none' : 'rotateY(180deg)' }}>
                        <span className="absolute inset-0 [backface-visibility:hidden]">
                          <PlayingCard code={code} style={style} />
                        </span>
                        {cards.up && (
                          <span className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                            <PlayingCard faceDown style={style} />
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            <span className={`flex min-w-0 flex-col items-center gap-1 ${shown ? '' : 'invisible'}`}>
              {cards.kind === 'rows' && cards.labels?.[lane] && <RankPill text={cards.labels[lane]} />}
              {cards.kind === 'rows' && cards.outcomes && <OutcomePill v={cards.outcomes[lane]} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A gold crown (small banker mark). */
export function CrownMark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="-12 -13 24 18" width={size} height={size * 0.75} aria-hidden="true">
      <defs>
        <linearGradient id="tl-crown" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff4b8" />
          <stop offset="0.5" stopColor="#f2c64a" />
          <stop offset="1" stopColor="#b07a0e" />
        </linearGradient>
      </defs>
      <path d="M-9 0 L-10 -9 L-5 -4.5 L0 -11 L5 -4.5 L10 -9 L9 0Z" fill="url(#tl-crown)" stroke="#6a3a00" strokeWidth="0.8" strokeLinejoin="round" />
      <rect x="-9.4" y="-0.4" width="18.8" height="3" rx="1" fill="url(#tl-crown)" stroke="#6a3a00" strokeWidth="0.6" />
      <circle cx="0" cy="-11" r="1.5" fill="#fff3b0" />
      <circle cx="-10" cy="-9" r="1.2" fill="#fff3b0" />
      <circle cx="10" cy="-9" r="1.2" fill="#fff3b0" />
    </svg>
  );
}

/** Gold laurel branch (left; mirror with `flip`). */
function Laurel({ flip = false, size = 64 }: { flip?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M34 36 C18 34 8 24 6 6" fill="none" stroke="#d9a441" strokeWidth="1.6" strokeLinecap="round" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t = i / 5;
        const x = 34 - 28 * t - 4 * Math.sin(t * Math.PI);
        const y = 36 - 30 * t;
        return (
          <g key={i}>
            <ellipse cx={Math.round((x - 4) * 10) / 10} cy={y} rx="4.2" ry="1.8" fill="#f2c64a" stroke="#8a5a0a" strokeWidth="0.4" transform={`rotate(${-30 - i * 8} ${Math.round((x - 4) * 10) / 10} ${y})`} />
            <ellipse cx={Math.round((x + 3) * 10) / 10} cy={y - 3} rx="4.2" ry="1.8" fill="#ffd968" stroke="#8a5a0a" strokeWidth="0.4" transform={`rotate(${40 - i * 6} ${Math.round((x + 3) * 10) / 10} ${y - 3})`} />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One seat: its avatar (beside the panel, or inside it for you), name and status, and the gold
 * panel with its three card rows. The banker's panel glows gold with a BANKER tag (or the large
 * BANKER (YOU) ribbon for you, drawn by BankerRibbon).
 */
export function HandPanel({
  spot,
  name,
  avatar,
  status,
  banker = false,
  offline = false,
  glow = false,
  cards,
  extra,
  children,
  label,
}: {
  spot: Spot;
  name: string;
  /** The avatar picture (already sized; 116 px beside a panel, 150 px inside yours). */
  avatar: ReactNode;
  status?: ReactNode;
  banker?: boolean;
  offline?: boolean;
  glow?: boolean;
  /** The three rows; omit to show `children` instead (your panel while betting / arranging). */
  cards?: PanelCards;
  /** A badge under the rows (Lucky Hand, Misplaced…). */
  extra?: ReactNode;
  children?: ReactNode;
  /** Accessible name of the seat (defaults to the name with banker / offline marks). */
  label?: string;
}) {
  const s = SPOT[spot];
  const you = spot === 'bottom';
  const seatLabel = label ?? `${name}${banker ? ' (banker)' : ''}${offline ? ' (offline)' : ''}`;
  const frame = banker ? 'border-[#ffd34d] shadow-[0_0_28px_rgb(255_200_60/0.75),0_8px_0_#3a1600]' : 'border-[#d9a441]/80 shadow-[0_8px_0_rgb(0_0_0/0.35)]';

  const avatarTile = (
    <div className={`relative rounded-[18px] p-[5px] ${banker ? 'bg-gradient-to-b from-[#fff3a0] to-[#e08a00] shadow-[0_0_24px_rgb(255_200_60/0.9)]' : 'lx-gold shadow-[0_6px_0_#7a3e00]'} ${glow ? 'tb-winner' : ''} ${offline ? 'grayscale' : ''}`}>
      <div className="overflow-hidden rounded-[13px] border-2 border-white/70">{avatar}</div>
      {offline && <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[#3a0d14] px-2 font-display text-[13px] font-black text-[#ffb3bd]">OFFLINE</span>}
    </div>
  );

  return (
    <>
      {/* Avatar, name and status beside the panel (opponents). */}
      {s.avatar && (
        <div className="absolute z-10 flex w-[132px] flex-col items-center" style={{ left: s.avatar.x, top: s.avatar.y }} aria-label={seatLabel}>
          {banker && (
            <span className="mb-1 flex items-center gap-1 rounded-full border-2 border-[#fff3a0] bg-gradient-to-b from-[#ffd34d] to-[#e08a00] px-2.5 font-display text-[15px] font-black text-[#4a1d00] shadow-[0_3px_0_#7a3e00]">
              <CrownMark size={18} /> BANKER
            </span>
          )}
          {avatarTile}
          <span className="mt-1 max-w-[150px] truncate rounded-full border-2 border-[#d9a441]/70 bg-gradient-to-b from-[#3a0a0c] to-[#1a0304] px-3 py-0.5 font-display text-[18px] font-black text-white">{name}</span>
          {status && <span className="mt-0.5 whitespace-nowrap font-display text-[17px] font-black drop-shadow-[0_2px_0_rgb(0_0_0/0.6)]">{status}</span>}
        </div>
      )}

      <div
        className={`absolute z-[6] rounded-[26px] border-[3px] ${frame} ${you ? 'bg-gradient-to-b from-[#6e0b10]/95 to-[#2a0305]/95' : 'bg-gradient-to-b from-[#0f4a2c]/90 to-[#082a19]/90'} ${glow && !s.avatar ? 'tb-winner' : ''}`}
        style={{ left: s.panel.x, top: s.panel.y, width: s.panel.w, height: s.panel.h }}
        aria-label={you ? seatLabel : undefined}
      >
        <div className={`flex h-full items-center ${you ? 'gap-4 px-5' : 'justify-center px-3'}`}>
          {/* Your avatar sits inside your panel. */}
          {!s.avatar && (
            <div className="flex shrink-0 flex-col items-center">
              {avatarTile}
              <span className="mt-1 max-w-[170px] truncate font-display text-[18px] font-black text-white">{name}</span>
              {status && <span className="whitespace-nowrap font-display text-[16px] font-black">{status}</span>}
            </div>
          )}
          {cards ? (
            <div className="flex flex-col items-start gap-1">
              <HandRows cards={cards} size={you ? 'large' : 'small'} label={you ? 'Your hand' : `${name}'s hand`} />
              {extra}
            </div>
          ) : (
            <div className="min-w-0 flex-1">{children}</div>
          )}
        </div>
      </div>
    </>
  );
}

/** The ribbon over your panel when you are the banker: ★ BANKER (YOU) ★ with a crown and laurels. */
export function BankerRibbon() {
  return (
    <div className="pointer-events-none absolute left-[618px] top-[528px] z-[7] flex w-[364px] items-end justify-center" aria-label="Banker (you)">
      <Laurel size={58} />
      <div className="relative -mx-2 flex flex-col items-center">
        <span className="absolute -top-[26px]">
          <CrownMark size={44} />
        </span>
        <span className="rounded-[14px] border-[3px] border-[#ffd34d] bg-gradient-to-b from-[#e3283c] to-[#7c0612] px-6 py-1 font-display text-[28px] font-black tracking-wide text-white shadow-[0_0_22px_rgb(255_200_60/0.7),0_5px_0_#4a0408]">BANKER (YOU)</span>
      </div>
      <Laurel size={58} flip />
    </div>
  );
}

/** The centre of the felt: the PUSOY 553 crest with laurels and the ROUND X / 12 badge (animated on change). */
export function TableCrest({ round, total, status }: { round: number; total: number; status?: ReactNode }) {
  return (
    <div className="pointer-events-none absolute left-[560px] top-[318px] z-[4] flex w-[480px] flex-col items-center">
      <div className="flex items-center">
        <Laurel size={72} />
        <div className="relative flex flex-col items-center">
          <span className="absolute -top-[30px]">
            <CrownMark size={50} />
          </span>
          <span className="bg-gradient-to-b from-[#fff4b8] via-[#f2c64a] to-[#b07a0e] bg-clip-text font-display text-[56px] font-black leading-none text-transparent drop-shadow-[0_3px_0_#5a2a00]">PUSOY</span>
          <span className="-mt-1 rounded-[10px] border-[3px] border-[#ffd34d] bg-gradient-to-b from-[#1f8a4a] to-[#0b4a26] px-5 font-display text-[34px] font-black leading-tight text-white shadow-[0_4px_0_#06301a]">553</span>
        </div>
        <Laurel size={72} flip />
      </div>
      <div key={`${round}/${total}`} className="sp-pop mt-2 flex items-center gap-2" aria-label="Round indicator">
        <span className="h-[3px] w-10 rounded-full bg-gradient-to-r from-transparent to-[#ffd34d]" />
        <span className="rounded-full border-[3px] border-[#ffd34d] bg-gradient-to-b from-[#a3101c] to-[#4a0408] px-7 py-0.5 font-display text-[28px] font-black uppercase text-white shadow-[0_0_18px_rgb(255_200_60/0.55),0_4px_0_#2a0204]">
          Round <span className="text-[#ffe14d]">{Math.min(round, total)} / {total}</span>
        </span>
        <span className="h-[3px] w-10 rounded-full bg-gradient-to-l from-transparent to-[#ffd34d]" />
      </div>
      {status && <div className="mt-1.5 max-w-[470px] text-center">{status}</div>}
    </div>
  );
}
