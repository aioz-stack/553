import { Link, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import AuthCard from '../../Components/AuthCard';
import { Button, Field, Input } from '../../Components/ui';

export default function Register({ referral }: { referral?: string | null }) {
  const { data, setData, post, processing, errors } = useForm({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
    referral_code: referral ?? '',
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    post('/register');
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Play free with Virtual Coins. Have an agent referral code? Add it below."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" error={errors.name} required>
          <Input value={data.name} onChange={(e) => setData('name', e.target.value)} autoComplete="name" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Username" error={errors.username} required>
            <Input value={data.username} onChange={(e) => setData('username', e.target.value)} autoComplete="username" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input value={data.phone} onChange={(e) => setData('phone', e.target.value)} autoComplete="tel" />
          </Field>
        </div>
        <Field label="Email" error={errors.email} required>
          <Input type="email" value={data.email} onChange={(e) => setData('email', e.target.value)} autoComplete="email" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Password" error={errors.password} required hint="8+ characters with letters and numbers">
            <Input type="password" value={data.password} onChange={(e) => setData('password', e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" required>
            <Input type="password" value={data.password_confirmation} onChange={(e) => setData('password_confirmation', e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <Field label="Agent referral code" error={errors.referral_code}>
          <Input value={data.referral_code} onChange={(e) => setData('referral_code', e.target.value.toUpperCase())} />
        </Field>
        <Button type="submit" disabled={processing} className="w-full">
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}
