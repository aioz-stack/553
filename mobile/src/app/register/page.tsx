'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', password_confirmation: '', referral_code: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);

    try {
      await register(form);
      router.replace('/home/');
    } catch (e) {
      if (e instanceof ApiError && e.errors) {
        setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      }
      setError(errorText(e));
      setBusy(false);
    }
  };

  const bind = (key: keyof typeof form) => ({ value: form[key], onChange: (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value }), error: errors[key] });

  return (
    <div className="safe-top safe-bottom min-h-dvh bg-white px-6 py-8 dark:bg-gray-950">
      <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-white">Create account</h1>
      <p className="mb-6 text-sm text-gray-500">Play free with Virtual Coins.</p>
      {error && <Notice>{error}</Notice>}
      <form onSubmit={submit}>
        <Field label="Full name" autoComplete="name" {...bind('name')} />
        <Field label="Username" autoCapitalize="none" autoComplete="username" {...bind('username')} />
        <Field label="Email" type="email" autoComplete="email" {...bind('email')} />
        <Field label="Password" type="password" autoComplete="new-password" {...bind('password')} />
        <Field label="Confirm password" type="password" autoComplete="new-password" {...bind('password_confirmation')} />
        <Field label="Agent referral code (optional)" autoCapitalize="characters" {...bind('referral_code')} />
        <Button type="submit" className="mt-2 w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
        Have an account?{' '}
        <Link href="/login/" className="font-semibold text-brand-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}
