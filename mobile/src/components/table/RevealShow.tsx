'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CandyText } from '@/components/HomeArt';
import { lightNow } from '@/lib/motion';
import { play } from '@/lib/sound';
import { dealOrder } from './DealAnimation';

/**
 * The round's reveal show (Single Player, 1600×900 stage coordinates), played
 * once after you submit and the server has settled the round:
 *
 *   ALL PLAYERS SUBMITTED → FRONT (cards flip one by one, every seat) → FRONT RESULT →
 *   MIDDLE → MIDDLE RESULT → BACK → BACK RESULT → special effects → final results.
 *
 * Special effects, from the server's settled result only:
 *  - PUSOY! — a seat that lost all three lanes: a cartoon bomb is thrown at it and explodes
 *    (smoke, sparks, debris, screen shake) with the 2× bet it pays.
 *  - ARAYYY KOOOO! — a misplaced (fouled) hand: lightning strikes the lanes that are out of order.
 *
 * Nothing here decides anything: the cards, hand names, lane results and Gold
 * all come from the settled round. The timeline is a pure function of it
 * (revealPlan) and plays on one clock (useRevealClock): each state change is a
 * timer at a known time, and every motion is a CSS transform/opacity animation.
 */

export type Lane = 'front' | 'middle' | 'back';
export const LANES: Lane[] = ['front', 'middle', 'back'];

export interface RevealSeat {
  seat: number;
  is_banker: boolean;
  bet: number;
  front?: string[];
  middle?: string[];
  back?: string[];
  is_foul?: boolean;
  /** Lanes vs the banker from this seat's side: 1 win, -1 loss (null for the banker / Lucky Hands). */
  lanes?: Record<Lane, number> | null;
  /** On a misplaced hand: the lanes out of order. */
  misplaced?: string[];
}

export type Fx = { kind: 'bomb' | 'zap'; seat: number; t: number; end: number; amount: number };

export interface RevealPlan {
  /** `${seat}:${lane}:${i}` → when that card turns face up. */
  flips: Record<string, number>;
  /** When each lane's revealing starts and when its result shows. */
  lanes: Record<Lane, { start: number; result: number }>;
  fx: Fx[];
  done: number;
}

export const REVEAL = { intro: 900, flipGap: 50, flip: 260, hold: 650, bomb: 2300, zap: 2200, tail: 300 };

/** Build the whole reveal timeline from the settled round. */
export function revealPlan(players: RevealSeat[], banker: number): RevealPlan {
  const by = new Map(players.map((p) => [p.seat, p]));
  const order = dealOrder(banker).filter((s) => by.has(s));
  const flips: Record<string, number> = {};
  const lanes = {} as RevealPlan['lanes'];
  let t = REVEAL.intro;

  for (const lane of LANES) {
    const start = t;
    for (const seat of order) {
      (by.get(seat)?.[lane] ?? []).forEach((_, i) => {
        flips[`${seat}:${lane}:${i}`] = t;
        t += REVEAL.flipGap;
      });
    }
    t += REVEAL.flip - REVEAL.flipGap;
    lanes[lane] = { start, result: t };
    t += REVEAL.hold;
  }

  // PUSOY! — lost all three lanes (a misplaced hand gets the lightning instead).
  const allLanes = (p: RevealSeat, v: number) => !!p.lanes && LANES.every((l) => p.lanes?.[l] === v);
  const players_ = players.filter((p) => !p.is_banker);
  const bankerSeat = players.find((p) => p.is_banker);
  const fx: Omit<Fx, 't' | 'end'>[] = [];
  for (const p of players_) {
    if (!p.is_foul && allLanes(p, -1)) fx.push({ kind: 'bomb', seat: p.seat, amount: 2 * p.bet });
  }
  if (bankerSeat && !bankerSeat.is_foul) {
    // The banker lost all three lanes to these players: one bomb, paying 2× each of their bets.
    const swept = players_.filter((p) => !p.is_foul && allLanes(p, 1));
    if (swept.length > 0) fx.push({ kind: 'bomb', seat: bankerSeat.seat, amount: swept.reduce((s, p) => s + 2 * p.bet, 0) });
  }
  // ARAYYY KOOOO! — misplaced hands.
  for (const p of players) {
    if (!p.is_foul) continue;
    const amount = p.is_banker ? players_.filter((q) => !q.is_foul).reduce((s, q) => s + 2 * q.bet, 0) : 2 * p.bet;
    fx.push({ kind: 'zap', seat: p.seat, amount });
  }

  const timed: Fx[] = [];
  for (const f of [...fx.filter((f) => f.kind === 'bomb'), ...fx.filter((f) => f.kind === 'zap')]) {
    const dur = f.kind === 'bomb' ? REVEAL.bomb : REVEAL.zap;
    timed.push({ ...f, t, end: t + dur });
    t += dur;
  }

  return { flips, lanes, fx: timed, done: t + REVEAL.tail };
}

