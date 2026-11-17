'use client';

import { useState } from 'react';
import { Coin, GameButton } from '@/components/game';
import { Screen, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { points, titleCase, useFetch, when } from '@/lib/hooks';
import type { Transaction } from '@/lib/types';

export default function Transactions() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, loading } = useFetch<{ data: Transaction[]; meta: { current_page: number; last_page: number } }>(user ? '/wallet/transactions' : null, { page });

  return (
    <Screen title="Transactions" back>
      {loading && <Spinner />}
      {data?.data.length === 0 && <p className="pt-10 text-center text-white/60">No transactions yet.</p>}
      <ul className="space-y-2">
        {data?.data.map((t) => (
          <li key={t.id} className="glass flex items-center gap-3 rounded-2xl px-3 py-3">
            <Coin currency={t.currency} size={34} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-extrabold">{titleCase(t.type)}</p>
              <p className="truncate text-[11px] text-white/55">{when(t.created_at)} · {t.reference}</p>
            </div>
            <p className={`font-display text-base font-black ${t.direction === 'in' ? 'text-mint-400' : 'text-candy-400'}`}>
              {t.direction === 'in' ? '+' : '−'}
              {points(t.amount)}
            </p>
          </li>
        ))}
      </ul>
      {data?.meta && data.meta.last_page > 1 && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <GameButton tone="glass" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹ Prev</GameButton>
          <GameButton tone="glass" disabled={page >= data.meta.last_page} onClick={() => setPage(page + 1)}>Next ›</GameButton>
        </div>
      )}
    </Screen>
  );
}
