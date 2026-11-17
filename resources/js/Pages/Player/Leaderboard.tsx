import { usePage } from '@inertiajs/react';
import DataTable from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Badge, Card } from '../../Components/ui';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';

interface Row {
  rank: number;
  user_id: number;
  name: string;
  games_played: number;
  games_won: number;
  total_score: number;
  win_rate: number;
}

export default function Leaderboard() {
  const { auth } = usePage<SharedProps>().props;
  const { data, loading } = useApi<{ data: Row[] }>('/leaderboard');

  return (
    <PageShell title="Leaderboard">
      <Card title="Top players" subtitle="Ranked by total score across all games.">
        <DataTable<Row>
          loading={loading}
          rows={data?.data}
          rowKey={(r) => r.user_id}
          columns={[
            { key: 'rank', label: 'Rank', render: (r) => (r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : `#${r.rank}`) },
            { key: 'name', label: 'Player', render: (r) => <span className="font-medium">{r.name} {r.user_id === auth.user?.id && <Badge tone="brand">You</Badge>}</span> },
            { key: 'played', label: 'Games', align: 'right', render: (r) => r.games_played },
            { key: 'won', label: 'Wins', align: 'right', render: (r) => r.games_won },
            { key: 'rate', label: 'Win rate', align: 'right', render: (r) => `${r.win_rate}%` },
            { key: 'score', label: 'Score', align: 'right', render: (r) => <strong>{r.total_score}</strong> },
          ]}
        />
      </Card>
    </PageShell>
  );
}
