import { usePage } from '@inertiajs/react';
import ApexChart from '../../Components/ApexChart';
import PageShell from '../../Components/PageShell';
import { IconCards, IconCoins, IconTable, IconUser } from '../../Components/PlatformIcons';
import { Alert, Card, LinkButton, StatCard } from '../../Components/ui';
import { points } from '../../lib/format';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';

export interface PlatformOverview {
  users: { super_admins: number; administrators: number; agents: number; players: number };
  tables: { waiting: number; in_game: number };
  games: { today: number; completed: number; cancelled: number };
  issued: { GD: string; CH: string };
  platform_fees: { GD: string; CH: string };
  player_balances: { GD: string; CH: string };
  pending_commissions: number;
  games_per_day: { labels: string[]; values: number[] };
}

export default function Overview() {
  const { auth } = usePage<SharedProps>().props;
  const canReport = auth.user?.abilities.includes('view_reports');
  const { data } = useApi<{ data: PlatformOverview }>(canReport ? '/admin/reports/overview' : null);
  const d = data?.data;

  return (
    <PageShell title="Overview">
      {!canReport && <Alert tone="warning">You do not have the "view reports" permission. Use the menu to reach the areas you manage.</Alert>}
      {d && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
            <StatCard icon={<IconUser />} label="Players" value={d.users.players} hint={`${d.users.agents} agents · ${d.users.administrators} admins`} />
            <StatCard icon={<IconTable />} label="Tables in game" value={d.tables.in_game} hint={`${d.tables.waiting} waiting for players`} />
            <StatCard icon={<IconCards />} label="Games today" value={d.games.today} hint={`${d.games.completed} completed · ${d.games.cancelled} cancelled all-time`} />
            <StatCard icon={<IconCoins />} label="Chips platform fees" value={points(d.platform_fees.CH)} hint={`${d.pending_commissions} commissions pending`} />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Card title="Games per day (14 days)" className="xl:col-span-2">
              <ApexChart
                options={{
                  chart: { type: 'area', height: 280, fontFamily: 'Outfit, sans-serif', toolbar: { show: false } },
                  colors: ['#465FFF'],
                  series: [{ name: 'Games', data: d.games_per_day.values }],
                  xaxis: { categories: d.games_per_day.labels },
                  stroke: { curve: 'smooth', width: 2 },
                  fill: { type: 'gradient', gradient: { opacityFrom: 0.45, opacityTo: 0 } },
                  dataLabels: { enabled: false },
                }}
              />
            </Card>
            <Card title="Economy">
              <dl className="space-y-3 text-sm">
                {(['CH', 'GD'] as const).map((c) => (
                  <div key={c} className="rounded-xl bg-gray-50 p-3 dark:bg-white/[0.03]">
                    <dt className="mb-1 font-semibold text-gray-800 dark:text-white/90">{c === 'CH' ? 'Chips (Multiplayer)' : 'Gold (Single Player)'}</dt>
                    <dd className="flex justify-between"><span>Issued</span><span>{points(d.issued[c])}</span></dd>
                    <dd className="flex justify-between"><span>Player balances</span><span>{points(d.player_balances[c])}</span></dd>
                    <dd className="flex justify-between"><span>Platform fees</span><span>{points(d.platform_fees[c])}</span></dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex gap-2">
                <LinkButton href="/admin/allocations">Allocate</LinkButton>
                <LinkButton href="/admin/transactions" variant="outline">Ledger</LinkButton>
              </div>
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}
