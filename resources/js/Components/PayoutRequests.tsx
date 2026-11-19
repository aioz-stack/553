import { useState } from 'react';
import { api, errorMessage } from '../lib/api';
import { dateTime, points } from '../lib/format';
import { useApi } from '../lib/useApi';
import DataTable from './DataTable';
import { Alert, Badge, Button, Field, Input, statusTone } from './ui';

interface Payout {
  id: number;
  agent?: { name: string; username: string };
  currency: string;
  amount: string;
  status: string;
  created_at: string;
}

/**
 * Commission cash payout requests. Agents request; staff approve/reject.
 * The whole feature is disabled until the cash feature flags are enabled.
 */
export default function PayoutRequests({ mode }: { mode: 'agent' | 'staff' }) {
  const endpoint = mode === 'agent' ? '/agent/payout-requests' : '/admin/payout-requests';
  const { data, reload } = useApi<{ data: Payout[]; meta: { enabled: boolean } }>(endpoint);
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setMessage({ tone: 'success', text: ok });
      reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  if (data && !data.meta.enabled) {
    return <Alert tone="info">Commission payouts are not available: commissions are earned in Chips, which stay in your commission wallet and are never paid out.</Alert>;
  }

  return (
    <div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {mode === 'agent' && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="Chips amount to request">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Button onClick={() => run(() => api.post(endpoint, { currency: 'CH', amount }), 'Payout requested.')} disabled={!amount}>
            Request payout
          </Button>
        </div>
      )}
      <DataTable<Payout>
        rows={data?.data}
        loading={!data}
        rowKey={(p) => p.id}
        empty="No payout requests."
        columns={[
          { key: 'date', label: 'Requested', render: (p) => dateTime(p.created_at) },
          ...(mode === 'staff' ? [{ key: 'agent', label: 'Agent', render: (p: Payout) => p.agent?.name ?? '—' }] : []),
          { key: 'amount', label: 'Amount', align: 'right', render: (p) => points(p.amount, p.currency) },
          { key: 'status', label: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
          ...(mode === 'staff'
            ? [{
                key: 'act',
                label: '',
                align: 'right' as const,
                render: (p: Payout) =>
                  p.status === 'pending' && (
                    <div className="inline-flex gap-2">
                      <Button size="sm" variant="success" onClick={() => run(() => api.post(`/admin/payout-requests/${p.id}/approve`), 'Payout approved.')}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => run(() => api.post(`/admin/payout-requests/${p.id}/reject`), 'Payout rejected.')}>Reject</Button>
                    </div>
                  ),
              }]
            : []),
        ]}
      />
    </div>
  );
}
