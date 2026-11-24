import { useState, type FormEvent } from 'react';
import { ActionButton, Btn, ConfirmDialog, Details, Dialog, I, Note, Pager, Panel, Picker, SearchInput, StatusPill, Table, Toast, TypePill, fieldClass, when, type Column, type ConfirmAction } from '../../Components/AdminPanel/kit';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import { api, errorMessage } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import type { PageMeta } from './types';

interface Employee {
  id: number;
  account_id: string;
  username: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'loader' | 'admin';
  role_label: string;
  status: string;
  status_reason: string | null;
  permissions: string[];
  employer: { id: number; username: string } | null;
  last_login_at: string | null;
  created_at: string | null;
}

interface PermissionInfo {
  key: string;
  label: string;
  description: string;
}

interface Meta extends PageMeta {
  roles: Array<{ value: 'loader' | 'admin'; label: string }>;
  permissions: { loader: PermissionInfo[]; admin: PermissionInfo[] };
}

interface Activity {
  counts: { loads_processed: number; password_resets: number; withdrawals_reviewed: number; actions: number };
  recent: Array<{ action: string; subject: string | null; details: Record<string, unknown>; ip: string | null; at: string | null }>;
}

const strong = (p: string) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);

/**
 * Admin Panel → Users / Employees: staff accounts with their own sign-in. Admins create and
 * manage Loader Accounts (Load Transactions, Commission Transactions, Reset Password only); the
 * Super Admin also manages Administrators. Every rule is enforced again by the server.
 */
