import { useState } from 'react';
import { ActionIcon, AmountDialog, Btn, ConfirmDialog, Details, Dialog, I, Panel, Pager, Picker, SearchInput, Segments, StatusPill, Table, Toast, TypePill, type AmountAction, type Column, type ConfirmAction } from '../../Components/AdminPanel/kit';
import { Eye, Signed, TxLabel, loadRows } from '../../Components/AdminPanel/rows';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { TX_LOCKED_HINT, useMaintenance } from '../../lib/maintenance';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import { when } from '../../Components/AdminPanel/kit';
import type { Account, LoadLog, PageMeta } from './types';

type Status = '' | 'completed' | 'pending' | 'rejected';

/**
 * Load Logs: every Chips load, withdrawal and Chips request, permanently recorded. The Admin
 * Panel sees and reviews all of them; an agent sees its own and its downline's, and can send
 * Chips requests (only the Administrators approve them).
 */
export default function LoadLogs() {
  const panel = usePanel();
  const txLocked = useMaintenance().transactions_blocked;
  const [status, setStatus] = useState<Status>('');
  const [direction, setDirection] = useState<'' | 'load' | 'withdraw' | 'request'>('');
  const [type, setType] = useState<'' | 'agent' | 'master' | 'player' | 'admin'>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const params = { status: status || undefined, direction: direction || undefined, account_type: type || undefined, q: q.trim() || undefined, page };
  const { data, loading, reload } = useApi<{ data: LoadLog[]; meta: PageMeta & { counts: Record<'completed' | 'pending' | 'rejected', number> } }>(`${panel.api}/load-logs`, params);
  usePanelRefresh(reload);
  const [request, setRequest] = useState<AmountAction | null>(null);
  // Loader Accounts: "Load Chips" picks an agent or player, then the usual amount → confirm dialog.
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState<{ title: string; rows: Array<[string, React.ReactNode]> } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const counts = data?.meta.counts;

  const open = async (r: LoadLog) => {
    try {
      const full = await api.get<{ data: LoadLog & { ledger: Record<string, string | null> | null } }>(`${panel.api}/load-logs/${r.id}`);
      const l = full.data.data.ledger;
      setDetail({
        title: `Transaction ${r.reference}`,
        rows: [
          ...loadRows(full.data.data),
          ...(l
            ? ([
                ['Sender balance', l.source_balance_before !== null ? `${l.source_balance_before} → ${l.source_balance_after}` : 'Issued'],
                ['Recipient balance', l.destination_balance_before !== null ? `${l.destination_balance_before} → ${l.destination_balance_after}` : '—'],
              ] as Array<[string, React.ReactNode]>)
            : []),
        ],
      });
    } catch (e) {
      setToast({ ok: false, text: errorMessage(e) });
    }
  };

  const review = (r: LoadLog, approve: boolean) =>
    setConfirm({
      title: approve ? 'Approve Chips request' : 'Reject Chips request',
      message: approve ? (
        <>Load <b>{r.amount} Chips</b> from your own Chips wallet to <b>{r.account?.username}</b>?</>
      ) : (
        <>Reject the request of <b>{r.account?.username}</b> for {r.amount} Chips?</>
      ),
      confirm: approve ? 'Approve & load' : 'Reject',
      variant: approve ? 'success' : 'danger',
      reason: approve ? undefined : 'optional',
      run: async (note) => (await api.post<{ message: string }>(`/admin/panel/load-logs/${r.id}/${approve ? 'approve' : 'reject'}`, approve ? {} : { note: note || undefined })).data.message,
    });

  const cols: Column<LoadLog>[] = [
    { key: 'id', label: 'Transaction ID', render: (r) => <span className="font-mono text-xs font-bold">{r.reference}</span> },
    { key: 'date', label: 'Date & Time', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'tx', label: 'Transaction', render: (r) => <TxLabel direction={r.direction} text={r.transaction} /> },
    {
      key: 'parties',
      label: 'Sender → Recipient',
      render: (r) => (
        <span className="whitespace-nowrap">
          {r.direction === 'withdraw' ? r.account?.username : r.sender?.username ?? (r.direction === 'request' ? 'Request' : 'Issuance')} <span className="text-[#9a92b2]">→</span>{' '}
          <b>{r.direction === 'withdraw' ? r.sender?.username : r.account?.username}</b>
        </span>
      ),
    },
    { key: 'type', label: 'Account Type', render: (r) => <TypePill type={r.account_type} label={r.account_type_label} /> },
    { key: 'amt', label: 'Chips', className: 'text-right', render: (r) => <Signed value={r.signed_amount} /> },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
    { key: 'by', label: 'Processed by', render: (r) => r.processed_by?.username ?? <span className="text-[#9a92b2]">—</span> },
    {
      key: 'act',
      label: 'Action',
      className: 'text-center',
      render: (r) => (
        <span className="inline-flex gap-2">
          <Eye onClick={() => open(r)} />
          {r.status === 'pending' && !panel.isAgent && !txLocked && (
            <>
              <ActionIcon label={`Approve request ${r.reference}`} tone="green" onClick={() => review(r, true)}>
                <I.check className="h-5 w-5" />
              </ActionIcon>
              <ActionIcon label={`Reject request ${r.reference}`} tone="red" onClick={() => review(r, false)}>
                <I.x className="h-5 w-5" />
              </ActionIcon>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <AdminPanelLayout title={panel.isLoader ? 'Load Transactions' : 'Load Logs'} subtitle={panel.isAgent ? 'Your Chips loads and requests, and your downline’s' : panel.isLoader ? 'Every Chips load and request on the platform; loads use your employer Admin’s Chips' : 'Every Chips load, withdrawal and request'}>
      <Panel
        title="Chips Transactions"
        icon={<I.logs className="h-6 w-6" />}
        actions={
          <>
          {panel.isLoader && (
            <Btn variant="success" size="sm" disabled={txLocked} title={txLocked ? TX_LOCKED_HINT : undefined} onClick={() => setPicking(true)}>
              <I.plus className="h-4 w-4" /> Load Chips
            </Btn>
          )}
          {panel.isAgent && (
            <Btn variant="gold" size="sm" disabled={txLocked} title={txLocked ? TX_LOCKED_HINT : undefined} onClick={() => setRequest({ title: 'Request Chips', verb: 'Request', target: 'from the Administrator', path: '/agent/chip-requests', variant: 'gold' })}>
              <I.plus className="h-4 w-4" /> Request Chips
            </Btn>
          )}
          <Segments<Status>
            label="Status"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={[
              ['', 'All'],
              ['completed', `Successful${counts ? ` · ${counts.completed}` : ''}`],
              ['pending', `Pending${counts ? ` · ${counts.pending}` : ''}`],
              ['rejected', `Rejected${counts ? ` · ${counts.rejected}` : ''}`],
            ]}
          />
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search ID, sender or account…" />
          <Picker label="Transaction type" value={direction} onChange={(v) => { setDirection(v); setPage(1); }} options={[['', 'All transactions'], ['load', 'Load Chips'], ['withdraw', 'Withdraw Chips'], ['request', 'Chips requests']]} />
          <Picker label="Account type" value={type} onChange={(v) => { setType(v); setPage(1); }} options={[['', 'All accounts'], ['agent', 'Incorporators'], ['master', 'Master Agents'], ['player', 'Players'], ...(panel.isAgent ? [] : ([['admin', 'Administrators']] as Array<['admin', string]>))]} />
        </div>
        <Table label="Load logs" columns={cols} rows={data?.data} loading={loading && !data} rowKey={(r) => r.id} empty="No transactions match these filters." />
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>

      <Dialog open={!!detail} title={detail?.title ?? ''} onClose={() => setDetail(null)}>
        {detail && <Details rows={detail.rows} />}
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
      <PickAccountDialog
        open={picking}
        api={panel.api}
        onClose={() => setPicking(false)}
        onPick={(a) => {
          setPicking(false);
          setRequest({ title: `Load Chips · ${a.username}`, verb: 'Load', target: `to ${a.username} (${a.account_type_label}) from your employer Admin’s Chips`, path: `${panel.api}/accounts/${a.id}/load`, variant: 'success' });
        }}
      />
      <AmountDialog
        action={request}
        onClose={() => setRequest(null)}
        onDone={(m) => {
          setRequest(null);
          setToast({ ok: true, text: m || 'Chips request sent for approval.' });
          reload();
        }}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}

/** Choose the agent or player to load (search by username, account ID, name or email). */
function PickAccountDialog({ open, api: base, onClose, onPick }: { open: boolean; api: string; onClose: () => void; onPick: (a: Account) => void }) {
  const [q, setQ] = useState('');
  const term = q.trim().replace(/^(PL|AG)-0*/i, '');
  const { data, loading } = useApi<{ data: Account[] }>(open && term ? `${base}/accounts` : null, { kind: 'all', q: term || undefined, per_page: 8 });

  return (
    <Dialog open={open} title="Load Chips — choose the account" onClose={onClose}>
      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="Username, account ID, name or email…" />
        {term && loading && !data && <p className="text-sm text-[#6b6385] dark:text-white/55">Searching…</p>}
        {term && data?.data.length === 0 && <p className="text-sm text-[#6b6385] dark:text-white/55">No agent or player matches.</p>}
        <ul className="divide-y divide-[#f0ecf9] dark:divide-white/[0.06]">
          {term &&
            data?.data.map((a) => (
              <li key={a.id}>
                <button type="button" disabled={a.status !== 'active'} onClick={() => onPick(a)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-[#f6f3fd] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/[0.05]">
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block font-bold">{a.username}</span>
                    <span className="block font-mono text-[11px] text-[#857d9c] dark:text-white/45">{a.account_id} · {a.name}</span>
                  </span>
                  <TypePill type={a.account_type} label={a.account_type_label} />
                  <StatusPill status={a.status} />
                </button>
              </li>
            ))}
        </ul>
      </div>
    </Dialog>
  );
}
