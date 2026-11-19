import { useState } from 'react';
import { dateTime, points, titleCase } from '../lib/format';
import type { Transaction } from '../lib/types';
import { useApi, type Paginated } from '../lib/useApi';
import DataTable, { Pager } from './DataTable';
import { Badge, Select } from './ui';

const TYPES = ['ADMIN_ALLOCATION', 'AGENT_ALLOCATION', 'PLAYER_CREDIT', 'PLAYER_DEBIT', 'GAME_ENTRY', 'GAME_REFUND', 'GAME_REWARD', 'PLATFORM_FEE', 'COMMISSION_PAYMENT', 'MANUAL_ADJUSTMENT', 'DAILY_REWARD', 'REVERSAL'];

/**
 * Ledger list used by players, agents and staff. `staff` shows both sides of
 * each movement; others see direction and their own balance before/after.
 */
export default function TransactionsTable({ endpoint, staff = false, extraFilters = {} }: { endpoint: string; staff?: boolean; extraFilters?: Record<string, unknown> }) {
  const [page, setPage] = useState(1);
  const [currency, setCurrency] = useState('');
  const [type, setType] = useState('');
  const { data, loading, error } = useApi<Paginated<Transaction> & { meta: { current_page: number; last_page: number; total: number } }>(endpoint, {
    page,
    currency: currency || undefined,
    type: type || undefined,
    ...extraFilters,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <Select value={currency} onChange={(e) => { setCurrency(e.target.value); setPage(1); }} className="w-36">
          <option value="">All currencies</option>
          <option value="CH">Chips</option>
          <option value="GD">Gold</option>
        </Select>
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-56">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {titleCase(t)}
            </option>
          ))}
        </Select>
      </div>
      {error && <p className="mb-3 text-sm text-error-500">{error}</p>}
      <DataTable<Transaction>
        loading={loading}
        rows={data?.data}
        rowKey={(t) => t.id}
        columns={[
          { key: 'date', label: 'Date', render: (t) => dateTime(t.created_at) },
          { key: 'ref', label: 'Reference', render: (t) => <code className="text-xs">{t.reference}</code> },
          { key: 'type', label: 'Type', render: (t) => <Badge tone="brand">{titleCase(t.type)}</Badge> },
          ...(staff
            ? [
                { key: 'from', label: 'From', render: (t: Transaction) => t.source ?? '—' },
                { key: 'to', label: 'To', render: (t: Transaction) => t.destination ?? '—' },
              ]
            : [{ key: 'dir', label: 'Direction', render: (t: Transaction) => <Badge tone={t.direction === 'in' ? 'success' : 'error'}>{t.direction === 'in' ? 'Credit' : 'Debit'}</Badge> }]),
          { key: 'amount', label: 'Amount', align: 'right', render: (t) => <span className="font-semibold">{points(t.amount, t.currency)}</span> },
          ...(!staff ? [{ key: 'after', label: 'Balance after', align: 'right' as const, render: (t: Transaction) => (t.balance_after ? points(t.balance_after) : '—') }] : []),
          { key: 'reason', label: 'Reason', render: (t) => <span className="max-w-64 truncate">{t.reason ?? '—'}</span> },
        ]}
      />
      <Pager meta={data?.meta} onPage={setPage} />
    </div>
  );
}
