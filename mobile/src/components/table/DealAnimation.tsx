'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { lightNow, reducedNow } from '@/lib/motion';
import { play } from '@/lib/sound';
import { CardBackArt, CardFaceArt } from '@/components/CardArt';

/**
 * Shuffle-and-deal animation for the Single Player table (1600×900 stage coordinates).
 *
 * GATHER → FORM DECK → SPLIT → RIFFLE SHUFFLE → MERGE & SQUARE → DECK READY →
 * DEAL CLOCKWISE → DISTRIBUTION COMPLETE, then `onDone` opens manual arrangement.
 *
 * It only *shows* the deal the server already made: the deck is shuffled on the
 * server, card p (0 = top of the deck) goes to `dealOrder(banker)[p % 4]` — the
 * seat after the banker first, clockwise, ending on the banker — exactly as
 * `Deck::deal($deck, 4, 13, banker % 4 + 1)` dealt it. Bot cards stay face down;
 * your 13 land face down and turn over (your real cards, in the order you
 * received them) only once all 52 are out. Nothing here changes a card or a result.
 *
 * Rendering: 52 cards in one CSS 3D scene (perspective + translateZ for the deck
 * height and the toss arc). Each card runs a single Web Animations timeline built
 * up front from its keyframes, so playback is transform/opacity only, composited
 * on the GPU and off the main thread. Low-end devices drop the travelling shadows.
 * With reduced motion on (or no Web Animations support) it finishes at once.
 */

export const CARD_W = 84;
export const CARD_H = 118;
const CX = 800;
const CY = 455;
const TILT = 16; // cards lie on the felt, seen from above the table
const STEP = 1.1; // card thickness in the deck (px of height per card)

/** Seats in the order they receive cards: the seat after the banker first, clockwise (1 You → 2 LuckyBot → 3 CardBot → 4 AceBot). */
export function dealOrder(banker: number): number[] {
  const first = (banker % 4) + 1;
  return [0, 1, 2, 3].map((i) => ((first - 1 + i) % 4) + 1);
}

/**
 * Shuffle tempo: every shuffle timing below is written at a relaxed design pace and played at
 * SHUFFLE_SPEED of it, so the whole shuffle speeds up evenly — same motions, same easing, no step lost.
 */
const SHUFFLE_SPEED = 0.275;
const T = (ms: number) => Math.round(ms * SHUFFLE_SPEED);

/** Phase start times (ms). */
export const PHASES = {
  gather: 0,
  form: T(1900),
  split: T(2650),
  riffle: T(3800),
  merge: T(5800),
  ready: T(6500),
  deal: T(7200),
  complete: 0, // filled below
  done: 0,
};
export const DEAL_GAP = 55; // a new card leaves the deck every 55 ms (one at a time, no pauses)
const FLIGHT = 210; // each toss takes 0.21 s from the deck to the player
const BOUNCE = 30; // landing bounce: up and settle, 30 ms each
const FLIP_GAP = 18; // your cards turn over 18 ms apart…
const FLIP = 150; // …each turn taking 0.15 s
PHASES.complete = PHASES.deal + 51 * DEAL_GAP + FLIGHT + 2 * BOUNCE + 40;
// Your cards turn over, then arrangement opens straight away (a short beat, no waiting).
PHASES.done = PHASES.complete + 12 * FLIP_GAP + FLIP + 100;

/** Which phase is showing at time t. */
export function phaseAt(t: number): 'gather' | 'form' | 'split' | 'riffle' | 'merge' | 'ready' | 'deal' | 'complete' {
  if (t >= PHASES.complete) return 'complete';
  if (t >= PHASES.deal) return 'deal';
  if (t >= PHASES.ready) return 'ready';
  if (t >= PHASES.merge) return 'merge';
  if (t >= PHASES.riffle) return 'riffle';
  if (t >= PHASES.split) return 'split';
  if (t >= PHASES.form) return 'form';
  return 'gather';
}

/** When card p (0 = top of the deck) lands at its seat. */
export const landsAt = (p: number) => PHASES.deal + p * DEAL_GAP + FLIGHT;

