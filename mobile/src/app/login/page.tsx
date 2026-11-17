'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import AuthShell from '@/components/AuthShell';
import { GameButton } from '@/components/game';
import { Field, Notice } from '@/components/ui';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await login(form.username, form.password);
      router.replace('/home/');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <AuthShell subtitle="Welcome back, player!">
      <form onSubmit={submit} className="glass rounded-3xl p-5">
        {error && <Notice>{error}</Notice>}
        <Field label="Username" autoComplete="username" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <Field label="Password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <GameButton type="submit" size="lg" className="mt-2 w-full" disabled={busy || !form.username || !form.password}>
          {busy ? 'SIGNING IN…' : 'SIGN IN'}
        </GameButton>
      </form>
      <p className="mt-6 text-center text-sm text-white/75">
        New here?{' '}
        <Link href="/register/" className="font-display font-extrabold text-gold-300">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
