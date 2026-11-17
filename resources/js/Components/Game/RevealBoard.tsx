import PlayingCard from '../PlayingCard';
import { Badge } from '../ui';
import type { Arrangement, Result } from '../../lib/types';
import { points } from '../../lib/format';

/**
 * Everyone's arrangements after the reveal, plus the final results.
 */
export default function RevealBoard({ arrangements, results, currency }: { arrangements: Arrangement[]; results?: Result[] | null; currency: string }) {
  const byUser = new Map(results?.map((r) => [r.user_id, r]) ?? []);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {arrangements.map((a) => {
        const result = byUser.get(a.user_id);

        return (
          <div key={a.user_id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800 dark:text-white/90">{a.name}</span>
                {a.is_foul && <Badge tone="error">Foul</Badge>}
                {a.is_auto && <Badge tone="warning">Auto</Badge>}
              </div>
              {result && (
                <div className="flex items-center gap-2">
                  <Badge tone={result.placement === 1 ? 'success' : 'gray'}>#{result.placement}</Badge>
                  <Badge tone={result.score >= 0 ? 'success' : 'error'}>{result.score > 0 ? `+${result.score}` : result.score} pts</Badge>
                  <span className={`text-sm font-semibold ${Number(result.net) >= 0 ? 'text-success-600' : 'text-error-600'}`}>
                    {Number(result.net) >= 0 ? '+' : ''}
                    {points(result.net, currency)}
                  </span>
                </div>
              )}
            </div>
            {(['front', 'middle', 'back'] as const).map((row) => (
              <div key={row} className="mb-2 flex items-center gap-3">
                <span className="w-14 text-xs uppercase text-gray-500">{row}</span>
                <div className="flex flex-wrap gap-1">
                  {a[row].map((c) => (
                    <PlayingCard key={c} code={c} size="sm" />
                  ))}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{a.labels[row]}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
