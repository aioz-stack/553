'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import LoginArt from '@/components/LoginArt';
import { errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * Mobile Game sign-in (Players) on the Pusoy553 login artwork, in landscape: username, password,
 * show / hide password and LOG IN only. The server decides everything — wrong credentials,
 * pending / suspended / banned accounts, players switched off, maintenance, and non-player accounts
 * (Admins, staff and agents use the Web App) — and the message it sends is shown here.
 */
export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      await login(form.username, form.password);
      router.replace('/home/');
    } catch (e) {
      setError(errorText(e));
      setForm((f) => ({ ...f, password: '' }));
      setBusy(false);
    }
  };

  return (
    <LoginArt
      username={form.username}
      password={form.password}
      onUsername={(username) => setForm((f) => ({ ...f, username }))}
      onPassword={(password) => setForm((f) => ({ ...f, password }))}
      onSubmit={submit}
      busy={busy}
      error={error}
    />
  );
}
