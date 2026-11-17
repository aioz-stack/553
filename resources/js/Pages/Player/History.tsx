import { Link } from '@inertiajs/react';
import { useState } from 'react';
import DataTable, { Pager } from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Badge, Card, statusTone } from '../../Components/ui';
import { dateTime, points, titleCase } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface GameRow {
  id: number;
  room: { name: string };
  status: string;
  currency: string;
  payout_mode: string;
  pot: string;
  started_at: string;
  my_result: { score: number; placement: number; net: string; is_foul: boolean } | null;
}

export default function History() {
  const [page, setPage] = useState(1);
  const { data, loading } = useApi<{ data: GameRow[]; meta: { current_page: number; last_page: number; total: number } }>('/profile/games', { page });

  return (
    <PageShell title="Game History">
      <Card title="Your games">
        <DataTable<GameRow>
          loading={loading}
          rows={data?.data}
          rowKey={(g) => g.id}
          empty="No games yet — head to the lobby!"
          columns={[
            { key: 'id', label: 'Game', render: (g) => <Link href={`/games/${g.id}`} className="text-brand-500">#{g.id}</Link> },
            { key: 'room', label: 'Room', render: (g) => g.room.name },
            { key: 'date', label: 'Played', render: (g) => dateTime(g.started_at) },
            { key: 'status', label: 'Status', render: (g) => <Badge tone={statusTone(g.status)}>{titleCase(g.status)}</Badge> },
            { key: 'place', label: 'Place', render: (g) => (g.my_result ? `#${g.my_result.placement}` : '—') },
            { key: 'score', label: 'Score', align: 'right', render: (g) => g.my_result?.score ?? '—' },
            {
              key: 'net',
              label: 'Net',
              align: 'right',
              render: (g) =>
                g.my_result ? <span className={Number(g.my_result.net) >= 0 ? 'text-success-600' : 'text-error-600'}>{points(g.my_result.net, g.currency)}</span> : '—',
            },
          ]}
        />
        <Pager meta={data?.meta} onPage={setPage} />
      </Card>
    </PageShell>
  );
}
