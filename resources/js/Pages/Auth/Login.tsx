import { Head, Link, useForm, usePage } from '@inertiajs/react';
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { CardFaceArt } from '../../Components/CardArt';
import { IconEye, IconEyeOff, IconMoon, IconSun } from '../../Components/Icons';
import GuestLayout from '../../Layouts/GuestLayout';
import { useTheme } from '../../lib/ThemeContext';

/**
 * Web App sign-in (every role may sign in here; panels are role-gated by the server).
 *
 * Redesigned on the Baseplate split-screen login: the form column uses the template's exact form
 * tokens, and the brand panel keeps the template's grid shapes, dark brand surface and theme
 * toggle. Authentication, account status and platform rules are all enforced by the server; this
 * page only displays the result.
 */
export default function Login() {
  const { flash } = usePage<{ flash?: { success?: string | null } }>().props;
  const { isDark, toggle } = useTheme();
  const { data, setData, post, processing, errors, reset } = useForm({ username: '', password: '' });
  const err = errors as Record<string, string | undefined>;

  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  // One active login per player: the server signed every session out ("Account Already Connected").
  const [disconnected, setDisconnected] = useState<string | null>(err.session ?? null);

  useEffect(() => setDisconnected(err.session ?? null), [err.session]);

  useEffect(() => {
    if (!disconnected) {
      return;
    }

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDisconnected(null);
      }
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [disconnected]);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (!processing && data.username && data.password) {
      post('/login', { onFinish: () => reset('password') });
    }
  };

  const checkCapsLock = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(event.getModifierState?.('CapsLock') ?? false);
  };

  const platformError = err.platform;
  const credentialsError = err.username ?? err.password ?? (err.session && !disconnected ? err.session : undefined);
  const notice = !platformError && !credentialsError ? flash?.success : undefined;

  return (
    <GuestLayout>
      <Head title="Login" />

      <div className="flex min-h-dvh flex-col bg-white dark:bg-gray-900 lg:flex-row">
        {/* Form column */}
        <main className="relative flex flex-1 flex-col px-6 pb-20 pt-6 sm:px-10 lg:px-14 lg:pb-6 xl:px-20">
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center" aria-label="Pusoy 13 home">
              <img className="dark:hidden" src="/images/logo/pusoy-logo.svg" alt="Pusoy 13" />
              <img className="hidden dark:block" src="/images/logo/pusoy-logo-dark.svg" alt="Pusoy 13" />
            </Link>

            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-theme-xs font-medium text-gray-500 lg:hidden dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
              Web App
            </span>
          </div>

          <div className="flex flex-1 items-center justify-center py-10 sm:py-14">
            <div className="w-full max-w-[400px]">
              <div>
                <p className="text-theme-xs font-semibold uppercase tracking-[0.2em] text-brand-500 dark:text-brand-400">Pusoy 13</p>
                <h1 className="mt-3 text-title-sm font-semibold text-gray-800 dark:text-white/90">Welcome back</h1>
                <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">Sign in to your account to continue to the table.</p>
              </div>

              <div className="mt-7 space-y-4">
                {platformError && (
                  <FormAlert tone="error" title="Mobile App Required">
                    {platformError}
                  </FormAlert>
                )}

                {!platformError && credentialsError && (
                  <FormAlert tone="error" title="Unable to sign in">
                    {credentialsError}
                  </FormAlert>
                )}

                {notice && (
                  <FormAlert tone="success" title="Signed out">
                    {notice}
                  </FormAlert>
                )}
              </div>

              <form onSubmit={submit} className="mt-7 space-y-5" aria-label="Sign in">
                <div>
                  <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Username<span className="text-error-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true">
                      <UserIcon />
                    </span>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      value={data.username}
                      onChange={(event) => setData('username', event.target.value)}
                      disabled={processing}
                      aria-invalid={Boolean(err.username)}
                      placeholder="Enter your username"
                      className={inputClass(Boolean(err.username))}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                    Password<span className="text-error-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true">
                      <LockIcon />
                    </span>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={data.password}
                      onChange={(event) => setData('password', event.target.value)}
                      onKeyDown={checkCapsLock}
                      onKeyUp={checkCapsLock}
                      onBlur={() => setCapsLock(false)}
                      disabled={processing}
                      aria-invalid={Boolean(err.password)}
                      placeholder="Enter your password"
                      className={`${inputClass(Boolean(err.password))} pr-12`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-3 focus:ring-brand-500/10 dark:hover:bg-white/5 dark:hover:text-gray-300"
                    >
                      {showPassword ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                  {capsLock && (
                    <p role="status" className="mt-1.5 text-xs font-medium text-warning-600 dark:text-warning-400">
                      Caps Lock is on.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={processing || !data.username || !data.password}
                  className="shadow-theme-xs flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {processing ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                      Signing in…
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>
              </form>

              <p className="mt-8 text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                Sign-in is monitored. Only one active session is allowed per account.
              </p>
            </div>
          </div>

          <footer className="flex items-center justify-between gap-4 text-theme-xs text-gray-400 dark:text-gray-500">
            <span>© {new Date().getFullYear()} Pusoy 13</span>
            <span className="hidden lg:block">All rights reserved</span>
          </footer>
        </main>

        {/* Brand panel (Baseplate split login, redesigned for Pusoy 13) */}
        <aside className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:w-1/2" aria-hidden="true">
          <div className="pointer-events-none absolute -left-32 top-1/4 size-96 rounded-full bg-brand-500/25 blur-[120px]" />
          <div className="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-brand-700/30 blur-[120px]" />
          <div className="pointer-events-none absolute right-0 top-0 w-full max-w-[450px] opacity-20">
            <img src="/images/shape/grid-01.svg" alt="" />
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 w-full max-w-[450px] rotate-180 opacity-10">
            <img src="/images/shape/grid-01.svg" alt="" />
          </div>

          <span className="pointer-events-none absolute -right-8 top-20 select-none text-[11rem] leading-none text-white/[0.035]">♠</span>
          <span className="pointer-events-none absolute -left-6 bottom-24 select-none text-[9rem] leading-none text-white/[0.03]">♦</span>

          <div className="relative z-1 flex w-full flex-col justify-between p-10 xl:p-14">
            <div className="flex items-center gap-3">
              <img src="/images/logo/pusoy-icon.svg" alt="" className="size-9 rounded-lg" />
              <div>
                <p className="text-sm font-semibold text-white">Pusoy 13</p>
                <p className="text-theme-xs text-white/50">Multiplayer card game</p>
              </div>
              <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white/70">
                <span className="size-1.5 rounded-full bg-success-400" />
                Live multiplayer
              </span>
            </div>

            <div className="my-10 max-w-lg">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-300">Four players · Thirteen cards</p>
              <h2 className="mt-4 text-title-sm font-semibold leading-tight text-white xl:text-[40px] xl:leading-[1.15]">
                Three hands.
                <br />
                <span className="text-brand-300">One winner.</span>
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/60">
                Take a seat, arrange your Front, Middle and Back, and outplay the table. Every deal, reveal and score is handled live by the server.
              </p>

              <CardFan />

              <div className="mt-4 flex items-center justify-center gap-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                <span>Front · 3</span>
                <span className="size-1 rounded-full bg-white/20" />
                <span>Middle · 5</span>
                <span className="size-1 rounded-full bg-white/20" />
                <span>Back · 5</span>
              </div>

              <ul className="mt-9 space-y-3">
                {FEATURES.map((feature) => (
                  <li key={feature.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                      <CheckIcon />
                    </span>
                    <p className="text-sm text-white/70">
                      <span className="font-semibold text-white">{feature.title}</span> — {feature.text}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center gap-3 text-theme-xs text-white/40">
              <span>© {new Date().getFullYear()} Pusoy 13</span>
              <span className="size-1 rounded-full bg-white/20" />
              <span>Play responsibly</span>
            </div>
          </div>
        </aside>

        {/* Baseplate theme toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label="Toggle dark mode"
          className="shadow-theme-md fixed bottom-5 right-5 z-50 inline-flex size-12 items-center justify-center rounded-full bg-brand-500 text-white transition-colors hover:bg-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-500/25 sm:bottom-6 sm:right-6"
        >
          <IconSun className={`fill-current ${isDark ? 'block' : 'hidden'}`} />
          <IconMoon className={`fill-current ${isDark ? 'hidden' : 'block'}`} />
        </button>
      </div>

      {disconnected && <DisconnectedDialog message={disconnected} onClose={() => setDisconnected(null)} />}
    </GuestLayout>
  );
}

const FEATURES = [
  { title: 'Four-seat tables', text: 'classic Pusoy 13, exactly four players.' },
  { title: 'Three-hand strategy', text: 'arrange before the timer runs out.' },
  { title: 'Server-settled results', text: 'every reveal and score is verified.' },
];

const FAN: Array<{ code: string; x: number; y: number; rotate: number; z: number }> = [
  { code: 'AS', x: -176, y: 20, rotate: -20, z: 1 },
  { code: 'KS', x: -88, y: 2, rotate: -10, z: 2 },
  { code: 'QS', x: 0, y: -8, rotate: 0, z: 3 },
  { code: 'JS', x: 88, y: 2, rotate: 10, z: 2 },
  { code: 'TS', x: 176, y: 20, rotate: 20, z: 1 },
];

function CardFan() {
  return (
    <div className="relative mt-10 flex h-52 w-full items-center justify-center">
      <div className="absolute left-1/2 top-1/2 size-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/35 blur-[70px]" />
      <div className="absolute left-1/2 top-1/2 h-24 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full bg-warning-400/10 blur-3xl" />
      {FAN.map((card) => (
        <div
          key={card.code}
          className="absolute left-1/2 top-1/2 h-44 w-32 overflow-hidden rounded-[9%/6.5%] bg-white shadow-[0_24px_45px_-12px_rgba(0,0,0,0.75)] ring-1 ring-white/20"
          style={{
            transform: `translate(calc(-50% + ${card.x}px), calc(-50% + ${card.y}px)) rotate(${card.rotate}deg)`,
            zIndex: card.z,
          }}
        >
          <CardFaceArt code={card.code} className="h-full w-full" />
        </div>
      ))}
    </div>
  );
}

function DisconnectedDialog({ message, onClose }: { message: string; onClose: () => void }) {
  const signedOut = message.startsWith('You were signed out');

  return (
    <div className="fixed inset-0 z-1000 flex items-center justify-center bg-gray-900/60 p-4 backdrop-blur-sm" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="disconnected-title"
        aria-describedby="disconnected-text"
        className="shadow-theme-xl w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-gray-900 sm:p-8"
      >
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-warning-50 text-warning-500 dark:bg-warning-500/15 dark:text-warning-400">
          <WarningIcon />
        </div>
        <h2 id="disconnected-title" className="mt-5 text-xl font-semibold text-gray-800 dark:text-white/90">
          {signedOut ? 'Signed out' : 'Account already connected'}
        </h2>
        <p id="disconnected-text" className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          {message}
        </p>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-6 h-11 w-full rounded-lg bg-brand-500 text-sm font-semibold text-white transition hover:bg-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-500/20"
        >
          OK — Sign in again
        </button>
      </div>
    </div>
  );
}

function FormAlert({ tone, title, children }: { tone: 'error' | 'success'; title: string; children: ReactNode }) {
  const error = tone === 'error';

  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        error
          ? 'border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/10 dark:text-error-400'
          : 'border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-400'
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${error ? 'text-error-500' : 'text-success-500'}`} aria-hidden="true">
        {error ? <WarningIcon /> : <CheckCircleIcon />}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 leading-relaxed opacity-90">{children}</p>
      </div>
    </div>
  );
}

function inputClass(invalid: boolean): string {
  return `shadow-theme-xs h-12 w-full rounded-lg border bg-transparent pl-11 pr-4 text-sm text-gray-800 outline-none transition placeholder:text-gray-400 focus:ring-3 dark:bg-white/[0.03] dark:text-white/90 dark:placeholder:text-white/30 ${
    invalid
      ? 'border-error-300 focus:border-error-300 focus:ring-error-500/10 dark:border-error-500/50 dark:focus:border-error-500'
      : 'border-gray-300 focus:border-brand-300 focus:ring-brand-500/10 dark:border-gray-700 dark:focus:border-brand-800'
  }`;
}

function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4.5 4.5L19 7" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}
