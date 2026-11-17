import { Link, usePage } from '@inertiajs/react';
import { useState, type FormEvent } from 'react';
import DataTable, { Pager } from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, Tabs } from '../../Components/ui';
import { api, errorMessage, newIdempotencyKey } from '../../lib/api';
import { points, titleCase } from '../../lib/format';
import type { SharedProps, Wallet } from '../../lib/types';
import { useApi } from '../../lib/useApi';

interface Reconcile {
  ok: boolean;
  wallets_checked: number;
  mismatches: unknown[];
  escrow: Record<string, { balance: number; expected: number }>;
}

/**
 * Wallet management, also used as the CP and VC management screens
 * (`?currency=CP|VC`). CP and VC are always listed separately.
 */
export default function Wallets() {
  const { auth } = usePage<SharedProps>().props;
  const initial = (new URLSearchParams(window.location.search).get('currency') as 'CP' | 'VC' | null) ?? 'VC';
  const [currency, setCurrency] = useState<'CP' | 'VC'>(initial);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const wallets = useApi<{ data: Wallet[]; meta: { current_page: number; last_page: number; total: number } }>('/admin/wallets', { currency, type: type || undefined, search: search || undefined, page });
  const [reconcile, setReconcile] = useState<Reconcile | null>(null);
  const [adjusting, setAdjusting] = useState<Wallet | null>(null);
  const [adjust, setAdjust] = useState({ direction: 'credit', amount: '', reason: '' });
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const isSuper = auth.user?.role === 'super_admin';

  const runReconcile = async () => setReconcile((await api.get('/admin/reconcile')).data.data);

  const freeze = async (w: Wallet) => {
    try {
      await api.post(`/admin/wallets/${w.id}/freeze`, { frozen: !w.is_frozen });
      wallets.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  const submitAdjust = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post('/admin/adjustments', { wallet_id: adjusting!.id, ...adjust, idempotency_key: newIdempotencyKey() });
      setMessage({ tone: 'success', text: 'Adjustment recorded in the ledger.' });
      setAdjusting(null);
      wallets.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <PageShell title={`${currency} Management`}>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {currency === 'CP' && <Alert tone="warning">CP is PHP-denominated accounting points. Real-money deposits, withdrawals, redemption and CP wagering are disabled.</Alert>}
      {currency === 'VC' && <Alert tone="info">VC is free-play only — never withdrawable, redeemable, or convertible to CP.</Alert>}

      <Card
        title="Wallets"
        actions={
          <>
            <Tabs value={currency} onChange={(c) => { setCurrency(c); setPage(1); }} options={[{ value: 'VC', label: 'VC' }, { value: 'CP', label: 'CP' }]} />
            <Button variant="outline" onClick={runReconcile}>Reconcile ledger</Button>
          </>
        }
      >
        {reconcile && (
          <Alert tone={reconcile.ok ? 'success' : 'error'}>
            {reconcile.ok ? `Ledger balanced — ${reconcile.wallets_checked} wallets checked.` : `${reconcile.mismatches.length} mismatches found! ${JSON.stringify(reconcile.mismatches)}`}{' '}
            Escrow: {Object.entries(reconcile.escrow).map(([c, e]) => `${c} ${points(e.balance / 100)} (expected ${points(e.expected / 100)})`).join(' · ')}
          </Alert>
        )}
        <div className="mb-4 flex flex-wrap gap-3">
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="w-48">
            <option value="">All wallet types</option>
            {['player', 'allocation', 'commission', 'platform', 'escrow'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
          <Input className="max-w-xs" placeholder="Username" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <DataTable<Wallet>
          loading={wallets.loading}
          rows={wallets.data?.data}
          rowKey={(w) => w.id}
          columns={[
            { key: 'owner', label: 'Owner', render: (w) => (w.owner?.id ? <Link href={`/admin/users/${w.owner.id}`} className="text-brand-500">{w.owner.name}</Link> : <Badge>{w.owner?.system}</Badge>) },
            { key: 'role', label: 'Role', render: (w) => w.owner?.role ? titleCase(w.owner.role) : 'System' },
            { key: 'type', label: 'Type', render: (w) => titleCase(w.type) },
            { key: 'balance', label: 'Balance', align: 'right', render: (w) => <strong>{points(w.balance, w.currency)}</strong> },
            { key: 'frozen', label: 'State', render: (w) => (w.is_frozen ? <Badge tone="error">Frozen</Badge> : <Badge tone="success">Active</Badge>) },
            {
              key: 'act',
              label: '',
              align: 'right',
              render: (w) => (
                <div className="inline-flex gap-2">
                  {w.type === 'allocation' && auth.user?.abilities.includes('freeze_allocations') && (
                    <Button size="sm" variant="outline" onClick={() => freeze(w)}>{w.is_frozen ? 'Unfreeze' : 'Freeze'}</Button>
                  )}
                  {isSuper && w.owner?.id && (
                    <Button size="sm" variant="outline" onClick={() => setAdjusting(w)}>Adjust</Button>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pager meta={wallets.data?.meta} onPage={setPage} />
      </Card>

      <Modal open={!!adjusting} title={`Manual adjustment — ${adjusting?.owner?.name} (${adjusting?.currency} ${adjusting?.type})`} onClose={() => setAdjusting(null)}>
        <form onSubmit={submitAdjust} className="space-y-4">
          <Alert tone="warning">Adjustments create immutable ledger entries and are audited. Use reversals on the Transactions page to undo a specific transaction.</Alert>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Direction">
              <Select value={adjust.direction} onChange={(e) => setAdjust({ ...adjust, direction: e.target.value })}>
                <option value="credit">Credit (+)</option>
                <option value="debit">Debit (−)</option>
              </Select>
            </Field>
            <Field label="Amount" required><Input value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} /></Field>
          </div>
          <Field label="Reason (required)" required><Input value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} /></Field>
          <Button type="submit">Record adjustment</Button>
        </form>
      </Modal>
    </PageShell>
  );
}
