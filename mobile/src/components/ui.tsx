'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useOnline } from '@/lib/hooks';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const TABS = [
  { href: '/home/', label: 'Home', icon: '⌂' },
  { href: '/lobby/', label: 'Play', icon: '♠' },
  { href: '/wallet/', label: 'Wallet', icon: '◎' },
  { href: '/leaderboard/', label: 'Ranks', icon: '★' },
  { href: '/profile/', label: 'Me', icon: '☺' },
];

/**
 * Authenticated mobile screen: safe-area aware header, offline banner and
 * bottom tab bar. Redirects to /login when there is no session.
 */
export function Screen({ title, children, back, tabs = true, action }: { title: string; children: ReactNode; back?: boolean; tabs?: boolean; action?: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const online = useOnline();

  useEffect(() => {
    if (ready && !user) {
      router.replace('/login/');
    }
  }, [ready, user, router]);

  if (!ready || !user) {
    return <div className="flex min-h-dvh items-center justify-center bg-brand-950"><Spinner /></div>;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gray-50 dark:bg-gray-950">
      <header className="safe-top sticky top-0 z-20 bg-brand-950 text-white">
        <div className="flex h-14 items-center gap-2 px-4">
          {back && (
            <button onClick={() => router.back()} className="-ml-2 h-10 w-10 text-2xl" aria-label="Back">
              ‹
            </button>
          )}
          <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
          {action}
        </div>
        {!online && <div className="bg-warning-500 px-4 py-1 text-center text-xs font-medium text-white">Offline — reconnecting when the network returns</div>}
      </header>
      <main className={cx('flex-1 px-4 py-4', tabs && 'pb-24')}>{children}</main>
      {tabs && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <ul className="grid grid-cols-5">
            {TABS.map((t) => {
              const active = path?.startsWith(t.href.replace(/\/$/, ''));
              return (
                <li key={t.href}>
                  <Link href={t.href} className={cx('flex h-14 flex-col items-center justify-center text-xs', active ? 'text-brand-500' : 'text-gray-500')}>
                    <span className="text-lg leading-none">{t.icon}</span>
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

export function Panel({ title, children, className, action }: { title?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cx('mb-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="font-semibold text-gray-800 dark:text-white">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = 'primary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'danger' | 'success' }) {
  const styles = {
    primary: 'bg-brand-500 text-white active:bg-brand-600',
    outline: 'border border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-200',
    danger: 'border border-error-500 text-error-500',
    success: 'bg-success-500 text-white',
  };

  return <button {...props} className={cx('min-h-12 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50', styles[variant], className)} />;
}

export function Field({ label, error, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input {...props} className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
      {error && <span className="mt-1 block text-xs text-error-500">{error}</span>}
    </label>
  );
}

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info' | 'warning'; children: ReactNode }) {
  const styles = {
    error: 'bg-error-50 text-error-700',
    success: 'bg-success-50 text-success-700',
    info: 'bg-brand-50 text-brand-700',
    warning: 'bg-warning-50 text-warning-700',
  };

  return <div className={cx('mb-3 rounded-xl px-4 py-3 text-sm', styles[tone])}>{children}</div>;
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'brand' | 'success' | 'error' | 'warning' }) {
  const styles = {
    gray: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-success-50 text-success-700',
    error: 'bg-error-50 text-error-700',
    warning: 'bg-warning-50 text-warning-700',
  };

  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', styles[tone])}>{children}</span>;
}

export function Spinner() {
  return <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-400 border-t-transparent" />;
}