/** The moments at which the reveal's picture changes. */
function moments(plan: RevealPlan): number[] {
  const set = new Set<number>([0, plan.done]);
  Object.values(plan.flips).forEach((t) => set.add(t));
  Object.values(plan.lanes).forEach((l) => {
    set.add(l.start);
    set.add(l.result);
  });
  plan.fx.forEach((f) => {
    set.add(f.t);
    set.add(f.end);
  });
  return [...set].sort((a, b) => a - b);
}

/**
 * Plays a plan: returns the reveal clock (ms since it started, advanced at each moment the
 * picture changes; Infinity when there is no plan) and calls onDone once at the end.
 */
export function useRevealClock(plan: RevealPlan | null, onDone: () => void): number {
  const [now, setNow] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!plan) return undefined;
    setNow(0);
    const timers = moments(plan).map((t) =>
      setTimeout(() => {
        setNow(t);
        if (Object.values(plan.flips).includes(t)) play('flip');
        if (t === plan.done) done.current();
      }, t),
    );
    return () => timers.forEach(clearTimeout);
  }, [plan]);

  return plan ? now : Number.POSITIVE_INFINITY;
}

/** Is this card face up at time `now`? */
export const isUp = (plan: RevealPlan | null, now: number, seat: number, lane: Lane, i: number) => !plan || (plan.flips[`${seat}:${lane}:${i}`] ?? 0) <= now;
/** Is this lane's result (hand name, win/loss) showing at time `now`? */
export const laneShown = (plan: RevealPlan | null, now: number, lane: Lane) => !plan || plan.lanes[lane].result <= now;
/** The effect playing at time `now`, if any. */
export const fxAt = (plan: RevealPlan | null, now: number) => plan?.fx.find((f) => f.t <= now && now < f.end) ?? null;

// ---------------------------------------------------------------- banner

const LANE_TITLE: Record<Lane, string> = { front: 'FRONT', middle: 'MIDDLE', back: 'BACK' };

/** The centre banner: "All Players Submitted", then FRONT / MIDDLE / BACK · Revealing… → RESULT. */
export function RevealBanner({ plan, now, onSkip }: { plan: RevealPlan; now: number; onSkip: () => void }) {
  let title: string | null = null;
  let sub = '';
  if (now < REVEAL.intro) {
    title = 'All Players Submitted';
    sub = 'Revealing cards…';
  } else {
    for (const lane of LANES) {
      const l = plan.lanes[lane];
      if (now >= l.start && now < l.result) {
        title = LANE_TITLE[lane];
        sub = 'Revealing…';
      } else if (now >= l.result && now < l.result + REVEAL.hold) {
        title = LANE_TITLE[lane];
        sub = 'RESULT';
      }
    }
  }
  return (
    <>
      {title && (
        <div key={`${title}${sub}`} role="status" aria-label="Reveal" className="rv-banner lx-gold absolute left-[880px] top-[440px] z-[9] w-[320px] rounded-[30px] p-[5px] shadow-[0_8px_0_#7a3e00]">
          <div className="flex flex-col items-center rounded-[25px] bg-gradient-to-b from-[#5a0609] to-[#2a0204] px-4 py-2 text-center font-display font-black leading-tight">
            <span className={`${title.length > 8 ? 'text-[28px]' : 'text-[44px]'} text-[#ffe14d] drop-shadow-[0_3px_0_#3a0204]`}>{title}</span>
            <span className={`${sub === 'RESULT' ? 'text-[30px] text-white' : 'text-[22px] text-white/85'}`}>{sub}</span>
          </div>
        </div>
      )}
      <button type="button" onClick={onSkip} className="lx-tile absolute right-[30px] top-[640px] z-[9] h-[52px] rounded-full border-[3px] border-white/60 bg-black/40 px-5 font-display text-[20px] font-black text-white">
        Skip ▸▸
      </button>
    </>
  );
}

