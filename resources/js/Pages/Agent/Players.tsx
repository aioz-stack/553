import { Link } from '@inertiajs/react';
import { useState } from 'react';
import DataTable, { Pager } from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Badge, Card, Input, LinkButton, statusTone } from '../../Components/ui';
import { dateTime } from '../../lib/format';
import { useApi } from '../../lib/useApi';

interface Player {
  id: number;
  name: string;
  username: string;
  email?: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

export default function Players() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, loading } = useApi<{ data: Player[]; meta: { current_page: number; last_page: number; total: number } }>('/agent/players', { page, search: search || undefined });

  return (
    <PageShell title="My Players">
      <Card title="Players you manage" actions={<LinkButton href="/agent/players/create">Register player</LinkButton>}>
        <div className="mb-4 max-w-sm">
          <Input placeholder="Search name or username" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <DataTable<Player>
          loading={loading}
          rows={data?.data}
          rowKey={(p) => p.id}
          empty="No players yet. Register one or share a referral code."
          columns={[
            { key: 'name', label: 'Name', render: (p) => <Link href={`/agent/players/${p.id}`} className="font-medium text-brand-500">{p.name}</Link> },
            { key: 'username', label: 'Username', render: (p) => p.username },
            { key: 'status', label: 'Status', render: (p) => <Badge tone={statusTone(p.status)}>{p.status}</Badge> },
            { key: 'login', label: 'Last login', render: (p) => dateTime(p.last_login_at) },
            { key: 'joined', label: 'Joined', render: (p) => dateTime(p.created_at) },
            { key: 'actions', label: '', align: 'right', render: (p) => <LinkButton href={`/agent/allocate?player=${p.id}`} variant="outline">Allocate</LinkButton> },
          ]}
        />
        <Pager meta={data?.meta} onPage={setPage} />
      </Card>
    </PageShell>
  );
}
