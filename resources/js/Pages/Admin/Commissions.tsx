import { usePage } from '@inertiajs/react';
import { useState } from 'react';
import CommissionsTable from '../../Components/CommissionsTable';
import PayoutRequests from '../../Components/PayoutRequests';
import DataTable from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Alert, Badge, Button, Card, Field, Input, Select } from '../../Components/ui';
import { api, errorMessage } from '../../lib/api';
import { dateTime, percentFromBps } from '../../lib/format';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';

interface Rule {
  id: number;
  agent_id: number | null;
  agent?: { user?: { name: string } } | null;
  currency: string | null;
  rate_bps: number;
  is_active: boolean;
  created_at: string;
}

export default function Commissions() {
  const { auth } = usePage<SharedProps>().props;
  const isSuper = auth.user?.role === 'super_admin';
  const rules = useApi<{ data: Rule[] }>('/admin/commission-rules');
  const agents = useApi<{ data: Array<{ id: number; name: string; agent?: { id: number; code: string } }> }>(auth.user?.abilities.includes('manage_agents') ? '/admin/agents' : null, { per_page: 100 });
  const [rule, setRule] = useState({ agent_id: '', currency: '', rate_bps: '4000' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const act = async (path: string, reload: () => void, body: object = {}) => {
    try {
      await api.post(path, body);
      reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  const saveRule = async () => {
    try {
      await api.post('/admin/commission-rules', { agent_id: rule.agent_id || null, currency: rule.currency || null, rate_bps: Number(rule.rate_bps) });
      setMessage({ tone: 'success', text: 'Commission rule saved. New commissions use it; existing ones keep their snapshot rate.' });
      rules.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <PageShell title="Commissions">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Alert tone="info">Approved commissions are paid in Chips into the agent's commission wallet. Chips are never paid out.</Alert>

      <Card title="Agent commissions">
        <CommissionsTable
          endpoint="/admin/commissions"
          actions={(c, reload) => (
            <div className="inline-flex gap-2">
              {c.status === 'pending' && (
                <>
                  <Button size="sm" variant="success" onClick={() => act(`/admin/commissions/${c.id}/approve`, reload)}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => act(`/admin/commissions/${c.id}/reject`, reload)}>Reject</Button>
                </>
              )}
              {['pending', 'approved', 'paid'].includes(c.status) && (
                <Button size="sm" variant="danger" onClick={() => { const note = prompt('Reason for reversal:'); if (note) act(`/admin/commissions/${c.id}/reverse`, reload, { note }); }}>Reverse</Button>
              )}
            </div>
          )}
        />
      </Card>

      <Card className="mt-6" title="Agent payout requests">
        <PayoutRequests mode="staff" />
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {isSuper && (
          <Card title="Set a commission rate" subtitle="Only Super Admins configure rates. Agents cannot change their own.">
            <div className="space-y-4">
              <Field label="Agent">
                <Select value={rule.agent_id} onChange={(e) => setRule({ ...rule, agent_id: e.target.value })}>
                  <option value="">Platform default (all agents)</option>
                  {agents.data?.data.map((a) => <option key={a.id} value={a.agent?.id}>{a.name} ({a.agent?.code})</option>)}
                </Select>
              </Field>
              <Field label="Currency">
                <Select value={rule.currency} onChange={(e) => setRule({ ...rule, currency: e.target.value })}>
                  <option value="">Any</option>
                  <option value="CH">Chips</option>
                </Select>
              </Field>
              <Field label="Rate (basis points of the platform fee)" hint={percentFromBps(Number(rule.rate_bps) || 0)}>
                <Input value={rule.rate_bps} onChange={(e) => setRule({ ...rule, rate_bps: e.target.value })} inputMode="numeric" />
              </Field>
              <Button onClick={saveRule}>Save rule</Button>
            </div>
          </Card>
        )}
        <Card title="Rules" className={isSuper ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <DataTable<Rule>
            rows={rules.data?.data}
            loading={rules.loading}
            rowKey={(r) => r.id}
            columns={[
              { key: 'agent', label: 'Applies to', render: (r) => r.agent?.user?.name ?? 'Platform default' },
              { key: 'cur', label: 'Currency', render: (r) => r.currency ?? 'Any' },
              { key: 'rate', label: 'Rate', render: (r) => percentFromBps(r.rate_bps) },
              { key: 'active', label: 'Status', render: (r) => <Badge tone={r.is_active ? 'success' : 'gray'}>{r.is_active ? 'Active' : 'Superseded'}</Badge> },
              { key: 'date', label: 'Created', render: (r) => dateTime(r.created_at) },
            ]}
          />
        </Card>
      </div>
    </PageShell>
  );
}
