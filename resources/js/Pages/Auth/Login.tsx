import { Head, useForm, usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import LoginArt, { WEB_LOGIN_ART } from '../../Components/LoginArt';

/**
 * Web App sign-in (Admins, staff and every agent level) on the Pusoy553 login artwork: username,
 * password, show / hide password and LOG IN only. Authentication, account status and the platform
 * rules (every role may sign in here; panels are role-gated) are all enforced by the server; this page only shows the result.
 */
export default function Login() {
  const { flash } = usePage<{ flash?: { success?: string | null } }>().props;
  const { data, setData, post, processing, errors, reset } = useForm({ username: '', password: '' });
  const err = errors as Record<string, string | undefined>;
  // One active login per player: the server signed every session out ("Account Already Connected").
  const [disconnected, setDisconnected] = useState<string | null>(err.session ?? null);
  useEffect(() => setDisconnected(err.session ?? null), [err.session]);

  const error = err.platform ? (
    <>
      <b>Mobile App Required.</b> {err.platform}
    </>
  ) : (
    err.username ?? err.password ?? (err.session && !disconnected ? err.session : undefined)
  );

  return (
    <>
      <Head title="Login" />
      <LoginArt
        layout={WEB_LOGIN_ART}
        username={data.username}
        password={data.password}
        onUsername={(v) => setData('username', v)}
        onPassword={(v) => setData('password', v)}
        onSubmit={() => post('/login', { onFinish: () => reset('password') })}
        busy={processing}
        error={error}
        notice={!error ? flash?.success : undefined}
      />
      {disconnected && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 p-6" role="alertdialog" aria-modal="true" aria-labelledby="disconnected-title" aria-describedby="disconnected-text">
          <div className="w-full max-w-md rounded-3xl border-4 border-[#ffd34d] bg-gradient-to-b from-[#7a0f16] to-[#2e0306] p-6 text-center text-white shadow-[0_12px_0_#3a0204,0_20px_40px_rgb(0_0_0/0.6)]">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#ffd34d] bg-[#3a0d14] text-4xl" aria-hidden="true">
              ⚠
            </div>
            <h2 id="disconnected-title" className="text-2xl font-black text-[#ffe14d]">
              {disconnected.startsWith('You were signed out') ? 'Signed Out' : 'Account Already Connected'}
            </h2>
            <p id="disconnected-text" className="mt-3 text-base font-semibold leading-relaxed text-white/90">
              {disconnected}
            </p>
            <button type="button" autoFocus onClick={() => setDisconnected(null)} className="mt-6 h-12 w-full rounded-full border-4 border-[#fff3a0] bg-gradient-to-b from-[#ffd13a] to-[#e08a00] text-lg font-black text-[#4a1d00]">
              OK — Log in again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
