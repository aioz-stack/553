import { useEffect, useState } from 'react';
import PageShell from '../../Components/PageShell';
import { Alert, Badge, Button, Card, Field, Input, Textarea } from '../../Components/ui';
import { api, errorMessage } from '../../lib/api';
import { titleCase } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface SettingsData {
  features: Record<string, boolean>;
  game: Record<string, number>;
  settings: Record<string, string | null>;
}

export default function Settings() {
  const { data } = useApi<{ data: SettingsData }>('/admin/settings');
  const [values, setValues] = useState<Record<string, string>>({ lobby_announcement: '', support_contact: '', maintenance_message: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setValues((v) => ({ ...v, ...Object.fromEntries(Object.entries(data.data.settings).map(([k, val]) => [k, val ?? ''])) }));
    }
  }, [data]);

  const save = async () => {
    try {
      await api.put('/admin/settings', { settings: values });
      setMessage({ tone: 'success', text: 'Settings saved.' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <PageShell title="System Settings">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card title="Feature flags" subtitle="Set in the server environment (.env) as a deploy-time decision. Cash features must remain off until legal, regulatory and payment-provider approvals are obtained.">
          <ul className="space-y-2">
            {data &&
              Object.entries(data.data.features).map(([key, on]) => (
                <li key={key} className="flex items-center justify-between text-sm">
                  <span>{titleCase(key)}</span>
                  <Badge tone={on ? 'success' : 'gray'}>{on ? 'Enabled' : 'Disabled'}</Badge>
                </li>
              ))}
          </ul>
        </Card>
        <Card title="Game defaults" subtitle="From config/pusoy.php">
          <ul className="space-y-2 text-sm">
            {data && Object.entries(data.data.game).map(([k, v]) => <li key={k} className="flex justify-between"><span>{titleCase(k)}</span><strong>{String(v)}</strong></li>)}
          </ul>
        </Card>
        <Card title="Platform messages" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Lobby announcement">
              <Textarea value={values.lobby_announcement} onChange={(e) => setValues({ ...values, lobby_announcement: e.target.value })} />
            </Field>
            <div className="space-y-4">
              <Field label="Support contact"><Input value={values.support_contact} onChange={(e) => setValues({ ...values, support_contact: e.target.value })} /></Field>
              <Field label="Maintenance message"><Input value={values.maintenance_message} onChange={(e) => setValues({ ...values, maintenance_message: e.target.value })} /></Field>
            </div>
          </div>
          <Button className="mt-4" onClick={save}>Save settings</Button>
        </Card>
      </div>
    </PageShell>
  );
}
