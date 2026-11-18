'use client';

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import PlayingCard from '@/components/PlayingCard';
import { useToStage } from '@/components/LandscapeStage';
import { reducedNow } from '@/lib/motion';

/**
 * Drag a playing card like a real one (Single Player table and arrangement popup).
 *
 * - The lifted card is the same card at exactly the same size and proportions as in its slot
 *   (measured from the slot, drawn in stage units) — never stretched, shrunk or swapped for a
 *   default-size copy. Lifting is shown with a deeper shadow and a small rise, not by scaling.
 * - It stays under the finger at the point you grabbed it, and pivots around that point: moving
 *   sideways tilts it with the motion (like a card pulled by one corner) and it swings back
 *   upright when you stop — a small physics loop on requestAnimationFrame that writes the
 *   transform directly (no React re-render per frame, GPU-composited).
 * - Drop on a target: the move is committed, the dropped card glides from where you let go into
 *   its new slot and straightens, and any card it displaced slides across to its new place
 *   (FLIP animation). Drop anywhere else: it springs back into its slot.
 * - Reduced motion (Low quality): no tilt or glide; the card simply follows and drops.
 *
 * Usage: spread `bind(card)` on the card's wrapper (its first child is the card), hide the
 * original while `dragging === card`, render `ghost` inside the stage, and supply `resolve`,
 * which looks at the drop point and returns the cards that will move plus a `commit`, or null.
 */
export type DropResolution = { moved: string[]; commit: () => void } | null;

