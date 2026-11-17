import DataTable from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Card } from '../../Components/ui';
import { dateTime, points } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface Row {
  player: { id: number; name: string; username: string };
  game_session_id: number;
  score: number;
  placement: number;
  net: string;
  at: string;
}

export default function Activity() {
  const { data, loading } = useApi<{ data: Row[] }>('/agent/activity');

  return (
    <PageShell title="Player Activity">
      <Card title="Recent games by your players">
        <DataTable<Row>
          loading={loading}
          rows={data?.data}
          rowKey={(r) => `${r.game_session_id}-${r.player.id}`}
          columns={[
            { key: 'at', label: 'When', render: (r) => dateTime(r.at) },
            { key: 'player', label: 'Player', render: (r) => `${r.player.name} (@${r.player.username})` },
            { key: 'game', label: 'Game', render: (r) => `#${r.game_session_id}` },
            { key: 'place', label: 'Place', render: (r) => `#${r.placement}` },
            { key: 'score', label: 'Score', align: 'right', render: (r) => r.score },
            { key: 'net', label: 'Net', align: 'right', render: (r) => points(r.net) },
          ]}
        />
      </Card>
    </PageShell>
  );
}
