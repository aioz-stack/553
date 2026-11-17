import { useState } from 'react';
import DataTable from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Badge, Button, Card, Field, Input } from '../../Components/ui';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface Code {
  id: number;
  code: string;
  uses: number;
  max_uses: number | null;
  expires_at: string | null;
  is_active: boolean;
}

export default function ReferralCodes() {
  const { data, reload, loading } = useApi<{ data: Code[] }>('/agent/referral-codes');
  const [form, setForm] = useState({ max_uses: '', expires_in_days: '' });

  const create = async () => {
    await api.post('/agent/referral-codes', {
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_in_days: form.expires_in_days ? Number(form.expires_in_days) : null,
    });
    reload();
  };

  const link = (code: string) => `${window.location.origin}/register?ref=${code}`;

  return (
    <PageShell title="Referral Codes">
      <Card title="Generate a code" subtitle="Players who register with your code are assigned to you automatically.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Max uses (optional)">
            <Input value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} inputMode="numeric" />
          </Field>
          <Field label="Expires in days (optional)">
            <Input value={form.expires_in_days} onChange={(e) => setForm({ ...form, expires_in_days: e.target.value })} inputMode="numeric" />
          </Field>
          <div className="flex items-end">
            <Button onClick={create}>Generate code</Button>
          </div>
        </div>
      </Card>
      <Card title="Your codes" className="mt-6">
        <DataTable<Code>
          loading={loading}
          rows={data?.data}
          rowKey={(c) => c.id}
          columns={[
            { key: 'code', label: 'Code', render: (c) => <code className="font-semibold">{c.code}</code> },
            { key: 'uses', label: 'Uses', render: (c) => `${c.uses}${c.max_uses ? ` / ${c.max_uses}` : ''}` },
            { key: 'expires', label: 'Expires', render: (c) => dateTime(c.expires_at) },
            { key: 'active', label: 'Status', render: (c) => <Badge tone={c.is_active ? 'success' : 'error'}>{c.is_active ? 'Active' : 'Inactive'}</Badge> },
            { key: 'link', label: 'Signup link', render: (c) => <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(link(c.code))}>Copy link</Button> },
          ]}
        />
      </Card>
    </PageShell>
  );
}
