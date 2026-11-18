'use client';

import { useEffect, useState } from 'react';
import { GoldCoins } from '@/components/HomeArt';
import PlayingCard from '@/components/PlayingCard';
import { api } from '@/lib/api';
import { play } from '@/lib/sound';
import { CardBack553, Clover, MiniCrest } from './TableArt';

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

/**
 * Card arrangement popup shown right after the 13 cards are dealt (1600×900
 * stage coordinates). Shows the hand in three lanes (tap two cards to swap
 * them; ⇅ swaps Middle and Back), hand names with ✓ / ✗ order marks from the
 * server preview, the Declared Luck button (the server checks the dealt cards
 * for Six Pairs / Three Flushes / Three Straights) and SUBMIT (sends these
 * lanes to the server; a misplaced hand pays the 2× penalty). There is no
 * close button and no player portraits — only the opponents' card fans.
 */
export default function LuckPopup({
  gameId,
  initial,
  tierName,
  bet,
  betLabel,
  gold,
  seats,
  declaring,
  onDeclare,
  onSubmit,
  submitting = false,

}: {
  gameId: number;
  initial: Rows;
  tierName: string;
  bet: number;
  /** Replaces "Bet: N" (e.g. "Covering 450" when you are the banker). */
  betLabel?: string;
  gold?: number;
  /** Opponents whose card fans sit left and right of your lanes. */
  seats: { left: { name: string }; right: { name: string } };
  declaring: boolean;
  onDeclare: () => void;
  /** SUBMIT: send these lanes to the server (settles the round). */
  onSubmit: (rows: Rows) => void;
  submitting?: boolean;

}) {
  const [rows, setRows] = useState<Rows>(initial);
  const [picked, setPicked] = useState<{ lane: Lane; i: number } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    let live = true;
    api<{ data: Preview }>(`/practice/${gameId}/preview`, { method: 'POST', body: rows })
      .then((r) => live && setPreview(r.data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [rows, gameId]);

  const tap = (lane: Lane, i: number) => {
    play('tap');
    if (!picked) {
      setPicked({ lane, i });
      return;
    }
    if (picked.lane === lane && picked.i === i) {
      setPicked(null);
      return;
    }
    setRows((r) => {
      const next: Rows = { front: [...r.front], middle: [...r.middle], back: [...r.back] };
      const a = next[picked.lane][picked.i];
      next[picked.lane][picked.i] = next[lane][i];
      next[lane][i] = a;
      return next;
    });
    setPicked(null);
  };

  const swap = () => {
    play('deal');
    setPicked(null);
    setRows((r) => ({ ...r, middle: r.back, back: r.middle }));
  };

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
              <span className="font-display text-[22px] font-black text-[#ffe14d]">{betLabel ?? `Bet: ${fmt(bet)}`}</span>
            </span>
          </div>
        </div>



        {/* the top bot's cards peeking behind the lanes */}
        <div className="absolute left-[560px] top-[8px]">
          <Fan count={8} w={58} h={80} spread={7} />
        </div>
        <BotSeat name={seats.left.name} x={80} />
        <BotSeat name={seats.right.name} x={1210} />

        {/* lanes */}
        <div className="absolute left-[330px] top-[96px] z-10 flex flex-col gap-[14px]">
          {LANES.map((lane) => (
            <div key={lane} className="flex items-center gap-4">
              <span className="flex w-[150px] flex-col items-center gap-1">
                <Mark ok={preview?.order?.[lane]} />
                <span className="lx-gold rounded-[14px] p-[3px]">
                  <span className="block whitespace-nowrap rounded-[11px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-3 py-1 font-display text-[20px] font-black text-white">{preview?.labels[lane] ?? lane.toUpperCase()}</span>
                </span>
              </span>
              <div aria-label={`${lane} lane`} className="flex gap-[10px] rounded-[18px] border-[4px] border-[#5dff7a] bg-black/15 p-[8px] shadow-[0_0_24px_rgb(93_255_122/0.6)]">
                {rows[lane].map((c, i) => (
                  <PlayingCard key={c} code={c} selected={picked?.lane === lane && picked.i === i} onClick={() => tap(lane, i)} style={{ width: CARD.w, height: CARD.h, fontSize: CARD.f }} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <button type="button" aria-label="Swap Middle and Back" onClick={swap} className="lx-tile absolute left-[1100px] top-[352px] z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full border-[5px] border-[#ffc531] bg-gradient-to-b from-[#ff5a4a] to-[#a10d0b] text-white shadow-[0_6px_0_#5a0609]">
          <svg viewBox="0 0 30 40" className="h-10 w-8" aria-hidden="true">
            <path d="M8 4 L2 12 H6 V26 H10 V12 H14Z M22 36 L28 28 H24 V14 H20 V28 H16Z" fill="currentColor" />
          </svg>
        </button>

        {/* actions */}
        <div className="absolute left-[400px] top-[640px] z-10 flex items-center gap-6">
          <button
            type="button"
            onClick={onDeclare}
            disabled={declaring}
            className="lx-tile lx-gold relative h-[112px] w-[330px] rounded-full p-[6px] shadow-[0_8px_0_#7a3e00] disabled:opacity-70"
          >
            <span className="lx-gloss relative flex h-full w-full items-center gap-2 rounded-full bg-gradient-to-b from-[#a24dff] to-[#4a0f9a] pl-3 pr-5">
              <span className="tb-clover flex h-[90px] w-[90px] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,#ff7ad9,#7a1fc9)] shadow-[0_0_20px_rgb(255_122_217/0.8)]">
                <Clover size={74} />
              </span>
              <span className="flex flex-col items-center leading-none">
                <span className="font-display text-[34px] font-black text-white drop-shadow-[0_2px_0_#2a0660]">{declaring ? 'Checking…' : 'Declared'}</span>
                {!declaring && <span className="font-display text-[38px] font-black text-[#ffe14d] drop-shadow-[0_2px_0_#2a0660]">Luck</span>}
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
            className="lx-tile lx-gold h-[112px] w-[400px] rounded-full p-[6px] shadow-[0_8px_0_#7a3e00]"
          >
            <span className="lx-gloss relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-b from-[#fff3a0] via-[#ffd13a] to-[#e08a00] font-display text-[60px] font-black text-[#4a1d00]">{submitting ? '…' : 'SUBMIT'}</span>
          </button>
        </div>

        {/* gold balance */}
        <div className="lx-gold absolute left-[580px] top-[774px] z-10 h-[60px] w-[320px] rounded-full p-[4px]">
          <div className="flex h-full items-center gap-3 rounded-full bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-3">
            <GoldCoins size={50} />
            <span className="flex-1 text-center font-display text-[32px] font-black text-white" aria-label="Gold balance">
              {gold !== undefined ? fmt(gold) : '…'}
            </span>
          </div>
        </div>

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
    </div>
  );
}
