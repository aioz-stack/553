import { useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AuthCard from '../../Components/AuthCard';
import { Button, Field, Input } from '../../Components/ui';

export default function ResetPassword({ token, email }: { token: string; email?: string }) {
  const { data, setData, post, processing, errors } = useForm({
    token,
    email: email ?? '',
    password: '',
    password_confirmation: '',
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    post('/reset-password');
  };

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" error={errors.email} required>
          <Input type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />
        </Field>
        <Field label="New password" error={errors.password} required>
          <Input type="password" value={data.password} onChange={(e) => setData('password', e.target.value)} />
        </Field>
        <Field label="Confirm new password" required>
          <Input type="password" value={data.password_confirmation} onChange={(e) => setData('password_confirmation', e.target.value)} />
        </Field>
        <Button type="submit" disabled={processing} className="w-full">
          Reset password
        </Button>
      </form>
    </AuthCard>
  );
}