// ---------------------------------------------------------------- effects

/** Where an effect lands: a bot's avatar, or your hand for you. */
const AVATAR: Record<number, { x: number; y: number }> = { 1: { x: 640, y: 560 }, 2: { x: 98, y: 440 }, 3: { x: 800, y: 150 }, 4: { x: 1502, y: 440 } };
/** Centre of each seat's revealed cards (where lightning strikes). */
const CARDS: Record<number, { x: number; y: number }> = { 1: { x: 640, y: 500 }, 2: { x: 300, y: 410 }, 3: { x: 790, y: 300 }, 4: { x: 1290, y: 410 } };

const fmt = (n: number) => n.toLocaleString('en-US');
const v = (o: Record<string, string | number>) => o as CSSProperties;

/** Deterministic pseudo-random numbers (same picture on every render). */
function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function BombArt() {
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
      <defs>
        <radialGradient id="rv-bomb" cx="0.38" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#6b6b7a" />
          <stop offset="0.45" stopColor="#24242c" />
          <stop offset="1" stopColor="#050507" />
        </radialGradient>
      </defs>
      <path d="M78 26 Q92 6 106 14" stroke="#c8a46a" strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="66" y="22" width="22" height="16" rx="4" transform="rotate(35 77 30)" fill="#3a3a44" />
      <circle cx="56" cy="68" r="44" fill="url(#rv-bomb)" />
      <ellipse cx="40" cy="48" rx="12" ry="7" fill="#fff" opacity="0.35" transform="rotate(-30 40 48)" />
      {/* skull */}
      <g fill="#f4f4f8">
        <ellipse cx="56" cy="68" rx="20" ry="18" />
        <rect x="46" y="80" width="20" height="10" rx="3" />
      </g>
      <g fill="#111">
        <ellipse cx="49" cy="68" rx="6" ry="6.5" />
        <ellipse cx="63" cy="68" rx="6" ry="6.5" />
        <path d="M56 74 l-3 5 h6z" />
        <rect x="50" y="83" width="2.5" height="7" />
        <rect x="55" y="83" width="2.5" height="7" />
        <rect x="60" y="83" width="2.5" height="7" />
      </g>
      {/* fuse spark */}
      <g className="rv-fuse" transform="translate(106 14)">
        <path d="M0 -14 L3 -4 L13 -6 L5 1 L10 11 L0 5 L-10 11 L-5 1 L-13 -6 L-3 -4Z" fill="#ffd34d" />
        <circle r="5" fill="#fff6c2" />
      </g>
    </svg>
  );
}

function BurstArt() {
  const pts = (r1: number, r2: number, n: number) =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = (Math.PI * i) / n;
      const r = i % 2 ? r2 : r1;
      return `${100 + Math.cos(a) * r},${100 + Math.sin(a) * r}`;
    }).join(' ');
  return (
    <svg viewBox="0 0 200 200" width="300" height="300" aria-hidden="true">
      <polygon points={pts(98, 58, 12)} fill="#ff5a1f" stroke="#a11a00" strokeWidth="4" strokeLinejoin="round" />
      <polygon points={pts(76, 44, 10)} fill="#ffb21f" />
      <polygon points={pts(50, 30, 8)} fill="#fff3a0" />
    </svg>
  );
}

