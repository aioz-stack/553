import { useState } from 'react';
import { HistoryFilters, LoadError, SORTS, viewerTz, type Sort } from '../../Components/AdminPanel/HistoryFilters';
import { Details, Dialog, Figure, I, Panel, Pager, Picker, StatusPill, Table, fmt, when, type Column } from '../../Components/AdminPanel/kit';
import { Eye } from '../../Components/AdminPanel/rows';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import { useApi } from '../../lib/useApi';
import type { PageMeta } from './types';

export interface BuyIn {
  id: number;
  transaction_id: string;
  player: { id: number; username: string | null };
  upline: Array<{ role: string; username: string; user_id: number | null }>;
  buy_in: string;
  keys: string;
  payment_method: string;
  status: string;
  created_at: string;
}

const uplineText = (r: BuyIn) => (r.upline.length ? r.upline.map((u) => `${u.username} (${u.role})`).join(' → ') : '—');

/**
 * Revenue Logs (Admin, Incorporator and Master Agent panels): read-only history of every completed
 * player Shop Buy-In (Chips → Keys). Nothing else: no conversions, withdrawals, cash-outs or
 * commission percentages. The Admin Panel sees the whole platform; agents their own downline.
 */
export default function RevenueLogs() {
  const panel = usePanel();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<'' | 'completed'>('');
  const [sort, setSort] = useState<Sort>('newest');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<BuyIn | null>(null);
  const { data, loading, error, reload } = useApi<{ data: BuyIn[]; meta: PageMeta & { summary: { total_buy_in: string; total_keys: string } } }>(`${panel.api}/revenue-logs`, {
    q: q.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    status: status || undefined,
    sort,
    tz: viewerTz,
    page,
  });
  usePanelRefresh(reload);
  const filtered = !!(q.trim() || from || to || status);
  const reset = (f: () => void) => {
    f();
    setPage(1);
  };

  const cols: Column<BuyIn>[] = [
    { key: 'id', label: 'Transaction ID', render: (r) => <span className="font-mono text-xs font-bold">{r.transaction_id}</span> },
    {
      key: 'player',
      label: 'Player',
      render: (r) => (
        <span className="whitespace-nowrap">
          <span className="font-semibold">{r.player.username ?? '—'}</span>
          <span className="ml-1 text-xs text-[#857d9c] dark:text-white/45">ID {r.player.id}</span>
        </span>
      ),
    },
    { key: 'upline', label: 'Agent / Upline', render: (r) => <span className="text-xs">{uplineText(r)}</span> },
    { key: 'amt', label: 'Buy-In (Chips)', className: 'text-right', render: (r) => <span className="font-black">{fmt(r.buy_in, 2)}</span> },
    { key: 'keys', label: 'Keys', className: 'text-right', render: (r) => fmt(r.keys) },
    { key: 'pay', label: 'Payment', render: (r) => r.payment_method },
    { key: 'date', label: 'Date & Time', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
    { key: 'act', label: 'Details', className: 'text-center', render: (r) => <Eye onClick={() => setDetail(r)} /> },
  ];

  return (
    <AdminPanelLayout title="Revenue Logs" subtitle={panel.isAgent ? 'Shop Buy-Ins by the players in your downline' : 'Shop Buy-Ins by every player on the platform'}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure label="Buy-Ins" value={data ? fmt(data.meta.total) : '…'} hint={filtered ? 'Matching the filters' : 'Completed Shop Buy-Ins'} />
        <Figure label="Total Buy-In" value={data ? `${fmt(data.meta.summary.total_buy_in, 2)} Chips` : '…'} tone="gold" />
        <Figure label="Keys Purchased" value={data ? fmt(data.meta.summary.total_keys) : '…'} />
      </div>

      <Panel title="Buy-In History" icon={<I.coins className="h-6 w-6" />}>
        <HistoryFilters
          q={q}
          onQ={(v) => reset(() => setQ(v))}
          placeholder="Search player, player ID, upline or transaction ID…"
          from={from}
          to={to}
          onFrom={(v) => reset(() => setFrom(v))}
          onTo={(v) => reset(() => setTo(v))}
          dirty={filtered}
          onClear={() => reset(() => { setQ(''); setFrom(''); setTo(''); setStatus(''); })}
        >
          <Picker label="Status" value={status} onChange={(v) => reset(() => setStatus(v))} options={[['', 'All statuses'], ['completed', 'Completed']]} />
          <Picker label="Sort" value={sort} onChange={(v) => reset(() => setSort(v))} options={SORTS} />
        </HistoryFilters>
        {error && <LoadError error={error} onRetry={reload} />}
        <Table label="Revenue logs" columns={cols} rows={error ? [] : data?.data} loading={loading && !data} rowKey={(r) => r.id} empty={filtered ? 'No Buy-Ins match these filters.' : 'No Shop Buy-Ins yet.'} />
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>

      <Dialog open={!!detail} title={detail ? `Buy-In ${detail.transaction_id}` : ''} onClose={() => setDetail(null)}>
        {detail && (
          <Details
            rows={[
              ['Transaction ID', detail.transaction_id],
              ['Player', `${detail.player.username ?? '—'} (ID ${detail.player.id})`],
              ['Agent / Upline', uplineText(detail)],
              ['Buy-In', `${fmt(detail.buy_in, 2)} Chips`],
              ['Keys purchased', fmt(detail.keys)],
              ['Payment method', detail.payment_method],
              ['Date & Time', when(detail.created_at)],
              ['Status', <StatusPill key="s" status={detail.status} />],
            ]}
          />
        )}
      </Dialog>
    </AdminPanelLayout>
  );
}
