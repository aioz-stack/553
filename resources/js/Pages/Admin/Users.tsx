import { Link, usePage } from '@inertiajs/react';
import { useState, type FormEvent } from 'react';
import DataTable, { Pager } from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, statusTone } from '../../Components/ui';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { dateTime } from '../../lib/format';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';

interface UserRow {
  id: number;
  name: string;
  username: string;
  email?: string;
  role: string;
  role_label: string;
  status: string;
  agent?: { id: number; code: string } | null;
  owning_agent?: { agent_id: number; name: string } | null;
  last_login_at: string | null;
  created_at: string;
}

const TITLES: Record<string, string> = { admin: 'Administrators', agent: 'Agents', player: 'Players' };
const ENDPOINT: Record<string, string> = { admin: '/admin/administrators', agent: '/admin/agents', player: '/admin/players' };

/**
 * Administrators / Agents / Players management (one page, role prop).
 */
export default function Users({ role }: { role: 'admin' | 'agent' | 'player' }) {
  const { auth } = usePage<SharedProps>().props;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const { data, loading, reload } = useApi<{ data: UserRow[]; meta: { current_page: number; last_page: number; total: number } }>(ENDPOINT[role], { page, search: search || undefined });
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', role: role === 'admin' ? 'admin' : role });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    setError(null);
    try {
      const endpoint = role === 'admin' && form.role === 'super_admin' ? '/admin/users' : ENDPOINT[role];
      await api.post(endpoint, form);
      setOpen(false);
      setForm({ ...form, name: '', username: '', email: '', password: '' });
      reload();
    } catch (e) {
      setErrors(fieldErrors(e));
      setError(errorMessage(e));
    }
  };

  const toggleStatus = async (user: UserRow) => {
    await api.post(`/admin/users/${user.id}/status`, { status: user.status === 'active' ? 'suspended' : 'active' });
    reload();
  };

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  return (
    <PageShell title={TITLES[role]}>
      <Card title={TITLES[role]} actions={role === 'admin' ? <Button onClick={() => setOpen(true)}>Add administrator</Button> : <span className="text-sm text-gray-500">{role === 'agent' ? 'Agents' : 'Players'} join only through registration links.</span>}>
        <div className="mb-4 max-w-sm">
          <Input placeholder="Search name, username or email" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <DataTable<UserRow>
          loading={loading}
          rows={data?.data}
          rowKey={(u) => u.id}
          columns={[
            { key: 'name', label: 'Name', render: (u) => <Link href={`/admin/users/${u.id}`} className="font-medium text-brand-500">{u.name}</Link> },
            { key: 'username', label: 'Username', render: (u) => u.username },
            { key: 'email', label: 'Email', render: (u) => u.email ?? '—' },
            ...(role === 'agent' ? [{ key: 'code', label: 'Agent code', render: (u: UserRow) => <code>{u.agent?.code}</code> }] : []),
            ...(role === 'player' ? [{ key: 'agent', label: 'Agent', render: (u: UserRow) => u.owning_agent?.name ?? <span className="text-gray-400">Unassigned</span> }] : []),
            { key: 'status', label: 'Status', render: (u) => <Badge tone={statusTone(u.status)}>{u.status}</Badge> },
            { key: 'login', label: 'Last login', render: (u) => dateTime(u.last_login_at) },
            {
              key: 'actions',
              label: 'Actions',
              align: 'right',
              render: (u) => (
                <div className="inline-flex gap-2">
                  <Link href={`/admin/users/${u.id}`} className="rounded-lg border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300">
                    View
                  </Link>
                  <Button size="sm" variant={u.status === 'active' ? 'danger' : 'success'} onClick={() => toggleStatus(u)}>
                    {u.status === 'active' ? 'Suspend' : 'Activate'}
                  </Button>
                </div>
              ),
            },
          ]}
        />
        <Pager meta={data?.meta} onPage={setPage} />
      </Card>

      <Modal open={open} title={`Add ${role === 'admin' ? 'administrator' : role}`} onClose={() => setOpen(false)}>
        {error && <Alert>{error}</Alert>}
        <form onSubmit={create} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Name" error={errors.name} required><Input value={form.name} onChange={set('name')} /></Field>
          <Field label="Username" error={errors.username} required><Input value={form.username} onChange={set('username')} /></Field>
          <Field label="Email" error={errors.email} required><Input type="email" value={form.email} onChange={set('email')} /></Field>
          <Field label="Password" error={errors.password} required><Input type="password" value={form.password} onChange={set('password')} /></Field>
          {role === 'admin' && auth.user?.role === 'super_admin' && (
            <Field label="Role" hint="Only Super Admins can create Super Admins.">
              <Select value={form.role} onChange={set('role')}>
                <option value="admin">Administrator</option>
                <option value="super_admin">Super Admin</option>
              </Select>
            </Field>
          )}
          <div className="md:col-span-2">
            <Button type="submit">Create</Button>
            {role === 'admin' && <p className="mt-2 text-xs text-gray-500">Grant permissions on the administrator's detail page after creating.</p>}
          </div>
        </form>
      </Modal>
    </PageShell>
  );
}
