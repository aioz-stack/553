import ApexChart from '../../Components/ApexChart';
import PageShell from '../../Components/PageShell';
import { Card, StatCard } from '../../Components/ui';
import { points } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { PlatformOverview } from './Overview';

export default function Reports() {
  const { data } = useApi<{ data: PlatformOverview }>('/admin/reports/overview');
  const d = data?.data;

  return (
    <PageShell title="Reports">
      {d && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
            <StatCard label="Completed games" value={d.games.completed} />
            <StatCard label="Cancelled games" value={d.games.cancelled} />
            <StatCard label="Chips issued" value={points(d.issued.CH)} />
            <StatCard label="Gold issued" value={points(d.issued.GD)} />
            <StatCard label="Chips player balances" value={points(d.player_balances.CH)} />
            <StatCard label="Gold player balances" value={points(d.player_balances.GD)} />
            <StatCard label="Chips platform fees" value={points(d.platform_fees.CH)} />
            <StatCard label="Pending commissions" value={d.pending_commissions} />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Games per day">
              <ApexChart options={{ chart: { type: 'bar', height: 280, fontFamily: 'Outfit, sans-serif', toolbar: { show: false } }, colors: ['#465FFF'], series: [{ name: 'Games', data: d.games_per_day.values }], xaxis: { categories: d.games_per_day.labels }, dataLabels: { enabled: false }, plotOptions: { bar: { borderRadius: 4 } } }} />
            </Card>
            <Card title="Users by role">
              <ApexChart options={{ chart: { type: 'donut', height: 280, fontFamily: 'Outfit, sans-serif' }, labels: ['Players', 'Agents', 'Administrators', 'Super Admins'], series: [d.users.players, d.users.agents, d.users.administrators, d.users.super_admins], colors: ['#465FFF', '#9CB9FF', '#12B76A', '#F79009'], legend: { position: 'bottom' } }} />
            </Card>
          </div>
        </>
      )}
    </PageShell>
  );
}
