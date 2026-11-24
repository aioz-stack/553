import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { Btn, Details, Dialog, Figure, I, Panel, Pager, Picker, SearchInput, StatusPill, Table, Toast, TypePill, fieldClass, fmt, when, type Column } from '../../Components/AdminPanel/kit';
import { Eye, commissionRows } from '../../Components/AdminPanel/rows';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api, errorMessage } from '../../lib/api';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import type { CommissionLog, PageMeta } from './types';

type Level = 'agent' | 'master' | 'silver';
const LEVELS: Array<[Level, string]> = [
  ['agent', 'Agents'],
  ['master', 'Master Agents'],
  ['silver', 'Silver Agents'],
];

/** Admin Panel → Commission Logs: every commission earned up the hierarchy, with rates per level. */
export default function CommissionLogs() {
  const { auth } = usePage<SharedProps>().props;
  const panel = usePanel();
  const canEdit = !panel.isAgent && auth.user?.role === 'super_admin' || (auth.user?.abilities ?? []).includes('manage_commissions');
  const [level, setLevel] = useState<'' | Level>('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<{ data: CommissionLog[]; meta: PageMeta & { breakdown: Record<Level, { count: number; total: string }>; rates: Record<Level, number> } }>(`${panel.api}/commission-logs`, {
    level: level || undefined,
    status: status || undefined,
    q: q.trim() || undefined,
    page,
  });
  usePanelRefresh(reload);
  const [detail, setDetail] = useState<CommissionLog | null>(null);
  const [rates, setRates] = useState<Record<Level, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data?.meta.rates && rates === null) {
      setRates({ agent: String(data.meta.rates.agent), master: String(data.meta.rates.master), silver: String(data.meta.rates.silver) });
    }
  }, [data, rates]);

  const saveRates = async () => {
    if (!rates) return;
    setSaving(true);
    try {
      const r = await api.put<{ message: string }>('/admin/panel/commission-rates', { agent: Number(rates.agent), master: Number(rates.master), silver: Number(rates.silver) });
      setToast({ ok: true, text: r.data.message });
      reload();
    } catch (e) {
      setToast({ ok: false, text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  const cols: Column<CommissionLog>[] = [
    { key: 'id', label: 'Commission ID', render: (r) => <span className="font-mono text-xs font-bold">{r.reference}</span> },
    { key: 'to', label: 'Recipient', render: (r) => <span className="font-semibold">{r.recipient?.username}</span> },
    {
      key: 'src',
      label: 'Source',
      render: (r) => (
        <span className="whitespace-nowrap">
          {r.source.player?.username} · Game #{r.source.game_session_id}
          <span className={`ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${r.source.kind === 'override' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200' : 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200'}`}>{r.source.kind}</span>
        </span>
      ),
    },
    { key: 'type', label: 'Account Type', render: (r) => <TypePill type={r.account_type} label={r.account_type_label} /> },
    { key: 'rate', label: 'Rate', className: 'text-right', render: (r) => `${r.rate}%` },
    { key: 'amt', label: 'Commission', className: 'text-right', render: (r) => <span className="font-black text-emerald-600 dark:text-emerald-400">+ {fmt(r.amount, 2)}</span> },
    { key: 'date', label: 'Date & Time', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
    { key: 'act', label: 'Action', className: 'text-center', render: (r) => <Eye onClick={() => setDetail(r)} /> },
  ];

  return (
    <AdminPanelLayout title="Commission Logs" subtitle={panel.isAgent ? 'Commissions earned by you and the agents below you' : 'Commissions earned by Agents, Master Agents and Silver Agents'}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {LEVELS.map(([l, label]) => (
          <Figure key={l} label={`${label} — ${data?.meta.rates[l] ?? '…'}%`} value={data ? `${fmt(data.meta.breakdown[l].total, 2)} Chips` : '…'} tone="gold" hint={data ? `${data.meta.breakdown[l].count} commission records${level || status || q ? ' (filtered)' : ''}` : undefined} />
        ))}
      </div>

      <Panel title="Commission Rates" icon={<I.percent className="h-6 w-6" />}>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-[#5b5274] dark:text-white/65">
            Percent of the platform fee collected from each player's game. The player's direct sponsor earns its rate; each upline level earns the difference up to its own rate (for example under a Silver Agent: Silver 30%, Master 40−30 = 10%, Agent 50−40 = 10%). {panel.isAgent || panel.isLoader ? 'Rates are set by the Administrator.' : 'Individual agents can be given their own rate from the Agents page.'}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {LEVELS.map(([l, label]) => (
              <label key={l} className="block w-40">
                <span className="mb-1 block text-xs font-bold uppercase text-[#6b6385] dark:text-white/55">{label} %</span>
                <input inputMode="decimal" disabled={!canEdit} value={rates?.[l] ?? ''} onChange={(e) => rates && setRates({ ...rates, [l]: e.target.value.replace(/[^\d.]/g, '') })} aria-label={`${label} rate`} className={fieldClass} />
              </label>
            ))}
            {canEdit && (
              <Btn onClick={saveRates} disabled={saving || !rates}>
                {saving ? 'Saving…' : 'Save rates'}
              </Btn>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Commission History" icon={<I.coins className="h-6 w-6" />}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search agent, player or game #…" />
          <Picker label="Level" value={level} onChange={(v) => { setLevel(v); setPage(1); }} options={[['', 'All levels'], ...LEVELS]} />
          <Picker label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['', 'All statuses'], ['pending', 'Pending'], ['approved', 'Approved'], ['paid', 'Paid'], ['rejected', 'Rejected'], ['reversed', 'Reversed']]} />
        </div>
        <Table label="Commission logs" columns={cols} rows={data?.data} loading={loading && !data} rowKey={(r) => r.id} empty="No commissions match these filters." />
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>

      <Dialog open={!!detail} title={detail ? `Commission ${detail.reference}` : ''} onClose={() => setDetail(null)}>
        {detail && <Details rows={commissionRows(detail)} />}
      </Dialog>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