interface Pose {
  x: number;
  y: number;
  z: number;
  rz: number;
  rx: number;
  ry: number;
  s: number;
}
interface Key extends Pose {
  t: number;
  e?: string;
}

/** Where the k-th card (0..12) a seat receives rests: a neat fan beside that player. */
export function fanPose(seat: number, k: number): Pose {
  const d = k - 6;
  const z = 2 + k * 0.6;
  switch (seat) {
    case 1:
      return { x: CX + d * 32, y: 646 + Math.abs(d) * 1.8, z, rz: d * 2.2, rx: TILT, ry: 0, s: 0.92 };
    case 3:
      return { x: CX - d * 17, y: 276 + Math.abs(d) * 1.2, z, rz: 180 + d * 2, rx: TILT, ry: 0, s: 0.56 };
    case 2:
      return { x: 270 + Math.abs(d) * 1.4, y: CY - d * 15, z, rz: 90 + d * 3, rx: TILT, ry: 0, s: 0.56 };
    default:
      return { x: 1330 - Math.abs(d) * 1.4, y: CY + d * 15, z, rz: -90 + d * 3, rx: TILT, ry: 0, s: 0.56 };
  }
}

/** Small deterministic PRNG, so a round's scatter is the same on every render. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Keyframes for the card that ends up p-th from the top of the shuffled deck.
 * Riffle: even p fall from the left pile, odd p from the right, bottom card first.
 */
