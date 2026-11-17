import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import AllocateForm from '../../Components/AllocateForm';
import PageShell from '../../Components/PageShell';
import TransactionsTable from '../../Components/TransactionsTable';
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner, StatCard, statusTone } from '../../Components/ui';
import { api, errorMessage } from '../../lib/api';
import { points, titleCase } from '../../lib/format';
import type { SharedProps, Wallet } from '../../lib/types';
import { useApi } from '../../lib/useApi';

const ABILITIES: Array<[string, string]> = [
  ['manage_players', 'Manage players'],
  ['manage_agents', 'Manage agents'],
  ['allocate_points', 'Allocate points'],
  ['manage_rooms', 'Manage game rooms'],
  ['review_transactions', 'Review transactions'],
  ['view_reports', 'View reports'],
  ['manage_commissions', 'Manage commissions'],
  ['manage_games', 'Manage games'],
  ['view_audit_logs', 'View audit logs'],
  ['freeze_allocations', 'Freeze allocations'],
];

interface Detail {
  id: number;
  name: string;
  username: string;
  email: string;
  role: string;
  role_label: string;
  status: string;
  agent?: { id: number; code: string } | null;
  owning_agent?: { agent_id: number; name: string } | null;
}

export default function UserDetail({ userId }: { userId: number }) {
  const { auth } = usePage<SharedProps>().props;
  const isSuper = auth.user?.role === 'super_admin';
  const user = useApi<{ data: Detail & { permissions?: string[] } }>(`/admin/users/${userId}`);
  const wallets = useApi<{ data: Wallet[] }>(auth.user?.abilities.includes('review_transactions') ? '/admin/wallets' : null, { user_id: userId });
  const agents = useApi<{ data: Array<{ id: number; name: string; agent?: { id: number; code: string } }> }>(auth.user?.abilities.includes('manage_agents') ? '/admin/agents' : null, { per_page: 100 });
  const [permissions, setPermissions] = useState<string[]>([]);
  const [limits, setLimits] = useState({ currency: 'VC', max_per_transaction: '', daily_limit: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const u = user.data?.data;

  useEffect(() => {
    setPermissions(user.data?.data.permissions ?? []);
  }, [user.data]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
      user.reload();
      wallets.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  if (!u) {
    return <PageShell title="User">{user.error ? <Alert>{user.error}</Alert> : <Spinner />}</PageShell>;
  }

  return (
    <PageShell title={`${u.name} (@${u.username})`}>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone="brand">{u.role_label}</Badge>
        <Badge tone={statusTone(u.status)}>{u.status}</Badge>
        {u.agent && <Badge>Agent code {u.agent.code}</Badge>}
        {u.owning_agent && <Badge>Agent: {u.owning_agent.name}</Badge>}
      </div>

      {wallets.data && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {wallets.data.data.map((w) => (
            <div key={w.id}>
              <StatCard label={`${titleCase(w.type)} · ${w.currency}`} value={points(w.balance, w.currency)} hint={w.is_frozen ? 'Frozen' : undefined} />
              {w.type === 'allocation' && auth.user?.abilities.includes('freeze_allocations') && (
                <Button size="sm" variant={w.is_frozen ? 'success' : 'danger'} className="mt-2" onClick={() => run(() => api.post(`/admin/wallets/${w.id}/freeze`, { frozen: !w.is_frozen }), w.is_frozen ? 'Unfrozen.' : 'Frozen.')}>
                  {w.is_frozen ? 'Unfreeze' : 'Freeze'} allocation
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {auth.user?.abilities.includes('allocate_points') && u.role !== 'super_admin' && (
          <Card title="Allocate points" subtitle={isSuper ? 'Super Admin allocations are new issuance.' : 'Allocated from your own allocation balance.'}>
            <AllocateForm recipients={[{ id: u.id, name: u.name, username: u.username, role: u.role_label }]} defaultRecipient={u.id} onDone={wallets.reload} />
          </Card>
        )}

        {isSuper && u.role === 'admin' && (
          <Card title="Permissions" subtitle="Administrators can only do what is granted here.">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ABILITIES.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input type="checkbox" checked={permissions.includes(key)} onChange={(e) => setPermissions(e.target.checked ? [...permissions, key] : permissions.filter((p) => p !== key))} />
                  {label}
                </label>
              ))}
            </div>
            <Button className="mt-4" onClick={() => run(() => api.put(`/admin/users/${u.id}/permissions`, { permissions }), 'Permissions saved.')}>
              Save permissions
            </Button>

            <hr className="my-6 border-gray-200 dark:border-gray-800" />
            <h4 className="mb-3 font-semibold text-gray-800 dark:text-white/90">Allocation limits</h4>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Currency">
                <Select value={limits.currency} onChange={(e) => setLimits({ ...limits, currency: e.target.value })}>
                  <option>VC</option>
                  <option>CP</option>
                </Select>
              </Field>
              <Field label="Per transaction">
                <Input value={limits.max_per_transaction} onChange={(e) => setLimits({ ...limits, max_per_transaction: e.target.value })} />
              </Field>
              <Field label="Daily">
                <Input value={limits.daily_limit} onChange={(e) => setLimits({ ...limits, daily_limit: e.target.value })} />
              </Field>
            </div>
            <Button className="mt-3" variant="outline" onClick={() => run(() => api.put(`/admin/users/${u.id}/limits`, { ...limits, max_per_transaction: limits.max_per_transaction || null, daily_limit: limits.daily_limit || null }), 'Limits saved.')}>
              Save limits
            </Button>
          </Card>
        )}

        {u.role === 'player' && agents.data && (
          <Card title="Agent assignment">
            <Select defaultValue={u.owning_agent?.agent_id ?? ''} onChange={(e) => e.target.value && run(() => api.post(`/admin/users/${u.id}/assign-agent`, { agent_id: Number(e.target.value) }), 'Player assigned.')}>
              <option value="">Select agent…</option>
              {agents.data.data.map((a) => (
                <option key={a.id} value={a.agent?.id}>
                  {a.name} ({a.agent?.code})
                </option>
              ))}
            </Select>
          </Card>
        )}
      </div>

      {auth.user?.abilities.includes('review_transactions') && (
        <Card className="mt-6" title="Ledger for this user">
          <TransactionsTable endpoint="/admin/transactions" staff extraFilters={{ user_id: u.id }} />
        </Card>
      )}
    </PageShell>
  );
}
