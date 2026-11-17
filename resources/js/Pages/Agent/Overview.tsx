import PageShell from '../../Components/PageShell';
import { IconCoins, IconTrophy, IconUser, IconWallet } from '../../Components/PlatformIcons';
import { Alert, Card, LinkButton, StatCard } from '../../Components/ui';
import { points, titleCase } from '../../lib/format';
import { useApi } from '../../lib/useApi';

export interface AgentOverviewData {
  agent: { code: string; status: string };
  players: number;
  active_players_7d: number;
  allocation: { CP: string; VC: string };
  commission_wallet: { CP: string; VC: string };
  allocation_frozen: boolean;
  commissions: Array<{ status: string; currency: string; total: string }>;
  distributed: { CP: string; VC: string };
}

export default function Overview() {
  const { data } = useApi<{ data: AgentOverviewData }>('/agent/dashboard');
  const d = data?.data;

  return (
    <PageShell title="Agent Overview">
      {d?.allocation_frozen && <Alert tone="warning">Your allocation balance is frozen by an administrator. You cannot distribute points until it is unfrozen.</Alert>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <StatCard icon={<IconUser />} label="My players" value={d?.players ?? 0} hint={`${d?.active_players_7d ?? 0} active in 7 days`} />
        <StatCard icon={<IconWallet />} label="VC allocation balance" value={points(d?.allocation.VC)} hint="Distributable to your players" />
        <StatCard icon={<IconCoins />} label="CP allocation balance" value={points(d?.allocation.CP)} hint="Accounting points" />
        <StatCard icon={<IconTrophy />} label="Commission wallet (VC)" value={points(d?.commission_wallet.VC)} hint="Separate from allocations" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Commissions" subtitle="Percentage of platform fees from your players' completed games. Rates are set by the Super Admin.">
          <ul className="space-y-2 text-sm">
            {d?.commissions.length === 0 && <li className="text-gray-500">No commissions yet.</li>}
            {d?.commissions.map((c) => (
              <li key={`${c.status}-${c.currency}`} className="flex justify-between">
                <span>{titleCase(c.status)}</span>
                <strong>{points(c.total, c.currency)}</strong>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Quick actions" subtitle={`Agent code ${d?.agent.code ?? ''}`}>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/agent/allocate">Allocate points</LinkButton>
            <LinkButton href="/agent/players/create" variant="outline">Register player</LinkButton>
            <LinkButton href="/agent/referral-codes" variant="outline">Referral codes</LinkButton>
          </div>
          <p className="mt-4 text-sm text-gray-500">
            Distributed so far: {points(d?.distributed.VC, 'VC')} · {points(d?.distributed.CP, 'CP')}
          </p>
        </Card>
      </div>
    </PageShell>
  );
}