export function cardKeys(p: number, banker: number, seed: number): Key[] {
  const r = rng(seed * 131 + p * 7919 + 17);
  const left = p % 2 === 0;
  const pileH = left ? (50 - p) / 2 : (51 - p) / 2; // height within its pile (0 = bottom)
  const h = left ? 26 + pileH : pileH; // height in the gathered deck: left pile is the top half
  const side = left ? -1 : 1;
  const base: Omit<Pose, 'x' | 'y' | 'z'> = { rz: 0, rx: TILT, ry: 0, s: 1 };
  const deckZ = (height: number) => 1 + height * STEP;
  const keys: Key[] = [];
  const at = (t: number, pose: Partial<Pose>, e?: string) => {
    const prev = keys[keys.length - 1];
    keys.push({ ...(prev ?? { x: CX, y: CY, z: 1, ...base }), ...pose, t, e });
  };

  // 1 GATHER: the last round's cards lie around the felt and fly in, bottom of the new deck first.
  const ang = r() * Math.PI * 2;
  const rad = 0.45 + r() * 0.55;
  const sx = CX + Math.cos(ang) * 470 * rad;
  const sy = CY + Math.sin(ang) * 190 * rad;
  const lands = T(700 + h * 20);
  at(0, { x: sx, y: sy, z: 1, rz: r() * 360 - 180, s: 0.9 });
  at(lands - T(650), {}, 'cubic-bezier(.45,0,.2,1)');
  at(lands - T(300), { x: (sx + CX) / 2, y: (sy + CY) / 2 - 10, z: 40 + h * STEP, rz: (keys[0].rz + (r() * 14 - 7)) / 2, s: 0.95 }, 'cubic-bezier(.2,.6,.3,1)');
  at(lands, { x: CX + (r() * 8 - 4), y: CY + (r() * 6 - 3), z: deckZ(h), rz: r() * 14 - 7, s: 1 });

  // 2 FORM THE DECK: square it up, then lift it slightly off the felt.
  at(PHASES.form, {}, 'cubic-bezier(.3,0,.2,1)');
  at(PHASES.form + T(550), { x: CX, y: CY, rz: 0 }, 'ease-in-out');
  at(PHASES.split - T(50), { z: deckZ(h) + 22 }, 'cubic-bezier(.3,0,.2,1)');

  // 3 SPLIT: the top half lifts away to the left, the bottom half slides right.
  const pileZ = deckZ(pileH) + 10;
  at(PHASES.split + T(250), left ? { x: CX - 70, z: deckZ(h) + 60, rz: -3 } : { x: CX + 25, z: pileZ + 12, rz: 2 }, 'cubic-bezier(.3,0,.2,1)');
  at(PHASES.split + T(700), { x: CX + side * 190, y: CY + 6, z: pileZ, rz: side * 7 }, 'ease-in-out');
  // …and the two piles move toward each other, inner corners raised for the riffle.
  at(PHASES.riffle - T(100), { x: CX + side * 122, z: pileZ + 6, ry: side * 16, rz: side * 4 });

  // 4 RIFFLE: cards fall one at a time, alternating piles, bending as they leave the thumb.
  const k = 51 - p; // bottom of the new deck drops first
  const drop = PHASES.riffle + T(k * 34);
  at(drop, {}, 'cubic-bezier(.5,0,.6,1)');
  at(drop + T(70), { x: CX + side * 58, z: deckZ(51 - p) + 18, ry: side * 46, rz: side * 2 }, 'cubic-bezier(.2,.6,.3,1)');
  at(drop + T(170), { x: CX + (r() * 4 - 2), y: CY, z: deckZ(51 - p), ry: 0, rz: r() * 4 - 2 });

  // 5 MERGE & SQUARE: a gentle swirl, then the deck is squared at the centre.
  at(PHASES.merge, {}, 'ease-in-out');
  at(PHASES.merge + T(330), { rz: (51 - p) * 0.14 + 3, z: deckZ(51 - p) + 4 }, 'ease-in-out');
  at(PHASES.ready, { x: CX, y: CY, rz: 0, z: deckZ(51 - p) });

  // 6 DECK READY: hold while the camera settles.  7-8 DEAL CLOCKWISE from the top, one card at a time.
  const seat = dealOrder(banker)[p % 4];
  const target = fanPose(seat, Math.floor(p / 4));
  const go = PHASES.deal + p * DEAL_GAP;
  const spin = target.rz > 90 ? -1 : 1;
  at(go, {}, 'cubic-bezier(.35,0,.25,1)');
  at(go + FLIGHT * 0.5, { x: (CX + target.x) / 2, y: (CY + target.y) / 2 - 30, z: 150, rz: target.rz / 2 + spin * 160, s: (1 + target.s) / 2 + 0.08 }, 'cubic-bezier(.15,.55,.3,1)');
  at(go + FLIGHT, { ...target, rz: target.rz + spin * 360 }, 'ease-out');
  at(go + FLIGHT + BOUNCE, { z: target.z + 7 }, 'ease-in');
  at(go + FLIGHT + 2 * BOUNCE, { z: target.z });

  // 9 COMPLETE: your cards turn over, left to right.
  if (seat === 1) {
    const flip = PHASES.complete + Math.floor(p / 4) * FLIP_GAP;
    at(flip, {}, 'ease-in');
    at(flip + FLIP / 2, { z: target.z + 26, ry: 90 }, 'ease-out');
    at(flip + FLIP, { z: target.z, ry: 180 });
  }
  at(PHASES.done, {});
  return keys;
}

// Height also lifts a card up the screen (oblique view of the felt), so the deck shows its stacked edge.
const LIFT_Y = 0.6;
const transformOf = (k: Pose) => `translate3d(${(k.x - CARD_W / 2).toFixed(1)}px, ${(k.y - CARD_H / 2 - k.z * LIFT_Y).toFixed(1)}px, ${k.z.toFixed(1)}px) rotateX(${k.rx}deg) rotateZ(${k.rz.toFixed(1)}deg) rotateY(${k.ry.toFixed(1)}deg) scale(${k.s.toFixed(3)})`;

/** Turn absolute-time keys into a Web Animations keyframe list spanning PHASES.done. */
function toFrames(keys: Key[], shadow = false): Keyframe[] {
  return keys.map((k) => {
    const f: Keyframe = { offset: Math.min(1, Math.max(0, k.t / PHASES.done)), easing: k.e ?? 'linear' };
    if (shadow) {
      // A soft shadow on the felt under a lifted card: further, bigger and fainter the higher it flies.
      const lift = Math.max(0, k.z - 4);
      f.transform = `translate3d(${(k.x - CARD_W / 2 + lift * 0.18).toFixed(1)}px, ${(k.y - CARD_H / 2 + lift * 0.3 + 2).toFixed(1)}px, 0px) rotateX(${TILT}deg) rotateZ(${k.rz.toFixed(1)}deg) scale(${(k.s * (1 + lift / 500)).toFixed(3)})`;
      f.opacity = Math.min(0.42, lift / 90);
    } else {
      f.transform = transformOf(k);
    }
    return f;
  });
}

