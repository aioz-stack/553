import { Link, useForm } from '@inertiajs/react';
import { useEffect, useState, type FormEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import AuthCard from '../../Components/AuthCard';
import { Button, Field, Input } from '../../Components/ui';

/**
 * Registration — only through a registration link (/register/player?ref=CODE or
 * /register/agent?ref=CODE). Without a valid link there is no form. The server checks the
 * link again, decides the sponsor and the agent level, and the account waits for approval.
 */
export default function Register({ referral, accountType = 'player' }: { referral?: string | null; accountType?: 'player' | 'agent' }) {
  const [invite, setInvite] = useState<{ sponsor: string; sponsor_name: string; level: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  useEffect(() => {
    if (!referral) return;
    api.get(`/auth/referral/${encodeURIComponent(referral)}`, { params: { type: accountType } })
      .then((r) => setInvite(r.data.data))
      .catch((e) => setInviteError(errorMessage(e)));
  }, [referral, accountType]);

  const { data, setData, post, processing, errors } = useForm({
    name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    password_confirmation: '',
    referral_code: referral ?? '',
    account_type: accountType,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    post('/register');
  };

  return (
    <AuthCard
      title={accountType === 'agent' ? 'Agent registration' : 'Create your account'}
      subtitle={accountType === 'agent' ? 'Join the Pusoy553 agent network. Your account is reviewed by an administrator before you can sign in.' : 'Play Single Player for Gold and Multiplayer for Chips. Your account is reviewed by an administrator before you can sign in.'}
      footer={
        <>
          Already have an account?{' '}
          <Link href="/" className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
            Sign in
          </Link>
        </>
      }
    >
      {invite && (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
          Invited by <b>{invite.sponsor_name}</b> (@{invite.sponsor}) — you are registering as <b>{invite.level}</b>.
        </div>
      )}
      {inviteError && <div role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-200">{inviteError}</div>}
      {!referral && (
        <div role="alert" className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200">
          Registration is by invitation only. Ask your agent or administrator for your <b>registration link</b> and open it to create your account.
        </div>
      )}
      {invite && !inviteError && (
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
        {(errors.referral_code || (errors as Record<string, string>).account_type) && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{errors.referral_code ?? (errors as Record<string, string>).account_type}</p>
        )}
        <Button type="submit" disabled={processing} className="w-full">
          Create account
        </Button>
      </form>
      )}
    </AuthCard>
  );
}
