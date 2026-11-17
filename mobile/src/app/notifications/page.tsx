'use client';

import { Badge, Button, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFetch, when } from '@/lib/hooks';

interface Item {
  id: string;
  data: { title?: string; message?: string };
  read_at: string | null;
  created_at: string;
}

export default function Notifications() {
  const { user } = useAuth();
  const { data, reload } = useFetch<{ data: Item[] }>(user ? '/notifications' : null);

  return (
    <Screen
      title="Notifications"
      back
      action={<Button variant="outline" className="min-h-9 border-white/30 px-3 text-xs text-white" onClick={async () => { await api('/notifications/read', { method: 'POST' }); reload(); }}>Mark read</Button>}
    >
      {data?.data.length === 0 && <p className="text-center text-sm text-gray-500">You&apos;re all caught up.</p>}
      {data?.data.map((n) => (
        <div key={n.id} className="mb-2 rounded-2xl bg-white p-4 dark:bg-gray-900">
          <p className="font-medium text-gray-900 dark:text-white">{n.data.title ?? 'Notification'} {!n.read_at && <Badge tone="brand">New</Badge>}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">{n.data.message}</p>
          <p className="mt-1 text-xs text-gray-400">{when(n.created_at)}</p>
        </div>
      ))}
    </Screen>
  );
}
