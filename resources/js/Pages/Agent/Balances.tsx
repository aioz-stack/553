import PageShell from '../../Components/PageShell';
import { Badge, Card, StatCard } from '../../Components/ui';
import { points, titleCase } from '../../lib/format';
import type { Wallet } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export default function Balances() {
  const { data } = useApi<{ data: Wallet[] }>('/agent/wallet');

  return (
    <PageShell title="Allocation Balances">
      <Card title="Your wallets" subtitle="Allocation balances are distributable to players. Commission balances are earnings and are kept separate. You cannot change your own balances.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.data.map((w) => (
            <StatCard
              key={w.id}
              label={`${titleCase(w.type)} · ${w.currency}`}
              value={points(w.balance, w.currency)}
              hint={w.is_frozen ? <Badge tone="error">Frozen</Badge> : undefined}
            />
          ))}
        </div>
      </Card>
    </PageShell>
  );
}
