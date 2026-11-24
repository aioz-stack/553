import { Head, useForm, usePage } from '@inertiajs/react';
import LoginArt, { WEB_LOGIN_ART } from '../../Components/LoginArt';

/**
 * Web App sign-in (Admins, staff and every agent level) on the Pusoy553 login artwork: username,
 * password, show / hide password and LOG IN only. Authentication, account status and the platform
 * rules (players use the Mobile Game) are all enforced by the server; this page only shows the result.
 */
export default function Login() {
  const { flash } = usePage<{ flash?: { success?: string | null } }>().props;
  const { data, setData, post, processing, errors, reset } = useForm({ username: '', password: '' });
  const err = errors as Record<string, string | undefined>;

  const error = err.platform ? (
    <>
      <b>Mobile App Required.</b> {err.platform}
    </>
  ) : (
    err.username ?? err.password
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
    </>
  );
}
