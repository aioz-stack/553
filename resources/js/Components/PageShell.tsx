import { Head, usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import AdminPanelLayout from '../Layouts/AdminPanelLayout';
import AuthenticatedLayout from '../Layouts/AuthenticatedLayout';
import Breadcrumb from './Breadcrumb';
import FlashMessage from './FlashMessage';
import { Alert } from './ui';
import type { SharedProps } from '../lib/types';

/**
 * Standard authenticated page: Baseplate layout + breadcrumb + flash messages. Pages under
 * /admin and /agent use the Admin / Agent Panel shell instead, so every staff and agent tool
 * shares one look and theme.
 */
export default function PageShell({ title, children, wide = true }: { title: string; children: ReactNode; wide?: boolean }) {
  const { flash } = usePage<SharedProps>().props;
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const inAgent = path.startsWith('/agent');
  const inAdmin = path.startsWith('/admin') || inAgent;

  const body = (
    <>
      <FlashMessage message={flash?.success} />
      {flash?.error && <Alert>{flash.error}</Alert>}
      {children}
    </>
  );

  if (inAdmin) {
    return (
      <AdminPanelLayout title={title} subtitle={inAgent ? 'Agent tools' : 'Platform management'}>
        <div className={wide ? '' : 'max-w-4xl'}>{body}</div>
      </AdminPanelLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <Head title={title} />
      <main>
        <div className={`mx-auto p-4 md:p-6 ${wide ? 'max-w-(--breakpoint-2xl)' : 'max-w-4xl'}`}>
          <Breadcrumb pageName={title} />
          {body}
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
