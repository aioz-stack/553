import { usePage } from '@inertiajs/react';
import { useState } from 'react';
import PageShell from '../../Components/PageShell';
import TransactionsTable from '../../Components/TransactionsTable';
import { Alert, Button, Card, Field, Input } from '../../Components/ui';
import { api, errorMessage } from '../../lib/api';
import type { SharedProps } from '../../lib/types';

export default function Transactions() {
  const { auth } = usePage<SharedProps>().props;
  const [reference, setReference] = useState('');
  const [reverse, setReverse] = useState({ id: '', reason: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [key, setKey] = useState(0);

  const submitReverse = async () => {
    try {
      const { data } = await api.post(`/admin/transactions/${reverse.id}/reverse`, { reason: reverse.reason });
      setMessage({ tone: 'success', text: `Reversal ${data.data.reference} created.` });
      setKey((k) => k + 1);
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <PageShell title="Transactions">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Card title="Ledger" subtitle="Completed transactions are immutable. Corrections are made with reversal entries.">
        <div className="mb-4 max-w-sm">
          <Input placeholder="Find by reference (TX…)" value={reference} onChange={(e) => setReference(e.target.value.trim())} />
        </div>
        <TransactionsTable key={key} endpoint="/admin/transactions" staff extraFilters={{ reference: reference || undefined }} />
      </Card>

      {auth.user?.role === 'super_admin' && (
        <Card className="mt-6" title="Reverse a transaction" subtitle="Creates a REVERSAL entry moving the amount back. Each transaction can be reversed once.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Transaction ID"><Input value={reverse.id} onChange={(e) => setReverse({ ...reverse, id: e.target.value })} inputMode="numeric" /></Field>
            <Field label="Reason"><Input value={reverse.reason} onChange={(e) => setReverse({ ...reverse, reason: e.target.value })} /></Field>
            <div className="flex items-end"><Button variant="danger" onClick={submitReverse} disabled={!reverse.id || reverse.reason.length < 5}>Reverse</Button></div>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