/** The 553 card back (shared card design), with a sliver of card thickness. */
function Back() {
  return (
    <span className="absolute inset-0 overflow-hidden rounded-[8px] shadow-[0_1px_0_#e9c46a,0_2px_0_#9a6a14,0_3px_4px_rgb(0_0_0/0.35)] [backface-visibility:hidden]">
      <CardBackArt className="absolute inset-0 h-full w-full" />
    </span>
  );
}

/** Your card face (shared card design), on the far side until the card turns over. */
function Face({ code }: { code: string }) {
  return (
    <span className="absolute inset-0 overflow-hidden rounded-[8px] bg-[#fbf5ea] shadow-[0_3px_4px_rgb(0_0_0/0.35)] [backface-visibility:hidden] [transform:rotateY(180deg)]">
      <CardFaceArt code={code} className="absolute inset-0 h-full w-full" />
    </span>
  );
}

const lowEnd = () => {
  if (typeof navigator === 'undefined') return false;
  const n = navigator as Navigator & { deviceMemory?: number };
  return (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 2;
};

const CAPTION: Record<ReturnType<typeof phaseAt>, string> = {
  gather: 'Gathering the cards…',
  form: 'Forming the deck…',
  split: 'Splitting the deck…',
  riffle: 'Riffle shuffle…',
  merge: 'Merging and squaring…',
  ready: 'Deck ready',
  deal: 'Dealing clockwise…',
  complete: 'All cards dealt',
};

export default function DealAnimation({
  roundId,
  banker,
  cards,
  names,
  onDone,
}: {
  roundId: number;
  /** Banker seat (1 = you). */
  banker: number;
  /** Your 13 cards in the order the server dealt them to you. */
  cards: string[];
  /** Seat → name for the dealing caption. */
  names: Record<number, string>;
  onDone: () => void;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(0);
  const [phase, setPhase] = useState<ReturnType<typeof phaseAt>>('gather');
  const done = useRef(onDone);
  done.current = onDone;
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    done.current();
  };
  // Travelling shadows: not on low-end devices or at Medium motion quality.
  const shadows = useMemo(() => !lowEnd() && !lightNow(), []);
  const order = dealOrder(banker);

  useEffect(() => {
    const root = scene.current;
    const canAnimate = !!root && typeof root.animate === 'function';
    if (!canAnimate || reducedNow()) {
      finish();
      return undefined;
    }
    const opts: KeyframeAnimationOptions = { duration: PHASES.done, fill: 'forwards', easing: 'linear' };
    const anims: Animation[] = [];
    root.querySelectorAll<HTMLElement>('[data-deal-card]').forEach((el) => {
      const p = Number(el.dataset.dealCard);
      anims.push(el.animate(toFrames(cardKeys(p, banker, roundId)), opts));
    });
    root.querySelectorAll<HTMLElement>('[data-deal-shadow]').forEach((el) => {
      const p = Number(el.dataset.dealShadow);
      anims.push(el.animate(toFrames(cardKeys(p, banker, roundId), true), opts));
    });
    // A subtle camera push-in on the finished deck, easing back out as the deal starts.
    const cam = root.querySelector<HTMLElement>('[data-deal-camera]');
    if (cam) {
      const o = (t: number) => t / PHASES.done;
      anims.push(
        cam.animate(
          [
            { offset: 0, transform: 'scale(1)' },
            { offset: o(PHASES.merge), transform: 'scale(1)', easing: 'ease-in-out' },
            { offset: o(PHASES.ready + 300), transform: 'scale(1.06)', easing: 'ease-in-out' },
            { offset: o(PHASES.deal + 500), transform: 'scale(1)' },
            { offset: 1, transform: 'scale(1)' },
          ],
          opts,
        ),
      );
    }

    // Captions, counters and sounds follow the same clock (state updates only, nothing per frame).
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (t: number, f: () => void) => timers.push(setTimeout(f, t));
    (Object.keys(CAPTION) as Array<keyof typeof CAPTION>).forEach((ph) => later(PHASES[ph], () => setPhase(ph)));
    later(PHASES.riffle, () => play('deal'));
    for (let p = 0; p < 52; p++) later(landsAt(p), () => setLanded(p + 1));
    for (let p = 0; p < 52; p += 4) later(landsAt(p), () => play('tap'));
    later(PHASES.done, finish);
    // Belt and braces: open arrangement as soon as every card animation has played out, even if a
    // throttled timer runs late. (A cancelled animation rejects: nothing happens then.)
    if (anims.every((a) => a.finished instanceof Promise)) {
      Promise.all(anims.map((a) => a.finished)).then(finish, () => undefined);
    }

    return () => {
      timers.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId, banker]);

  const counts = [1, 2, 3, 4].map((seat) => ({ seat, n: Array.from({ length: landed }, (_, p) => order[p % 4]).filter((s) => s === seat).length }));
  const badge: Record<number, { x: number; y: number }> = { 1: { x: CX + 230, y: 600 }, 2: { x: 330, y: 360 }, 3: { x: CX + 140, y: 250 }, 4: { x: 1270, y: 360 } };
  // Your cards, by deck position: the k-th card you receive is deck[order.indexOf(1) + 4k].
  const mine = order.indexOf(1);

  return (
    <div ref={scene} className="absolute inset-0 z-[7]" role="status" aria-label="Shuffling and dealing">
      <div data-deal-camera className="absolute inset-0 [transform-origin:800px_455px]" style={{ perspective: 1500, perspectiveOrigin: '800px 380px' }}>
        <div className="absolute inset-0 [transform-style:preserve-3d]" aria-hidden="true">
          {shadows &&
            Array.from({ length: 52 }, (_, p) => (
              <span
                key={`s${p}`}
                data-deal-shadow={p}
                className="absolute left-0 top-0 rounded-[10px] bg-[radial-gradient(closest-side,rgb(0_0_0/0.75),rgb(0_0_0/0.25)_70%,transparent)] opacity-0 will-change-transform"
                style={{ width: CARD_W, height: CARD_H }}
              />
            ))}
          {Array.from({ length: 52 }, (_, p) => {
            const yours = p % 4 === mine;
            return (
              <span
                key={p}
                data-deal-card={p}
                className="absolute left-0 top-0 will-change-transform [transform-style:preserve-3d]"
                style={{ width: CARD_W, height: CARD_H, transform: transformOf({ ...fanPose(order[p % 4], Math.floor(p / 4)), ry: yours ? 180 : 0 }) }}
              >
                <Back />
                {yours && <Face code={cards[Math.floor(p / 4)] ?? 'AS'} />}
              </span>
            );
          })}
        </div>
      </div>

      {/* card counts while dealing */}
      {(phase === 'deal' || phase === 'complete') &&
        counts.map(({ seat, n }) => (
          <span
            key={seat}
            aria-label={`${names[seat] ?? `Seat ${seat}`} cards`}
            className={`absolute z-[8] flex h-[38px] min-w-[38px] items-center justify-center rounded-full border-[3px] px-2 font-display text-[20px] font-black transition-colors ${n === 13 ? 'border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] text-[#4a1d00]' : 'border-white/70 bg-black/60 text-white'}`}
            style={{ left: badge[seat].x - 19, top: badge[seat].y - 19 }}
          >
            {n}
          </span>
        ))}

      <p className="absolute left-1/2 top-[548px] z-[8] -translate-x-1/2 whitespace-nowrap rounded-full bg-black/55 px-5 py-1 font-display text-[22px] font-black text-white">
        {phase === 'deal' ? `Dealing clockwise from ${names[order[0]] ?? 'the next seat'}…` : CAPTION[phase]}
      </p>

      <button type="button" onClick={finish} className="lx-tile absolute right-[30px] top-[640px] z-[8] h-[52px] rounded-full border-[3px] border-white/60 bg-black/40 px-5 font-display text-[20px] font-black text-white">
        Skip ▸▸
      </button>
    </div>
  );
}
