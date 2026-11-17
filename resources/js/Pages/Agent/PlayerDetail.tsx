import AllocateForm from '../../Components/AllocateForm';
import DataTable from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Alert, Card, Spinner, StatCard } from '../../Components/ui';
import { dateTime, points } from '../../lib/format';
import type { Wallet } from '../../lib/types';
import { useApi } from '../../lib/useApi';

interface Detail {
  player: { id: number; name: string; username: string; email: string; status: string };
  wallets: Wallet[];
  recent_games: Array<{ game_session_id: number; score: number; placement: number; net: string; played_at: string }>;
}

export default function PlayerDetail({ playerId }: { playerId: number }) {
  const { data, error, loading, reload } = useApi<{ data: Detail }>(`/agent/players/${playerId}`);
  const d = data?.data;

  return (
    <PageShell title={d ? `${d.player.name} (@${d.player.username})` : 'Player'}>
      {loading && <Spinner />}
      {error && <Alert>{error}</Alert>}
      {d && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            {d.wallets.map((w) => (
              <StatCard key={w.id} label={`${w.currency} wallet`} value={points(w.balance, w.currency)} />
            ))}
            <Card title="Allocate to this player">
              <AllocateForm recipients={[{ id: d.player.id, name: d.player.name, username: d.player.username }]} defaultRecipient={d.player.id} onDone={reload} />
            </Card>
          </div>
          <Card title="Recent games" className="lg:col-span-2">
            <DataTable
              rows={d.recent_games}
              rowKey={(g) => g.game_session_id}
              empty="No games played yet."
              columns={[
                { key: 'game', label: 'Game', render: (g) => `#${g.game_session_id}` },
                { key: 'date', label: 'Played', render: (g) => dateTime(g.played_at) },
                { key: 'place', label: 'Place', render: (g) => `#${g.placement}` },
                { key: 'score', label: 'Score', align: 'right', render: (g) => g.score },
                { key: 'net', label: 'Net', align: 'right', render: (g) => points(g.net) },
              ]}
            />
          </Card>
        </div>
      )}
    </PageShell>
  );
}
