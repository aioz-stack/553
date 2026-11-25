import { type ReactNode } from 'react';
import { Btn, Note, SearchInput, fieldClass } from './kit';

/** The viewer's timezone, so date filters match the dates shown in the tables. */
export const viewerTz = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
})();

export type Sort = 'newest' | 'oldest' | 'amount_desc' | 'amount_asc';
export const SORTS: Array<[Sort, string]> = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['amount_desc', 'Highest amount'],
  ['amount_asc', 'Lowest amount'],
];

/** Search, From / To dates and extra pickers for the read-only history pages, with a Clear button. */
export function HistoryFilters({
  q,
  onQ,
  placeholder,
  from,
  to,
  onFrom,
  onTo,
  children,
  onClear,
  dirty,
}: {
  q: string;
  onQ: (v: string) => void;
  placeholder: string;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  children?: ReactNode;
  onClear: () => void;
  dirty: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 px-5 py-4">
      <SearchInput value={q} onChange={onQ} placeholder={placeholder} />
      <label className="block w-[9.5rem]">
        <span className="mb-1 block text-xs font-bold uppercase text-[#6b6385] dark:text-white/55">From</span>
        <input type="date" value={from} max={to || undefined} onChange={(e) => onFrom(e.target.value)} aria-label="From date" className={fieldClass} />
      </label>
      <label className="block w-[9.5rem]">
        <span className="mb-1 block text-xs font-bold uppercase text-[#6b6385] dark:text-white/55">To</span>
        <input type="date" value={to} min={from || undefined} onChange={(e) => onTo(e.target.value)} aria-label="To date" className={fieldClass} />
      </label>
      {children}
      {dirty && (
        <Btn variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Btn>
      )}
    </div>
  );
}

export function LoadError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="px-5 pb-4">
      <Note tone="warn">
        <span className="font-semibold">Could not load the history: {error}</span>{' '}
        <button type="button" onClick={onRetry} className="font-bold underline">
          Try again
        </button>
      </Note>
    </div>
  );
}
