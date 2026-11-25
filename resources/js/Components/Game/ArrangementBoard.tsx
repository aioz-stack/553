import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import PlayingCard, { sortCards } from '../PlayingCard';
import { Alert, Badge, Button } from '../ui';

type Row = 'front' | 'middle' | 'back';

const ROWS: Array<{ key: Row; label: string; size: number }> = [
  { key: 'front', label: 'Front', size: 3 },
  { key: 'middle', label: 'Middle', size: 5 },
  { key: 'back', label: 'Back', size: 5 },
];

/**
 * Front / Middle / Back arrangement. Tap a card in your hand to select it,
 * then tap a row to place it; tap a placed card to return it. Hand names
 * and foul warnings come from the server preview endpoint — the client
 * never evaluates or scores hands itself.
 */
export default function ArrangementBoard({ sessionId, cards, onSubmitted, disabled }: { sessionId: number; cards: string[]; onSubmitted: () => void; disabled?: boolean }) {
  const storageKey = `pusoy:arrangement:${sessionId}`;
  const [rows, setRows] = useState<Record<Row, string[]>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      if (saved && [...saved.front, ...saved.middle, ...saved.back].every((c: string) => cards.includes(c))) {
        return saved;
      }
    } catch {
      // ignore unreadable drafts
    }
    return { front: [], middle: [], back: [] };
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'rank' | 'suit'>('rank');
  const [preview, setPreview] = useState<{ labels: Record<Row, string | null>; complete: boolean; is_foul: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placed = useMemo(() => new Set([...rows.front, ...rows.middle, ...rows.back]), [rows]);
  const hand = sortCards(cards.filter((c) => !placed.has(c)), sortBy);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(rows));
    } catch {
      // storage unavailable — draft simply won't persist
    }

    const timer = setTimeout(() => {
      api.post(`/games/${sessionId}/preview`, rows).then((r) => setPreview(r.data.data)).catch(() => undefined);
    }, 200);

    return () => clearTimeout(timer);
  }, [rows, sessionId, storageKey]);

  const toggleSelect = (card: string) =>
    setSelected((current) => (current.includes(card) ? current.filter((c) => c !== card) : [...current, card]));

  const placeInto = (row: Row, size: number) => {
    if (selected.length === 0) {
      return;
    }

    setRows((current) => {
      const room = size - current[row].length;
      const moving = selected.slice(0, room);

      return { ...current, [row]: [...current[row], ...moving] };
    });
    setSelected([]);
  };

  const removeFrom = (row: Row, card: string) => setRows((current) => ({ ...current, [row]: current[row].filter((c) => c !== card) }));

  const complete = rows.front.length === 3 && rows.middle.length === 5 && rows.back.length === 5;

  const submit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/games/${sessionId}/submit`, rows);
      sessionStorage.removeItem(storageKey);
      onSubmitted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}

      <div className="space-y-3">
        {ROWS.map(({ key, label, size }) => (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => placeInto(key, size)}
            onKeyDown={(e) => e.key === 'Enter' && placeInto(key, size)}
            className={`rounded-xl border-2 border-dashed p-3 transition ${
              selected.length && rows[key].length < size ? 'border-brand-400 bg-brand-25 dark:bg-brand-500/5' : 'border-gray-200 dark:border-gray-700'
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {label} <span className="text-gray-400">({rows[key].length}/{size})</span>
              </span>
              {preview?.labels[key] && <Badge tone="brand">{preview.labels[key]}</Badge>}
            </div>
            <div className="flex min-h-20 flex-wrap gap-1.5 sm:min-h-24">
              {rows[key].map((card) => (
                <PlayingCard
                  key={card}
                  code={card}
                  onClick={() => {
                    removeFrom(key, card);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {preview?.is_foul && <Alert tone="warning">Misarranged: Back should be at least as strong as Middle, and Middle at least as strong as Front. You can still submit — a misarranged hand costs 2× your bet.</Alert>}

      <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Your hand ({hand.length})</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSortBy(sortBy === 'rank' ? 'suit' : 'rank')}>
              Sort by {sortBy === 'rank' ? 'suit' : 'rank'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRows({ front: [], middle: [], back: [] })}>
              Reset
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {hand.map((card) => (
            <PlayingCard key={card} code={card} selected={selected.includes(card)} onClick={() => toggleSelect(card)} />
          ))}
        </div>
      </div>

      <Button className="w-full" onClick={submit} disabled={!complete || submitting || disabled}>
        {submitting ? 'Submitting…' : 'Submit arrangement'}
      </Button>
    </div>
  );
}
