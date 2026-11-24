import { Link } from '@inertiajs/react';
import { ChipStack, Figure, I, Note, Panel, StatTile, fmt, when } from '../../Components/AdminPanel/kit';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import { useApi } from '../../lib/useApi';

interface LoaderOverview {
  me: { username: string; name: string };
  permissions: string[];
  employer: { username: string; chips: string } | null;
  loads: { total: number; completed: number; pending: number; rejected: number; processed_by_me: number } | null;
  commissions: { total: number; withdrawals_pending: number; withdrawals_pending_amount: string; conversions: number } | null;
  recent: Array<{ action: string; details: Record<string, unknown>; at: string | null }>;
}

const ACTIONS: Record<string, string> = {
  'wallet.allocate': 'Loaded Chips',
  'chips.request_approved': 'Approved a Chips request',
  'chips.request_rejected': 'Rejected a Chips request',
  'commission_withdrawal.approve': 'Approved a commission withdrawal',
  'commission_withdrawal.reject': 'Rejected a commission withdrawal',
  'user.password_reset': 'Reset a password',
};

/** Loader Panel → Overview: only the Loader's own modules and figures (all live from the API). */
export default function LoaderOverview() {
  const panel = usePanel();
  const { data, reload } = useApi<{ data: LoaderOverview }>('/loader/panel/overview');
  usePanelRefresh(reload);
  const d = data?.data;

  return (
    <AdminPanelLayout title="Overview" subtitle="Load Transactions, Commission Transactions and Reset Password">
      {d && !d.employer && panel.loaderCan('loader_loads') && (
        <Note tone="warn">
          <b>Loads are unavailable:</b> the Admin account whose Chips you load is not active. Ask an Admin.
        </Note>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {d?.loads && (
          <StatTile tone="purple" title="Load Transactions" subtitle="All Chips loads and requests" icon={<ChipStack className="h-16 w-16" />} value={fmt(d.loads.total)} label="Load transactions" footer={<Link href="/loader/load-logs" className="underline">{d.loads.pending} pending · {d.loads.completed} completed →</Link>} />
        )}
        {d?.commissions && (
          <StatTile tone="blue" title="Commission Transactions" subtitle="Commission records" icon={<I.coins className="h-10 w-10" />} value={fmt(d.commissions.total)} label="Commission transactions" footer={<Link href="/loader/commission-withdrawals" className="underline">{d.commissions.withdrawals_pending} withdrawal requests pending →</Link>} />
        )}
        {panel.loaderCan('loader_passwords') && (
          <StatTile tone="green" title="Reset Password" subtitle="Incorporators, Master Agents, Players" icon={<I.lock className="h-10 w-10" />} value="Reset" label="Reset Password" footer={<Link href="/loader/reset-password" className="underline">Open Reset Password →</Link>} />
        )}
      </div>

      {(d?.loads || d?.commissions) && (
        <Panel title="Figures" icon={<I.logs className="h-6 w-6" />}>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {d.loads && <Figure label="Pending loads" value={fmt(d.loads.pending)} tone="warn" hint="Chips requests waiting" />}
            {d.loads && <Figure label="Completed loads" value={fmt(d.loads.completed)} tone="good" hint={`${fmt(d.loads.processed_by_me)} processed by you`} />}
            {d.commissions && <Figure label="Pending commission withdrawals" value={`${fmt(d.commissions.withdrawals_pending_amount, 2)} Chips`} tone="warn" hint={`${d.commissions.withdrawals_pending} requests`} />}
            {d.employer && <Figure label="Employer Chips" value={fmt(d.employer.chips, 2)} tone="gold" hint={`Your loads use ${d.employer.username}'s Chips`} />}
          </div>
        </Panel>
      )}

      <Panel title="My recent activity" icon={<I.clock className="h-6 w-6" />}>
        <ul className="divide-y divide-[#f0ecf9] text-sm dark:divide-white/[0.06]">
          {d && d.recent.length === 0 && <li className="px-5 py-4 text-[#857d9c] dark:text-white/45">Nothing yet.</li>}
          {d?.recent.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="w-40 shrink-0 text-xs text-[#857d9c] dark:text-white/45">{when(r.at)}</span>
              <span className="font-semibold">{ACTIONS[r.action] ?? r.action}</span>
              {'target' in r.details && <span className="text-[#6b6385] dark:text-white/55">· {String(r.details.target)}</span>}
            </li>
          ))}
        </ul>
      </Panel>
    </AdminPanelLayout>
  );
}
