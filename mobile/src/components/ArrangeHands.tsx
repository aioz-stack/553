'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '@/lib/api';
import PlayingCard, { sortCards } from './PlayingCard';
import { Badge, Button, Notice } from './ui';

type Row = 'front' | 'middle' | 'back';
const ROWS: Array<[Row, string, number]> = [
  ['front', 'Front', 3],
  ['middle', 'Middle', 5],
  ['back', 'Back', 5],
];

/**
 * Touch arrangement: tap cards to select, tap a row to place them, tap a
 * placed card to return it. Hand names and foul warnings come from the
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
      {ROWS.map(([key, label, size]) => (
        <div
          key={key}
          onClick={() => place(key, size)}
          className={`mb-2 rounded-xl border-2 border-dashed p-2 ${selected.length && rows[key].length < size ? 'border-brand-400 bg-brand-50/40' : 'border-white/20'}`}
        >
          <div className="mb-1 flex items-center justify-between text-xs text-white/80">
            <span>
              {label} {rows[key].length}/{size}
            </span>
            {preview?.labels[key] && <Badge tone="brand">{preview.labels[key]}</Badge>}
          </div>
          <div className="flex min-h-[4.25rem] gap-1">
            {rows[key].map((c) => (
              <PlayingCard key={c} code={c} onClick={() => setRows((r) => ({ ...r, [key]: r[key].filter((x) => x !== c) }))} />
            ))}
          </div>
        </div>
      ))}

      {preview?.is_foul && <Notice tone="warning">Foul: Back ≥ Middle ≥ Front is required.</Notice>}

      <div className="mt-3 rounded-xl bg-black/20 p-2">
        <div className="mb-2 flex items-center justify-between text-xs text-white/80">
          <span>Your hand ({hand.length})</span>
          <div className="flex gap-3">
            <button onClick={() => setSortBy(sortBy === 'rank' ? 'suit' : 'rank')} className="h-8">
              Sort: {sortBy}
            </button>
            <button onClick={() => setRows({ front: [], middle: [], back: [] })} className="h-8">
              Reset
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {hand.map((c) => (
            <PlayingCard key={c} code={c} selected={selected.includes(c)} onClick={() => setSelected((s) => (s.includes(c) ? s.filter((x) => x !== c) : [...s, c]))} />
          ))}
        </div>
      </div>

      <Button className="mt-3 w-full" onClick={submit} disabled={!complete || busy || (preview?.is_foul && !allowFoul)}>
        {busy ? 'Submitting…' : 'Submit arrangement'}
      </Button>
    </div>
  );
}
