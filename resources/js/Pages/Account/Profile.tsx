import { router } from '@inertiajs/react';
import { useEffect, useState, type FormEvent } from 'react';
import PageShell from '../../Components/PageShell';
import { Alert, Badge, Button, Card, Field, Input } from '../../Components/ui';
import { api, errorMessage, fieldErrors } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface Me {
  id: number;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  role: string;
  role_label: string;
  display_name: string | null;
  agent?: { code: string } | null;
  owning_agent?: { name: string } | null;
  created_at: string;
}

export default function Profile() {
  const { data, reload } = useApi<{ data: Me }>('/profile');
  const me = data?.data;
  const [form, setForm] = useState({ name: '', display_name: '', phone: '' });
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirmation: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (me) {
      setForm({ name: me.name, display_name: me.display_name ?? '', phone: me.phone ?? '' });
    }
  }, [me]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    try {
      await api.patch('/profile', form);
      setMessage({ tone: 'success', text: 'Profile updated.' });
      reload();
      router.reload({ only: ['auth'] });
    } catch (e) {
      setErrors(fieldErrors(e));
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setErrors({});
    try {
      await api.put('/profile/password', pw);
      setPw({ current_password: '', password: '', password_confirmation: '' });
      setMessage({ tone: 'success', text: 'Password updated.' });
    } catch (e) {
      setErrors(fieldErrors(e));
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <PageShell title="Profile">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Account">
          {me && (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Username</dt>
                <dd className="font-medium text-gray-800 dark:text-white/90">{me.username}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Email</dt>
                <dd className="font-medium text-gray-800 dark:text-white/90">{me.email}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Role</dt>
                <dd>
                  <Badge tone="brand">{me.role_label}</Badge>
                </dd>
              </div>
              {me.agent && (
                <div>
                  <dt className="text-gray-500">Agent code</dt>
                  <dd className="font-mono">{me.agent.code}</dd>
                </div>
              )}
              {me.owning_agent && (
                <div>
                  <dt className="text-gray-500">Your agent</dt>
                  <dd>{me.owning_agent.name}</dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500">Member since</dt>
                <dd>{dateTime(me.created_at)}</dd>
              </div>
            </dl>
          )}
        </Card>

        <Card title="Edit profile" className="lg:col-span-2">
          <form onSubmit={save} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Full name" error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Display name (shown at tables)" error={errors.display_name}>
              <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="flex items-end">
              <Button type="submit">Save profile</Button>
            </div>
          </form>

          <hr className="my-6 border-gray-200 dark:border-gray-800" />

          <form onSubmit={changePassword} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Current password" error={errors.current_password}>
              <Input type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </Field>
            <Field label="New password" error={errors.password}>
              <Input type="password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
            </Field>
            <Field label="Confirm">
              <Input type="password" value={pw.password_confirmation} onChange={(e) => setPw({ ...pw, password_confirmation: e.target.value })} />
            </Field>
            <div>
              <Button type="submit" variant="outline">
                Change password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </PageShell>
  );
}
