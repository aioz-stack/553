import { useState } from 'react';
import DataTable, { Pager } from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Badge, Card, Input } from '../../Components/ui';
import { dateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface Log {
  id: number;
  actor?: { id: number; name: string; username: string } | null;
  action: string;
  subject_type: string | null;
  subject_id: number | null;
  old_values: unknown;
  new_values: unknown;
  ip_address: string | null;
  created_at: string;
}

export default function AuditLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, loading } = useApi<{ data: Log[]; meta: { current_page: number; last_page: number; total: number } }>('/admin/audit-logs', { page, action: action || undefined });

  return (
    <PageShell title="Audit Logs">
      <Card title="Audit trail" subtitle="Append-only record of administrative and wallet actions.">
        <div className="mb-4 max-w-sm">
          <Input placeholder="Filter by action prefix (e.g. wallet.)" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        </div>
        <DataTable<Log>
          loading={loading}
          rows={data?.data}
          rowKey={(l) => l.id}
          columns={[
            { key: 'date', label: 'When', render: (l) => dateTime(l.created_at) },
            { key: 'actor', label: 'Actor', render: (l) => l.actor?.username ?? 'system' },
            { key: 'action', label: 'Action', render: (l) => <Badge tone="brand">{l.action}</Badge> },
            { key: 'subject', label: 'Subject', render: (l) => (l.subject_type ? `${l.subject_type} #${l.subject_id}` : '—') },
            { key: 'changes', label: 'Details', render: (l) => <code className="block max-w-md truncate text-xs">{JSON.stringify(l.new_values ?? l.old_values ?? {})}</code> },
            { key: 'ip', label: 'IP', render: (l) => l.ip_address ?? '—' },
          ]}
        />
        <Pager meta={data?.meta} onPage={setPage} />
      </Card>
    </PageShell>
  );
}
