import { Link } from '@inertiajs/react';
import { useEffect } from 'react';
import DataTable from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Badge, Button, Card, statusTone } from '../../Components/ui';
import { api } from '../../lib/api';
import { dateTime, titleCase } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface TableRow {
  id: number;
  status: string;
  room: { id: number; name: string };
  currency: string;
  players: Array<{ user_id: number; username: string; seat: number; is_ready: boolean; is_connected: boolean }>;
  session: { id: number; status: string; deadline: string | null } | null;
  created_at: string;
}

export default function Tables() {
  const { data, loading, reload } = useApi<{ data: TableRow[] }>('/admin/tables');

  useEffect(() => {
    const id = setInterval(reload, 10_000);
    return () => clearInterval(id);
  }, [reload]);

  const close = async (t: TableRow) => {
    const reason = prompt('Reason for closing this table (entries will be refunded):');
    if (reason) {
      await api.post(`/admin/tables/${t.id}/close`, { reason });
      reload();
    }
  };

  const cancel = async (t: TableRow) => {
    const reason = prompt('Reason for cancelling this game (all entries refunded):');
    if (reason && t.session) {
      await api.post(`/admin/games/${t.session.id}/cancel`, { reason });
      reload();
    }
  };

  return (
    <PageShell title="Active Tables">
      <Card title="Open tables" subtitle="Refreshes every 10 seconds.">
        <DataTable<TableRow>
          loading={loading && !data}
          rows={data?.data}
          rowKey={(t) => t.id}
          empty="No open tables."
          columns={[
            { key: 'id', label: 'Table', render: (t) => `#${t.id}` },
            { key: 'room', label: 'Room', render: (t) => t.room?.name },
            { key: 'status', label: 'Status', render: (t) => <Badge tone={statusTone(t.status)}>{titleCase(t.status)}</Badge> },
            {
              key: 'players',
              label: 'Players',
              render: (t) => (
                <div className="flex flex-wrap gap-1">
                  {t.players.map((p) => (
                    <Badge key={p.user_id} tone={p.is_connected ? (p.is_ready ? 'success' : 'gray') : 'error'}>
                      {p.seat}. {p.username}
                    </Badge>
                  ))}
                </div>
              ),
            },
            { key: 'session', label: 'Game', render: (t) => (t.session ? <Link href={`/admin/sessions/${t.session.id}`} className="text-brand-500">#{t.session.id} · {titleCase(t.session.status)}</Link> : '—') },
            { key: 'deadline', label: 'Timer ends', render: (t) => dateTime(t.session?.deadline) },
            {
              key: 'act',
              label: '',
              align: 'right',
              render: (t) =>
                t.session ? (
                  <Button size="sm" variant="danger" onClick={() => cancel(t)}>Cancel game</Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => close(t)}>Close table</Button>
                ),
            },
          ]}
        />
      </Card>
    </PageShell>
  );
}
