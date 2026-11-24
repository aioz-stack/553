import { usePanelRefresh } from '../../lib/panel';
import { useApi } from '../../lib/useApi';
import { Figure, I, Panel, fmt } from './kit';

interface TeamOverview {
  total_player_wallets: string;
  total_agent_wallets: string;
  players: number;
  agents: number;
  scope: 'platform' | 'downline';
}

/**
 * "Team Overview" for Administrators, Incorporators and Master Agents (Overview page). Every
 * figure comes from the server. (The "Convert Commission to Wallet" panel was removed from the
 * Overview; commission withdrawals stay on the Commission Withdrawal page.)
 */
export default function TeamSections() {
  const team = useApi<{ data: TeamOverview }>('/team/overview');
  usePanelRefresh(team.reload);
  const t = team.data?.data;

  return (
    <Panel title="Team Overview" icon={<I.users className="h-6 w-6" />} actions={t && <span className="text-sm text-[#6b6385] dark:text-white/55">{t.scope === 'platform' ? 'Whole platform' : `${fmt(t.agents)} agents · ${fmt(t.players)} players in your downline`}</span>}>
      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
        <Figure label="Total Player Wallets" value={t ? fmt(t.total_player_wallets, 2) : '…'} tone="gold" hint={t?.scope === 'platform' ? 'Chips held by every player' : 'Chips held by every player in your downline, at every level'} />
        <Figure label="Total Agent Wallets" value={t ? fmt(t.total_agent_wallets, 2) : '…'} tone="gold" hint={t?.scope === 'platform' ? 'Chips held by every agent' : 'Chips held by every agent in your downline, at every level'} />
      </div>
    </Panel>
  );
}
