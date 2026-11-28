import { useState } from 'react';
import { HistoryFilters, LoadError, viewerTz } from '../../Components/AdminPanel/HistoryFilters';
import {
  ActionButton,
  Btn,
  ConfirmDialog,
  Details,
  Dialog,
  I,
  Note,
  Panel,
  Pager,
  Picker,
  Segments,
  StatusPill,
  Table,
  Toast,
  TypePill,
  when,
  type Column,
  type ConfirmAction,
} from '../../Components/AdminPanel/kit';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api } from '../../lib/api';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import { useApi } from '../../lib/useApi';
import type { PageMeta } from './types';

type RegStatus = 'pending' | 'approved' | 'rejected';
type ApplicantType = 'player' | 'agent' | 'master';

interface Person {
  id: number;
  username: string;
  name: string;
  role_label: string;
}

/** One registration, as returned by GET {panel}/registrations (App\Http\Controllers\Api\V1\RegistrationController). */
interface Registration {
  id: number;
  account_id: string;
  username: string;
  name: string;
  email: string;
  applicant_type: ApplicantType | null;
  applicant_type_label: string;
  registration_status: RegStatus;
  account_status: string;
  registered_at: string | null;
  link: { type: 'player' | 'agent'; label: string; code: string | null; owner: Person | null };
  approved_at: string | null;
  approved_by: Person | null;
  rejected_at: string | null;
  rejected_by: Person | null;
  rejection_reason: string | null;
  can_review: boolean;
}

interface RegMeta extends PageMeta {
  counts: Record<RegStatus, number>;
  reviewable_types: ApplicantType[];
}

const TYPE_LABEL: Record<ApplicantType, string> = { agent: 'Incorporators', master: 'Master Agents', player: 'Players' };

/** Who this account approves, in words (the server enforces the same rule: RegistrationReview). */
function scopeText(isSuper: boolean, isAgent: boolean, level: string | null): string {
  if (isSuper) return 'As Super Admin you can review every registration on the platform.';
  if (!isAgent) return 'Incorporators and Players who registered through your own registration links.';
  return level === 'master' ? 'Players who registered through your own Player Registration Link.' : 'Master Agents and Players who registered through your own registration links.';
}

/**
 * Registration approvals (Admin Panel and Agent Panel): Pending, Approved and Rejected
 * registrations made through the signed-in account's own registration links, with Approve and
 * Reject. The list, counts and actions are scoped on the server; a button shown here is only
 * a convenience, never the permission.
 */
