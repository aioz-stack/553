'use client';

import { useState } from 'react';
import { Badge, Button, Screen, Spinner } from '@/components/ui';
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
      <ul className="divide-y divide-gray-200 rounded-2xl bg-white dark:divide-gray-800 dark:bg-gray-900">
        {data?.data.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{titleCase(t.type)}</p>
              <p className="truncate text-xs text-gray-500">{when(t.created_at)} · {t.reference}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-semibold ${t.direction === 'in' ? 'text-success-700' : 'text-error-700'}`}>
                {t.direction === 'in' ? '+' : '−'}{points(t.amount)}
              </p>
              <Badge>{t.currency}</Badge>
            </div>
          </li>
        ))}
      </ul>
      {data?.meta && data.meta.last_page > 1 && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" disabled={page >= data.meta.last_page} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </Screen>
  );
}
