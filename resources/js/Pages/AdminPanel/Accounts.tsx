import { usePage } from '@inertiajs/react';
import { useState, type ReactNode } from 'react';
import {
  ActionIcon,
  AmountDialog,
  Btn,
  ConfirmDialog,
  Details,
  Dialog,
  I,
  Panel,
  Pager,
  Picker,
  SearchInput,
  StatusPill,
  Table,
  Toast,
  TypePill,
  fieldClass,
  fmt,
  when,
  type AmountAction,
  type Column,
  type ConfirmAction,
} from '../../Components/AdminPanel/kit';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api, errorMessage } from '../../lib/api';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import type { Account, PageMeta } from './types';

type Kind = 'agents' | 'players' | 'pending' | 'banned' | 'archived';

const AGENT_PAGE: Partial<Record<Kind, { title: string; subtitle: string; empty: string }>> = {
  agents: { title: 'My Agents', subtitle: 'Master and Silver Agents in your downline', empty: 'No agents yet. Share your Agent Registration Link to recruit.' },
  players: { title: 'My Players', subtitle: 'Active players in your downline — load Chips to the players registered to you', empty: 'No active players yet. Share your Player Registration Link.' },
  pending: { title: 'Pending Users', subtitle: 'Registrations through your links, waiting for the Administrator’s approval', empty: 'No registrations are waiting.' },
};

const PAGE: Record<Kind, { title: string; subtitle: string; empty: string }> = {
  agents: { title: 'Agents', subtitle: 'Agents, Master Agents and Silver Agents', empty: 'No agents yet. Share your Agent Registration Link to recruit.' },
  players: { title: 'Active Players', subtitle: 'Every active player on the platform, under any agent or directly under you', empty: 'No active players match.' },
  pending: { title: 'Pending Users', subtitle: 'New registrations waiting for approval', empty: 'No registrations are waiting.' },
  banned: { title: 'Ban Users', subtitle: 'Banned and suspended accounts', empty: 'No banned or suspended accounts.' },
  archived: { title: 'Archive', subtitle: 'Retired accounts, kept with their full history', empty: 'The archive is empty.' },
};

interface AccountDetail extends Account {
  email: string;
  links: { player: string | null; agent: string | null; agent_level: string | null } | null;
  downline: { agents: number; players: number } | null;
  transactions: Array<{ reference: string; type: string; currency: string; amount: string; direction: 'in' | 'out'; reason: string | null; created_at: string }>;
  commissions_total: string;
}

/**
 * Agents / Players (Agents, Active Players, Pending Users, Ban Users) and Archive. Administrators
 * manage every account; an agent sees only its own downline and can load Chips to the players
 * registered to it — approvals, bans, archiving, withdrawals and rates stay with the Administrators.
 */
