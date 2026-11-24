/** GET agent/dashboard (also used by Load Chips and Reports). */
export interface AgentOverviewData {
  agent: { code: string; status: string };
  players: number;
  active_players_7d: number;
  allocation: { CH: string };
  commission_wallet: { CH: string };
  allocation_frozen: boolean;
  commissions: Array<{ status: string; currency: string; total: string }>;
  distributed: { CH: string };
}
