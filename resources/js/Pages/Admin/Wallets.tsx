import { Link, usePage } from '@inertiajs/react';
import { useState, type FormEvent } from 'react';
import DataTable, { Pager } from '../../Components/DataTable';
import PageShell from '../../Components/PageShell';
import { Alert, Badge, Button, Card, Field, Input, Modal, Select, StatCard, Tabs } from '../../Components/ui';
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

type WalletTypeKey = Wallet['type'];
interface CurrencyTotals {
  total: string;
  total_minor: number;
  by_type: Record<WalletTypeKey, { total: string; total_minor: number; wallets: number }>;
}
type Summary = Record<'GD' | 'CH' | 'KY', CurrencyTotals>;

interface UserHit {
  id: number;
  name: string;
  username: string;
  role: string;
}

type Direction = 'credit' | 'debit';

/** Who a deposit/withdrawal goes to: an existing wallet row, or a user + currency picked in the form. */
type Target = { kind: 'wallet'; wallet: Wallet } | { kind: 'user' };

const TYPES: WalletTypeKey[] = ['player', 'allocation', 'commission', 'platform', 'escrow'];

/**
 * Wallet management, also used as the Chips and Gold management screens
 * (`?currency=CH|GD`). Chips and Gold are always listed and totalled separately.
 * Super Admin can deposit (credit) or withdraw (debit) points; both are
 * immutable, audited ledger entries. Points only — no real money moves.
 */
