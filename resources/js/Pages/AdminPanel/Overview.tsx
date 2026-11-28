import { Link } from '@inertiajs/react';
import { useState } from 'react';
import { ChipStack, CopyLink, Dialog, Details, I, Note, Panel, Segments, StatTile, StatusPill, Table, Toast, TypePill, AmountDialog, fmt, when, type AmountAction, type Column } from '../../Components/AdminPanel/kit';
import { TX_LOCKED_HINT, useMaintenance } from '../../lib/maintenance';
import { usePanel, usePanelRefresh } from '../../lib/panel';
import AdminPanelLayout from '../../Layouts/AdminPanelLayout';
import RevenueConvert, { type RevenueSummary } from '../../Components/AdminPanel/RevenueConvert';
import { useApi } from '../../lib/useApi';
import type { LoadLog } from './types';
import { Eye, Signed, TxLabel, loadRows } from '../../Components/AdminPanel/rows';
import type { BuyIn } from './RevenueLogs';
import type { ConversionRow } from './RevenueWithdrawals';

interface OverviewData {
  me: { username: string; is_super_admin: boolean };
  /** Agent Panel only. */
  level?: 'agent' | 'master';
  level_label?: string;
  upline?: { username: string } | null;
  allocation_frozen?: boolean;
  my_players?: number;
  pending_chip_requests?: number;
  chip_requests?: Array<{ reference: string; amount: string; status: string; note: string | null; created_at: string }>;
  my_chips: string;
  active_agents: { total: number; agent: number; master: number };
  active_players: number;
  pending_users: number;
  links: { code: string; player: string | null; agent: string | null; agent_level: string | null; player_registrations: number };
  recent: { load_logs: LoadLog[] };
}

interface TeamTotals {
  total_revenue: string;
  my_revenue_share: string;
  total_player_wallets: string;
  total_agent_wallets: string;
  players: number;
  agents: number;
  scope: 'platform' | 'downline';
}

type Tab = 'load' | 'buyins' | 'conversions';

/**
 * Overview of the Admin Panel (whole platform) and of the Incorporator / Master Agent
 * Panel (the agent's own downline): summary tiles, permanent referral links,
 * Total Revenue, wallet totals and recent transactions — all live from the API.
 */
