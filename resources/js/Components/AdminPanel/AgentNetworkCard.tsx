import { useState } from 'react';
import { AmountDialog, Btn, CopyLink, Figure, I, Panel, StatusPill, Toast, TypePill, fmt, when, type AmountAction } from './kit';
import { useApi } from '../../lib/useApi';
import TeamSections from './TeamSections';

interface AgentPanel {
  level: 'agent' | 'master' | 'silver';
  level_label: string;
  upline: { username: string } | null;
  sponsor: { username: string } | null;
  links: { player: string | null; agent: string | null; agent_level: string | null };
  chips: string;
  commission: { balance: string; available: string; withdrawn: string };
  downline: { agents: number; players: number; pending: number };
  chip_requests: Array<{ reference: string; amount: string; status: string; note: string | null; created_at: string }>;
}

/**
 * The agent's own view of the Admin Panel features: level and upline, permanent referral
 * links, Chips and commission balances, Chips requests and commission withdrawals. All live
 * from /agent/panel; the Administrator approves requests in the Admin Panel.
 */
export default function AgentNetworkCard() {
  const { data, reload } = useApi<{ data: AgentPanel }>('/agent/panel');
  const d = data?.data;
  const [action, setAction] = useState<AmountAction | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  if (!d) return null;

  return (
    <div className="mb-6 space-y-5">
      <Panel
        title="My Network"
        icon={<I.users className="h-6 w-6" />}
        actions={
          <>
            <TypePill type={d.level} label={d.level_label} />
            {d.upline && <span className="text-sm text-[#6b6385] dark:text-white/55">Upline: <b>{d.upline.username}</b></span>}
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <Figure label="My Chips" value={fmt(d.chips, 2)} tone="gold" hint="Load these to your players" />
          <Figure label="Commission available" value={fmt(d.commission.available, 2)} tone="good" hint={`Withdrawn so far: ${fmt(d.commission.withdrawn, 2)}`} />
          <Figure label="Downline agents" value={fmt(d.downline.agents)} hint={d.links.agent_level ? `You recruit ${d.links.agent_level}s` : 'Silver Agents recruit players only'} />
          <Figure label="My players" value={fmt(d.downline.players)} hint={d.downline.pending ? `${d.downline.pending} waiting for approval` : undefined} />
        </div>
        <div className="flex flex-wrap gap-3 px-5 pb-5">
          <Btn variant="gold" onClick={() => setAction({ title: 'Request Chips', verb: 'Request', target: 'from the Administrator', path: '/agent/chip-requests' })}>
            <I.plus className="h-4 w-4" /> Request Chips
          </Btn>
          <Btn variant="success" disabled={Number(d.commission.available) <= 0} onClick={() => setAction({ title: 'Withdraw Commission', verb: 'Withdraw', target: 'of commission into your own Chips', path: '/agent/payout-requests', limit: d.commission.available, limitLabel: 'Available commission', variant: 'success' })}>
            <I.percent className="h-4 w-4" /> Withdraw Commission
          </Btn>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CopyLink title="Player Registration Link" url={d.links.player} icon={<I.users className="h-7 w-7" />} hint="Players who register here join your downline once approved" />
        <CopyLink title={d.links.agent_level ? `${d.links.agent_level} Registration Link` : 'Agent Registration Link'} url={d.links.agent} icon={<I.userPlus className="h-7 w-7" />} hint={d.links.agent_level ? `Registers ${d.links.agent_level}s under you` : 'Silver Agents cannot recruit agents'} />
      </div>

      <TeamSections onChanged={reload} />

      {d.chip_requests.length > 0 && (
        <Panel title="My Chips Requests" icon={<I.clock className="h-6 w-6" />}>
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

      <AmountDialog
        action={action}
        onClose={() => setAction(null)}
        onDone={(m) => {
          setAction(null);
          setToast({ ok: true, text: m || 'Request sent for approval.' });
          reload();
        }}
      />
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  );
}