export default function Wallets() {
  const { auth } = usePage<SharedProps>().props;
  const initial = (new URLSearchParams(window.location.search).get('currency') as 'GD' | 'CH' | 'KY' | null) ?? 'CH';
  const [currency, setCurrency] = useState<'GD' | 'CH' | 'KY'>(initial === 'GD' || initial === 'KY' ? initial : 'CH');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const wallets = useApi<{ data: Wallet[]; meta: { current_page: number; last_page: number; total: number } }>('/admin/wallets', { currency, type: type || undefined, search: search || undefined, page });
  const summary = useApi<{ data: Summary }>('/admin/wallets/summary');
  const [reconcile, setReconcile] = useState<Reconcile | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const isSuper = auth.user?.role === 'super_admin';

  // Deposit / withdraw form
  const [target, setTarget] = useState<Target | null>(null);
  const [form, setForm] = useState({ direction: 'credit' as Direction, currency: 'CH' as 'GD' | 'CH' | 'KY', amount: '', reason: '' });
  const [userSearch, setUserSearch] = useState('');
  const [picked, setPicked] = useState<UserHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [idemKey, setIdemKey] = useState(newIdempotencyKey());
  const hits = useApi<{ data: UserHit[] }>(target?.kind === 'user' && userSearch.trim().length >= 2 && !picked ? '/admin/users' : null, { search: userSearch.trim(), per_page: 8 });

  const runReconcile = async () => setReconcile((await api.get('/admin/reconcile')).data.data);

  const reloadAll = () => {
    wallets.reload();
    summary.reload();
  };

  const freeze = async (w: Wallet) => {
    try {
      await api.post(`/admin/wallets/${w.id}/freeze`, { frozen: !w.is_frozen });
      wallets.reload();
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e) });
    }
  };

  const open = (t: Target, direction: Direction) => {
    setTarget(t);
    setForm({ direction, currency: t.kind === 'wallet' ? t.wallet.currency : currency, amount: '', reason: '' });
    setPicked(null);
    setUserSearch('');
    setFormError(null);
    setIdemKey(newIdempotencyKey());
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target || busy) return;
    if (target.kind === 'user' && !picked) {
      setFormError('Choose a user.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const body =
        target.kind === 'wallet'
          ? { wallet_id: target.wallet.id }
          : { user_id: picked!.id, currency: form.currency };
      const r = await api.post('/admin/adjustments', { ...body, direction: form.direction, amount: form.amount, reason: form.reason, idempotency_key: idemKey });
      const who = target.kind === 'wallet' ? target.wallet.owner?.name : picked!.name;
      const cur = target.kind === 'wallet' ? target.wallet.currency : form.currency;
      setMessage({ tone: 'success', text: `${form.direction === 'credit' ? 'Deposited' : 'Withdrew'} ${points(form.amount)} ${cur} ${form.direction === 'credit' ? 'to' : 'from'} ${who}. New balance ${points(r.data.data.balance)} ${cur} · ref ${r.data.data.reference}` });
      setTarget(null);
      reloadAll();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const totals = summary.data?.data;
  const cur = totals?.[currency];
  const formCurrency = target?.kind === 'wallet' ? target.wallet.currency : form.currency;

  return (
    <PageShell title={`${currency === 'GD' ? 'Gold' : currency === 'KY' ? 'Keys' : 'Chips'} Management`}>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {currency === 'GD' && <Alert tone="info">Gold is Single Player only. A credit or debit here adjusts a player's Gold; it can never be used in Multiplayer or exchanged for Chips.</Alert>}
      {currency === 'CH' && <Alert tone="info">Chips are Multiplayer only. They are never cash, never paid out, and never exchanged for Gold.</Alert>}
      {currency === 'KY' && <Alert tone="info">Keys are a separate player wallet shown in the Main Lobby. Only a Super Admin loads or removes Keys here (audited); they are never cash. Players buy Keys with Chips in the Shop (5 Chips = 1 Key; final, never back into Chips); the Chips paid are shared with their Admin / Incorporator / Master Agent.</Alert>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Chips" value={totals ? points(totals.CH.total, 'CH') : '…'} hint={totals ? `Players ${points(totals.CH.by_type.player.total)} · Allocation ${points(totals.CH.by_type.allocation.total)}` : undefined} />
        <StatCard label="Total Gold" value={totals ? points(totals.GD.total, 'GD') : '…'} hint={totals ? `Players ${points(totals.GD.by_type.player.total)}` : undefined} />
        <StatCard label={`${currency} in player wallets`} value={cur ? points(cur.by_type.player.total, currency) : '…'} hint={cur ? `${cur.by_type.player.wallets} wallets` : undefined} />
        <StatCard label={`${currency} in allocation wallets`} value={cur ? points(cur.by_type.allocation.total, currency) : '…'} hint={cur ? `${cur.by_type.allocation.wallets} admins / agents` : undefined} />
      </div>

      <Card
        title="Wallets"
        subtitle={cur ? `Total ${currency}: ${points(cur.total, currency)} — ${TYPES.map((t) => `${titleCase(t)} ${points(cur.by_type[t].total)}`).join(' · ')}` : undefined}
        actions={
          <>
            <Tabs value={currency} onChange={(c) => { setCurrency(c); setPage(1); }} options={[{ value: 'CH', label: 'Chips' }, { value: 'GD', label: 'Gold' }, { value: 'KY', label: 'Keys' }]} />
            {isSuper && (
              <>
                <Button onClick={() => open({ kind: 'user' }, 'credit')}>Deposit</Button>
                <Button variant="outline" onClick={() => open({ kind: 'user' }, 'debit')}>Withdraw</Button>
              </>
            )}
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
            {TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
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
                  {isSuper && w.owner?.id && w.owner.role !== 'super_admin' && (
                    <>
                      <Button size="sm" onClick={() => open({ kind: 'wallet', wallet: w }, 'credit')}>Deposit</Button>
                      <Button size="sm" variant="outline" onClick={() => open({ kind: 'wallet', wallet: w }, 'debit')} disabled={w.balance_minor <= 0}>Withdraw</Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
        <Pager meta={wallets.data?.meta} onPage={setPage} />
      </Card>

      <Modal
        open={!!target}
        title={`${form.direction === 'credit' ? 'Deposit' : 'Withdraw'} points${target?.kind === 'wallet' ? ` — ${target.wallet.owner?.name} (${target.wallet.currency} ${target.wallet.type})` : ''}`}
        onClose={() => setTarget(null)}
      >
        <form onSubmit={submit} className="space-y-4">
          <Alert tone="warning">Points only — no real money is sent or received. Every deposit and withdrawal is an immutable, audited ledger entry; undo one with a reversal on the Transactions page.</Alert>
          {formError && <Alert tone="error">{formError}</Alert>}

          {target?.kind === 'user' && (
            <Field label="User" required hint="Players receive into their player wallet; administrators and agents into their allocation wallet.">
              {picked ? (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                  <span>
                    <strong>{picked.name}</strong> <span className="text-gray-500">@{picked.username} · {titleCase(picked.role)}</span>
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPicked(null)}>Change</Button>
                </div>
              ) : (
                <>
                  <Input placeholder="Search name or username" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} autoFocus />
                  {hits.data && userSearch.trim().length >= 2 && (
                    <ul className="mt-1 max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      {hits.data.data.filter((u) => u.role !== 'super_admin').map((u) => (
                        <li key={u.id}>
                          <button type="button" className="w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-white/5" onClick={() => setPicked(u)}>
                            {u.name} <span className="text-gray-500">@{u.username} · {titleCase(u.role)}</span>
                          </button>
                        </li>
                      ))}
                      {hits.data.data.length === 0 && <li className="px-3 py-2 text-gray-500">No users found.</li>}
                    </ul>
                  )}
                </>
              )}
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as Direction })}>
                <option value="credit">Deposit (+)</option>
                <option value="debit">Withdraw (−)</option>
              </Select>
            </Field>
            {target?.kind === 'user' ? (
              <Field label="Currency">
                <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as 'GD' | 'CH' | 'KY' })}>
                  <option value="CH">Chips</option>
                  <option value="GD">Gold</option>
                  <option value="KY">Keys</option>
                </Select>
              </Field>
            ) : (
              <Field label="Current balance">
                <Input value={target?.kind === 'wallet' ? points(target.wallet.balance, target.wallet.currency) : ''} readOnly />
              </Field>
            )}
          </div>
          <Field label={`Amount (${formCurrency})`} required>
            <Input inputMode="decimal" placeholder="e.g. 1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Reason (required, min 5 characters)" required>
            <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </Field>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : form.direction === 'credit' ? 'Deposit points' : 'Withdraw points'}</Button>
        </form>
      </Modal>
    </PageShell>
  );
}