export default function Employees() {
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'' | 'loader' | 'admin'>('');
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('');
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<{ data: Employee[]; meta: Meta }>('/admin/employees', { q: q.trim() || undefined, role: role || undefined, status: status || undefined, page });
  const meta = data?.meta;
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [perms, setPerms] = useState<Employee | null>(null);
  const [password, setPassword] = useState<Employee | null>(null);
  const [activity, setActivity] = useState<(Employee & Activity) | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const done = (text: string) => {
    setCreating(false);
    setEditing(null);
    setPerms(null);
    setPassword(null);
    setConfirm(null);
    setToast({ ok: true, text });
    reload();
  };

  const permissionList = (r: 'loader' | 'admin') => (r === 'loader' ? meta?.permissions.loader : meta?.permissions.admin) ?? [];

  const openActivity = async (e: Employee) => {
    try {
      const r = await api.get<{ data: Employee & Activity }>(`/admin/employees/${e.id}/activity`);
      setActivity(r.data.data);
    } catch (err) {
      setToast({ ok: false, text: errorMessage(err) });
    }
  };

  const cols: Column<Employee>[] = [
    {
      key: 'user',
      label: 'Employee',
      render: (e) => (
        <span className="leading-tight">
          <span className="block font-bold">{e.username}</span>
          <span className="block text-xs text-[#857d9c] dark:text-white/45">
            {e.name} · <span className="font-mono">{e.account_id}</span>
          </span>
        </span>
      ),
    },
    { key: 'role', label: 'Role', render: (e) => <TypePill type={e.role === 'loader' ? 'silver' : 'admin'} label={e.role_label} /> },
    {
      key: 'perm',
      label: 'Permissions',
      render: (e) => (
        <span className="text-xs text-[#5b5274] dark:text-white/65">
          {e.permissions.length === 0 ? <span className="text-rose-600 dark:text-rose-400">None</span> : e.permissions.map((p) => permissionList(e.role).find((x) => x.key === p)?.label ?? p).join(', ')}
        </span>
      ),
    },
    { key: 'emp', label: 'Created by', render: (e) => e.employer?.username ?? '—' },
    { key: 'login', label: 'Last sign-in', render: (e) => <span className="whitespace-nowrap">{when(e.last_login_at)}</span> },
    { key: 'st', label: 'Status', className: 'text-center', render: (e) => <StatusPill status={e.status} /> },
    {
      key: 'act',
      label: 'Actions',
      render: (e) => (
        <span className="flex flex-wrap gap-1.5">
          <ActionButton label="Edit" icon={<I.user />} onClick={() => setEditing(e)} />
          <ActionButton label="Permissions" tone="purple" icon={<I.shield />} onClick={() => setPerms(e)} />
          <ActionButton label="Reset Password" tone="gold" icon={<I.lock />} onClick={() => setPassword(e)} />
          <ActionButton label="Activity" icon={<I.clock />} onClick={() => openActivity(e)} />
          {e.status === 'active' ? (
            <ActionButton
              label="Deactivate"
              tone="red"
              icon={<I.ban />}
              onClick={() =>
                setConfirm({
                  title: `Deactivate ${e.username}`,
                  message: <>Deactivate <b>{e.username}</b>? They are signed out everywhere at once and cannot sign in until reactivated. Their history stays.</>,
                  confirm: 'Deactivate',
                  variant: 'danger',
                  reason: 'optional',
                  run: async (reason) => (await api.post<{ message: string }>(`/admin/employees/${e.id}/status`, { active: false, reason: reason || undefined })).data.message,
                })
              }
            />
          ) : (
            <ActionButton
              label="Activate"
              tone="green"
              icon={<I.restore />}
              onClick={() =>
                setConfirm({
                  title: `Activate ${e.username}`,
                  message: <>Activate <b>{e.username}</b>? They can sign in again with their current password.</>,
                  confirm: 'Activate',
                  variant: 'success',
                  run: async () => (await api.post<{ message: string }>(`/admin/employees/${e.id}/status`, { active: true })).data.message,
                })
              }
            />
          )}
          <ActionButton
            label="Delete"
            tone="red"
            icon={<I.trash />}
            onClick={() =>
              setConfirm({
                title: `Delete ${e.username}`,
                message: <>Delete <b>{e.username}</b> permanently? This is only possible for an account that has never done anything; otherwise deactivate it so its history stays attributed. This cannot be undone.</>,
                confirm: 'Delete',
                variant: 'danger',
                run: async () => (await api.delete<{ message: string }>(`/admin/employees/${e.id}`)).data.message,
              })
            }
          />
        </span>
      ),
    },
  ];

  return (
    <AdminPanelLayout title="Users / Employees" subtitle="Staff accounts with their own sign-in — Loader Accounts and Administrators">
      <Note>
        <b>Loader Accounts</b> can only use Load Transactions (loads use the Chips of the Admin who created them), Commission Transactions (review commission withdrawals) and Reset Password for Agents, Master Agents, Silver Agents and Players. They never reach the Admin dashboard, maintenance, settings, rates or the agent hierarchy.
      </Note>
      <Panel
        title="Employees"
        icon={<I.users className="h-6 w-6" />}
        actions={
          <Btn onClick={() => setCreating(true)} disabled={!meta}>
            <I.userPlus className="h-4 w-4" /> New employee
          </Btn>
        }
      >
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search name, username, email or role…" />
          <Picker label="Role" value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[['', 'All roles'], ...((meta?.roles ?? []).map((r) => [r.value, r.label]) as Array<['loader' | 'admin', string]>)]} />
          <Picker label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[['', 'Any status'], ['active', 'Active'], ['inactive', 'Deactivated']]} />
        </div>
        <Table label="Employees" columns={cols} rows={data?.data} loading={loading && !data} rowKey={(e) => e.id} empty="No employees yet. Create a Loader Account to get started." />
        <Pager meta={meta} onPage={setPage} />
      </Panel>

      {meta && <CreateDialog open={creating} meta={meta} onClose={() => setCreating(false)} onDone={done} />}
      {editing && <EditDialog employee={editing} onClose={() => setEditing(null)} onDone={done} />}
      {perms && <PermissionsDialog employee={perms} options={permissionList(perms.role)} onClose={() => setPerms(null)} onDone={done} />}
      {password && <PasswordDialog employee={password} onClose={() => setPassword(null)} onDone={done} />}
      <Dialog open={!!activity} title={activity ? `Activity · ${activity.username}` : ''} onClose={() => setActivity(null)} wide>
        {activity && (
          <div className="space-y-4">
            <Details
              rows={[
                ['Role', activity.role_label],
                ['Status', <StatusPill key="s" status={activity.status} />],
                ['Loads processed', activity.counts.loads_processed],
                ['Password resets', activity.counts.password_resets],
                ['Withdrawals reviewed', activity.counts.withdrawals_reviewed],
                ['All recorded actions', activity.counts.actions],
                ['Last sign-in', when(activity.last_login_at)],
              ]}
            />
            <ul className="max-h-80 divide-y divide-[#f0ecf9] overflow-y-auto text-sm dark:divide-white/[0.06]">
              {activity.recent.length === 0 && <li className="py-3 text-[#857d9c] dark:text-white/45">No activity yet.</li>}
              {activity.recent.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-36 shrink-0 text-xs text-[#857d9c] dark:text-white/45">{when(r.at)}</span>
                  <span className="font-mono text-xs font-bold">{r.action}</span>
                  {r.subject && <span className="text-xs text-[#6b6385] dark:text-white/55">{r.subject}</span>}
                  {'target' in r.details && <span className="text-xs">→ {String(r.details.target)}</span>}
                  {r.ip && <span className="ml-auto text-[11px] text-[#9a92b2]">{r.ip}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Dialog>
      <ConfirmDialog action={confirm} onClose={() => setConfirm(null)} onDone={done} />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}

function useSubmit(onDone: (m: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await fn());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-[#3b3354] dark:text-white/80">{label}</span>
      {children}
    </label>
  );
}

function PermissionBoxes({ options, value, onChange }: { options: PermissionInfo[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {options.map((p) => (
        <label key={p.key} className="flex items-start gap-3 rounded-xl border border-[#ece7f8] p-3 dark:border-white/10">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#7c3aed]" checked={value.includes(p.key)} onChange={(e) => onChange(e.target.checked ? [...value, p.key] : value.filter((k) => k !== p.key))} aria-label={p.label} />
          <span>
            <span className="block text-sm font-bold">{p.label}</span>
            <span className="block text-xs text-[#6b6385] dark:text-white/55">{p.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function CreateDialog({ open, meta, onClose, onDone }: { open: boolean; meta: Meta; onClose: () => void; onDone: (m: string) => void }) {
  const [form, setForm] = useState({ role: 'loader' as 'loader' | 'admin', name: '', username: '', email: '', phone: '', password: '', password_confirmation: '' });
  const [permissions, setPermissions] = useState<string[]>(['loader_loads', 'loader_commissions', 'loader_passwords']);
  const { busy, error, run } = useSubmit(onDone);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const ok = form.name && form.username.length >= 3 && form.email && strong(form.password) && form.password === form.password_confirmation;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ok) void run(async () => (await api.post<{ message: string }>('/admin/employees', { ...form, phone: form.phone || undefined, permissions })).data.message);
  };

  return (
    <Dialog open={open} title="New employee" onClose={onClose} wide>
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Role">
          <select
            className={fieldClass}
            value={form.role}
            onChange={(e) => {
              const r = e.target.value as 'loader' | 'admin';
              setForm({ ...form, role: r });
              setPermissions(r === 'loader' ? ['loader_loads', 'loader_commissions', 'loader_passwords'] : []);
            }}
            aria-label="Role"
          >
            {meta.roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Full name"><input className={fieldClass} value={form.name} onChange={set('name')} aria-label="Full name" /></Field>
        <Field label="Username (sign-in)"><input className={fieldClass} value={form.username} onChange={set('username')} autoComplete="off" aria-label="Username" /></Field>
        <Field label="Email"><input type="email" className={fieldClass} value={form.email} onChange={set('email')} aria-label="Email" /></Field>
        <Field label="Phone (optional)"><input className={fieldClass} value={form.phone} onChange={set('phone')} aria-label="Phone" /></Field>
        <div />
        <Field label="Password"><input type="password" autoComplete="new-password" className={fieldClass} value={form.password} onChange={set('password')} aria-label="Password" /></Field>
        <Field label="Confirm password"><input type="password" autoComplete="new-password" className={fieldClass} value={form.password_confirmation} onChange={set('password_confirmation')} aria-label="Confirm password" /></Field>
        <p className="text-xs text-[#857d9c] md:col-span-2 dark:text-white/45">8+ characters with letters and numbers. The employee signs in with their own username and password.</p>
        <div className="md:col-span-2">
          <span className="mb-2 block text-sm font-bold text-[#3b3354] dark:text-white/80">Permissions</span>
          <PermissionBoxes options={form.role === 'loader' ? meta.permissions.loader : meta.permissions.admin} value={permissions} onChange={setPermissions} />
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-rose-600 md:col-span-2 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2 md:col-span-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={!ok || busy}>{busy ? 'Creating…' : 'Create employee'}</Btn>
        </div>
      </form>
    </Dialog>
  );
}

function EditDialog({ employee, onClose, onDone }: { employee: Employee; onClose: () => void; onDone: (m: string) => void }) {
  const [form, setForm] = useState({ name: employee.name, email: employee.email, phone: employee.phone ?? '' });
  const { busy, error, run } = useSubmit(onDone);

  return (
    <Dialog open title={`Edit · ${employee.username}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => (await api.patch<{ message: string }>(`/admin/employees/${employee.id}`, { ...form, phone: form.phone || null })).data.message);
        }}
        className="space-y-4"
      >
        <Field label="Full name"><input className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Full name" /></Field>
        <Field label="Email"><input type="email" className={fieldClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email" /></Field>
        <Field label="Phone"><input className={fieldClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Phone" /></Field>
        {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={busy || !form.name || !form.email}>Save</Btn>
        </div>
      </form>
    </Dialog>
  );
}

function PermissionsDialog({ employee, options, onClose, onDone }: { employee: Employee; options: PermissionInfo[]; onClose: () => void; onDone: (m: string) => void }) {
  const [value, setValue] = useState<string[]>(employee.permissions);
  const { busy, error, run } = useSubmit(onDone);

  return (
    <Dialog open title={`Permissions · ${employee.username}`} onClose={onClose}>
      <div className="space-y-4">
        <PermissionBoxes options={options} value={value} onChange={setValue} />
        {error && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn disabled={busy} onClick={() => void run(async () => (await api.put<{ message: string }>(`/admin/employees/${employee.id}/permissions`, { permissions: value })).data.message)}>Save permissions</Btn>
        </div>
      </div>
    </Dialog>
  );
}

function PasswordDialog({ employee, onClose, onDone }: { employee: Employee; onClose: () => void; onDone: (m: string) => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sure, setSure] = useState(false);
  const { busy, error, run } = useSubmit(onDone);
  const problem = !password ? null : !strong(password) ? 'Use at least 8 characters with letters and numbers.' : confirmation && confirmation !== password ? 'The passwords do not match.' : null;
  const ok = strong(password) && password === confirmation;

  return (
    <Dialog open title={`Reset password · ${employee.username}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="New password"><input type="password" autoComplete="new-password" className={fieldClass} value={password} onChange={(e) => { setPassword(e.target.value); setSure(false); }} aria-label="New password" /></Field>
        <Field label="Confirm new password"><input type="password" autoComplete="new-password" className={fieldClass} value={confirmation} onChange={(e) => { setConfirmation(e.target.value); setSure(false); }} aria-label="Confirm new password" /></Field>
        {(problem || error) && <p role="alert" className="text-sm font-semibold text-rose-600 dark:text-rose-400">{problem ?? error}</p>}
        {sure && <p className="text-sm">The new password works at once and every open sign-in of <b>{employee.username}</b> ends. Continue?</p>}
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          {!sure ? (
            <Btn variant="danger" disabled={!ok} onClick={() => setSure(true)}>Reset password</Btn>
          ) : (
            <Btn variant="danger" disabled={busy} onClick={() => void run(async () => (await api.put<{ message: string }>(`/admin/employees/${employee.id}/password`, { password, password_confirmation: confirmation })).data.message)}>
              Yes, reset it
            </Btn>
          )}
        </div>
      </div>
    </Dialog>
  );
}
