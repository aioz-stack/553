import AllocateForm, { type Recipient } from '../../Components/AllocateForm';
import PageShell from '../../Components/PageShell';
import { Card, StatCard } from '../../Components/ui';
import { points } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { AgentOverviewData } from './types';

export default function Allocate() {
  const players = useApi<{ data: Recipient[] }>('/agent/players', { per_page: 100 });
  const overview = useApi<{ data: AgentOverviewData }>('/agent/dashboard');
  const preset = Number(new URLSearchParams(window.location.search).get('player')) || undefined;

  return (
    <PageShell title="Point Allocation">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4">
          <StatCard label="Available Chips" value={points(overview.data?.data.allocation.CH)} />
        </div>
        <Card title="Distribute to your players" subtitle="You can only allocate from your available balance, and only to players you manage." className="lg:col-span-2">
          {players.data && <AllocateForm recipients={players.data.data} defaultRecipient={preset} onDone={overview.reload} />}
        </Card>
      </div>
    </PageShell>
  );
}