type Pt = { x: number; y: number };
interface Live {
  card: string;
  w: number;
  h: number;
  /** Grab point relative to the card's centre (stage units); the card pivots around it. */
  grab: Pt;
  start: Pt; // client coords at pointer-down
  origin: Pt; // card centre in its slot (stage)
  target: Pt; // where the card centre should be (stage)
  pos: Pt; // where it is drawn now (stage)
  rot: number;
  moving: boolean;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function useCardDrag({ enabled = true, resolve }: { enabled?: boolean; resolve: (drop: { card: string; clientX: number; clientY: number }) => DropResolution }) {
  // Read through a ref: the stage mapping changes identity on every stage render, and the pointer
  // listeners below must stay put for the whole drag (re-subscribing would also stop the physics loop).
  const toStageNow = useToStage();
  const toStageRef = useRef(toStageNow);
  toStageRef.current = toStageNow;
  const toStage = (x: number, y: number) => toStageRef.current(x, y);
  const [dragging, setDragging] = useState<{ card: string; w: number; h: number; off: Pt } | null>(null);
  const live = useRef<Live | null>(null);
  const ghost = useRef<HTMLDivElement | null>(null);
  const raf = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const seq = useRef(0); // counts drags, so a late spring-back never touches a newer drag
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  // FLIP: card → where (and at what tilt) it was drawn before the move was committed.
  const pendingFlip = useRef<Map<string, { at: Pt; rot: number; dropped: boolean }> | null>(null);

  const centreOf = (el: Element): Pt => {
    const r = el.getBoundingClientRect();
    return toStage(r.left + r.width / 2, r.top + r.height / 2);
  };

  const paint = () => {
    const v = live.current;
    const el = ghost.current;
    if (!v || !el) return;
    el.style.transform = `translate(${v.pos.x - v.w / 2}px, ${v.pos.y - v.h / 2}px) rotate(${v.rot.toFixed(2)}deg)`;
  };

  // The physics loop: follow the finger with a touch of weight, tilt with sideways speed, relax upright.
  const loop = () => {
    const v = live.current;
    if (!v) return;
    const reduced = reducedNow();
    const prevX = v.pos.x;
    const k = reduced ? 1 : 0.55;
    v.pos = { x: v.pos.x + (v.target.x - v.pos.x) * k, y: v.pos.y + (v.target.y - v.pos.y) * k };
    const vx = v.pos.x - prevX; // stage px per frame
    const want = reduced ? 0 : clamp(vx * 0.9, -14, 14);
    v.rot += (want - v.rot) * 0.18;
    paint();
    raf.current = requestAnimationFrame(loop);
  };

  const stop = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  /** pointerdown on a card's wrapper. */
  const bind = (card: string) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || e.button !== 0) return;
    seq.current += 1;
    const slot = (e.currentTarget.firstElementChild as HTMLElement | null) ?? e.currentTarget;
    const centre = centreOf(slot);
    const p = toStage(e.clientX, e.clientY);
    const grab = { x: p.x - centre.x, y: p.y - centre.y };
    live.current = {
      card,
      w: slot.offsetWidth || 0,
      h: slot.offsetHeight || 0,
      grab,
      start: { x: e.clientX, y: e.clientY },
      origin: centre,
      target: centre,
      pos: centre,
      rot: 0,
      moving: false,
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const v = live.current;
      if (!v) return;
      const p = toStage(e.clientX, e.clientY);
      v.target = { x: p.x - v.grab.x, y: p.y - v.grab.y };
      if (!v.moving && Math.hypot(e.clientX - v.start.x, e.clientY - v.start.y) > 8) {
        v.moving = true;
        setDragging({ card: v.card, w: v.w, h: v.h, off: v.grab });
        stop();
        raf.current = requestAnimationFrame(loop);
      }
    };
    const onUp = (e: PointerEvent) => {
      const v = live.current;
      if (!v) return;
      stop();
      if (!v.moving) {
        live.current = null;
        return;
      }
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const res = resolveRef.current({ card: v.card, clientX: e.clientX, clientY: e.clientY });
      const reduced = reducedNow();
      if (res) {
        // Remember where everything is drawn now, commit, then glide each card into its new slot.
        if (!reduced) {
          const map = new Map<string, { at: Pt; rot: number; dropped: boolean }>();
          map.set(v.card, { at: v.pos, rot: v.rot, dropped: true });
          for (const c of res.moved) {
            const el = document.querySelector(`[data-card="${CSS.escape(c)}"]`)?.firstElementChild;
            if (el && c !== v.card) map.set(c, { at: centreOf(el), rot: 0, dropped: false });
          }
          pendingFlip.current = map;
        }
        live.current = null;
        setDragging(null);
        res.commit();
        return;
      }
      // Not dropped on a target: spring back into the slot, then show the card there again.
      const el = ghost.current;
      if (el && typeof el.animate === 'function' && !reduced) {
        const from = el.style.transform;
        const to = `translate(${v.origin.x - v.w / 2}px, ${v.origin.y - v.h / 2}px) rotate(0deg)`;
        const a = el.animate([{ transform: from }, { transform: to }], { duration: 260, easing: 'cubic-bezier(.25,1.35,.45,1)', fill: 'forwards' });
        let landed = false;
        const mine = seq.current;
        const land = () => {
          if (landed || seq.current !== mine) return;
          landed = true;
          live.current = null;
          setDragging(null);
        };
        a.onfinish = land;
        // Never leave a card hidden: if the animation is paused (app in the background), land anyway.
        setTimeout(land, 400);
      } else {
        live.current = null;
        setDragging(null);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      stop();
    };
    // Subscribed once; everything the handlers use lives in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After a committed drop: FLIP each moved card from where it was drawn into its new slot.
  useLayoutEffect(() => {
    const map = pendingFlip.current;
    if (!map) return;
    pendingFlip.current = null;
    map.forEach(({ at, rot, dropped }, card) => {
      const el = document.querySelector(`[data-card="${CSS.escape(card)}"]`)?.firstElementChild as HTMLElement | null | undefined;
      if (!el || typeof el.animate !== 'function') return;
      const now = centreOf(el);
      const dx = at.x - now.x;
      const dy = at.y - now.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(rot) < 0.5) return;
      el.animate(
        dropped
          ? [
              { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, boxShadow: '0 18px 26px rgb(0 0 0 / 0.45)', zIndex: 30 },
              { transform: 'translate(0, 0) rotate(0deg)', zIndex: 30 },
            ]
          : [{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 20 }, { transform: 'translate(0, 0)', zIndex: 20 }],
        { duration: dropped ? 230 : 300, easing: dropped ? 'cubic-bezier(.2,.9,.3,1.12)' : 'cubic-bezier(.3,.7,.3,1)' },
      );
    });
  });

  const ghostEl = dragging ? (
    <div
      ref={(el) => {
        ghost.current = el;
        if (el) paint();
      }}
      className="pointer-events-none absolute left-0 top-0 z-[80] will-change-transform"
      style={{ width: dragging.w, height: dragging.h, transformOrigin: `${dragging.w / 2 + dragging.off.x}px ${dragging.h / 2 + dragging.off.y}px` }}
      aria-hidden="true"
    >
      {/* Lifted off the table: a rise and a deeper, softer shadow — never a change of size. */}
      <div className="cd-lift h-full w-full">
        <PlayingCard code={dragging.card} style={{ width: dragging.w, height: dragging.h }} />
      </div>
    </div>
  ) : null;

  return { bind, dragging: dragging?.card ?? null, ghost: ghostEl, suppressClick };
}
