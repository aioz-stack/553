import { Link, useForm, usePage } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AuthCard from '../../Components/AuthCard';
import { Alert, Button, Field, Input } from '../../Components/ui';
import type { SharedProps } from '../../lib/types';

export default function ForgotPassword() {
  const { flash } = usePage<SharedProps>().props;
  const { data, setData, post, processing, errors } = useForm({ email: '' });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    post('/forgot-password');
  };

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a reset link."
      footer={
        <Link href="/" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
          Back to sign in
        </Link>
      }
    >
      {flash?.success && <Alert tone="success">{flash.success}</Alert>}
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email" error={errors.email} required>
          <Input type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} />
        </Field>
        <Button type="submit" disabled={processing} className="w-full">
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
