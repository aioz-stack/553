'use client';

import { IconBell } from '@/components/icons';
import { Screen } from '@/components/ui';
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
      action={
        <button className="rounded-full bg-white/10 px-3 py-1.5 font-display text-xs font-bold" onClick={async () => { await api('/notifications/read', { method: 'POST' }); reload(); }}>
          Mark all read
        </button>
      }
    >
      {data?.data.length === 0 && (
        <div className="pt-16 text-center">
          <IconBell className="mx-auto h-16 w-16 text-white/20" />
          <p className="mt-2 text-white/60">You&apos;re all caught up.</p>
        </div>
      )}
      <div className="space-y-2">
        {data?.data.map((n) => (
          <div key={n.id} className={`glass flex gap-3 rounded-2xl p-3 ${!n.read_at ? 'ring-2 ring-gold-400/70' : ''}`}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-candy-400 to-candy-500">
              <IconBell className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-extrabold">{n.data.title ?? 'Notification'}</p>
              <p className="text-sm text-white/75">{n.data.message}</p>
              <p className="mt-1 text-[11px] text-white/45">{when(n.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
    </Screen>
  );
}