/** PUSOY! — a bomb is thrown at the seat and explodes. */
function Bomb({ fx }: { fx: Fx }) {
  const root = useRef<HTMLDivElement>(null);
  const lite = lightNow(); // Medium quality: half the particles, no screen shake
  const to = AVATAR[fx.seat];
  const from = { x: 800, y: 120 };
  const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 140 };
  const rnd = seeded(fx.seat * 31 + fx.t);
  const text = { x: Math.round(800 + (to.x - 800) * 0.4), y: Math.round(450 + (to.y - 450) * 0.4) };

  useEffect(() => {
    const t1 = setTimeout(() => {
      play('boom');
      // Screen shake: the whole stage jolts (CSS `translate`, so it never fights the stage's own transform).
      const stage = root.current?.parentElement;
      if (!lightNow()) stage?.animate?.(
        [{ translate: '0 0' }, { translate: '-14px 8px' }, { translate: '12px -10px' }, { translate: '-9px 6px' }, { translate: '6px -4px' }, { translate: '-3px 2px' }, { translate: '0 0' }],
        { duration: 450, easing: 'ease-out' },
      );
    }, 750);
    return () => clearTimeout(t1);
  }, []);

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-[12]" aria-label="Pusoy! Lost all three lines" role="img">
      {/* the throw */}
      <div className="rv-throw absolute left-0 top-0" style={v({ '--sx': `${from.x - 60}px`, '--sy': `${from.y - 60}px`, '--mx': `${mid.x - 60}px`, '--my': `${mid.y - 60}px`, '--tx': `${to.x - 60}px`, '--ty': `${to.y - 60}px` })}>
        <BombArt />
      </div>
      {/* the explosion */}
      <div className="absolute" style={{ left: to.x, top: to.y }}>
        <span className="rv-ring absolute -left-[90px] -top-[90px] h-[180px] w-[180px] rounded-full border-[10px] border-[#fff3a0]" />
        <span className="rv-burst absolute -left-[150px] -top-[150px]">
          <BurstArt />
        </span>
        {Array.from({ length: lite ? 4 : 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2 + rnd();
          const d = 90 + rnd() * 70;
          const size = 70 + rnd() * 50;
          return <span key={`m${i}`} className="rv-smoke absolute rounded-full bg-[radial-gradient(circle,#cfc6c0,#6d6460_60%,transparent_72%)]" style={v({ left: -size / 2, top: -size / 2, width: size, height: size, '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d - 40}px`, animationDelay: `${0.78 + rnd() * 0.12}s` })} />;
        })}
        {Array.from({ length: lite ? 8 : 16 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          const d = 130 + rnd() * 110;
          return <span key={`s${i}`} className="rv-spark absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full" style={v({ background: i % 2 ? '#ffd34d' : '#ff7a1f', boxShadow: '0 0 10px #ffb21f', '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px` })} />;
        })}
        {Array.from({ length: lite ? 3 : 7 }, (_, i) => {
          const a = rnd() * Math.PI * 2;
          const d = 110 + rnd() * 90;
          return <span key={`d${i}`} className="rv-debris absolute -left-[7px] -top-[5px] h-[10px] w-[14px] rounded-[2px] bg-[#3a2a22]" style={v({ '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--r': `${Math.round(rnd() * 720 - 360)}deg` })} />;
        })}
      </div>
      {/* PUSOY! */}
      <div className="rv-pop absolute flex flex-col items-center" style={{ left: text.x - 280, top: text.y - 80, width: 560, animationDelay: '0.85s' }}>
        <CandyText text="PUSOY!" width={560} height={140} size={124} stroke="#7a0a00" fill={['#fff6a8', '#ffb21f', '#ff5a1f']} />
        <span className="-mt-2 rounded-full bg-black/70 px-4 py-1 font-display text-[26px] font-black text-[#ff9aa8]">Lost all three lines · 2× bet · −{fmt(fx.amount)} Gold</span>
      </div>
    </div>
  );
}

/** A jagged bolt from the sky to (x, y), plus two forks. */
function boltPath(x: number, y: number, seed: number): { main: string; forks: string[] } {
  const rnd = seeded(seed);
  const pts: [number, number][] = [[x - 60 + rnd() * 120, -20]];
  const n = 7;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push([pts[0][0] + (x - pts[0][0]) * t + (rnd() * 90 - 45), -20 + (y + 20) * t]);
  }
  pts.push([x, y]);
  const main = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(0)} ${py.toFixed(0)}`).join(' ');
  const forks = [2, 4].map((k) => {
    const [fx, fy] = pts[k];
    const dir = rnd() > 0.5 ? 1 : -1;
    return `M${fx.toFixed(0)} ${fy.toFixed(0)} L${(fx + dir * (40 + rnd() * 40)).toFixed(0)} ${(fy + 50).toFixed(0)} L${(fx + dir * (60 + rnd() * 60)).toFixed(0)} ${(fy + 110).toFixed(0)}`;
  });
  return { main, forks };
}

/** ARAYYY KOOOO! — lightning strikes the misplaced cards. */
function Zap({ fx }: { fx: Fx }) {
  const at = CARDS[fx.seat];
  const { main, forks } = boltPath(at.x, at.y, fx.seat * 17 + fx.t);
  const rnd = seeded(fx.seat * 7 + fx.t);
  const lite = lightNow();
  useEffect(() => {
    const t = setTimeout(() => play('zap'), 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="pointer-events-none absolute inset-0 z-[12]" aria-label="Arayyy kooooo! Misplaced cards" role="img">
      <div className="rv-dim absolute inset-0 bg-[#0a0420]" />
      <div className="rv-flash absolute inset-0 bg-[#e9dcff]" />
      <svg className="rv-bolt absolute inset-0" width="1600" height="900" viewBox="0 0 1600 900" aria-hidden="true">
        {[main, ...forks].map((d, i) => (
          <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d={d} stroke="#9b5cff" strokeWidth={i ? 12 : 26} opacity="0.45" />
            <path d={d} stroke="#d9c4ff" strokeWidth={i ? 6 : 12} />
            <path d={d} stroke="#ffffff" strokeWidth={i ? 2.5 : 5} />
          </g>
        ))}
      </svg>
      <div className="absolute" style={{ left: at.x, top: at.y }}>
        <span className="rv-glow absolute -left-[150px] -top-[110px] h-[220px] w-[300px] rounded-full bg-[radial-gradient(closest-side,rgb(233_220_255/0.95),rgb(155_92_255/0.55)_55%,transparent)]" />
        {Array.from({ length: lite ? 7 : 14 }, (_, i) => {
          const a = (i / 14) * Math.PI * 2;
          const d = 80 + rnd() * 90;
          return <span key={i} className="rv-spark absolute -left-[4px] -top-[4px] h-[8px] w-[8px] rounded-full bg-white" style={v({ boxShadow: '0 0 12px #b98cff, 0 0 4px #fff', '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, animationDelay: '0.3s' })} />;
        })}
      </div>
      <div className="rv-pop absolute flex flex-col items-center" style={{ left: Math.min(Math.max(at.x + 60, 40), 900), top: Math.max(at.y - 250, 40), width: 640, animationDelay: '0.45s' }}>
        <CandyText text="ARAYYY KOOOO!" width={640} height={120} size={84} stroke="#3a0a6b" fill={['#ffffff', '#ffe14d', '#ffa514']} />
        <span className="-mt-1 rounded-full bg-black/70 px-4 py-1 font-display text-[26px] font-black text-[#ff9aa8]">Misplaced cards · 2× bet penalty · −{fmt(fx.amount)} Gold</span>
      </div>
    </div>
  );
}

/** The effect playing now (bomb or lightning), mounted fresh for each so its animations start on time. */
export function RevealFx({ fx }: { fx: Fx | null }) {
  if (!fx) return null;
  return fx.kind === 'bomb' ? <Bomb key={`b${fx.seat}${fx.t}`} fx={fx} /> : <Zap key={`z${fx.seat}${fx.t}`} fx={fx} />;
}
