import { useState, type ReactNode } from 'react';
import { dateTime, points, titleCase } from '../lib/format';
import { useApi } from '../lib/useApi';
import DataTable, { Pager } from './DataTable';
import { Badge, Select, statusTone } from './ui';

export interface Commission {
  id: number;
  agent?: { id: number; code: string; name: string };
  player?: { id: number; name: string; username: string };
  game_session_id: number;
  currency: string;
  fee_basis: string;
  rate_percent: number;
  amount: string;
  status: string;
  created_at: string;
}

export default function CommissionsTable({ endpoint, actions }: { endpoint: string; actions?: (c: Commission, reload: () => void) => ReactNode }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useApi<{ data: Commission[]; meta: { current_page: number; last_page: number; total: number } }>(endpoint, { page, status: status || undefined });

  return (
    <div>
      <div className="mb-4 w-48">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {['pending', 'approved', 'paid', 'rejected', 'reversed'].map((s) => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </Select>
      </div>
      <DataTable<Commission>
        loading={loading}
        rows={data?.data}
        rowKey={(c) => c.id}
        columns={[
          { key: 'date', label: 'Date', render: (c) => dateTime(c.created_at) },
          ...(data?.data[0]?.agent ? [{ key: 'agent', label: 'Agent', render: (c: Commission) => c.agent?.name ?? '—' }] : []),
          { key: 'player', label: 'Player', render: (c) => c.player?.username ?? '—' },
          { key: 'game', label: 'Game', render: (c) => `#${c.game_session_id}` },
          { key: 'basis', label: 'Fee basis', align: 'right', render: (c) => points(c.fee_basis, c.currency) },
          { key: 'rate', label: 'Rate', align: 'right', render: (c) => `${c.rate_percent}%` },
          { key: 'amount', label: 'Commission', align: 'right', render: (c) => <strong>{points(c.amount, c.currency)}</strong> },
          { key: 'status', label: 'Status', render: (c) => <Badge tone={statusTone(c.status)}>{titleCase(c.status)}</Badge> },
          ...(actions ? [{ key: 'actions', label: '', align: 'right' as const, render: (c: Commission) => actions(c, reload) }] : []),
        ]}
      />
      <Pager meta={data?.meta} onPage={setPage} />
    </div>
  );
}
