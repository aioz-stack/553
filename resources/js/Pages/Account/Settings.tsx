import PageShell from '../../Components/PageShell';
import DataTable from '../../Components/DataTable';
import { Button, Card } from '../../Components/ui';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useTheme } from '../../lib/ThemeContext';
import { useApi } from '../../lib/useApi';

interface Device {
  id: number;
  device_name: string;
  platform: string | null;
  last_used_at: string | null;
}

export default function Settings() {
  const { isDark, toggle } = useTheme();
  const devices = useApi<{ data: Device[] }>('/auth/devices');

  const revoke = async (id: number) => {
    await api.delete(`/auth/devices/${id}`);
    devices.reload();
  };

  return (
    <PageShell title="Settings">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Appearance">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700 dark:text-gray-300">Dark mode</span>
            <Button variant="outline" size="sm" onClick={toggle}>
              {isDark ? 'On' : 'Off'}
            </Button>
          </div>
          <p className="mt-4 text-xs text-gray-500">Times are shown in your device's time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).</p>
        </Card>

        <Card title="Signed-in mobile devices" subtitle="Each device has its own token. Sign out any you don't recognise." className="lg:col-span-2">
          <DataTable<Device>
            rows={devices.data?.data}
            loading={devices.loading}
            rowKey={(d) => d.id}
            empty="No mobile devices signed in."
            columns={[
              { key: 'name', label: 'Device', render: (d) => d.device_name },
              { key: 'platform', label: 'Platform', render: (d) => d.platform ?? '—' },
              { key: 'used', label: 'Last used', render: (d) => dateTime(d.last_used_at) },
              { key: 'action', label: '', align: 'right', render: (d) => <Button size="sm" variant="danger" onClick={() => revoke(d.id)}>Sign out</Button> },
            ]}
          />
        </Card>
      </div>
    </PageShell>
  );
}
