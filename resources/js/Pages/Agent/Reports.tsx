import PageShell from '../../Components/PageShell';
import { Card, StatCard } from '../../Components/ui';
import { points, titleCase } from '../../lib/format';
import { useApi } from '../../lib/useApi';
import type { AgentOverviewData } from './types';

export default function Reports() {
  const { data } = useApi<{ data: AgentOverviewData }>('/agent/reports');
  const d = data?.data;

  return (
    <PageShell title="Agent Reports">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <StatCard label="Players" value={d?.players ?? 0} />
        <StatCard label="Active (7 days)" value={d?.active_players_7d ?? 0} />
        <StatCard label="Chips distributed" value={points(d?.distributed.CH)} />
      </div>
      <Card className="mt-6" title="Commission summary">
        <table className="min-w-full text-sm">
          <tbody>
            {d?.commissions.map((c) => (
              <tr key={`${c.status}-${c.currency}`} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2">{titleCase(c.status)}</td>
                <td className="py-2">{c.currency}</td>
                <td className="py-2 text-right font-semibold">{points(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </PageShell>
  );
}
