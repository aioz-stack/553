import { router } from '@inertiajs/react';
import { useState, type FormEvent } from 'react';
import PageShell from '../../Components/PageShell';
import { Alert, Button, Card, Field, Input } from '../../Components/ui';
import { api, errorMessage, fieldErrors } from '../../lib/api';

export default function RegisterPlayer() {
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const { data } = await api.post('/agent/players', form);
      router.visit(`/agent/players/${data.data.id}`);
    } catch (e) {
      setErrors(fieldErrors(e));
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  return (
    <PageShell title="Register Player" wide={false}>
      <Card title="New player" subtitle="The player is automatically assigned to you.">
        {error && <Alert>{error}</Alert>}
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Full name" error={errors.name} required>
            <Input value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Username" error={errors.username} required>
            <Input value={form.username} onChange={set('username')} />
          </Field>
          <Field label="Email" error={errors.email} required>
            <Input type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input value={form.phone} onChange={set('phone')} />
          </Field>
          <Field label="Temporary password" error={errors.password} required hint="At least 8 characters. Ask the player to change it.">
            <Input type="password" value={form.password} onChange={set('password')} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy}>
              Register player
            </Button>
          </div>
        </form>
      </Card>
    </PageShell>
  );
}
