'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import AuthShell from '@/components/AuthShell';
import { GameButton } from '@/components/game';
import { Field, Notice } from '@/components/ui';
import { ApiError, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Register() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', password_confirmation: '', referral_code: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Registration received: the account waits for administrator approval before it can sign in.
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setError(null);

    try {
      setDone(await register(form));
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
    <AuthShell subtitle="Join the table — it's free to play">
      <form onSubmit={submit} className="glass mb-6 rounded-3xl p-5">
        {error && <Notice>{error}</Notice>}
        {done && (
          <Notice tone="success">
            {done}{' '}
            <button type="button" className="underline" onClick={() => router.replace('/login/')}>
              Go to sign in
            </button>
          </Notice>
        )}
        <Field label="Full name" autoComplete="name" {...bind('name')} />
        <Field label="Username" autoCapitalize="none" autoComplete="username" {...bind('username')} />
        <Field label="Email" type="email" autoComplete="email" {...bind('email')} />
        <Field label="Password" type="password" autoComplete="new-password" {...bind('password')} />
        <Field label="Confirm password" type="password" autoComplete="new-password" {...bind('password_confirmation')} />
        <Field label="Referral code (optional)" autoCapitalize="characters" {...bind('referral_code')} />
        <GameButton type="submit" tone="green" size="lg" className="mt-2 w-full" disabled={busy}>
          {busy ? 'CREATING…' : 'CREATE ACCOUNT'}
        </GameButton>
      </form>
      <p className="mb-8 text-center text-sm text-white/75">
        Have an account?{' '}
        <Link href="/login/" className="font-display font-extrabold text-gold-300">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
