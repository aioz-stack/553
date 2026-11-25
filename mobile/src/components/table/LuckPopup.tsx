'use client';

import { useEffect, useState, type ReactNode } from 'react';
import PlayingCard from '@/components/PlayingCard';
import { api } from '@/lib/api';
import type { GoldWallet } from '@/lib/gold';
import { play } from '@/lib/sound';
import GoldWalletHud from './GoldWalletHud';
import { CardBack553, Clover, MiniCrest } from './TableArt';
import { useCardDrag } from './useCardDrag';

type Lane = 'front' | 'middle' | 'back';
export type Rows = Record<Lane, string[]>;

interface Preview {
  labels: Record<Lane, string | null>;
  is_foul: boolean;
  order?: Record<Lane, boolean | null>;
}

const LANES: Lane[] = ['front', 'middle', 'back'];
const CARD = { w: 104, h: 140, f: 32 };
const fmt = (n: number) => n.toLocaleString('en-US');

function Fan({ count = 7, w = 62, h = 86, spread = 9 }: { count?: number; w?: number; h?: number; spread?: number }) {
  const mid = (count - 1) / 2;
  return (
    <div className="relative" style={{ width: w + count * 16, height: h + 24 }}>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="absolute bottom-0 origin-bottom drop-shadow-[0_3px_3px_rgb(0_0_0/0.4)]" style={{ left: i * 16, transform: `rotate(${(i - mid) * spread}deg)` }}>
          <CardBack553 w={w} h={h} />
        </span>
      ))}
    </div>
  );
}

/** An opponent's place: just its fan of face-down cards (no avatar or name plate). */
function BotSeat({ name, x }: { name: string; x: number }) {
  return (
    <div className="absolute top-[150px] flex w-[220px] justify-center" style={{ left: x }} aria-label={`${name}'s cards`}>
      <Fan />
    </div>
  );
}

function Mark({ ok }: { ok: boolean | null | undefined }) {
  if (ok === null || ok === undefined) return <span className="h-[60px] w-[60px]" />;
  return (
    <span aria-label={ok ? 'In order' : 'Out of order'} className={`flex h-[60px] w-[60px] items-center justify-center rounded-full border-[4px] border-white shadow-[0_4px_0_rgb(0_0_0/0.35)] ${ok ? 'bg-gradient-to-b from-[#7dff8a] to-[#13a344]' : 'bg-gradient-to-b from-[#ff6b6b] to-[#b3121a]'}`}>
      <svg viewBox="0 0 24 24" className="h-8 w-8" aria-hidden="true">
        {ok ? <path d="M5 12.5l4.5 4.5L19 7" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />}
      </svg>
    </span>
  );
}

const SIZE: Record<Lane, number> = { front: 3, middle: 5, back: 5 };

/** The 13 cards placed straight into the rows in the order they were dealt: 1-3 Front, 4-8 Middle, 9-13 Back. */
export function dealtRows(cards: string[]): Rows {
  return { front: cards.slice(0, 3), middle: cards.slice(3, 8), back: cards.slice(8, 13) };
}

const isFull = (r: Rows) => r.front.length === 3 && r.middle.length === 5 && r.back.length === 5;

/** Exchange two cards' places (same row: reorder; different rows: move each into the other's slot). */
function exchange(rows: Rows, a: string, b: string): Rows {
  const next: Rows = { front: [...rows.front], middle: [...rows.middle], back: [...rows.back] };
  const at = (c: string) => {
    for (const lane of LANES) {
      const i = next[lane].indexOf(c);
      if (i >= 0) return { lane, i };
    }
    return null;
  };
  const pa = at(a);
  const pb = at(b);
  if (!pa || !pb) return rows;
  next[pa.lane][pa.i] = b;
  next[pb.lane][pb.i] = a;
  return next;
}

