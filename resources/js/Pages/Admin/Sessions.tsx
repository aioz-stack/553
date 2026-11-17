import { Link } from '@inertiajs/react';
import { useState } from 'react';
import DataTable, { Pager } from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Badge, Card, Select, statusTone } from '../../Components/ui';
import { dateTime, points, titleCase } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface Row {
  id: number;
  room: { name: string };
  status: string;
  currency: string;
  payout_mode: string;
  pot: string;
  platform_fee: string;
  started_at: string;
  players?: Array<{ user_id: number; name: string; score: number; placement: number; net: string }>;
}

/**
 * Game sessions and their results.
 */
export default function Sessions() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const { data, loading } = useApi<{ data: Row[]; meta: { current_page: number; last_page: number; total: number } }>('/admin/games', { page, status: status || undefined });

  return (
    <PageShell title="Game Sessions">
      <Card title="Sessions & results">
        <div className="mb-4 w-56">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['ARRANGING', 'SUBMITTED', 'REVEALING', 'SCORING', 'COMPLETED', 'CANCELLED'].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
        </div>
        <DataTable<Row>
          loading={loading}
          rows={data?.data}
          rowKey={(r) => r.id}
          columns={[
            { key: 'id', label: 'Game', render: (r) => <Link href={`/admin/sessions/${r.id}`} className="text-brand-500">#{r.id}</Link> },
            { key: 'room', label: 'Room', render: (r) => r.room.name },
            { key: 'started', label: 'Started', render: (r) => dateTime(r.started_at) },
            { key: 'status', label: 'Status', render: (r) => <Badge tone={statusTone(r.status)}>{titleCase(r.status)}</Badge> },
            { key: 'pot', label: 'Pot', align: 'right', render: (r) => points(r.pot, r.currency) },
            { key: 'fee', label: 'Fee', align: 'right', render: (r) => points(r.platform_fee) },
            { key: 'winner', label: 'Winner(s)', render: (r) => r.players?.filter((p) => p.placement === 1).map((p) => p.name).join(', ') || '—' },
          ]}
        />
        <Pager meta={data?.meta} onPage={setPage} />
      </Card>
    </PageShell>
  );
}
