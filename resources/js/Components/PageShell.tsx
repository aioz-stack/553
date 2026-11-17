import { Head, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import AuthenticatedLayout from '../Layouts/AuthenticatedLayout';
import Breadcrumb from './Breadcrumb';
import FlashMessage from './FlashMessage';
import { Alert } from './ui';
import type { SharedProps } from '../lib/types';

/**
 * Standard authenticated page: Baseplate layout + breadcrumb + flash messages.
 */
export default function PageShell({ title, children, wide = true }: { title: string; children: ReactNode; wide?: boolean }) {
  const { flash } = usePage<SharedProps>().props;

  return (
    <AuthenticatedLayout>
      <Head title={title} />
      <main>
        <div className={`mx-auto p-4 md:p-6 ${wide ? 'max-w-(--breakpoint-2xl)' : 'max-w-4xl'}`}>
          <Breadcrumb pageName={title} />
          <FlashMessage message={flash?.success} />
          {flash?.error && <Alert>{flash.error}</Alert>}
          {children}
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
