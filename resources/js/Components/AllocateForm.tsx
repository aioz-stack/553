import { useState, type FormEvent } from 'react';
import { api, errorMessage, fieldErrors, newIdempotencyKey } from '../lib/api';
import { Alert, Button, Field, Input, Select } from './ui';

export interface Recipient {
  id: number;
  name: string;
  username: string;
  role?: string;
}

/**
 * Point allocation form. The server decides which source wallet is used and
 * whether the actor may allocate to the recipient (AllocationService). Each
 * submit carries a fresh idempotency key so a double-click cannot double-pay.
 */
export default function AllocateForm({ recipients, onDone, defaultRecipient }: { recipients: Recipient[]; onDone?: () => void; defaultRecipient?: number }) {
  const [form, setForm] = useState({ recipient_id: defaultRecipient ? String(defaultRecipient) : '', currency: 'VC', amount: '', reason: '' });
  const [key, setKey] = useState(newIdempotencyKey);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage(null);

    try {
      const { data } = await api.post('/wallet/allocate', { ...form, idempotency_key: key });
      setMessage({ tone: 'success', text: `${data.message} Reference ${data.data.reference}.` });
      setForm({ ...form, amount: '', reason: '' });
      setKey(newIdempotencyKey());
      onDone?.();
    } catch (e) {
      setErrors(fieldErrors(e));
      setMessage({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Field label="Recipient" error={errors.recipient_id} required>
        <Select value={form.recipient_id} onChange={(e) => setForm({ ...form, recipient_id: e.target.value })}>
          <option value="">Select…</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} (@{r.username}){r.role ? ` · ${r.role}` : ''}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Currency" error={errors.currency} required>
          <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            <option value="VC">VC — Virtual Coins</option>
            <option value="CP">CP — Cash Points</option>
          </Select>
        </Field>
        <Field label="Amount" error={errors.amount} required>
          <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} inputMode="decimal" placeholder="0.00" />
        </Field>
      </div>
      <Field label="Reason / reference" error={errors.reason}>
        <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      </Field>
      <Button type="submit" disabled={busy || !form.recipient_id || !form.amount}>
        {busy ? 'Allocating…' : 'Allocate points'}
      </Button>
    </form>
  );
}
