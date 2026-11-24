import { useState } from 'react';
import { ActionIcon, AmountDialog, Btn, ConfirmDialog, Details, Dialog, Figure, I, Panel, Pager, SearchInput, Segments, StatusPill, Table, Toast, TypePill, fmt, when, type AmountAction, type Column, type ConfirmAction } from '../../Components/AdminPanel/kit';
import { Eye, withdrawalRows } from '../../Components/AdminPanel/rows';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import type { PageMeta, Withdrawal } from './types';

type Status = '' | 'pending' | 'approved' | 'rejected';

/**
 * Admin Panel → Commission Withdrawal: agents' requests to move their commission into
 * their own Chips. Approve moves the Chips (once); reject leaves the balance as it was.
 */
export default function Withdrawals() {
  const panel = usePanel();
  const agent = panel.isAgent;
  const [request, setRequest] = useState<AmountAction | null>(null);
  const [status, setStatus] = useState<Status>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<{ data: Withdrawal[]; meta: PageMeta & { summary: { available: string; pending: string; pending_count: number; withdrawn: string } } }>(`${panel.api}/withdrawals`, {
    status: status || undefined,
    q: q.trim() || undefined,
    page,
  });
  usePanelRefresh(reload);
  const s = data?.meta.summary;
  const [detail, setDetail] = useState<Withdrawal | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const review = (r: Withdrawal, approve: boolean) =>
    setConfirm({
      title: approve ? 'Approve withdrawal' : 'Reject withdrawal',
      message: approve ? (
        <>Move <b>{fmt(r.amount, 2)} Chips</b> from <b>{r.agent?.username}</b>&apos;s commission into their own Chips wallet?</>
      ) : (
        <>Reject <b>{r.agent?.username}</b>&apos;s withdrawal of {fmt(r.amount, 2)} Chips? Their commission balance stays as it is.</>
      ),
      confirm: approve ? 'Approve' : 'Reject',
      variant: approve ? 'success' : 'danger',
      reason: approve ? undefined : 'optional',
      run: async (note) => (await api.post<{ message: string }>(`/admin/panel/withdrawals/${r.id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { note: note || undefined })).data.message,
    });

  const cols: Column<Withdrawal>[] = [
    { key: 'id', label: 'Withdrawal ID', render: (r) => <span className="font-mono text-xs font-bold">{r.reference}</span> },
    { key: 'agent', label: 'Agent', render: (r) => <span className="font-semibold">{r.agent?.username}</span> },
    { key: 'type', label: 'Account Type', render: (r) => <TypePill type={r.account_type} label={r.account_type_label} /> },
    { key: 'amt', label: 'Amount (Chips)', className: 'text-right', render: (r) => <span className="font-black">{fmt(r.amount, 2)}</span> },
    { key: 'date', label: 'Requested', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
    { key: 'by', label: 'Reviewed by', render: (r) => r.reviewed_by?.username ?? <span className="text-[#9a92b2]">—</span> },
    {
      key: 'act',
      label: 'Action',
      className: 'text-center',
      render: (r) => (
        <span className="inline-flex gap-2">
          <Eye onClick={() => setDetail(r)} />
          {r.status === 'pending' && !agent && (
            <>
              <ActionIcon label={`Approve withdrawal ${r.reference}`} tone="green" onClick={() => review(r, true)}>
                <I.check className="h-5 w-5" />
              </ActionIcon>
              <ActionIcon label={`Reject withdrawal ${r.reference}`} tone="red" onClick={() => review(r, false)}>
                <I.x className="h-5 w-5" />
              </ActionIcon>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPanelLayout title="Commission Withdrawal" subtitle={agent ? 'Your commission withdrawals (and your downline’s), approved by the Administrator' : "Agents' commission moved into their own Chips"}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Figure label={agent ? 'My available commission' : 'Available commission balance'} value={s ? `${fmt(s.available, 2)} Chips` : '…'} tone="gold" hint={agent ? 'Your commission wallet, less your pending requests' : "All agents' commission wallets, less pending requests"} />
        <Figure label={agent ? 'My total withdrawn' : 'Total withdrawn'} value={s ? `${fmt(s.withdrawn, 2)} Chips` : '…'} tone="good" hint="Approved withdrawals" />
        <Figure label={agent ? 'My pending requests' : 'Pending requests'} value={s ? `${fmt(s.pending, 2)} Chips` : '…'} tone="warn" hint={s ? `${s.pending_count} waiting for review` : undefined} />
      </div>
      <Panel
        title="Withdrawal Requests"
        icon={<I.wallet className="h-6 w-6" />}
        actions={
          <>
            {agent && (
              <Btn variant="success" size="sm" disabled={!s || Number(s.available) <= 0} onClick={() => s && setRequest({ title: 'Withdraw Commission', verb: 'Withdraw', target: 'of commission into your own Chips (after approval)', path: '/agent/payout-requests', limit: s.available, limitLabel: 'Available commission', variant: 'success' })}>
                <I.percent className="h-4 w-4" /> Withdraw Commission
              </Btn>
            )}
            <Segments<Status> label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['', 'All'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']]} />
          </>
        }
      >
        <div className="px-5 py-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search agent…" />
        </div>
        <Table label="Commission withdrawals" columns={cols} rows={data?.data} loading={loading && !data} rowKey={(r) => r.id} empty="No withdrawal requests." />
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>

      <Dialog open={!!detail} title={detail ? `Withdrawal ${detail.reference}` : ''} onClose={() => setDetail(null)}>
        {detail && <Details rows={withdrawalRows(detail)} />}
      </Dialog>
      <ConfirmDialog
        action={confirm}
        onClose={() => setConfirm(null)}
        onDone={(m) => {
          setConfirm(null);
          setToast({ ok: true, text: m });
          reload();
        }}
      />
      <AmountDialog
        action={request}
        onClose={() => setRequest(null)}
        onDone={(m) => {
          setRequest(null);
          setToast({ ok: true, text: m || 'Withdrawal request sent for approval.' });
          reload();
        }}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
