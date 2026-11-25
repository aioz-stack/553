import { useState } from 'react';
import { HistoryFilters, LoadError, SORTS, viewerTz, type Sort } from '../../Components/AdminPanel/HistoryFilters';
import { Details, Dialog, Figure, I, Panel, Pager, Picker, StatusPill, Table, fmt, when, type Column } from '../../Components/AdminPanel/kit';
import { Eye } from '../../Components/AdminPanel/rows';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import { useApi } from '../../lib/useApi';
import type { PageMeta } from './types';

export interface ConversionRow {
  id: number;
  transaction_id: string;
  reference: string | null;
  account: { id: number; username: string | null; role: string };
  revenue_converted: string;
  chips_credited: string;
  status: string;
  created_at: string;
}

type RoleFilter = '' | 'admin' | 'incorporator' | 'master';

/**
 * Revenue Commission Withdrawal (Admin, Incorporator and Master Agent panels): read-only history of
 * completed Self Convert Revenue to Chips transactions. Not a withdrawal system: no requests,
 * approvals or payments. The Admin Panel sees every account; agents themselves and their downline.
 */
export default function RevenueWithdrawals() {
  const panel = usePanel();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [role, setRole] = useState<RoleFilter>('');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ConversionRow | null>(null);
  const { data, loading, error, reload } = useApi<{ data: ConversionRow[]; meta: PageMeta & { summary: { total_converted: string } } }>(`${panel.api}/revenue-conversions`, {
    q: q.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    role: role || undefined,
    sort,
    tz: viewerTz,
    page,
  });
  usePanelRefresh(reload);
  const filtered = !!(q.trim() || from || to || role);
  const reset = (f: () => void) => {
    f();
    setPage(1);
  };
  const roles: Array<[RoleFilter, string]> = [['', 'All roles'], ...(panel.isAgent ? [] : ([['admin', 'Admin']] as Array<[RoleFilter, string]>)), ['incorporator', 'Incorporator'], ['master', 'Master Agent']];

  const cols: Column<ConversionRow>[] = [
    { key: 'id', label: 'Conversion ID', render: (r) => <span className="font-mono text-xs font-bold">{r.transaction_id}</span> },
    {
      key: 'acct',
      label: 'Account',
      render: (r) => (
        <span className="whitespace-nowrap">
          <span className="font-semibold">{r.account.username ?? '—'}</span>
          <span className="ml-1 text-xs text-[#857d9c] dark:text-white/45">ID {r.account.id}</span>
        </span>
      ),
    },
    { key: 'role', label: 'Role', render: (r) => <span className="whitespace-nowrap rounded-md bg-[#f3eeff] px-2 py-0.5 text-xs font-bold text-[#6d28d9] dark:bg-white/10 dark:text-[#c4b5fd]">{r.account.role}</span> },
    { key: 'amt', label: 'Revenue Converted', className: 'text-right', render: (r) => <span className="font-black">{fmt(r.revenue_converted, 2)}</span> },
    { key: 'date', label: 'Date & Time', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
    { key: 'ref', label: 'Reference No.', render: (r) => <span className="font-mono text-xs">{r.reference ?? '—'}</span> },
    { key: 'act', label: 'Details', className: 'text-center', render: (r) => <Eye onClick={() => setDetail(r)} /> },
  ];

  return (
    <AdminPanelLayout title="Revenue Commission Withdrawal" subtitle={panel.isAgent ? 'Revenue converted to Chips by you and the agents below you' : 'Revenue converted to Chips by Admins, Incorporators and Master Agents'}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Figure label="Conversions" value={data ? fmt(data.meta.total) : '…'} hint={filtered ? 'Matching the filters' : 'Completed Self Convert Revenue to Chips'} />
        <Figure label="Total Revenue Converted" value={data ? fmt(data.meta.summary.total_converted, 2) : '…'} tone="gold" />
      </div>

      <Panel title="Conversion History" icon={<I.wallet className="h-6 w-6" />}>
        <HistoryFilters
          q={q}
          onQ={(v) => reset(() => setQ(v))}
          placeholder="Search account, account ID or reference…"
          from={from}
          to={to}
          onFrom={(v) => reset(() => setFrom(v))}
          onTo={(v) => reset(() => setTo(v))}
          dirty={filtered}
          onClear={() => reset(() => { setQ(''); setFrom(''); setTo(''); setRole(''); })}
        >
          <Picker label="Role" value={role} onChange={(v) => reset(() => setRole(v))} options={roles} />
          <Picker label="Sort" value={sort} onChange={(v) => reset(() => setSort(v))} options={SORTS} />
        </HistoryFilters>
        {error && <LoadError error={error} onRetry={reload} />}
        <Table label="Revenue conversions" columns={cols} rows={error ? [] : data?.data} loading={loading && !data} rowKey={(r) => r.id} empty={filtered ? 'No conversions match these filters.' : 'No Revenue conversions yet.'} />
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>

      <Dialog open={!!detail} title={detail ? `Conversion ${detail.transaction_id}` : ''} onClose={() => setDetail(null)}>
        {detail && (
          <Details
            rows={[
              ['Conversion ID', detail.transaction_id],
              ['Reference No.', detail.reference ?? '—'],
              ['Account', `${detail.account.username ?? '—'} (ID ${detail.account.id})`],
              ['Role', detail.account.role],
              ['Revenue converted', fmt(detail.revenue_converted, 2)],
              ['Chips credited', `${fmt(detail.chips_credited, 2)} Chips`],
              ['Date & Time', when(detail.created_at)],
              ['Status', <StatusPill key="s" status={detail.status} />],
            ]}
          />
        )}
      </Dialog>
    </AdminPanelLayout>
  );
}
