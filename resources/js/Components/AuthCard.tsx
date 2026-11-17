import { Head, Link } from '@inertiajs/react';
import type { ReactNode } from 'react';
import GuestLayout from '../Layouts/GuestLayout';

/**
 * Centered guest card in the Baseplate login style, used by Register,
 * Forgot Password and Reset Password.
 */
export default function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <GuestLayout>
      <Head title={title} />
      <div className="relative z-1 flex min-h-screen items-center justify-center bg-white p-6 dark:bg-gray-900">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 block">
            <img className="dark:hidden" src="/images/logo/pusoy-logo.svg" alt="Pusoy 13" />
            <img className="hidden dark:block" src="/images/logo/pusoy-logo-dark.svg" alt="Pusoy 13" />
          </Link>
          <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90">{title}</h1>
          {subtitle && <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
          {children}
          {footer && <div className="mt-6 text-sm text-gray-700 dark:text-gray-400">{footer}</div>}
        </div>
      </div>
    </GuestLayout>
  );
}
