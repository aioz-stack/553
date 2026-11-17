'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { GameButton } from './game';
import PlayingCard, { sortCards } from './PlayingCard';
import { Notice } from './ui';

type Row = 'front' | 'middle' | 'back';
const ROWS: Array<[Row, string, number]> = [
  ['front', 'Front', 3],
  ['middle', 'Middle', 5],
  ['back', 'Back', 5],
];

/**
 * Touch arrangement: tap cards to select, tap a row to place them, tap a
 * placed card to send it back. Hand names and foul warnings come from the
 * server preview endpoint; the app never evaluates or scores hands.
 */
export default function ArrangeHands({ sessionId, cards, allowFoul, onSubmitted }: { sessionId: number; cards: string[]; allowFoul: boolean; onSubmitted: () => void }) {
  const [rows, setRows] = useState<Record<Row, string[]>>({ front: [], middle: [], back: [] });
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'rank' | 'suit'>('rank');
  const [preview, setPreview] = useState<{ labels: Record<Row, string | null>; is_foul: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const placed = useMemo(() => new Set([...rows.front, ...rows.middle, ...rows.back]), [rows]);
  const hand = sortCards(cards.filter((c) => !placed.has(c)), sortBy);
  const complete = rows.front.length === 3 && rows.middle.length === 5 && rows.back.length === 5;
  const foulBlocked = !!preview?.is_foul && !allowFoul;

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ data: { labels: Record<Row, string | null>; is_foul: boolean } }>(`/games/${sessionId}/preview`, { method: 'POST', body: rows })
        .then((r) => setPreview(r.data))
        .catch(() => undefined);
    }, 200);
    return () => clearTimeout(t);
  }, [rows, sessionId]);

  const haptic = async () => {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      // no haptics on web
    }
  };

  const place = (row: Row, size: number) => {
    if (!selected.length) {
      return;
    }
    haptic();
    setRows((r) => ({ ...r, [row]: [...r[row], ...selected.slice(0, size - r[row].length)] }));
    setSelected([]);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/games/${sessionId}/submit`, { method: 'POST', body: rows });
      onSubmitted();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {error && <Notice>{error}</Notice>}

      <div className="space-y-2">
        {ROWS.map(([key, label, size]) => {
          const target = selected.length > 0 && rows[key].length < size;

          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              aria-label={`${label} row`}
              onClick={() => place(key, size)}
              onKeyDown={(e) => e.key === 'Enter' && place(key, size)}
              className={`relative flex items-center gap-2 rounded-2xl border-2 p-2 transition ${
                target ? 'border-gold-300 bg-gold-400/15 shadow-[0_0_16px_rgb(255_204_61/0.45)]' : 'border-white/15 bg-black/25'
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
                  <PlayingCard key={c} code={c} className="animate-deal" onClick={() => setRows((r) => ({ ...r, [key]: r[key].filter((x) => x !== c) }))} />
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

      <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-2">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-display font-extrabold text-white/80">
            Your hand <span className="text-gold-300">{hand.length}</span>
            {selected.length > 0 && <span className="ml-2 text-mint-400">{selected.length} selected — tap a row</span>}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setSortBy(sortBy === 'rank' ? 'suit' : 'rank')} className="h-8 rounded-full bg-white/10 px-3 font-bold">
              Sort: {sortBy}
            </button>
            <button onClick={() => { setRows({ front: [], middle: [], back: [] }); setSelected([]); }} className="h-8 rounded-full bg-white/10 px-3 font-bold">
              Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-1">
          {hand.map((c) => (
            <PlayingCard key={c} code={c} selected={selected.includes(c)} onClick={() => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} />
          ))}
          {hand.length === 0 && <p className="py-3 text-sm font-bold text-mint-400">All cards placed — submit when ready!</p>}
        </div>
      </div>

      <GameButton tone={complete && !foulBlocked ? 'green' : 'glass'} size="lg" className="mt-3 w-full" onClick={submit} disabled={!complete || busy || foulBlocked}>
        {busy ? 'Submitting…' : 'SUBMIT HAND'}
      </GameButton>
    </div>
  );
}
