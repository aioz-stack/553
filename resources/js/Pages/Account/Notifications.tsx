import PageShell from '../../Components/PageShell';
import { Badge, Button, Card, Empty } from '../../Components/ui';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface Notification {
  id: string;
  data: { title?: string; message?: string; room_id?: number; invite_code?: string };
  read_at: string | null;
  created_at: string;
}

export default function Notifications() {
  const { data, reload } = useApi<{ data: Notification[]; meta: { unread: number } }>('/notifications');

  const markRead = async () => {
    await api.post('/notifications/read');
    reload();
  };

  return (
    <PageShell title="Notifications">
      <Card
        title="Notifications"
        subtitle={`${data?.meta.unread ?? 0} unread`}
        actions={<Button size="sm" variant="outline" onClick={markRead}>Mark all as read</Button>}
      >
        {data?.data.length === 0 && <Empty>You're all caught up.</Empty>}
        <ul className="divide-y divide-gray-200 dark:divide-gray-800">
          {data?.data.map((n) => (
            <li key={n.id} className="flex items-start justify-between gap-4 py-4">
              <div>
                <p className="font-medium text-gray-800 dark:text-white/90">
                  {n.data.title ?? 'Notification'} {!n.read_at && <Badge tone="brand">New</Badge>}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{n.data.message}</p>
                {n.data.invite_code && <p className="mt-1 text-xs text-gray-500">Room #{n.data.room_id} · code {n.data.invite_code}</p>}
              </div>
              <span className="whitespace-nowrap text-xs text-gray-500">{dateTime(n.created_at)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}
