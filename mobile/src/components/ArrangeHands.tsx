'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { api, errorText } from '@/lib/api';
import { play } from '@/lib/sound';
import { GameButton } from './game';
import PlayingCard, { sortCards } from './PlayingCard';
import { Notice } from './ui';

type Row = 'front' | 'middle' | 'back';
type Zone = Row | 'hand';
const ROWS: Array<[Row, string, number]> = [
  ['front', 'Front', 3],
  ['middle', 'Middle', 5],
  ['back', 'Back', 5],
];
const SIZE: Record<Row, number> = { front: 3, middle: 5, back: 5 };

interface Drag {
  card: string;
  from: Zone;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moving: boolean;
}

/**
 * Card arrangement with two input styles:
 *  - tap cards to select, tap a lane to place them, tap a placed card to return it;
 *  - drag a card (or a selected group) onto a lane, between lanes, or back to the hand.
 * Hand names and foul warnings come from the server preview endpoint; the app
 * never evaluates or scores hands. A detected Lucky Hand can be declared,
 * which locks the hand on the server.
 */
export default function ArrangeHands({
  sessionId,
  cards,
  allowFoul,
  onSubmitted,
  lucky,
  basePath,
}: {
  sessionId: number;
  cards: string[];
  allowFoul: boolean;
  onSubmitted: (response?: unknown) => void;
  lucky?: { type: string; label: string } | null;
  /** API base for preview/submit/lucky; defaults to `/games/{sessionId}` (Single Player uses `/practice/{id}`). */
  basePath?: string;
}) {
  const base = basePath ?? `/games/${sessionId}`;
  const [rows, setRows] = useState<Record<Row, string[]>>({ front: [], middle: [], back: [] });
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'rank' | 'suit'>('rank');
  const [preview, setPreview] = useState<{ labels: Record<Row, string | null>; is_foul: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmLucky, setConfirmLucky] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hovering, setHovering] = useState<Zone | null>(null);
  const suppressClick = useRef(false);
  const dragRef = useRef<Drag | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const placed = useMemo(() => new Set([...rows.front, ...rows.middle, ...rows.back]), [rows]);
  const hand = sortCards(cards.filter((c) => !placed.has(c)), sortBy);
  const complete = rows.front.length === 3 && rows.middle.length === 5 && rows.back.length === 5;
  const foulBlocked = !!preview?.is_foul && !allowFoul;

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ data: { labels: Record<Row, string | null>; is_foul: boolean } }>(`${base}/preview`, { method: 'POST', body: rows })
        .then((r) => setPreview(r.data))
        .catch(() => undefined);
    }, 200);
    return () => clearTimeout(t);
  }, [rows, base]);

  const haptic = async () => {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // no haptics on web
    }
  };

  /** Move cards into a zone (respecting lane sizes); cards keep their identity. */
  const moveTo = (moving: string[], zone: Zone) => {
    setRows((r) => {
      const next: Record<Row, string[]> = { front: r.front.filter((c) => !moving.includes(c)), middle: r.middle.filter((c) => !moving.includes(c)), back: r.back.filter((c) => !moving.includes(c)) };

      if (zone !== 'hand') {
        next[zone] = [...next[zone], ...moving.slice(0, SIZE[zone] - next[zone].length)];
      }

      return next;
    });
    setSelected([]);
    haptic();
    play('deal');
  };

  const place = (row: Row) => {
    if (!selected.length || suppressClick.current) {
      return;
    }
    moveTo(selected, row);
  };

  // ---- drag and drop (pointer events: mouse, touch and pen) ----
  const startDrag = (card: string, from: Zone) => (e: ReactPointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    const d = { card, from, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moving: false };
    dragRef.current = d;
    setDrag(d);
  };

  useEffect(() => {
    if (!drag) {
      return undefined;
    }

    let frame: number | null = null;
    const updateFrame = () => {
      frame = null;
      const d = dragRef.current;
      if (!d?.moving) return;

      const target = (document.elementFromPoint(d.x, d.y) as HTMLElement | null)?.closest('[data-zone]') as HTMLElement | null;
      const zone = (target?.dataset.zone as Zone | undefined) ?? null;
      setHovering((current) => current === zone ? current : zone);

      const ghost = ghostRef.current;
      if (ghost) {
        ghost.style.transform = `translate3d(${d.x}px, ${d.y}px, 0) translate(-50%, -50%) rotate(6deg)`;
      }
    };

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = { ...d, x: e.clientX, y: e.clientY, moving: d.moving || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 8 };
      dragRef.current = next;
      if (!next.moving) return;
      if (!d.moving) setDrag(next);
      if (frame === null) frame = requestAnimationFrame(updateFrame);
    };

    const onUp = (e: PointerEvent) => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setHovering(null);

      if (!d?.moving) {
        return;
      }

      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest('[data-zone]') as HTMLElement | null;
      const zone = target?.dataset.zone as Zone | undefined;
      // Dragging a selected hand card carries the whole selection.
      const group = d.from === 'hand' && selected.includes(d.card) ? selected : [d.card];

      if (zone && zone !== d.from) {
        moveTo(group, zone);
      }

      // The pointerup is followed by a click on the card: ignore that one.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.card, drag?.from, selected]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api(`${base}/submit`, { method: 'POST', body: rows });
      play('start');
      onSubmitted(res);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const declareLucky = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/lucky`, { method: 'POST' });
      play('lucky');
      onSubmitted();
    } catch (e) {
      setError(errorText(e));
      setConfirmLucky(false);
    } finally {
      setBusy(false);
    }
  };

  const draggingOut = (c: string) => drag?.moving && (drag.card === c || (drag.from === 'hand' && selected.includes(drag.card) && selected.includes(c)));

  return (
    <div>
      {error && <Notice>{error}</Notice>}

      {lucky && (
        <div className="mb-3 rounded-2xl border-[3px] border-gold-300 bg-gradient-to-b from-gold-400/30 to-candy-500/30 p-3 text-center shadow-[0_0_24px_rgb(255_204_61/0.5)]">
          <p className="font-display text-lg font-black text-gold-200">You have a Lucky Hand: {lucky.label}!</p>
          {!confirmLucky ? (
            <GameButton tone="gold" size="lg" className="shine mt-2 w-full" onClick={() => setConfirmLucky(true)} disabled={busy}>
              DECLARE LUCKY ×2
            </GameButton>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <GameButton tone="glass" onClick={() => setConfirmLucky(false)} disabled={busy}>
                Cancel
              </GameButton>
              <GameButton tone="gold" onClick={declareLucky} disabled={busy}>
                {busy ? 'Declaring…' : 'Lock it in'}
              </GameButton>
            </div>
          )}
          <p className="mt-1 text-[11px] text-white/70">Declaring locks your cards. The server re-checks your 13 cards before accepting.</p>
        </div>
      )}

      <div className="space-y-2">
        {ROWS.map(([key, label, size]) => {
          const target = (selected.length > 0 || drag?.moving) && rows[key].length < size;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              aria-label={`${label} row`}
              data-zone={key}
              onClick={() => place(key)}
              onKeyDown={(e) => e.key === 'Enter' && place(key)}
              className={`relative flex items-center gap-2 rounded-2xl border-2 p-2 transition ${
                hovering === key ? 'border-mint-400 bg-mint-500/20' : target ? 'border-gold-300 bg-gold-400/15 shadow-[0_0_16px_rgb(255_204_61/0.45)]' : 'border-white/15 bg-black/25'
              }`}
            >
              <div className="flex w-16 shrink-0 flex-col items-center">
                <span className="rounded-full bg-gradient-to-b from-felt-400 to-felt-700 px-2 py-0.5 font-display text-[11px] font-black uppercase text-white shadow">{label}</span>
                <span className="mt-1 text-[10px] font-bold text-white/60">
                  {rows[key].length}/{size}
                </span>
              </div>
              <div className="flex min-h-[4.4rem] flex-1 gap-1">
                {rows[key].map((c) => (
                  <span key={c} onPointerDown={startDrag(c, key)} className={`touch-none ${draggingOut(c) ? 'opacity-30' : ''}`}>
                    <PlayingCard
                      code={c}
                      className="animate-deal"
                      onClick={() => {
                        if (!suppressClick.current) {
                          moveTo([c], 'hand');
                        }
                      }}
                    />
                  </span>
                ))}
                {Array.from({ length: size - rows[key].length }).map((_, i) => (
                  <span key={i} className="h-[4.4rem] w-[3rem] shrink-0 rounded-md border-2 border-dashed border-white/15" />
                ))}
              </div>
              {preview?.labels[key] && (
                <span className="absolute -top-2 right-2 rounded-full bg-gradient-to-b from-gold-300 to-gold-500 px-2 py-0.5 font-display text-[10px] font-black text-night-900 shadow">
                  {preview.labels[key]}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {preview?.is_foul && <Notice tone="warning">Foul: Back must be ≥ Middle ≥ Front.</Notice>}

      <div data-zone="hand" className={`mt-3 rounded-2xl border p-2 ${hovering === 'hand' ? 'border-mint-400 bg-mint-500/15' : 'border-white/10 bg-black/30'}`}>
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-display font-extrabold text-white/80">
            Your hand <span className="text-gold-300">{hand.length}</span>
            {selected.length > 0 && <span className="ml-2 text-mint-400">{selected.length} selected — tap or drag to a lane</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSortBy(sortBy === 'rank' ? 'suit' : 'rank')} className="h-8 rounded-full bg-white/10 px-3 font-bold">
              Sort: {sortBy}
            </button>
            <button
              onClick={() => {
                setRows({ front: [], middle: [], back: [] });
                setSelected([]);
              }}
              className="h-8 rounded-full bg-white/10 px-3 font-bold"
            >
              Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          {hand.map((c) => (
            <span key={c} onPointerDown={startDrag(c, 'hand')} className={`touch-none ${draggingOut(c) ? 'opacity-30' : ''}`}>
              <PlayingCard
                code={c}
                selected={selected.includes(c)}
                onClick={() => {
                  if (suppressClick.current) {
                    return;
                  }
                  play('tap');
                  setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]));
                }}
              />
            </span>
          ))}
          {hand.length === 0 && <p className="py-3 text-sm font-bold text-mint-400">All cards placed — submit when ready!</p>}
        </div>
        <p className="mt-1 text-center text-[10px] text-white/45">Tip: drag cards onto a lane, between lanes, or back here.</p>
      </div>

      <GameButton tone={complete && !foulBlocked ? 'green' : 'glass'} size="lg" className="mt-3 w-full" onClick={submit} disabled={!complete || busy || foulBlocked}>
        {busy ? 'Submitting…' : 'SUBMIT HAND'}
      </GameButton>

      {drag?.moving && (
        <div ref={ghostRef} className="pointer-events-none fixed left-0 top-0 z-50 drop-shadow-[0_10px_16px_rgb(0_0_0/0.5)] will-change-transform" style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0) translate(-50%, -50%) rotate(6deg)` }}>
          <PlayingCard code={drag.card} />
          {drag.from === 'hand' && selected.includes(drag.card) && selected.length > 1 && (
            <span className="absolute -right-2 -top-2 rounded-full bg-candy-500 px-1.5 font-display text-xs font-black">{selected.length}</span>
          )}
        </div>
      )}
    </div>
  );
}