/**
 * Manual card arrangement popup, shown right after the 13 cards are dealt
 * (1600×900 stage coordinates). There is no separate hand panel: your 13
 * cards sit directly in Front (3), Middle (5) and Back (5), placed in the
 * order they were dealt — nothing is sorted or arranged by strength. Each row
 * always holds exactly its 3 / 5 / 5, so moving a card means swapping it:
 *
 * - Tap a card to pick it up, then tap any other card to swap the two (across
 *   rows to move them, within a row to reorder). Tap it again to put it down.
 * - Or drag a card and drop it on another card.
 * - ⇅ swaps Middle and Back.
 *
 * Hand names and ✓ / ✗ order marks come from the server preview (Pusoy
 * rules). Nothing arranges your cards for you. SUBMIT sends your rows as
 * they are (a misplaced hand pays the 2× penalty). No close button, no portraits.
 */
export default function LuckPopup({
  gameId,
  cards,
  initial,
  tierName,
  bet,
  betLabel,
  wallet,
  seats,
  declaring,
  onDeclare,
  onSubmit,
  submitting = false,
  previewPath,
  hud,
  betText,
  onRowsChange,
}: {
  gameId: number;
  /** Your 13 cards in the order they were dealt. */
  cards: string[];
  /** Rows to start from (your own arrangement when reopened); otherwise the cards go in dealt order. */
  initial: Rows;
  tierName: string;
  bet: number;
  /** Replaces "Bet: N" (e.g. "Covering 450" when you are the banker). */
  betLabel?: string;
  /** Your Gold wallet (Total Amount), kept live by the page (useGoldWallet). */
  wallet?: GoldWallet | null;
  /** Opponents whose card fans sit left and right of your rows. */
  seats: { left: { name: string }; right: { name: string } };
  declaring: boolean;
  /** Declared Luck, with the rows as they are now (checked on your 13 cards; a false declaration costs 2× bet). */
  onDeclare: (rows: Rows) => void;
  /** SUBMIT: send these rows to the server (settles the round). */
  onSubmit: (rows: Rows) => void;
  submitting?: boolean;
  /** Live lane labels / order check: defaults to the Single Player preview (Multiplayer: /games/{id}/preview). */
  previewPath?: string;
  /** Replaces the Gold wallet HUD (Multiplayer shows your Chips). */
  hud?: ReactNode;
  /** Formats the bet line, e.g. "Bet: 10 Chips" (default "Bet: N"). */
  betText?: (bet: number) => string;
  /** Called with the new rows after every move you make (Multiplayer saves them on the server). */
  onRowsChange?: (rows: Rows) => void;
}) {
  const [rows, setRows] = useState<Rows>(() => (isFull(initial) ? initial : dealtRows(cards)));
  const [sel, setSel] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  // Drag a card like a real one and drop it on another card to swap the two (useCardDrag).
  const { bind, dragging, ghost, suppressClick } = useCardDrag({
    resolve: ({ card, clientX, clientY }) => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const target = (el?.closest('[data-card]') as HTMLElement | null)?.dataset.card;
      if (target && target !== card) return { moved: [target], commit: () => apply(exchange(rows, card, target)) };
      if (el?.closest('[data-zone]')) setHint('Drop it on a card to swap the two.');
      return null;
    },
  });

  useEffect(() => {
    let live = true;
    api<{ data: Preview }>(previewPath ?? `/practice/${gameId}/preview`, { method: 'POST', body: rows })
      .then((r) => live && setPreview(r.data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [rows, gameId, previewPath]);

  const apply = (next: Rows) => {
    setRows(next);
    onRowsChange?.(next);
    setSel(null);
    setHint(null);
    play('deal');
  };

  /** Tap a card: pick it up, put it down, or swap it with the card you are holding. */
  const tapCard = (c: string) => {
    if (suppressClick.current) return;
    if (sel === null) {
      play('tap');
      setSel(c);
      setHint('Now tap the card to swap it with (in any row).');
      return;
    }
    if (sel === c) {
      setSel(null);
      setHint(null);
      return;
    }
    apply(exchange(rows, sel, c));
  };

  /** Tapping a row (not a card): rows are always full, so explain how to move into it. */
  const tapRow = (lane: Lane) => {
    if (suppressClick.current || sel === null) return;
    setHint(`${lane[0].toUpperCase()}${lane.slice(1)} is full (${SIZE[lane]}/${SIZE[lane]}) — tap one of its cards to swap.`);
  };

  const card = (c: string) => (
    // stopPropagation: tapping a card must not also count as tapping the row behind it.
    // While a card is lifted its slot is empty (the lifted card is drawn by `ghost`).
    <span key={c} data-card={c} onPointerDown={bind(c)} onClick={(e) => e.stopPropagation()} className={`touch-none ${dragging === c ? 'opacity-0' : ''}`}>
      <PlayingCard code={c} selected={sel === c} onClick={() => tapCard(c)} style={{ width: CARD.w, height: CARD.h, fontSize: CARD.f }} />
    </span>
  );

  return (
    <div className="absolute inset-0 z-40" role="dialog" aria-modal="true" aria-label="Declared Luck">
      <div className="sp-fade absolute inset-0 bg-black/60" />
      <div className="sp-pop absolute left-[60px] top-[24px] h-[852px] w-[1480px]">
        <div className="lx-gold absolute inset-0 rounded-[48px] shadow-[0_14px_0_#7a3e00,0_30px_60px_rgb(0_0_0/0.6)]" />
        <div className="absolute inset-[12px] overflow-hidden rounded-[38px] bg-[radial-gradient(90%_80%_at_50%_45%,#1fa046,#0e6a2a_70%,#09481c)]">
          {/* red corner bands with a gold edge, like the table rail */}
          {[
            'left-[-120px] top-[-120px] rotate-45',
            'right-[-120px] top-[-120px] -rotate-45',
            'left-[-120px] bottom-[-120px] -rotate-45',
            'right-[-120px] bottom-[-120px] rotate-45',
          ].map((c) => (
            <span key={c} className={`absolute h-[240px] w-[340px] border-b-[8px] border-[#ffc531] bg-gradient-to-b from-[#b3141b] to-[#6e080c] ${c}`} />
          ))}
        </div>

        <div className="pointer-events-none absolute left-[18px] top-[6px] z-10">
          <MiniCrest />
        </div>

        {/* level + bet */}
        <div className="lx-gold absolute right-[130px] top-[26px] z-10 rounded-[22px] p-[4px]">
          <div className="flex items-center gap-3 rounded-[18px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-4 py-2">
            <span className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-white/90">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#5a0609]" aria-hidden="true">
                <circle cx="12" cy="8" r="4.5" fill="currentColor" />
                <path d="M3.5 21c1-5 4.5-7 8.5-7s7.5 2 8.5 7z" fill="currentColor" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-[24px] font-black text-white">{tierName}</span>
              <span className="font-display text-[22px] font-black text-[#ffe14d]">{betLabel ?? (betText ? betText(bet) : `Bet: ${fmt(bet)}`)}</span>
            </span>
          </div>
        </div>



        {/* the top bot's cards peeking behind the lanes */}
        <div className="absolute left-[560px] top-[8px]">
          <Fan count={8} w={58} h={80} spread={7} />
        </div>
        <BotSeat name={seats.left.name} x={80} />
        <BotSeat name={seats.right.name} x={1210} />

        {/* your 13 cards, directly in the three rows */}
        <div className="absolute left-[300px] top-[92px] z-10 flex flex-col gap-[12px]">
          {LANES.map((lane) => (
            <div key={lane} className="flex items-center gap-4">
              <span className="flex w-[150px] flex-col items-center gap-1">
                <Mark ok={preview?.order?.[lane]} />
                <span className="lx-gold rounded-[14px] p-[3px]">
                  <span className="flex flex-col items-center whitespace-nowrap rounded-[11px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-3 py-1 font-display font-black leading-tight text-white">
                    <span className="text-[18px]">
                      {lane.toUpperCase()} <span aria-label={`${lane} count`}>{rows[lane].length}/{SIZE[lane]}</span>
                    </span>
                    {preview?.labels[lane] && <span className="text-[16px] text-[#ffe14d]">{preview.labels[lane]}</span>}
                  </span>
                </span>
              </span>
              <div
                role="group"
                aria-label={`${lane} lane`}
                data-zone={lane}
                onClick={() => tapRow(lane)}
                className={`flex h-[164px] items-center gap-[8px] rounded-[18px] border-[4px] p-[8px] ${sel && !rows[lane].includes(sel) ? 'border-[#ffe14d] bg-[#ffe14d]/12 shadow-[0_0_26px_rgb(255_225_77/0.6)]' : 'border-[#5dff7a] bg-black/15 shadow-[0_0_24px_rgb(93_255_122/0.6)]'}`}
              >
                {rows[lane].map((c) => card(c))}
              </div>
            </div>
          ))}
        </div>

        <button type="button" aria-label="Swap Middle and Back" onClick={() => apply({ ...rows, middle: rows.back, back: rows.middle })} className="lx-tile absolute left-[1100px] top-[352px] z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b from-[#ff5a4a] to-[#a10d0b] text-white shadow-[0_6px_0_#5a0609]">
          <svg viewBox="0 0 30 40" className="h-10 w-8" aria-hidden="true">
            <path d="M8 4 L2 12 H6 V26 H10 V12 H14Z M22 36 L28 28 H24 V14 H20 V28 H16Z" fill="currentColor" />
          </svg>
        </button>

        <p className="absolute left-[300px] top-[634px] z-10 w-[760px] text-center font-display text-[18px] font-bold text-white/80" role="status">
          {hint ?? 'Tap a card, then tap another card to swap them — or drag one onto another.'}
        </p>

        {/* actions */}
        <div className="absolute left-[330px] top-[676px] z-10 flex items-center gap-6">
          <button
            type="button"
            onClick={() => onDeclare(rows)}
            disabled={declaring || submitting}
            className="lx-tile lx-gold relative h-[108px] w-[320px] rounded-full p-[6px] shadow-[0_8px_0_#7a3e00] disabled:opacity-70"
          >
            <span className="lx-gloss relative flex h-full w-full items-center gap-2 rounded-full bg-gradient-to-b from-[#a24dff] to-[#4a0f9a] pl-3 pr-5">
              <span className="tb-clover flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,#ff7ad9,#7a1fc9)] shadow-[0_0_20px_rgb(255_122_217/0.8)]">
                <Clover size={70} />
              </span>
              <span className="flex flex-col items-center leading-none">
                <span className="font-display text-[32px] font-black text-white drop-shadow-[0_2px_0_#2a0660]">{declaring ? 'Checking…' : 'Declared'}</span>
                {!declaring && <span className="font-display text-[36px] font-black text-[#ffe14d] drop-shadow-[0_2px_0_#2a0660]">Luck</span>}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              play('tap');
              onSubmit(rows);
            }}
            disabled={declaring || submitting}
            className="lx-tile lx-gold h-[108px] w-[380px] rounded-full p-[6px] shadow-[0_8px_0_#7a3e00]"
          >
            <span className="lx-gloss relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-[#fff3a0] via-[#ffd13a] to-[#e08a00] font-display text-[58px] font-black text-[#4a1d00]">{submitting ? '…' : 'SUBMIT'}</span>
          </button>
        </div>

        {/* Your Gold wallet: Total Amount, updated live while you arrange */}
        {hud ?? <GoldWalletHud wallet={wallet ?? null} className="absolute left-[1080px] top-[668px] z-10" />}

        {/* decorative 553 chips */}
        <svg width="230" height="170" viewBox="0 0 230 170" className="pointer-events-none absolute bottom-[10px] left-[10px]" aria-hidden="true">
          {[
            [70, 100, -12],
            [150, 120, 10],
          ].map(([cx, cy, r], i) => (
            <g key={i} transform={`translate(${cx} ${cy}) rotate(${r})`}>
              <ellipse cx="0" cy="14" rx="66" ry="40" fill="#7a0a0e" />
              <ellipse cx="0" cy="0" rx="66" ry="40" fill="#e0262f" stroke="#ffd34d" strokeWidth="5" />
              {Array.from({ length: 8 }, (_, k) => (
                <rect key={k} x="-6" y="-40" width="12" height="12" fill="#ffe9a8" transform={`rotate(${k * 45}) scale(1 0.6)`} />
              ))}
              <ellipse cx="0" cy="0" rx="42" ry="25" fill="none" stroke="#fff" strokeWidth="2.5" strokeDasharray="5 4" />
              <text x="0" y="9" textAnchor="middle" fontSize="28" fontWeight="900" fill="#fff" transform="scale(1 0.8)">
                553
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* the card you are dragging, same size as in its row */}
      {ghost}
    </div>
  );
}
