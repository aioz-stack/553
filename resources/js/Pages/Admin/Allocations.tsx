import { usePage } from '@inertiajs/react';
import { useState } from 'react';
import AllocateForm, { type Recipient } from '../../Components/AllocateForm';
import PageShell from '../../Components/PageShell';
import TransactionsTable from '../../Components/TransactionsTable';
import { Alert, Card, Select } from '../../Components/ui';
import type { SharedProps } from '../../lib/types';
import { useApi } from '../../lib/useApi';

/**
 * Super Admin issues new CP/VC to administrators, agents or players.
 * Administrators allocate from their own allocation balance, within limits.
 */
export default function Allocations() {
  const { auth } = usePage<SharedProps>().props;
  const isSuper = auth.user?.role === 'super_admin';
  const [target, setTarget] = useState<'agent' | 'player' | 'admin'>('agent');
  const endpoint = target === 'agent' ? '/admin/agents' : target === 'player' ? '/admin/players' : '/admin/administrators';
  const canList = target === 'admin' ? isSuper : auth.user?.abilities.includes(target === 'agent' ? 'manage_agents' : 'manage_players');
  const recipients = useApi<{ data: Recipient[] }>(canList ? endpoint : null, { per_page: 100 });
  const [refresh, setRefresh] = useState(0);

  return (
    <PageShell title="Allocations">
      <Alert tone="info">
        {isSuper
          ? 'Allocations by a Super Admin are new issuance recorded as ADMIN_ALLOCATION / PLAYER_CREDIT ledger entries.'
          : 'You allocate from your own allocation balance. Per-transaction and daily limits set by the Super Admin apply.'}
      </Alert>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="New allocation">
          <div className="mb-4">
            <Select value={target} onChange={(e) => setTarget(e.target.value as typeof target)}>
              <option value="agent">To an agent (allocation balance)</option>
              <option value="player">To a player (player wallet)</option>
              {isSuper && <option value="admin">To an administrator (allocation balance)</option>}
            </Select>
          </div>
          {!canList && <Alert tone="warning">You do not have permission to list these accounts.</Alert>}
          {recipients.data && <AllocateForm key={target} recipients={recipients.data.data} onDone={() => setRefresh((n) => n + 1)} />}
        </Card>
        <Card title="Allocation history" className="xl:col-span-2">
          {auth.user?.abilities.includes('review_transactions') ? (
            <TransactionsTable key={refresh} endpoint="/admin/transactions" staff extraFilters={{ type: undefined }} />
          ) : (
            <p className="text-sm text-gray-500">You need the "review transactions" permission to view the ledger.</p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