export default function Accounts({ kind }: { kind: Kind }) {
  const { auth } = usePage<SharedProps>().props;
  const panel = usePanel();
  const agent = panel.isAgent;
  const abilities = new Set(auth.user?.abilities ?? []);
  const isSuper = auth.user?.role === 'super_admin';
  const canChips = !agent && (isSuper || abilities.has('allocate_points'));
  const canCommission = !agent && (isSuper || abilities.has('manage_commissions'));
  const [q, setQ] = useState('');
  const [level, setLevel] = useState<'' | 'agent' | 'master' | 'silver'>('');
  const [type, setType] = useState<'' | 'player' | 'agent'>('');
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<{ data: Account[]; meta: PageMeta }>(`${panel.api}/accounts`, {
    kind,
    q: q.trim() || undefined,
    level: kind === 'agents' && level ? level : undefined,
    type: (kind === 'pending' || kind === 'banned' || kind === 'archived') && type ? type : undefined,
    page,
  });
  const [amount, setAmount] = useState<AmountAction | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [rate, setRate] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  usePanelRefresh(reload);
  const info = (agent && AGENT_PAGE[kind]) || PAGE[kind];

  const done = (text: string) => {
    setAmount(null);
    setConfirm(null);
    setToast({ ok: true, text });
    reload();
  };

  const status = (a: Account, action: 'ban' | 'suspend' | 'reactivate' | 'archive' | 'restore') => {
    const words = { ban: 'Ban', suspend: 'Suspend', reactivate: 'Reactivate', archive: 'Archive', restore: 'Restore' }[action];
    setConfirm({
      title: `${words} ${a.username}`,
      message: {
        ban: <>Ban <b>{a.username}</b>? They are signed out at once and cannot sign in, play or move Chips.</>,
        suspend: <>Suspend <b>{a.username}</b>? They are signed out and blocked until reactivated.</>,
        reactivate: <>Reactivate <b>{a.username}</b>? They can sign in and play again.</>,
        archive: <>Archive <b>{a.username}</b>? The account is retired but its transactions, commissions and referral relationships are kept.</>,
        restore: <>Restore <b>{a.username}</b> from the archive? The account becomes active again.</>,
      }[action],
      confirm: words,
      variant: action === 'reactivate' || action === 'restore' ? 'success' : 'danger',
      reason: action === 'ban' || action === 'suspend' ? 'required' : 'optional',
      run: async (reason) => (await api.post<{ message: string }>(`/admin/panel/accounts/${a.id}/status`, { action, reason: reason || undefined })).data.message,
    });
  };

  const openDetail = async (a: Account) => {
    try {
      const r = await api.get<{ data: AccountDetail }>(`${panel.api}/accounts/${a.id}`);
      setDetail(r.data.data);
      setRate(r.data.data.commission_rate !== null ? String(r.data.data.commission_rate) : '');
    } catch (e) {
      setToast({ ok: false, text: errorMessage(e) });
    }
  };

  const saveRate = async () => {
    if (!detail) return;
    try {
      const r = await api.put<{ message: string }>(`/admin/panel/accounts/${detail.id}/commission-rate`, { rate: rate === '' ? null : Number(rate) });
      setToast({ ok: true, text: r.data.message });
    } catch (e) {
      setToast({ ok: false, text: errorMessage(e) });
    }
  };

  const chipsActions = (a: Account) =>
    agent ? (
      a.can_load && (
        <ActionIcon label={`Load Chips to ${a.username}`} tone="green" onClick={() => setAmount({ title: `Load Chips · ${a.username}`, verb: 'Load', target: `to ${a.username} from your Chips`, path: `${panel.api}/accounts/${a.id}/load`, variant: 'success' })}>
          <I.plus className="h-5 w-5" />
        </ActionIcon>
      )
    ) : canChips && (
      <>
        <ActionIcon label={`Load Chips to ${a.username}`} tone="green" onClick={() => setAmount({ title: `Load Chips · ${a.username}`, verb: 'Load', target: `to ${a.username}`, path: `/admin/panel/accounts/${a.id}/load`, variant: 'success' })}>
          <I.plus className="h-5 w-5" />
        </ActionIcon>
        <ActionIcon label={`Withdraw Chips from ${a.username}`} tone="red" onClick={() => setAmount({ title: `Withdraw Chips · ${a.username}`, verb: 'Withdraw', target: `from ${a.username}`, path: `/admin/panel/accounts/${a.id}/withdraw`, limit: a.chips, limitLabel: `${a.username}'s Chips`, variant: 'danger' })}>
          <I.minus className="h-5 w-5" />
        </ActionIcon>
      </>
    );

  const more = (a: Account) => (
    <>
      <ActionIcon label={`View ${a.username}`} onClick={() => openDetail(a)}>
        <I.eye className="h-5 w-5" />
      </ActionIcon>
      {a.status === 'active' && !agent && (
        <ActionIcon label={`Ban ${a.username}`} tone="red" onClick={() => status(a, 'ban')}>
          <I.ban className="h-5 w-5" />
        </ActionIcon>
      )}
      {a.status === 'active' && !agent && (
        <ActionIcon label={`Archive ${a.username}`} onClick={() => status(a, 'archive')}>
          <I.archive className="h-5 w-5" />
        </ActionIcon>
      )}
    </>
  );

  const common: Record<string, Column<Account>> = {
    user: {
      key: 'user',
      label: 'Username / Account ID',
      render: (a) => (
        <span className="leading-tight">
          <span className="block font-bold">{a.username}</span>
          <span className="block font-mono text-[11px] text-[#857d9c] dark:text-white/45">{a.account_id}</span>
        </span>
      ),
    },
    type: { key: 'type', label: 'Account Type', render: (a) => <TypePill type={a.account_type} label={a.account_type_label} /> },
    sponsor: { key: 'sponsor', label: kind === 'players' ? 'Agent / Sponsor' : 'Parent / Sponsor', render: (a) => (a.sponsor ? <span>{a.sponsor.username} <span className="text-xs text-[#857d9c] dark:text-white/45">({a.sponsor.account_type_label})</span></span> : <span className="text-[#9a92b2]">Direct</span>) },
    chips: { key: 'chips', label: 'Chips', className: 'text-right', render: (a) => <span className="font-black">{fmt(a.chips, 2)}</span> },
    registered: { key: 'reg', label: 'Registered', render: (a) => <span className="whitespace-nowrap">{when(a.registered_at)}</span> },
    status: { key: 'st', label: 'Status', className: 'text-center', render: (a) => <StatusPill status={a.status} /> },
  };

  const columns: Column<Account>[] = {
    agents: [
      common.user,
      common.type,
      common.sponsor,
      common.chips,
      { key: 'com', label: 'Commission', className: 'text-right', render: (a: Account) => <span className="font-semibold text-[#a16207] dark:text-[#f5c542]">{fmt(a.commission, 2)}</span> },
      common.registered,
      common.status,
      {
        key: 'act',
        label: 'Actions',
        render: (a: Account) => (
          <span className="flex flex-wrap gap-1.5">
            {a.status === 'active' && chipsActions(a)}
            {a.status === 'active' && canCommission && (
              <ActionIcon label={`Withdraw Commission of ${a.username}`} tone="gold" onClick={() => setAmount({ title: `Withdraw Commission · ${a.username}`, verb: 'Withdraw commission of', target: `into ${a.username}'s own Chips`, path: `/admin/panel/accounts/${a.id}/withdraw-commission`, limit: a.commission, limitLabel: 'Commission balance', variant: 'gold' })}>
                <I.percent className="h-5 w-5" />
              </ActionIcon>
            )}
            {more(a)}
            {a.status !== 'active' && !agent && (
              <ActionIcon label={`Reactivate ${a.username}`} tone="green" onClick={() => status(a, 'reactivate')}>
                <I.restore className="h-5 w-5" />
              </ActionIcon>
            )}
          </span>
        ),
      },
    ],
    players: [
      common.user,
      common.sponsor,
      common.chips,
      common.registered,
      common.status,
      { key: 'act', label: 'Actions', render: (a: Account) => <span className="flex flex-wrap gap-1.5">{chipsActions(a)}{more(a)}</span> },
    ],
    pending: [
      common.user,
      { key: 'name', label: 'Name / Email', render: (a: Account) => a.name },
      { key: 'req', label: 'Registering as', render: (a: Account) => <TypePill type={a.account_type === 'agent' ? 'agent' : 'player'} label={a.requested_level ?? 'Player'} /> },
      { key: 'ref', label: 'Referred by', render: (a: Account) => (a.sponsor ? <span>{a.sponsor.username} <span className="text-xs text-[#857d9c] dark:text-white/45">({a.sponsor.account_type_label})</span></span> : <span className="text-[#9a92b2]">No referral</span>) },
      common.registered,
      {
        key: 'act',
        label: 'Actions',
        render: (a: Account) => agent ? (
          <span className="inline-flex items-center gap-2 text-sm text-[#6b6385] dark:text-white/55"><I.clock className="h-4 w-4" /> Waiting for the Administrator</span>
        ) : (
          <span className="flex flex-wrap gap-2">
            <Btn size="sm" variant="success" onClick={() => setConfirm({ title: `Approve ${a.username}`, message: <>Approve <b>{a.username}</b> as {a.requested_level ?? 'Player'}{a.sponsor ? <> under <b>{a.sponsor.username}</b></> : null}? The account becomes active and joins the hierarchy.</>, confirm: 'Approve', variant: 'success', run: async () => (await api.post<{ message: string }>(`/admin/panel/accounts/${a.id}/approve`)).data.message })}>
              <I.check className="h-4 w-4" /> Approve
            </Btn>
            <Btn size="sm" variant="danger" onClick={() => setConfirm({ title: `Delete ${a.username}`, message: <>Delete the registration of <b>{a.username}</b>? This cannot be undone.</>, confirm: 'Delete', variant: 'danger', run: async () => (await api.delete<{ message: string }>(`/admin/panel/accounts/${a.id}`)).data.message })}>
              <I.trash className="h-4 w-4" /> Delete
            </Btn>
          </span>
        ),
      },
    ],
    banned: [
      common.user,
      common.type,
      common.status,
      { key: 'why', label: 'Reason', render: (a: Account) => a.status_reason ?? '—' },
      { key: 'since', label: 'Date', render: (a: Account) => <span className="whitespace-nowrap">{when(a.status_changed_at)}</span> },
      {
        key: 'act',
        label: 'Actions',
        render: (a: Account) => (
          <span className="flex flex-wrap gap-1.5">
            <Btn size="sm" variant="success" onClick={() => status(a, 'reactivate')}>
              <I.restore className="h-4 w-4" /> Reactivate
            </Btn>
            {a.status === 'suspended' && (
              <Btn size="sm" variant="danger" onClick={() => status(a, 'ban')}>
                Ban
              </Btn>
            )}
            <ActionIcon label={`View ${a.username}`} onClick={() => openDetail(a)}>
              <I.eye className="h-5 w-5" />
            </ActionIcon>
          </span>
        ),
      },
    ],
    archived: [
      common.user,
      common.type,
      common.sponsor,
      common.chips,
      { key: 'arch', label: 'Archived', render: (a: Account) => <span className="whitespace-nowrap">{when(a.archived_at)}</span> },
      { key: 'why', label: 'Reason', render: (a: Account) => a.status_reason ?? '—' },
      {
        key: 'act',
        label: 'Actions',
        render: (a: Account) => (
          <span className="flex flex-wrap gap-1.5">
            <ActionIcon label={`View ${a.username}`} onClick={() => openDetail(a)}>
              <I.eye className="h-5 w-5" />
            </ActionIcon>
            <Btn size="sm" variant="success" onClick={() => status(a, 'restore')}>
              <I.restore className="h-4 w-4" /> Restore
            </Btn>
          </span>
        ),
      },
    ],
  }[kind];

  const detailRows = (d: AccountDetail): Array<[string, ReactNode]> => [
    ['Account ID', d.account_id],
    ['Name', d.name],
    ['Email', d.email],
    ['Account type', <TypePill key="t" type={d.account_type} label={d.account_type_label} />],
    ['Sponsor', d.sponsor ? `${d.sponsor.username} (${d.sponsor.account_type_label})` : 'Direct'],
    ['Status', <StatusPill key="s" status={d.status} />],
    ['Chips', `${fmt(d.chips, 2)} Chips`],
    ...(d.commission !== null ? ([['Commission balance', `${fmt(d.commission, 2)} Chips`], ['Commissions earned (all time)', `${fmt(d.commissions_total, 2)} Chips`]] as Array<[string, ReactNode]>) : []),
    ...(d.downline ? ([['Downline', `${d.downline.agents} agents · ${d.downline.players} players`]] as Array<[string, ReactNode]>) : []),
    ['Registered', when(d.registered_at)],
    ['Approved', when(d.approved_at)],
    ...(d.status_reason ? ([['Status reason', d.status_reason]] as Array<[string, ReactNode]>) : []),
  ];

  return (
    <AdminPanelLayout title={info.title} subtitle={info.subtitle}>
      <Panel title={info.title} icon={kind === 'pending' ? <I.clock className="h-6 w-6" /> : kind === 'banned' ? <I.ban className="h-6 w-6" /> : kind === 'archived' ? <I.archive className="h-6 w-6" /> : <I.users className="h-6 w-6" />} actions={data?.meta && <span className="text-sm font-bold text-[#6b6385] dark:text-white/55">{fmt(data.meta.total)} accounts</span>}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search username, name, email or ID…" />
          {kind === 'agents' && <Picker label="Level" value={level} onChange={(v) => { setLevel(v); setPage(1); }} options={[['', 'All levels'], ['agent', 'Agents'], ['master', 'Master Agents'], ['silver', 'Silver Agents']]} />}
          {(kind === 'pending' || kind === 'banned' || kind === 'archived') && <Picker label="Account type" value={type} onChange={(v) => { setType(v); setPage(1); }} options={[['', 'Agents and players'], ['agent', 'Agents'], ['player', 'Players']]} />}
        </div>
        <Table label={info.title} columns={columns} rows={data?.data} loading={loading && !data} rowKey={(a) => a.id} empty={info.empty} />
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>

      <AmountDialog action={amount} onClose={() => setAmount(null)} onDone={done} />
      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} onDone={done} />
      <Dialog open={!!detail} title={detail ? `${detail.username} · ${detail.account_type_label}` : ''} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-5">
            <Details rows={detailRows(detail)} />
            {detail.links && (detail.links.player || detail.links.agent) && (
              <div className="space-y-1 text-xs">
                {detail.links.player && <p className="break-all"><b>Player link:</b> {detail.links.player}</p>}
                {detail.links.agent && <p className="break-all"><b>{detail.links.agent_level} link:</b> {detail.links.agent}</p>}
              </div>
            )}
            {detail.commission !== null && canCommission && detail.status === 'active' && (
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[#ece7f8] p-3 dark:border-white/10">
                <label className="block w-44">
                  <span className="mb-1 block text-xs font-bold uppercase text-[#6b6385] dark:text-white/55">Own commission rate %</span>
                  <input inputMode="decimal" value={rate} placeholder="Level default" onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} className={fieldClass} aria-label="Own commission rate" />
                </label>
                <Btn size="sm" onClick={saveRate}>Save rate</Btn>
                <span className="text-xs text-[#857d9c] dark:text-white/45">Leave empty to use the level default.</span>
              </div>
            )}
            <div>
              <h4 className="mb-2 text-sm font-extrabold">Recent transactions</h4>
              {detail.transactions.length === 0 ? (
                <p className="text-sm text-[#857d9c] dark:text-white/45">No transactions.</p>
              ) : (
                <ul className="divide-y divide-[#f0ecf9] text-sm dark:divide-white/[0.06]">
                  {detail.transactions.map((t) => (
                    <li key={t.reference} className="flex items-center gap-3 py-2">
                      <span className="w-28 shrink-0 text-xs text-[#857d9c] dark:text-white/45">{when(t.created_at)}</span>
                      <span className="min-w-0 flex-1 truncate">{t.reason ?? t.type}</span>
                      <span className={`font-black ${t.direction === 'in' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {t.direction === 'in' ? '+' : '−'} {fmt(t.amount, 2)} {t.currency === 'GD' ? 'Gold' : 'Chips'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Dialog>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