export default function Overview() {
  const panel = usePanel();
  const { data, reload } = useApi<{ data: OverviewData }>(`${panel.api}/overview`);
  // Revenue and wallet totals of the user's scope (whole platform for a Super Admin): one server query.
  const team = useApi<{ data: TeamTotals }>('/team/overview');
  // Self Convert Revenue to Chips: the user's own Revenue wallet and recent conversions.
  const revenue = useApi<{ data: RevenueSummary }>('/revenue');
  usePanelRefresh(reload, team.reload, revenue.reload);
  const rv = revenue.data?.data;
  const t = team.data?.data;
  const teamText = (v: string | undefined) => (t ? fmt(v ?? 0, 2) : team.error ? '—' : '…');
  const d = data?.data;
  const agent = panel.isAgent;
  const isMaster = panel.level === 'master';
  const txLocked = useMaintenance().transactions_blocked;
  const [tab, setTab] = useState<Tab>('load');
  const [detail, setDetail] = useState<{ title: string; rows: Array<[string, React.ReactNode]> } | null>(null);
  const [issue, setIssue] = useState<AmountAction | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCols: Column<LoadLog>[] = [
    { key: 'n', label: '#', render: (_, i) => i + 1 },
    { key: 'date', label: 'Date & Time', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'tx', label: 'Transaction', render: (r) => <TxLabel direction={r.direction} text={r.transaction} /> },
    { key: 'acct', label: 'Account', render: (r) => <span className="font-semibold">{r.account?.username}</span> },
    { key: 'type', label: 'Type', render: (r) => <TypePill type={r.account_type} label={r.account_type_label} /> },
    { key: 'amt', label: 'Amount (Chips)', className: 'text-right', render: (r) => <Signed value={r.signed_amount} /> },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
    { key: 'act', label: 'Action', className: 'text-center', render: (r) => <Eye onClick={() => setDetail({ title: `Load ${r.reference}`, rows: loadRows(r) })} /> },
  ];
  // Recent Revenue Logs (Shop Buy-Ins) and Revenue Commission Withdrawal (self-conversions) of this
  // panel's scope: the same read-only endpoints as their pages, latest 5.
  const buyIns = useApi<{ data: BuyIn[] }>(`${panel.api}/revenue-logs`, { per_page: 5 });
  const conversions = useApi<{ data: ConversionRow[] }>(`${panel.api}/revenue-conversions`, { per_page: 5 });
  usePanelRefresh(buyIns.reload, conversions.reload);
  const buyInCols: Column<BuyIn>[] = [
    { key: 'n', label: '#', render: (_, i) => i + 1 },
    { key: 'date', label: 'Date & Time', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'tx', label: 'Transaction', render: () => <TxLabel direction="commission" text="Shop Buy-In" /> },
    { key: 'id', label: 'Transaction ID', render: (r) => <span className="font-mono text-xs">{r.transaction_id}</span> },
    { key: 'acct', label: 'Player', render: (r) => <span className="font-semibold">{r.player.username}</span> },
    { key: 'amt', label: 'Buy-In (Chips)', className: 'text-right', render: (r) => <span className="font-black">{fmt(r.buy_in, 2)}</span> },
    { key: 'keys', label: 'Keys', className: 'text-right', render: (r) => fmt(r.keys) },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
  ];
  const conversionCols: Column<ConversionRow>[] = [
    { key: 'n', label: '#', render: (_, i) => i + 1 },
    { key: 'date', label: 'Date & Time', render: (r) => <span className="whitespace-nowrap">{when(r.created_at)}</span> },
    { key: 'tx', label: 'Transaction', render: () => <TxLabel direction="commission" text="Revenue → Chips" /> },
    { key: 'id', label: 'Conversion ID', render: (r) => <span className="font-mono text-xs">{r.transaction_id}</span> },
    { key: 'acct', label: 'Account', render: (r) => <span className="font-semibold">{r.account.username}</span> },
    { key: 'role', label: 'Role', render: (r) => r.account.role },
    { key: 'amt', label: 'Revenue Converted', className: 'text-right', render: (r) => <span className="font-black">{fmt(r.revenue_converted, 2)}</span> },
    { key: 'st', label: 'Status', className: 'text-center', render: (r) => <StatusPill status={r.status} /> },
  ];

  const viewAll = { load: `${panel.base}/load-logs`, buyins: `${panel.base}/revenue-logs`, conversions: `${panel.base}/revenue-withdrawals` }[tab];
  const requestChips = () => setIssue({ title: 'Request Chips', verb: 'Request', target: 'from the Administrator', path: '/agent/chip-requests', variant: 'gold' });

  return (
    <AdminPanelLayout title="Overview" subtitle={agent ? `${d?.level_label ?? 'Agent'} summary${d?.upline ? ` · Upline: ${d.upline.username}` : ''}` : 'Platform Summary and Management'}>
      {d?.allocation_frozen && <Note tone="warn"><b>Your Chips wallet is frozen</b> by an administrator. You cannot load Chips to players until it is unfrozen.</Note>}
      {/* Cards, two per row (stacked on small screens):
          My Total Chips | Total Active Agents · Total Active Players | Total Player Wallets · Total Agent Wallets.
          Master Agent panel: no downline-agents and agent-wallets cards. Total Revenue / Available Revenue
          sit under Self Convert Revenue to Chips, below the registration links. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <StatTile
          tone="purple"
          title="My Total Chips Amount"
          icon={<ChipStack className="h-16 w-16" />}
          value={d ? fmt(d.my_chips) : '…'}
          label="My Total Chips Amount"
          footer={
            agent ? (
              <button type="button" onClick={requestChips} disabled={txLocked} title={txLocked ? TX_LOCKED_HINT : undefined} className="rounded-lg bg-white/15 px-3 py-1 font-bold text-white ring-1 ring-white/25 hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50">
                + Request Chips{d?.pending_chip_requests ? ` · ${d.pending_chip_requests} pending` : ''}
              </button>
            ) : d?.me.is_super_admin ? (
              <button type="button" onClick={() => setIssue({ title: 'Issue Chips', verb: 'Issue', target: 'into your Chips wallet', path: '/admin/panel/issue', variant: 'gold' })} className="rounded-lg bg-white/15 px-3 py-1 font-bold text-white ring-1 ring-white/25 hover:bg-white/25">
                + Issue Chips
              </button>
            ) : (
              'Your available Chips for loading accounts'
            )
          }
        />
        {/* Master Agents recruit no agents: no downline-agents card for them. */}
        {!isMaster && (
          <StatTile
            tone="blue"
            title={agent ? 'My Downline Agents' : 'Total Active Agents'}
            subtitle={agent ? 'Active agents below you' : 'Incorporators + Master Agents'}
            icon={<I.users className="h-10 w-10" />}
            value={d ? fmt(d.active_agents.total) : '…'}
            label={agent ? 'My Downline Agents' : 'Total Active Agents'}
            footer={d && (agent ? `Master Agents ${fmt(d.active_agents.master)}` : `Incorporators ${fmt(d.active_agents.agent)} · Master Agents ${fmt(d.active_agents.master)}`)}
          />
        )}
        <StatTile
          tone="green"
          title={agent ? 'My Active Players' : 'Total Active Players'}
          subtitle={agent ? `Your downline${d?.my_players !== undefined ? ` · ${fmt(d.my_players)} registered directly to you` : ''}` : "All Agents' and Platform Players"}
          icon={<I.users className="h-10 w-10" />}
          value={d ? fmt(d.active_players) : '…'}
          label={agent ? 'My Active Players' : 'Total Active Players'}
          footer={d && (d.pending_users > 0 ? <Link href={`${panel.base}/accounts/pending-users`} className="underline">{d.pending_users} waiting for approval →</Link> : 'No registrations waiting')}
        />
        <StatTile
          tone="gold"
          title="Total Player Wallets"
          subtitle={t?.scope === 'platform' ? 'Chips held by every player' : 'Chips held by every player in your downline'}
          icon={<ChipStack className="h-14 w-14" />}
          value={teamText(t?.total_player_wallets)}
          label="Total Player Wallets"
          footer={t && `${fmt(t.players)} players`}
        />
        {!isMaster && (
          <StatTile
            tone="gold"
            title="Total Agent Wallets"
            subtitle={t?.scope === 'platform' ? 'Chips held by every agent' : 'Chips held by every agent in your downline'}
            icon={<ChipStack className="h-14 w-14" />}
            value={teamText(t?.total_agent_wallets)}
            label="Total Agent Wallets"
            footer={t && `${fmt(t.agents)} agents`}
          />
        )}
      </div>

      {/* Only the links this role may use: Admin → Incorporators + Players; Incorporator → Master Agents + Players;
          Master Agent → Players. The server enforces the same. Links are permanent (one code per account). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {(!d || d.links.agent) && (
          <CopyLink title={d?.links.agent_level ? `${d.links.agent_level} Registration Link` : 'Agent Registration Link'} url={d?.links.agent ?? null} icon={<I.userPlus className="h-7 w-7" />} hint={d?.links.agent_level ? `Registers ${d.links.agent_level}s under your account` : undefined} />
        )}
        {(!d || d.links.player) && (
          <CopyLink
            title="Player Registration Link"
            url={d?.links.player ?? null}
            icon={<I.users className="h-7 w-7" />}
            hint="Your permanent link: registers Players directly under your account"
            shareable
            concealable
            footer={d && `${fmt(d.links.player_registrations)} ${d.links.player_registrations === 1 ? 'player has' : 'players have'} registered through this link`}
          />
        )}
      </div>
      {/* Self Convert Revenue to Chips: centered, directly under the registration links. */}
      <RevenueConvert
        summary={rv}
        error={!!revenue.error}
        locked={!!txLocked && agent}
        lockedHint={TX_LOCKED_HINT}
        onDone={(m) => {
          setToast({ ok: true, text: m });
          setTab('conversions');
          conversions.reload();
          reload();
          team.reload();
          revenue.reload();
        }}
      />
      {/* Revenue of this account (own figures for every role, from GET /revenue):
          Total = every Shop share ever earned (cumulative, never reduced by a conversion);
          Available = the Revenue wallet, i.e. what Self Convert can still move into Chips. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <StatTile
          tone="red"
          title="Total Revenue"
          subtitle="All revenue you have earned, including revenue converted to Chips"
          icon={<I.coins className="h-10 w-10" />}
          value={rv ? fmt(rv.total_revenue, 2) : revenue.error ? '—' : '…'}
          label="Total Revenue"
          footer={t ? `Shop sales ${t.scope === 'platform' ? 'from every player' : 'in your downline'}: ${fmt(t.total_revenue, 2)} Chips` : revenue.error ? 'Could not load revenue' : undefined}
        />
        <StatTile
          tone="green"
          title="Available Revenue"
          subtitle="Revenue you can still convert to Chips"
          icon={<I.coins className="h-10 w-10" />}
          value={rv ? fmt(rv.available_revenue, 2) : revenue.error ? '—' : '…'}
          label="Available Revenue"
          footer={rv ? `Converted so far: ${fmt(rv.converted_total, 2)} · ${rv.rate}` : revenue.error ? 'Could not load revenue' : undefined}
        />
      </div>
      <Note>
        <b>Note:</b> Users who register using these links will be automatically assigned under your account once you approve their registration in Registration Approvals.
      </Note>

      <Panel
        title="Recent Transactions"
        icon={<I.clock className="h-6 w-6" />}
        actions={
          <>
            <Segments<Tab> label="Recent transactions" value={tab} onChange={setTab} options={[['load', 'Load Logs'], ['buyins', 'Revenue Logs'], ['conversions', 'Revenue Commission Withdrawal']]} />
            {viewAll && (
              <Link href={viewAll} className="ml-2 inline-flex items-center gap-1 text-sm font-bold text-[#6d28d9] hover:underline dark:text-[#c4b5fd]">
                View All <I.arrowRight className="h-4 w-4" />
              </Link>
            )}
          </>
        }
      >
        {tab === 'load' && <Table label="Recent load logs" columns={loadCols} rows={d?.recent.load_logs} loading={!d} rowKey={(r) => r.id} empty="No Chips loads yet." />}
        {tab === 'buyins' && <Table label="Recent revenue logs" columns={buyInCols} rows={buyIns.error ? [] : buyIns.data?.data} loading={!buyIns.data && !buyIns.error} rowKey={(r) => r.id} empty={buyIns.error ? `Could not load: ${buyIns.error}` : 'No Shop Buy-Ins yet.'} />}
        {tab === 'conversions' && <Table label="Recent revenue conversions" columns={conversionCols} rows={conversions.error ? [] : conversions.data?.data} loading={!conversions.data && !conversions.error} rowKey={(r) => r.id} empty={conversions.error ? `Could not load: ${conversions.error}` : 'No Revenue conversions yet.'} />}
      </Panel>

      {agent && d?.chip_requests && d.chip_requests.length > 0 && (
        <Panel title="My Chips Requests" icon={<I.clock className="h-6 w-6" />} actions={<Link href={`${panel.base}/load-logs`} className="text-sm font-bold text-[#6d28d9] hover:underline dark:text-[#c4b5fd]">View in Load Logs</Link>}>
          <ul className="divide-y divide-[#f0ecf9] text-sm dark:divide-white/[0.06]">
            {d.chip_requests.map((r) => (
              <li key={r.reference} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="font-mono text-xs">{r.reference}</span>
                <span className="text-[#857d9c] dark:text-white/45">{when(r.created_at)}</span>
                <span className="ml-auto font-black">{fmt(r.amount, 2)} Chips</span>
                <StatusPill status={r.status} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Dialog open={!!detail} title={detail?.title ?? ''} onClose={() => setDetail(null)}>
        {detail && <Details rows={detail.rows} />}
      </Dialog>
      <AmountDialog
        action={issue}
        onClose={() => setIssue(null)}
        onDone={(m) => {
          setIssue(null);
          setToast({ ok: true, text: m });
          reload();
        }}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </AdminPanelLayout>
  );
}