export default function Registrations() {
  const panel = usePanel();
  const [status, setStatus] = useState<RegStatus>('pending');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState<'' | ApplicantType>('');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi<{ data: Registration[]; meta: RegMeta }>(`${panel.api}/registrations`, {
    status,
    q: q.trim() || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
    tz: viewerTz,
    page,
  });
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [detail, setDetail] = useState<Registration | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  usePanelRefresh(reload);

  const meta = data?.meta;
  const isSuper = !panel.isAgent && meta?.reviewable_types.length === 3;
  const types = meta?.reviewable_types ?? [];
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const done = (text: string) => {
    setConfirm(null);
    setDetail(null);
    setToast({ ok: true, text });
    reload();
  };

  const approve = (r: Registration) =>
    setConfirm({
      title: `Approve ${r.username}`,
      message: (
        <>
          Approve <b>{r.username}</b> as <b>{r.applicant_type_label}</b>
          {r.link.owner ? <> under <b>{r.link.owner.username}</b></> : null}? The account becomes active with the {r.applicant_type_label} role.
        </>
      ),
      confirm: 'Approve',
      variant: 'success',
      run: async () => (await api.post<{ message: string }>(`${panel.api}/registrations/${r.id}/approve`)).data.message,
    });

  const reject = (r: Registration) =>
    setConfirm({
      title: `Reject ${r.username}`,
      message: (
        <>
          Reject the registration of <b>{r.username}</b> ({r.applicant_type_label})? The account stays inactive and cannot sign in, play or use any management feature. This cannot be undone.
        </>
      ),
      confirm: 'Reject',
      variant: 'danger',
      reason: 'required',
      run: async (reason) => (await api.post<{ message: string }>(`${panel.api}/registrations/${r.id}/reject`, { reason })).data.message,
    });

  const person = (p: Person | null) => (p ? <span>{p.username} <span className="text-xs text-[#857d9c] dark:text-white/45">({p.role_label})</span></span> : <span className="text-[#9a92b2]">—</span>);

  const columns: Column<Registration>[] = [
    {
      key: 'user',
      label: 'Applicant',
      render: (r) => (
        <span className="leading-tight">
          <span className="block font-bold">{r.name}</span>
          <span className="block text-xs text-[#6b6385] dark:text-white/55">@{r.username}</span>
          <span className="block font-mono text-[11px] text-[#857d9c] dark:text-white/45">{r.account_id}</span>
        </span>
      ),
    },
    { key: 'type', label: 'Applicant Role', render: (r) => <TypePill type={r.applicant_type} label={r.applicant_type_label} /> },
    { key: 'reg', label: 'Registered', render: (r) => <span className="whitespace-nowrap">{when(r.registered_at)}</span> },
    {
      key: 'link',
      label: 'Registration Link',
      render: (r) => (
        <span className="leading-tight">
          <span className="block">{person(r.link.owner)}</span>
          <span className="block text-xs text-[#857d9c] dark:text-white/45">
            {r.link.label}
            {r.link.code ? <> · <span className="font-mono">{r.link.code}</span></> : null}
          </span>
        </span>
      ),
    },
    ...(status === 'approved'
      ? [{ key: 'by', label: 'Approved', render: (r: Registration) => <span className="leading-tight"><span className="block whitespace-nowrap">{when(r.approved_at)}</span><span className="block text-xs">{person(r.approved_by)}</span></span> }]
      : status === 'rejected'
        ? [
            { key: 'by', label: 'Rejected', render: (r: Registration) => <span className="leading-tight"><span className="block whitespace-nowrap">{when(r.rejected_at)}</span><span className="block text-xs">{person(r.rejected_by)}</span></span> },
            { key: 'why', label: 'Rejection Reason', render: (r: Registration) => <span className="line-clamp-2 max-w-[16rem]">{r.rejection_reason ?? '—'}</span> },
          ]
        : []),
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.registration_status} /> },
    {
      key: 'act',
      label: 'Actions',
      render: (r) => (
        <span className="flex flex-wrap gap-1.5">
          {r.can_review && (
            <>
              <Btn size="sm" variant="success" onClick={() => approve(r)}>
                <I.check className="h-4 w-4" /> Approve
              </Btn>
              <Btn size="sm" variant="danger" onClick={() => reject(r)}>
                <I.ban className="h-4 w-4" /> Reject
              </Btn>
            </>
          )}
          <ActionButton label="View" icon={<I.eye />} onClick={() => setDetail(r)} />
        </span>
      ),
    },
  ];

  const tab = (s: RegStatus, label: string) => (
    <span className="inline-flex items-center gap-2">
      {label}
      {meta && <span className="rounded-md bg-black/10 px-1.5 text-xs dark:bg-white/15">{meta.counts[s]}</span>}
    </span>
  );

  const empty = { pending: 'No registrations are waiting for your approval.', approved: 'No approved registrations yet.', rejected: 'No rejected registrations.' }[status];

  return (
    <AdminPanelLayout title="Registration Approvals" subtitle="Applicants who registered through your registration links">
      <Panel
        title="Registration Approvals"
        icon={<I.clock className="h-6 w-6" />}
        actions={<Segments label="Registration status" value={status} onChange={(v) => reset(() => setStatus(v))} options={[['pending', tab('pending', 'Pending')], ['approved', tab('approved', 'Approved')], ['rejected', tab('rejected', 'Rejected')]]} />}
      >
        <div className="px-5 pt-4">
          <Note>
            <b>You can review:</b> {scopeText(isSuper, panel.isAgent, panel.level)}
          </Note>
        </div>
        <HistoryFilters
          q={q}
          onQ={(v) => reset(() => setQ(v))}
          placeholder="Search name, username, email or ID…"
          from={from}
          to={to}
          onFrom={(v) => reset(() => setFrom(v))}
          onTo={(v) => reset(() => setTo(v))}
          dirty={!!(q || from || to || type)}
          onClear={() => reset(() => { setQ(''); setFrom(''); setTo(''); setType(''); })}
        >
          {(types.length > 1 || isSuper) && (
            <Picker
              label="Applicant role"
              value={type}
              onChange={(v) => reset(() => setType(v))}
              options={[['', 'All roles'], ...((isSuper ? (['agent', 'master', 'player'] as ApplicantType[]) : types).map((t) => [t, TYPE_LABEL[t]] as [ApplicantType, string]))]}
            />
          )}
        </HistoryFilters>
        {error && <LoadError error={error} onRetry={reload} />}
        <Table label="Registrations" columns={columns} rows={data?.data} loading={loading && !data} rowKey={(r) => r.id} empty={empty} />
        <Pager meta={meta} onPage={setPage} />
      </Panel>

      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} onDone={done} />
      <Dialog open={!!detail} title={detail ? `${detail.username} · ${detail.applicant_type_label}` : ''} onClose={() => setDetail(null)} wide>
        {detail && (
          <div className="space-y-5">
            <Details
              rows={[
                ['Account ID', detail.account_id],
                ['Name', detail.name],
                ['Username', detail.username],
                ['Email', detail.email],
                ['Applicant role', <TypePill key="t" type={detail.applicant_type} label={detail.applicant_type_label} />],
                ['Registered', when(detail.registered_at)],
                ['Registration link', `${detail.link.label}${detail.link.code ? ` (${detail.link.code})` : ''}`],
                ['Link owner', detail.link.owner ? `${detail.link.owner.username} (${detail.link.owner.role_label})` : '—'],
                ['Registration status', <StatusPill key="s" status={detail.registration_status} />],
                ...(detail.approved_at ? ([['Approved', `${when(detail.approved_at)}${detail.approved_by ? ` by ${detail.approved_by.username}` : ''}`]] as Array<[string, string]>) : []),
                ...(detail.rejected_at ? ([['Rejected', `${when(detail.rejected_at)}${detail.rejected_by ? ` by ${detail.rejected_by.username}` : ''}`], ['Rejection reason', detail.rejection_reason ?? '—']] as Array<[string, string]>) : []),
              ]}
            />
            {detail.can_review && (
              <div className="flex flex-wrap gap-2">
                <Btn variant="success" onClick={() => approve(detail)}>
                  <I.check className="h-4 w-4" /> Approve
                </Btn>
                <Btn variant="danger" onClick={() => reject(detail)}>
                  <I.ban className="h-4 w-4" /> Reject
                </Btn>
              </div>
            )}
          </div>
        )}
      </Dialog>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
